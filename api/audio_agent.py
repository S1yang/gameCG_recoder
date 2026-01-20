# api/audio_agent.py
import os
import time
import threading
import warnings
import collections  # 用于队列计算移动平均
import requests
import numpy as np
import onnxruntime as ort
import soundcard as sc
import cv2

# 忽略 soundcard 的 buffer 溢出警告
warnings.filterwarnings("ignore", category=sc.SoundcardRuntimeWarning)

class AudioAgent:
    def __init__(self, model_dir=".galrec/models"):
        self.model_dir = os.path.abspath(model_dir)
        self.model_path = os.path.join(self.model_dir, "silero_vad.onnx")
        self.session = None
        
        self.VAD_SR = 16000
        self.VAD_WINDOW = 512 
        
        self.running = False
        self.thread = None
        
        # 实时状态
        self.current_prob = 0.0      # 瞬时概率
        self.smoothed_prob = 0.0     # 🟢 平滑后的概率 (更稳定)
        self.current_vol = 0.0
        
        # 🔊 增益保持 3.0，既能听清又不至于容易削波
        self.DIGITAL_GAIN = 3.0

        # 🟢 平滑窗口：保存最近 5 帧的概率
        self._prob_buffer = collections.deque(maxlen=5)

        self._ensure_model_v4()
        self._init_session()

    def _ensure_model_v4(self):
        if not os.path.exists(self.model_dir): os.makedirs(self.model_dir)
        if not os.path.exists(self.model_path):
            print("[Audio] Downloading Silero VAD model v4.0...")
            url = "https://github.com/snakers4/silero-vad/raw/v4.0/files/silero_vad.onnx"
            try:
                r = requests.get(url, allow_redirects=True)
                with open(self.model_path, 'wb') as f: f.write(r.content)
                print(f"[Audio] Downloaded v4 model.")
            except Exception as e: print(f"[Audio] Download failed: {e}")

    def _init_session(self):
        if os.path.exists(self.model_path):
            try:
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 1
                opts.inter_op_num_threads = 1
                self.session = ort.InferenceSession(self.model_path, opts, providers=['CPUExecutionProvider'])
            except Exception as e: print(f"[Audio] ONNX Error: {e}")

    def start(self):
        if self.running: return
        self.running = True
        self._prob_buffer.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        print(f"[Audio] Agent started (Gain={self.DIGITAL_GAIN}x, Smoothing=On).")

    def stop(self):
        self.running = False
        if self.thread: self.thread.join(timeout=1.0)
        print("[Audio] Agent stopped.")

    def _loop(self):
        h = np.zeros((2, 1, 64), dtype=np.float32)
        c = np.zeros((2, 1, 64), dtype=np.float32)
        audio_buffer = np.array([], dtype=np.float32)
        
        try:
            spk = sc.default_speaker()
            mic = sc.get_microphone(id=str(spk.name), include_loopback=True)
            print(f"[Audio] Binding to: {mic.name}")
            sys_rate = int(spk.samplerate)
        except:
            sys_rate = 44100
        
        print(f"[Audio] Auto-Detected Sample Rate: {sys_rate} Hz")
        READ_FRAMES = int(sys_rate * 0.1)

        with mic.recorder(samplerate=sys_rate, blocksize=READ_FRAMES * 2) as recorder:
            while self.running:
                try:
                    if self.session is None: time.sleep(1); continue

                    data_sys = recorder.record(numframes=READ_FRAMES)
                    data_mono = data_sys[:, 0] * self.DIGITAL_GAIN
                    data_mono = np.clip(data_mono, -1.0, 1.0)
                    
                    # 1. 通用重采样 (Linear Interpolation)
                    if sys_rate != 16000:
                        target_len = int(len(data_mono) * 16000 / sys_rate)
                        data_reshaped = data_mono.reshape(1, -1)
                        data_16k = cv2.resize(data_reshaped, (target_len, 1), interpolation=cv2.INTER_LINEAR).flatten()
                    else:
                        data_16k = data_mono

                    if len(data_16k) > 0:
                        self.current_vol = float(np.sqrt(np.mean(data_16k**2)))

                    audio_buffer = np.concatenate((audio_buffer, data_16k))

                    # 2. 持续推理 (Rolling Inference)
                    while len(audio_buffer) >= self.VAD_WINDOW:
                        chunk = audio_buffer[:self.VAD_WINDOW]
                        audio_buffer = audio_buffer[self.VAD_WINDOW:]
                        
                        inp = chunk[np.newaxis, :].astype(np.float32)
                        out, h, c = self.session.run(None, {
                            'input': inp, 'sr': np.array([16000], dtype=np.int64), 'h': h, 'c': c
                        })
                        prob = float(out[0][0])
                        self.current_prob = prob
                        
                        # 🟢 计算移动平均概率 (Smoothing)
                        self._prob_buffer.append(prob)
                        self.smoothed_prob = sum(self._prob_buffer) / len(self._prob_buffer)
                        
                except Exception:
                    pass
                time.sleep(0.01)

    def wait_for_speech_complete(self, start_timeout=2.0, silence_duration=0.6, max_total_wait=15.0, speech_threshold=0.4, log_fn=None):
        t0 = time.time()
        speech_started = False
        speech_start_time = 0
        
        # 🟢 智能静音门限 (Smart Silence Threshold)
        # 即使阈值设得很低(0.2)，静音门限也不能太低，至少要挡住BGM的底噪(通常0.1左右)
        # 逻辑：取 (阈值 * 0.6) 和 (0.15) 中的较大值
        silence_threshold = max(0.15, speech_threshold * 0.6)
        
        # 🟢 最小锁定时间：一旦开始，至少保持这么久不结束，防止抖动
        MIN_SPEECH_DURATION = 0.5 

        def _log(s):
            if log_fn: log_fn(s)

        _log(f"  [Audio] Listening... (Thr={speech_threshold:.2f}, SilenceThr={silence_threshold:.2f})")

        while True:
            elapsed = time.time() - t0
            if elapsed > max_total_wait:
                _log("  [Audio] Max wait reached.")
                break
            
            # 使用平滑后的概率进行判断
            prob = self.smoothed_prob
            
            if not speech_started:
                # 判定开始
                if prob > speech_threshold:
                    speech_started = True
                    speech_start_time = time.time()
                    _log(f"  [Audio] Speech START (Prob={prob:.2f})")
                elif elapsed > start_timeout:
                    _log(f"  [Audio] No speech (Timeout). AvgVol={self.current_vol:.3f}")
                    break
            else:
                # 判定结束
                if prob < silence_threshold:
                    # 必须满足两个条件：
                    # 1. 距离上次活跃（非静音）时间超过了 silence_duration
                    # 2. 整个语音段的持续时间超过了 MIN_SPEECH_DURATION (防止短促噪音误触发)
                    if (time.time() - self.last_speech_time > silence_duration) and (time.time() - speech_start_time > MIN_SPEECH_DURATION):
                         _log(f"  [Audio] Speech END (Dur={time.time()-speech_start_time:.1f}s).")
                         break
                else:
                    # 如果概率还在高位，更新最后活跃时间
                    self.last_speech_time = time.time()
            
            time.sleep(0.05)