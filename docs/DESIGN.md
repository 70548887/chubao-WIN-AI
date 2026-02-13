# Windows 本地 AI 自动化控制工具 - 设计方案

> 项目代号：chubao-WIN-AI  
> 版本：v0.3.0  
> 更新日期：2026-02-13

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [核心功能](#3-核心功能)
4. [技术选型](#4-技术选型)
5. [桌面自动化方案](#5-桌面自动化方案)
6. [记忆系统](#6-记忆系统)
7. [项目目录结构](#7-项目目录结构)

---

## 1. 项目概述

### 1.1 项目定位

基于 **OpenClaw** 开源项目二次开发，构建 Windows 平台的本地化 AI 自动化控制工具。

**核心能力：**
- 识别桌面内容（窗口、控件、文字）
- 模拟用户操作（点击、输入、快捷键）
- 多平台聊天集成（飞书、Telegram、WhatsApp）
- 本地持久记忆（知识图谱 + 每日日志）

### 1.2 核心目标

| 目标 | 说明 |
|------|------|
| **本地优先** | 100% 本地运行，数据不出域 |
| **无显卡可用** | CPU 模式完全支持 |
| **轻量部署** | Tauri 2.0 打包，~30-50MB |
| **智能记忆** | 三层超级记忆，复利增长 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Tauri 2.0 桌面应用 (~30MB)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Tauri Core (Rust)                          │   │
│  │  • 窗口管理  • 系统托盘  • IPC 通信  • 文件访问               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│              ┌───────────────┼───────────────┐                     │
│              ▼               ▼               ▼                     │
│  ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐        │
│  │   前端 UI        │ │  Node.js    │ │   Python         │        │
│  │   (WebView2)     │ │  Sidecar    │ │   Sidecar        │        │
│  ├──────────────────┤ ├──────────────┤ ├──────────────────┤        │
│  │ • React          │ │ • OpenClaw  │ │ • pywinauto      │        │
│  │ • 聊天界面       │ │ • AI 调度   │ │ • PaddleOCR      │        │
│  │ • 设置面板       │ │ • 记忆系统  │ │ • GUI 自动化     │        │
│  └──────────────────┘ └──────────────┘ └──────────────────┘        │
│                              │                                      │
│       ┌──────────────────────┼──────────────────┐                  │
│       ▼                      ▼                  ▼                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │  飞书   │  │Telegram │  │WhatsApp │  │本地 CLI │               │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 进程通信架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         进程通信架构                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Tauri (Rust)                                                   │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                                                        │    │
│   │   WebView ◄──invoke──► Rust Commands                  │    │
│   │     │                        │                         │    │
│   │     │                        │ spawn/stdin/stdout      │    │
│   │     │                        ▼                         │    │
│   │     │              ┌─────────────────┐                │    │
│   │     │              │   Sidecars      │                │    │
│   │     │              ├─────────────────┤                │    │
│   │     │              │ node-backend    │──► AI/Memory   │    │
│   │     │              │ python-auto     │──► GUI/OCR     │    │
│   │     │              └─────────────────┘                │    │
│   │     │                                                  │    │
│   └─────│──────────────────────────────────────────────────┘    │
│         │                                                        │
│         ▼                                                        │
│   用户看到的界面                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 OpenClaw 核心架构

基于 OpenClaw 的 **微核 + 插件 + 网关** 设计：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenClaw 核心架构 (Node.js Sidecar)              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Gateway (守护进程)                          │   │
│  │  "耳朵和嘴巴" - 负责与外部信道通信                              │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  飞书 │ Telegram │ WhatsApp │ Discord │ Web │ CLI           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 Agent Runtime (大脑)                          │   │
│  │  ReAct + Function Calling 动态编排                             │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  LLM (大脑)  │  Tools (手)  │  Memory (记忆)  │  Plan (规划) │   │
│  │  Claude API  │  Skills      │  三层记忆        │  ReAct     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               OS-Native Tools (手脚)                           │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  Shell Exec   │ Browser Relay │ File System │ GUI 自动化   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心功能

### 3.1 功能清单

| 功能模块 | 描述 | 优先级 | 技术方案 |
|----------|------|--------|----------|
| **桌面控制** | GUI 自动化、鼠标键盘模拟 | P0 | pywinauto + pyautogui |
| **屏幕识别** | 文字识别、UI 元素识别 | P0 | PaddleOCR (CPU) |
| **聊天集成** | 飞书/Telegram/WhatsApp | P0 | OpenClaw Gateway |
| **记忆存储** | 持久化上下文、用户偏好 | P0 | 三层记忆 + sqlite-vec |
| **浏览器控制** | 自动化网页操作 | P1 | Playwright |
| **邮件自动化** | 邮件分类、回复、归档 | P2 | Skills 插件 |
| **日历管理** | 日程安排、提醒 | P2 | Skills 插件 |

### 3.2 桌面自动化能力

| 能力 | 无显卡支持 | 技术方案 | 性能 |
|------|------------|----------|------|
| 获取窗口列表 | ✅ | pywinauto API | 即时 |
| 获取控件信息 | ✅ | Win UI Automation | 即时 |
| 点击按钮 | ✅ | pywinauto.click() | 即时 |
| 输入文字 | ✅ | pywinauto.type_keys() | 即时 |
| 菜单操作 | ✅ | pywinauto.menu_select() | 即时 |
| 截图 | ✅ | pyautogui.screenshot() | 即时 |
| OCR 文字识别 | ✅ CPU | PaddleOCR | 300-500ms |

### 3.3 支持的应用类型

| 应用类型 | API 支持 | OCR 备选 | 示例 |
|----------|----------|----------|------|
| **Office 套件** | ✅ 完全 | - | Word, Excel, Outlook |
| **浏览器** | ✅ 完全 | - | Chrome, Edge, Firefox |
| **系统应用** | ✅ 完全 | - | 资源管理器, 设置 |
| **编辑器** | ✅ 完全 | - | VS Code, Notepad++ |
| **通讯软件** | ✅ 大部分 | 备选 | 微信, 飞书, Teams |
| **自定义应用** | ⚠️ 部分 | ✅ 需要 | 各类小众软件 |

---

## 4. 技术选型

### 4.1 核心技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **桌面框架** | Tauri 2.0 | Rust 后端，~30MB 包体 |
| **前端 UI** | React + WebView2 | 系统原生渲染 |
| **AI 核心** | OpenClaw (Node.js) | Sidecar 嵌入 |
| **GUI 自动化** | pywinauto + pyautogui | Python Sidecar |
| **OCR** | PaddleOCR | CPU 模式，中文 96% |
| **LLM** | Claude API | claude-sonnet-4-20250514 |
| **记忆存储** | sqlite-vec | 本地向量检索 |

### 4.2 OpenClaw 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 22+ |
| 语言 | TypeScript (ESM) | 5.x |
| 包管理 | pnpm | 10.x |
| HTTP | Express | 5.x |
| WebSocket | ws | 8.x |
| 向量存储 | sqlite-vec | 0.1.7 |
| 浏览器控制 | playwright-core | 1.58 |

### 4.3 硬件需求

| 配置 | 最低要求 | 推荐配置 |
|------|----------|----------|
| **CPU** | Intel i5 / Ryzen 5 | Intel i7 / Ryzen 7 |
| **内存** | 8GB | 16GB |
| **显卡** | **不需要** | NVIDIA GTX 1060+ (可选) |
| **磁盘** | 10GB | 20GB |
| **系统** | Windows 10 22H2 | Windows 11 |

---

## 5. 桌面自动化方案

### 5.1 优先策略：API 优先，视觉回退

```
┌─────────────────────────────────────────────────────────────────────┐
│                    桌面自动化优先策略                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  第一优先级: Windows UI Automation API (90%场景，零 GPU)            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  pywinauto + pyautogui                        │   │
│  │  • 获取窗口/控件信息  • 点击/输入  • 菜单操作  • 窗口控制    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │ API 失败时                              │
│                           ▼                                        │
│  第二优先级: 截图 + OCR (10%场景，CPU 模式)                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               pyautogui.screenshot() + PaddleOCR              │   │
│  │  • 截图  • OCR 识别 (300-500ms)  • 定位坐标  • 点击           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  不推荐 (无显卡时太慢):                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ❌ OmniParser V2 (CPU ~5-10s)  ❌ UI-TARS (CPU ~10-30s)     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 pywinauto 使用示例

**操作记事本：**
```python
from pywinauto import Application

app = Application(backend='uia').connect(title='Notepad')
app.window().Edit.type_keys('Hello World!', with_spaces=True)
app.window().menu_select("File->Save")
```

**操作浏览器：**
```python
from pywinauto import Application
import pyautogui

app = Application(backend='uia').connect(title_re='.*Chrome.*')
app.window().child_window(control_type='Edit').set_text('https://google.com')
pyautogui.press('enter')
```

**OCR 识别并点击：**
```python
import pyautogui
from paddleocr import PaddleOCR

screenshot = pyautogui.screenshot()
screenshot.save('screen.png')

ocr = PaddleOCR(use_angle_cls=True, lang='ch', use_gpu=False)
result = ocr.ocr('screen.png')

for line in result[0]:
    if '确定' in line[1][0]:
        box = line[0]
        center_x = (box[0][0] + box[2][0]) / 2
        center_y = (box[0][1] + box[2][1]) / 2
        pyautogui.click(center_x, center_y)
```

---

## 6. 记忆系统

### 6.1 三层超级记忆架构

基于 OpenClaw 的记忆系统，实现动态自演化：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    三层超级记忆架构                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Layer 1: 知识图谱 (/life/areas/)                                   │
│  ├─ 存储：实体文件夹 (people/, companies/, projects/)                │
│  ├─ 内容：原子事实 (items.json) + 动态摘要 (summary.md)           │
│  └─ 更新：每周自动综合整理                                        │
│                                                                     │
│  Layer 2: 每日笔记 (memory/YYYY-MM-DD.md)                            │
│  ├─ 存储：Markdown 文件                                              │
│  ├─ 内容：事件日志 - 发生了什么，何时发生                           │
│  └─ 更新：实时记录                                                │
│                                                                     │
│  Layer 3: 隐性知识 (MEMORY.md)                                       │
│  ├─ 存储：Markdown 文件                                              │
│  ├─ 内容：模式、偏好、经验教训                                      │
│  └─ 特点：关于用户本身的事实                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 存储结构

```
memory/
├── MEMORY.md                  # Layer 3: 隐性知识
├── USER.md                    # 用户画像
├── daily/                     # Layer 2: 每日笔记
│   ├── 2026-02-13.md
│   └── 2026-02-12.md
└── AGENTS.md                  # 行为规则

life/
└── areas/                     # Layer 1: 知识图谱
    ├── people/
    │   └── [entity]/
    │       ├── summary.md     # 动态摘要 (每周重写)
    │       └── items.json     # 原子事实
    ├── companies/
    └── projects/
```

### 6.3 向量检索

- **存储引擎**: sqlite-vec (本地向量数据库)
- **嵌入模型**: OpenAI/Gemini/Voyage
- **检索方式**: BM25 + 向量混合检索

---

## 7. 项目目录结构

```
chubao-WIN-AI/
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── commands.rs          # Tauri 命令
│   │   └── tray.rs              # 系统托盘
│   ├── Cargo.toml               # Rust 依赖
│   └── tauri.conf.json          # Tauri 配置
│
├── src/                          # 前端 UI (React)
│   ├── App.tsx
│   ├── components/
│   │   ├── Chat/                # 聊天组件
│   │   └── Settings/            # 设置组件
│   └── pages/
│
├── sidecars/                     # 嵌入的子进程
│   ├── node-backend/            # OpenClaw Node.js 后端
│   │   ├── src/
│   │   │   ├── gateway/         # 消息网关
│   │   │   ├── agents/          # Agent 运行时
│   │   │   ├── memory/          # 记忆管理
│   │   │   └── tools/           # 工具集
│   │   └── package.json
│   │
│   └── python-automation/       # Python GUI 自动化
│       ├── main.py              # 入口
│       ├── gui_control.py       # pywinauto 封装
│       ├── ocr_service.py       # PaddleOCR 服务
│       └── requirements.txt
│
├── memory/                       # 记忆存储
│   ├── MEMORY.md
│   ├── USER.md
│   └── daily/
│
├── life/                         # 知识图谱
│   └── areas/
│       ├── people/
│       ├── companies/
│       └── projects/
│
├── docs/                         # 文档
│   ├── DESIGN.md                # 设计方案 (本文件)
│   └── TECH_STACK.md            # 技术栈
│
├── openclaw-main/               # OpenClaw 源码 (参考)
│
├── package.json                  # 前端依赖
└── README.md
```

---

## 附录

### A. 关键依赖

**Tauri (Rust):**
```toml
[dependencies]
tauri = { version = "2.0", features = ["shell-sidecar", "tray-icon"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

**Node.js Sidecar:**
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "sqlite-vec": "^0.1.7",
    "express": "^5.2.0",
    "ws": "^8.19.0"
  }
}
```

**Python Sidecar:**
```
pywinauto>=0.6.8
pyautogui>=0.9.54
paddleocr>=2.7.0
paddlepaddle>=2.5.0
pillow>=10.0.0
```

### B. 参考项目

- OpenClaw: https://github.com/openclaw/openclaw
- Tauri: https://tauri.app
- pywinauto: https://github.com/pywinauto/pywinauto
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR

---

*文档版本: v0.3.0 | 最后更新: 2026-02-13*
