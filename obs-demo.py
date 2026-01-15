import time
from obsws_python import ReqClient

HOST = "127.0.0.1"
PORT = 4455          # OBS 28+ 默认 4455
PASSWORD = "520diana" # 与 OBS 里设置一致

def main():
    obs = ReqClient(host=HOST, port=PORT, password=PASSWORD)

    # 可选：确认连接成功并读一下版本信息
    v = obs.get_version()
    print("Connected to OBS:", v.obs_version, "| WebSocket:", v.obs_web_socket_version)

    print("Start recording...")
    obs.start_record()
    time.sleep(5)

    print("Stop recording...")
    obs.stop_record()

    # 可选：读一下最终录制状态
    st = obs.get_record_status()
    print("Recording active:", st.output_active)

if __name__ == "__main__":
    main()
