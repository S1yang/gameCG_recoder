import time
import threading
import numpy as np
import pyaudio

class AudioMonitor:
    def __init__(self, threshold=0.01, silence_duration=0.5):
        self.chunk = 1024
        self.format = pyaudio.paInt16
        self.channels = 2
        self.rate = 44100
        
        self.threshold = threshold          # 音量阈值 (0.0 ~ 1.0)
        self.silence_duration = silence_duration # 需要保持静音多久才算结束
        
        self.p = pyaudio.PyAudio()
        self.stream = None
        self.running = False
        self.thread = None
        
        # 状态
        self.current_rms = 0.0
        self.is_speaking = False
        self.silence_start_time = 0.0
        self.can_advance = True  # 是否允许推进（即：是否已说完）

    def _find_loopback_device(self):
        """寻找 Windows WASAPI Loopback 设备"""
        try:
            # 遍历寻找包含 "Stereo Mix" 或 "立体声混音" 或 loopback 的设备
            # 在 WASAPI host api 下找
            info = self.p.get_host_api_info_by_type(pyaudio.paWASAPI)
            if not info:
                return None
                
            host_api_index = info.get('index')
            
            for i in range(self.p.get_device_count()):
                dev = self.p.get_device_info_by_index(i)
                if dev.get('hostApi') == host_api_index:
                    # WASAPI input device (loopback)
                    # 通常是默认输出设备的 loopback 版本
                    if dev.get('maxInputChannels') > 0:
                        return i
        except Exception:
            pass
        return None

    def start(self):
        if self.running:
            return
            
        dev_idx = self._find_loopback_device()
        if dev_idx is None:
            print("[Audio] Warning: No WASAPI loopback device found. Audio pacing may not work.")
            # Fallback: try default input (mic) just in case, or fail
            # dev_idx = self.p.get_default_input_device_info()['index']
            return

        print(f"[Audio] Listening on device index: {dev_idx}")

        self.stream = self.p.open(
            format=self.format,
            channels=self.channels,
            rate=self.rate,
            input=True,
            input_device_index=dev_idx,
            frames_per_buffer=self.chunk,
            stream_callback=None
        )
        
        self.running = True
        self.thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        self.p.terminate()

    def _listen_loop(self):
        while self.running:
            try:
                data = self.stream.read(self.chunk)
                # Convert to numpy array
                audio_data = np.frombuffer(data, dtype=np.int16)
                # Calculate RMS (Root Mean Square) -> Volume
                # int16 max is 32768
                rms = np.sqrt(np.mean(audio_data**2)) / 32768.0
                self.current_rms = rms
                
                # Logic: Speech Detection
                if rms > self.threshold:
                    # 声音很大，正在说话/播放语音
                    self.is_speaking = True
                    self.can_advance = False
                    self.silence_start_time = None
                else:
                    # 声音很小 (静音 或 BGM)
                    if self.is_speaking:
                        # 刚才在说话，现在停了，开始计时
                        if self.silence_start_time is None:
                            self.silence_start_time = time.time()
                        
                        # 检查静音持续时间
                        if time.time() - self.silence_start_time > self.silence_duration:
                            self.is_speaking = False
                            self.can_advance = True
                            # print("[Audio] Speech ended.")
                    else:
                        # 一直没说话
                        self.can_advance = True

            except Exception as e:
                print(f"[Audio Error] {e}")
                time.sleep(0.5)

    def wait_for_speech_end(self, timeout=10.0):
        """阻塞直到语音播放结束"""
        if not self.running:
            time.sleep(1.0) # fallback delay
            return

        t0 = time.time()
        # 1. 稍微等一下，给语音开始播放留点时间 (Attack time)
        time.sleep(0.15) 
        
        # 2. 如果检测到正在说话，就死等
        while self.is_speaking and (time.time() - t0 < timeout):
            time.sleep(0.05)
        
        # 3. 说话结束，返回
        return