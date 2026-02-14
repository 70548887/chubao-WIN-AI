# 参考项目分析报告

> 更新时间：2026-02-13  
> 状态：✅ 已完成

---

## 目录

1. [概述](#1-概述)
2. [claude-quickstarts-main](#2-claude-quickstarts-main)
3. [vibecraft-main](#3-vibecraft-main)
4. [与 chubao-WIN-AI 的对照](#4-与-chubao-win-ai-的对照)

---

## 1. 概述

本文档分析两个外部参考项目，评估其技术方案对 chubao-WIN-AI 的借鉴价值。

| 项目 | 来源 | 核心能力 | 与 chubao 关联度 |
|------|------|----------|-----------------|
| claude-quickstarts | Anthropic 官方 | AI 控制桌面/浏览器/编程 | **高** |
| vibecraft | 社区 (nearcyan) | Claude Code 3D 可视化 | **中** |

---

## 2. claude-quickstarts-main

### 2.1 项目信息

| 项目 | 信息 |
|------|------|
| **来源** | Anthropic 官方 (github.com/anthropics/claude-quickstarts) |
| **协议** | MIT |
| **语言** | Python + TypeScript (Next.js) |
| **结构** | Monorepo — 6 个独立子项目 |

### 2.2 子项目清单

#### 2.2.1 Computer Use Demo（桌面控制）

| 项目 | 详情 |
|------|------|
| **功能** | 让 Claude 控制桌面计算机 — 截图、鼠标点击、键盘输入 |
| **技术栈** | Python + Streamlit + Docker + VNC + XVFB |
| **运行方式** | Docker 容器内运行 Linux 桌面，Claude 通过 Vision API 远程操控 |
| **支持模型** | Claude Opus 4.5 / Sonnet 4.5 / Sonnet 4 / Opus 4 / Haiku 4.5 |
| **API 提供商** | Anthropic / AWS Bedrock / Google Vertex |
| **推荐分辨率** | XGA 1024×768 |
| **核心文件** | `computer_use_demo/tools/` — Computer、Bash、Edit 工具实现 |

**核心流程：**
```
截图 → base64 编码 → Claude Vision API → 返回坐标/操作 → 执行 → 再截图
```

**关键技术点：**
- 截图通过 `pyautogui.screenshot()` 捕获，编码为 base64 作为 `image` content block
- 坐标缩放：实际分辨率 → Claude 处理分辨率 (1024×768) 双向映射
- Agent Loop：`loop.py` 实现截图→分析→操作→再截图的自主循环
- 安全提醒：建议在隔离虚拟机中运行，限制网络访问

#### 2.2.2 Browser Use Demo（浏览器自动化）

| 项目 | 详情 |
|------|------|
| **功能** | Claude 控制浏览器 — 导航、DOM 操作、表单填写、截图 |
| **技术栈** | Python + Playwright + Streamlit + Docker |
| **核心优势** | 基于 DOM `ref` 元素定位，比坐标点击更稳定 |
| **坐标缩放** | 1456×819 (Claude) ↔ 1920×1080 (实际视窗) |
| **核心文件** | `browser_use_demo/tools/browser.py` |

**支持的浏览器操作：**

| 类别 | 动作 |
|------|------|
| **浏览器独有** | navigate, read_page, get_page_text, find, form_input, scroll_to, execute_js |
| **鼠标操作** | left_click, right_click, double_click, hover, drag 等 (支持 `ref` 或坐标定位) |
| **键盘操作** | type, key, hold_key |
| **其他** | screenshot, scroll, zoom, wait |

**DOM ref 方案优势：**
- 跨分辨率可靠 — 不依赖像素坐标
- 结构化理解 — 看到 DOM 树而非图片
- 精确表单操作 — 直接设值

#### 2.2.3 Autonomous Coding Agent（自主编程）

| 项目 | 详情 |
|------|------|
| **功能** | 两阶段自主编程 — 初始化 Agent 生成 200 个测试用例，编码 Agent 逐个实现 |
| **技术栈** | Python + Claude Agent SDK + Claude Code CLI |
| **核心文件** | `agent.py` (7KB), `security.py` (10KB), `client.py` (4KB) |

**两阶段模式：**
1. **Initializer Agent (Session 1):** 读取 `app_spec.txt` → 生成 `feature_list.json` (200 个测试用例) → 初始化项目 + git
2. **Coding Agent (Sessions 2+):** 读取 `feature_list.json` → 逐个实现 → 标记通过 → git commit

**安全模型（`security.py` — 10KB）：**
- OS 级沙箱隔离
- 文件系统限制在项目目录
- Bash 命令白名单：`ls, cat, head, tail, wc, grep, npm, node, git, ps, lsof, sleep, pkill`
- 未列入白名单的命令直接拒绝

#### 2.2.4 Agents（教育参考实现）

| 项目 | 详情 |
|------|------|
| **功能** | LLM Agent 构建的最小教育实现 |
| **核心代码** | <300 行，展示 Agent = LLM + Tools + Loop |
| **工具** | ThinkTool, FileTools, WebSearch, CodeExecution, MCP 集成 |
| **核心文件** | `agent.py` (6KB), `tools/`, `utils/` |

**Agent 核心循环（`agent.py`）：**
```python
while stop_reason == 'tool_use':
    1. 遍历 response.content 所有 tool_use blocks
    2. 执行每个工具调用
    3. 将结果作为 tool_result role 消息追加
    4. 再次调用 Claude API
```

**消息历史管理（`utils/history_util.py`）：**
- 上下文窗口管理，防止 token 溢出
- 工具结果正确拼接为 `tool_result` 格式

#### 2.2.5 Customer Support Agent

| 项目 | 详情 |
|------|------|
| **功能** | AI 客服系统 — 知识库问答 |
| **技术栈** | Next.js + TypeScript + shadcn/ui |

#### 2.2.6 Financial Data Analyst

| 项目 | 详情 |
|------|------|
| **功能** | 金融数据分析 — 对话式数据可视化 |
| **技术栈** | Next.js + TypeScript + Recharts |

---

## 3. vibecraft-main

### 3.1 项目信息

| 项目 | 信息 |
|------|------|
| **来源** | nearcyan (github.com/nearcyan/vibecraft) |
| **定位** | Claude Code 活动的 3D 实时可视化工坊 |
| **版本** | v0.1.15 |
| **协议** | MIT |
| **在线体验** | https://vibecraft.sh |
| **平台** | macOS / Linux（不支持 Windows — Hook 依赖 bash） |

### 3.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **3D 渲染** | Three.js ^0.170 | 六边形工坊场景 |
| **音频合成** | Tone.js ^15.1 | 17 种合成音效，无音频文件 |
| **WebSocket** | ws ^8.18 | 实时事件广播 |
| **语音输入** | Deepgram SDK ^4.11 | 实时语音转文字 |
| **构建** | Vite 6 + TypeScript 5.6 | |
| **服务端** | Node.js (2355 行) | WebSocket + tmux 集成 |

### 3.3 架构

```
Claude Code → Hook Script (bash) → events.jsonl → WebSocket Server → Browser (Three.js 3D)
```

**Hook 系统：** 捕获 Claude Code 的 8 种事件
- PreToolUse, PostToolUse, Stop, SubagentStop
- SessionStart, SessionEnd, UserPromptSubmit, Notification

### 3.4 核心特性

| 类别 | 特性 |
|------|------|
| **3D 工坊** | 8 个工作站（书架=Read、工作台=Edit、终端=Bash 等） |
| **多会话** | 多 Claude Code 实例，每个独立六边形区域 |
| **角色动画** | ClaudeMon 机器人 — idle/walking/working/thinking 状态 |
| **空间音频** | Tone.js 合成 17 种音效，3D 空间定位 |
| **EventBus** | 解耦事件架构，6 个专注 handler 模块 |
| **绘制模式** | 六边形画板，6 种颜色，3D 堆叠 |
| **语音输入** | Deepgram 实时语音转文字 |

### 3.5 代码规模

| 模块 | 核心文件 | 大小 |
|------|----------|------|
| 场景 | `WorkshopScene.ts` | 106 KB |
| 角色 | `ClaudeMon.ts` | 25 KB |
| 动画 | `IdleBehaviors.ts` + `WorkingBehaviors.ts` | 41 KB |
| 音频 | `SoundManager.ts` | 30 KB |
| UI | `FeedManager.ts` | 19 KB |
| 服务端 | `server/index.ts` | 2355 行 |
| **前端总计** | 65 个文件 | ~630 KB |

### 3.6 EventBus 架构（重点参考）

```
handleEvent(event)
    ↓
eventBus.emit(type, event, context)
    ↓
┌──────────────────────────────────────────────────┐
│  soundHandlers.ts       → 音效触发                │
│  notificationHandlers.ts → 浮动通知               │
│  characterHandlers.ts   → 角色移动/状态            │
│  subagentHandlers.ts    → 子 Agent 生成/移除       │
│  zoneHandlers.ts        → 区域注意力/状态          │
│  feedHandlers.ts        → 思考指示器               │
└──────────────────────────────────────────────────┘
```

**设计原则：** EventBus handler 更新 3D 场景状态，main.ts 处理 DOM UI 更新。

---

## 4. 与 chubao-WIN-AI 的对照

### 4.1 技术路线对比

| 对比维度 | chubao-WIN-AI | computer-use-demo | browser-use-demo |
|----------|---------------|-------------------|------------------|
| **平台** | Windows 原生 | Linux Docker | Linux Docker |
| **GUI 控制** | pywinauto (Win UI Automation) | pyautogui (截图+坐标) | Playwright (DOM ref) |
| **OCR** | PaddleOCR (CPU) | Claude Vision API | Playwright DOM 解析 |
| **Agent 循环** | 单轮工具调用 | 完整视觉循环 | 完整视觉循环 |
| **安全模型** | 无 | Docker 隔离 | Docker 隔离 |

### 4.2 可借鉴价值矩阵

| 来源 | 可借鉴内容 | 对应 chubao 模块 | 价值 |
|------|-----------|------------------|------|
| `agents/agent.py` | 正确的多轮工具循环 | `agent/runtime.ts` | ★★★★★ |
| `computer-use-demo/loop.py` | 截图→Vision→操作闭环 | `agent/runtime.ts` + `tools/` | ★★★★★ |
| `browser-use-demo/tools/browser.py` | 浏览器自动化完整实现 | `python-automation/` 新增 | ★★★★☆ |
| `autonomous-coding/security.py` | 命令白名单安全模型 | `python-automation/` 新增 | ★★★☆☆ |
| `browser-use-demo/coordinate_scaling.py` | 分辨率坐标缩放 | `python-automation/gui_control.py` | ★★★☆☆ |
| `vibecraft/EventBus.ts` | 前端事件解耦架构 | `src/` 前端重构 | ★★☆☆☆ |
| `vibecraft/SoundManager.ts` | 合成音效反馈 | 可选增强 | ★☆☆☆☆ |

---

*文档版本: v1.0 | 最后更新: 2026-02-13*
