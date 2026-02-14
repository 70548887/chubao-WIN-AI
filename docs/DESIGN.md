# Windows 本地 AI 自动化控制工具 - 设计方案

> 项目代号：chubao-WIN-AI  
> 版本：v0.4.0  
> 更新日期：2026-02-13

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [核心功能](#3-核心功能)
4. [技术选型](#4-技术选型)
5. [桌面自动化方案](#5-桌面自动化方案)
6. [记忆系统](#6-记忆系统)
7. [持续运行开发系统](#7-持续运行开发系统)
8. [多 Agent 并发开发](#8-多-agent-并发开发)
   1. [OpenClaw 上游多 Agent 能力](#88-openclaw-上游多-agent-能力)
   2. [OpenCode & Oh-My-OpenCode 集成方案](#89-opencode--oh-my-opencode-集成方案)
   3. [实施路线图](#810-实施路线图)
   4. [成本与风险控制](#811-成本与风险控制)
9. [项目目录结构](#9-项目目录结构)

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

## 7. 持续运行开发系统

> 详细分析文档：[CONTINUOUS_DEV_ANALYSIS.md](./CONTINUOUS_DEV_ANALYSIS.md)

### 7.1 目标

AI 系统能够 7×24 长久运行，持续进行开发任务，自主循环「分析→编码→测试→修复→提交」，无需人工频繁干预。

### 7.2 当前能力诊断

| 维度 | 当前状态 | 目标状态 | 差距 |
|------|----------|----------|------|
| **Agent 循环** | 最大 5 轮迭代，然后停止 | 无限循环，任务完成才停止 | 需重写 runtime.ts |
| **会话持久化** | 每次调用从零构建消息 | 对话历史磁盘持久化，中断可恢复 | 需新增 session store |
| **任务持续性** | 无任务状态管理 | 任务可跨会话延续 | 需新增 task manager |
| **错误恢复** | 工具失败直接中断 | 自动重试 + 超时中断 + 回滚 | 需增强错误处理 |
| **定时触发** | 不支持 | Cron 定时任务（代码检查、进度汇报） | 需新增 cron 调度 |
| **进程守护** | 无 | 崩溃自动重启 + 健康检查 | 需新增 supervisor |

### 7.3 关键改造点

```
┌───────────────────────────────────────────────────────────┐
│              持续运行开发系统架构                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           进程守护 (Process Supervisor)           │    │
│  │  • 崩溃自动重启  • 健康检查  • 日志轮转           │    │
│  └──────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │          Agent 循环 (Unlimited Loop)              │    │
│  │  • maxIterations: ∞（移除上限）                   │    │
│  │  • 消息历史累积（不再从零构建）                    │    │
│  │  • 工具调用重试（3 次 + 指数退避）                │    │
│  │  • 超时中断（单次调用 5 分钟上限）                │    │
│  └──────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │         会话持久化 (Session Store)                 │    │
│  │  • SQLite 存储对话历史                             │    │
│  │  • 支持 session 恢复和回放                         │    │
│  │  • Token 使用统计和预算控制                        │    │
│  └──────────────────────────────────────────────────┘    │
│                          │                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │         定时任务 (Cron Scheduler)                  │    │
│  │  • 定时代码检查  • 进度汇报  • 记忆整理            │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 7.4 OpenClaw 上游已有能力

| 能力 | 上游模块 | 状态 |
|------|----------|------|
| Agent Loop (无限循环) | `docs/concepts/agent-loop.md` | 可直接集成 |
| Command Queue (FIFO) | `docs/concepts/queue.md` | 可直接集成 |
| Session 持久化 | `agents/<id>/sessions/` | 可直接集成 |
| Cron Jobs | `docs/concepts/cron.md` | 可直接集成 |
| 超时中断 | Queue timeout 机制 | 可直接集成 |

---

## 8. 多 Agent 并发开发

> 详细方案文档：[MULTI_AGENT_CONCURRENT_PLAN.md](./MULTI_AGENT_CONCURRENT_PLAN.md)  
> 参考项目分析：[REFERENCE_PROJECTS.md](./REFERENCE_PROJECTS.md)

### 8.1 参考项目：auto-coding-agent-demo

| 项目 | 详情 |
|------|------|
| **定位** | 全自动编程 Agent 实验 — 100% 代码由 AI 生成 |
| **驱动** | Claude Code CLI (`claude -p --dangerously-skip-permissions`) |
| **实证** | 31 个任务，10 小时完成完整 Next.js 项目（前后端+数据库+第三方API） |
| **模式** | 串行单 Agent（task.json → CLAUDE.md 工作流 → run-automation.sh 循环） |
| **瓶颈** | 不支持并发，共享 task.json/workspace，无锁，无依赖图 |

**可借鉴的优秀设计：**

| 设计模式 | 说明 |
|----------|------|
| task.json 结构化任务 | 每个任务有 id/title/description/steps/passes |
| CLAUDE.md 强制工作流 | 6 步：初始化→选任务→实现→测试→记录→提交 |
| progress.txt 传承 | 每个 Agent 会话记录工作，给后续 Agent 参考 |
| 阻塞处理规则 | 明确定义何时停止、如何报告、禁止假装完成 |
| 单任务单提交 | 每个任务一个 commit，便于追溯和回滚 |

### 8.2 并发方案架构

```
┌─────────────────────────────────────────────────────────────────┐
│               多 Agent 并发调度器 (Orchestrator)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  task.json (增强版)                                              │
│    ├── depends_on: 依赖关系图                                    │
│    ├── role: 角色标签 (frontend/backend/test)                    │
│    ├── locked_by: 任务锁（防止重复选取）                         │
│    └── parallel_group: 并行分组                                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             任务调度器 (Task Scheduler)                    │   │
│  │  1. 拓扑排序解析依赖图，识别可并行任务                      │   │
│  │  2. 按角色分配任务给 Agent                                 │   │
│  │  3. 原子锁定任务（防止重复选取）                            │   │
│  │  4. 监控 Agent 状态和进度                                  │   │
│  │  5. 任务完成后触发合并 + 检查新的可执行任务                 │   │
│  └──────┬──────────┬──────────┬──────────┬──────────────────┘   │
│         ↓          ↓          ↓          ↓                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Agent A  │ │ Agent B  │ │ Agent C  │ │ Agent D  │          │
│  │ 前端开发 │ │ 后端开发 │ │ API 开发 │ │ 测试 QA  │          │
│  │ Branch:  │ │ Branch:  │ │ Branch:  │ │ Branch:  │          │
│  │ feat/ui  │ │ feat/api │ │ feat/svc │ │ feat/qa  │          │
│  │ Sonnet   │ │ Sonnet   │ │ Haiku    │ │ Haiku    │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│         ↓          ↓          ↓          ↓                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                合并管理器 (Merge Manager)                  │  │
│  │  • 每个 Agent 完成后自动 PR 到 main                        │  │
│  │  • 自动 lint + build 验证                                  │  │
│  │  • 无冲突自动合并 / 有冲突通知调度器                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 增强版 task.json 格式

```json
{
  "project": "my-project",
  "concurrency": {
    "max_agents": 4,
    "merge_strategy": "rebase",
    "conflict_policy": "notify"
  },
  "tasks": [
    {
      "id": 1,
      "title": "数据库 Schema",
      "role": "backend",
      "depends_on": [],
      "parallel_group": "foundation",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 8,
      "title": "智谱AI API 封装",
      "role": "backend",
      "depends_on": [1],
      "parallel_group": "ai_services",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 19,
      "title": "首页 UI",
      "role": "frontend",
      "depends_on": [4, 5, 6],
      "parallel_group": "ui_pages",
      "passes": false,
      "locked_by": null,
      "started_at": null
    }
  ]
}
```

**新增字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | string | 任务角色（frontend/backend/test/devops），按角色分配 Agent |
| `depends_on` | number[] | 前置任务 ID 列表，全部完成才可开始 |
| `parallel_group` | string | 同组任务可并行执行 |
| `locked_by` | string\|null | 当前锁定此任务的 Agent ID |
| `started_at` | string\|null | 任务开始时间戳，用于超时检测 |
| `concurrency` | object | 全局并发控制（最大 Agent 数、合并策略、冲突处理） |

### 8.4 依赖图与并行效率

以 auto-coding-agent-demo 的 31 个任务为例，通过依赖分析可分为 8 层：

```
Layer 0 (基础):     [1]                                   ← 串行
Layer 1 (基础):     [2] [3]                               ← 2 并行
Layer 2 (认证):     [4] [5] [6] [7]                       ← 4 并行
Layer 3 (服务):     [8] [9] [10]                          ← 3 并行
Layer 4 (数据层):   [11] [12] [13]                        ← 3 并行
Layer 5 (API):      [14] [15] [16] [17] [18]              ← 5 并行
Layer 6 (UI):       [19] [20] [21]                        ← 3 并行
Layer 7 (详情页):   [22] [23] [24] [25] [26] [27]         ← 部分并行
Layer 8 (收尾):     [28] [29] [30] [31]                   ← 4 并行
```

| 指标 | 串行 (当前) | 2 Agent | 4 Agent |
|------|------------|---------|----------|
| 完成时间 | ~10 小时 | ~6 小时 | ~3.5 小时 |
| 效率提升 | 基准 | 40% | **65%** |
| Token 消耗 | 1x | ~2x | ~4x |

### 8.5 Agent 隔离方案

| 方案 | 方式 | 优点 | 缺点 |
|------|------|------|------|
| **Git Branch** (推荐) | 每 Agent 独立分支，完成后 PR 合并 | 简单、原生支持 | 合并时可能冲突 |
| **Git Worktree** (高级) | 每 Agent 独立工作目录 | 完全文件隔离 | 磁盘占用 N 倍 |
| **端口隔离** | 每 Agent 独立 dev server 端口 | 互不干扰 | 资源占用增加 |

### 8.6 调度器核心逻辑

```typescript
class MultiAgentOrchestrator {
  private tasks: Task[];
  private agents: Map<string, AgentProcess>;
  private taskLock: AsyncMutex;

  // 获取当前可执行任务（依赖已满足 + 未被锁定）
  getReadyTasks(): Task[] {
    return this.tasks.filter(task => {
      if (task.passes || task.locked_by) return false;
      return task.depends_on.every(depId =>
        this.tasks.find(t => t.id === depId)?.passes === true
      );
    });
  }

  // 原子分配任务（带锁）
  async assignTask(agentId: string, role: string): Promise<Task | null> {
    const release = await this.taskLock.acquire();
    try {
      const task = this.getReadyTasks().find(t => t.role === role)
                || this.getReadyTasks()[0];
      if (task) {
        task.locked_by = agentId;
        task.started_at = new Date().toISOString();
        await this.saveTaskJson();
      }
      return task || null;
    } finally { release(); }
  }

  // 主循环：持续调度直到全部完成
  async run(): Promise<void> {
    while (!this.allTasksComplete()) {
      for (const agent of this.getFreeAgents()) {
        const task = await this.assignTask(agent.id, agent.role);
        if (task) agent.execute(task); // 非阻塞
      }
      await sleep(5000);
    }
  }
}
```

### 8.7 chubao-WIN-AI 集成改造

| 改造项 | 说明 |
|--------|------|
| **AgentRuntime 多实例** | 为每个开发 Agent 创建独立 AgentRuntime |
| **MemoryManager 命名空间** | 每 Agent 独立 namespace 避免记忆污染 |
| **ToolManager 权限控制** | 不同角色的 Agent 可用工具不同 |
| **GatewayServer 多路复用** | WebSocket 支持按 Agent ID 路由消息 |
| **新增调度器工具** | task_assign / task_complete / task_status / spawn_agent / merge_request |
| **前端监控面板** | 实时显示各 Agent 状态、依赖图、进度统计、日志流 |

### 8.8 OpenClaw 上游多 Agent 能力

| 能力 | 上游模块 | 说明 |
|------|----------|------|
| Sub-Agent (子 Agent) | `tools/subagents.md` | `sessions_spawn` 非阻塞生成，最大 8 并发 |
| Multi-Agent Routing | `concepts/multi-agent.md` | 每 Agent 独立 workspace/session/auth |
| Queue Lane 隔离 | `concepts/queue.md` | main(4并发) + subagent(8并发) + cron(1并发) |
| 子 Agent 模型分级 | `subagents.model` 配置 | 子 Agent 用便宜模型降低成本 |

### 8.9 OpenCode & Oh-My-OpenCode 集成方案

基于对 opencode-dev 和 oh-my-opencode-dev 项目的深入分析，我们发现这两个项目具备强大的多 Agent 并发开发能力，可通过 chubao 统一控制实现更高效的开发流程。

#### 8.9.1 OpenCode 核心能力

| 能力 | 说明 |
|------|------|
| **非交互式运行模式** | `run` 命令支持完全自动化执行，无需人工干预 |
| **Client/Server 架构** | 支持远程控制和编程接口，便于 chubao 调用 |
| **Git Worktree 支持** | 内置完整的 Git 工作树管理，支持多分支并行开发 |
| **内置 Agent 系统** | build(主要开发)、plan(分析)、general(通用)、explore(探索) 等 |
| **Session 管理** | 支持会话持久化和恢复，确保任务连续性 |

#### 8.9.2 Oh-My-OpenCode 增强能力

| 能力 | 说明 |
|------|------|
| **Atlas 主协调器** | 任务委派系统，可按类别或专业 Agent 分配任务 |
| **BackgroundManager** | 并发任务管理器，支持后台并行执行 |
| **专业 Agent 系统** | Sisyphus(任务管理)、Hephaestus(构建)、Oracle(决策) 等 |
| **任务委派机制** | 支持按技能和领域委派任务给不同专业 Agent |
| **并发控制** | ConcurrencyManager 精确控制并发数量 |

#### 8.9.3 chubao 集成架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              chubao 控制层                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    任务调度与协调器 (Orchestrator)                    │   │
│  │  • 高层任务规划  • 资源分配  • 进度监控  • 错误处理                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                ┌─────────────────────┼─────────────────────┐                 │
│                ▼                     ▼                     ▼                 │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐     │
│  │   OpenCode 实例 A   │ │   OpenCode 实例 B   │ │   OpenCode 实例 C   │     │
│  │   (前端开发)        │ │   (后端开发)        │ │   (测试验证)        │     │
│  │   • 非交互式运行    │ │   • 非交互式运行    │ │   • 非交互式运行    │     │
│  │   • Git Worktree    │ │   • Git Worktree    │ │   • Git Worktree    │     │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘     │
│                │                     │                     │                 │
│                └─────────────────────┼─────────────────────┘                 │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   Oh-My-OpenCode 协调层                              │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │   │
│  │  │   Atlas 主协调器  │ │  BackgroundManager │ │  ConcurrencyManager │   │   │
│  │  │   (任务委派)    │ │   (并发管理)      │ │   (并发控制)      │   │   │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘      │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │   │
│  │  │  Sisyphus Agent │ │ Hephaestus Agent │ │  Oracle Agent   │      │   │
│  │  │   (任务管理)    │ │   (构建专家)     │ │   (决策专家)     │   │   │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.9.4 集成优势

| 优势 | 说明 |
|------|------|
| **完全自动化** | OpenCode 的非交互式模式实现 100% 自动化开发 |
| **专业分工** | Oh-My-OpenCode 的专业 Agent 系统实现精细化分工 |
| **并发执行** | BackgroundManager 支持多任务并行执行 |
| **隔离开发** | Git Worktree 确保各 Agent 任务互不干扰 |
| **统一控制** | chubao 作为主控制器协调整个开发流程 |
| **灵活委派** | Atlas 可根据任务类型委派给最适合的专业 Agent |

#### 8.9.5 实施策略

1. **chubao 作为主控制器**：负责整体任务规划和资源协调
2. **OpenCode 作为执行引擎**：利用其非交互式模式执行具体开发任务
3. **Oh-My-OpenCode 作为协调层**：使用 Atlas 委派任务，BackgroundManager 管理并发
4. **Git Worktree 保障隔离**：确保多 Agent 并行开发的安全性
5. **Session 持久化**：保证任务中断后的恢复能力

### 8.10 实施路线图

```
Phase 1 (Day 1-2): 增强 task.json + 依赖解析器
Phase 2 (Day 2-3): Git Branch 隔离 + 端口隔离
Phase 3 (Day 3-5): MultiAgentOrchestrator 调度器
Phase 4 (Day 5-7): chubao AgentRuntime 多实例 + 前端监控
Phase 5 (Day 7-8): 31 任务并发测试 + 冲突处理验证
```

### 8.11 成本与风险控制

| 策略 | 说明 |
|------|------|
| 角色模型分级 | 调度器用 Sonnet，QA/数据 Agent 用 Haiku |
| 智能并发 | 根据依赖图动态调整并发数，不盲目开满 |
| Token 预算 | 每 Agent 每日 Token 上限，超出暂停 |
| 超时检测 | 任务超 30 分钟未完成，自动回滚并释放锁 |
| 缓存复用 | 共享 lint/build 缓存，减少重复构建 |

---

## 9. 项目目录结构

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
│   ├── TECH_STACK.md            # 技术栈
│   ├── CONTINUOUS_DEV_ANALYSIS.md  # 持续运行开发分析
│   ├── MULTI_AGENT_CONCURRENT_PLAN.md  # 多Agent并发方案
│   ├── REFERENCE_PROJECTS.md    # 参考项目分析
│   └── SPRINT_NEXT_PLAN.md      # 下一迭代计划
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

*文档版本: v0.5.0 | 最后更新: 2026-02-13*
