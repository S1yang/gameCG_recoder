# GalRec

**GalRec**是一款 GC 录制工具，用于 Galgame 和有 Gallery 的游戏，可以通过配置一系列任务序列来自动化执行并录制 CG。

它支持长时间无人值守运行，并能够处理剧情推动中的**分支情况**。

录制的工作交给 OBS，该工具与 OBS 进行通信，有关视频录制的详细配置请在 OBS 上配置。请确保 OBS 能正确地录制画面和音频。

## ✨ GalRec 能做什么？

- 🎮 自动推进游戏流程并录制 CG
- 🧠 基于图像模板（截图/ROI）识别界面状态
- 🔀 自动处理选项分支、弹窗等非线性剧情
- 🎵 添加音频模式以更智能地推进剧情

## 🧑‍💻 谁适合用 GalRec？

- 想 **自动录制 CG**，不想反复手点
- 能接受为录制 CG 剧情 **配置任务**
- 希望工具 **可预测、不中途乱点**
- 能接受工具 **接管你的鼠标和窗口**, 在录制期间你可以去做点别的（你可以尝试在虚拟机里运行它，这样你就可以继续操控主机）
- 能接受一些奇奇怪怪的 bug

## 🚀 下载应用

### A. 解压即用

1. 进入仓库的 Releases
2. 下载最新版本的压缩包（通常类似 `GalRecX.X.zip`）
3. 尽量解压到一个纯英文路径，**不要放 C 盘系统目录**，避免权限/路径问题
   例：`D:\Apps\GalRec\`
4. **下载 OBS**

### B. 开发模式 (未经验证正确性)

#### B0. 准备环境

- Git
- Miniconda/Anaconda
- Python 3.11
- Node.js 20+

```bash
git clone https://github.com/S1yang/gameCG_recoder.git
cd GalRec

conda create -n galrec python=3.11 -y
conda activate galrec

python -m pip install -U pip
pip install -r requirements.txt

```

#### B1. 启动工具

```cd ui_electron
npm install
npm run electron:dev
```

## 🤠 教程（非常重要）

### 1.快速开始（一个最常用，且简单的录制案例）

这里我们介绍如何新建一个游戏项目，如何创建一个录制任务，如何运行录制。
这里的录制默认没有分支，默认剧情推进是固定时间间隔的

#### 1.1 打开软件并部署 OBS

##### 1.打开软件

![Alt text](image.png)

##### 2.打开 OBS

![Alt text](image-1.png)

##### 3.配置 OBS 捕捉游戏窗口

打开你要录制的游戏，配置好你的 OBS 录制游戏的相关参数，包括录制的分辨率、帧率、录制文件的质量等。

![Alt text](QQ_1770003661513.png)

##### 4.配置 OBS WebSocket

点击 OBS 顶部菜单栏的 **工具(T)** -> **WebSocket 服务器设置**

开启 WebSocket 服务器，配置服务器端口、密码等。你可以保持这个窗口不关闭，以监控软件是否能正常连上 WebSocket 服务器。

![Alt text](image-2.png)

#### 1.2 配置针对该游戏的配置

##### 1 创建一个游戏项目

这里注意**游戏窗口的名称**（下图的 Window Title）最好能对齐游戏窗口，不然软件很可能匹配不上正确的游戏窗口。
一个常见的 BUG 是其他窗口（比如存放游戏的文件夹）很可能也包含这个游戏的关键字，这导致窗口匹配不正确。

![Alt text](78c8e666b2221ba00aa0dccd902848ed.png)

点击“Create Game”来创建一个该游戏的文件夹来维护

![Alt text](image-3.png)

如果你想看这个文件夹在哪，可以直接点击右上角的文件夹按钮

##### 2 配置该游戏项目的一些参数

![Alt text](image-6.png)

这里仅列举一些常用到的参数，注意**修改后一定要保存**：

1.窗口标题可以在此处重命名

2.语音模式是可选项，目的是为了更智能的录制，如果你录制是以固定时间点推进的，这一项开关都无所谓。

3.**OBS 一定要配置对**，在这里填入与 OBS 软件里一样的端口号/密码，HostIP 不用动。

![Alt text](image-4.png)

4. **System Pacing Interval 代表你推进剧情时的时延**，例如，你希望每一段对话都持续 3 秒，那么这里的间隔设置就是 3s。

![Alt text](image-5.png)

#### 1.3 配置一个录制任务

##### 1.创建一个录制任务

在“任务序列”下新建一个任务，点击“New Task”按钮

![Alt text](image-7.png)

![Alt text](image-8.png)

![Alt text](image-9.png)

##### 2.配置阶段 1-入口识别

将游戏切到画廊处，点击“capture” 截取要点击进入的事件

![Alt text](image-11.png)

##### 3.配置阶段 2-前置序列

你在进入正式录制时可能要预点击故事中的一些图标，比如你希望切换衣服、表情等。这里也是通过设置截图，时延的方式模拟你的操作。

![Alt text](image-12.png)

##### 4.配置阶段 3-推进循环

这里支持配置分支队列、音频推进等。

考虑到这是一个简单示例，这里仅介绍最简单的线性、固定时延方式。
如果是鼠标左键推进，你可以点击“pick”按钮来选择正确的鼠标该点击来推进剧情的位置

![Alt text](image-13.png)

##### 5.配置阶段 4-结束判定

我们都知道一段剧情播完后大部分游戏都是回到画廊界面，所以这里截取一张画廊的全图，就可以大概率退出。

![Alt text](image-14.png)

#### 1.4 运行一个录制任务

选定该任务后运行就行了，注意如果出现任何问题，**请尝试疯狂按“F9”来退出后端录制**，避免一直抢鼠标

![Alt text](7fadbd4f29caaadc7da3116c9173482c.png)

![Alt text](e1ac7c702df4df68e0ceecfad5caf0b7.png)

![Alt text](e2abaef73d62cbc8f65c204875165309.png)

录制成功后的文件在
resources\backend\galrec_api_internal\output 文件夹下

#### 1.5（可选）查看一个典型的日志

运行日志页面提供了完整的运行日志，你可以查看上次录制是卡在了何处

![Alt text](image-15.png)

#### 1.6（可选）维护图片库

图片库里可以统一截取并管理图片

![Alt text](image-16.png)

## 🏗️ 架构概览

GalRec 采用 **本地解耦架构**，所有组件运行在同一台电脑上：

- **后端**：FastAPI（Python）
- **前端**：Electron + Vite + React
- **执行器**：Python Runner（自动化 + 视觉）
- **录制**：OBS（WebSocket 控制）

```
┌──────────────┐
│   桌面 UI    │  Electron / React
└──────┬───────┘
       │ 本地 HTTP
┌──────▼───────┐
│   FastAPI    │  模板 / 任务 / 控制
└──────┬───────┘
       │ 子进程
┌──────▼───────┐
│   Runner     │  识别 + 输入 + OBS
└──────────────┘
```

## 📄 使用与版权说明

GalRec 仅用于 **个人存档与合理使用**。

用户需自行遵守：

- 游戏 EULA
- 当地版权法规
