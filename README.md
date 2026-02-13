# Chubao AI - Windows 本地 AI 自动化控制工具

> 基于 OpenClaw + Tauri 2.0 构建

## 快速开始

### 环境要求

- Node.js 22+
- Rust 1.75+
- Python 3.9+
- Windows 10/11

### 安装依赖

```bash
# 前端依赖
npm install

# Node.js Sidecar 依赖
cd sidecars/node-backend && npm install

# Python Sidecar 依赖
cd sidecars/python-automation && pip install -r requirements.txt
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入 ANTHROPIC_API_KEY
```

### 开发模式

```bash
# 一键启动（推荐）
.\scripts\start.ps1 -Mode all

# 只启动后端（Node）
.\scripts\start.ps1 -Mode cli

# 启动 Node + Python sidecar
.\scripts\start.ps1 -Mode server

# 启动前端开发服务器
npm run dev

# 启动 Tauri 开发模式
npm run tauri:dev
```

### 构建生产版本

```bash
npm run tauri:build
```

## 项目结构

```
chubao-WIN-AI/
├── src-tauri/              # Tauri Rust 后端
├── src/                    # 前端 React 代码
├── sidecars/
│   ├── node-backend/       # Node.js AI 后端
│   └── python-automation/  # Python GUI 自动化
├── memory/                 # 记忆存储
└── docs/                   # 文档
```

## 核心功能

- 🖥️ Windows 桌面自动化 (pywinauto + PaddleOCR)
- 🤖 AI 对话 (Claude API)
- 📝 三层记忆系统
- 💬 多平台集成：
  - **飞书 (Lark)** - 企业级消息推送
  - **Telegram** - Bot API 完整支持
  - **WhatsApp** - Web 扫码登录

## 消息平台集成

Chubao AI 支持通过多种消息平台接收和发送消息：

### 支持的平台

| 平台 | 状态 | 功能 |
|------|------|------|
| 飞书 (Lark) | ✅ 已完成 | Webhook 事件、消息接收/发送、签名验证 |
| Telegram | ✅ 已完成 | Bot API、Long Polling/Webhook、命令系统 |
| WhatsApp | ✅ 已完成 | WhatsApp Web、扫码登录、消息队列 |

### 快速配置

```bash
# 1. 编辑环境变量
cp .env.example .env

# 2. 配置消息平台（在 .env 中）
# 飞书
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...

# WhatsApp
WHATSAPP_ENABLED=true

# 3. 重启服务
```

详细配置请参考 [消息平台集成指南](docs/PLATFORMS.md)

### 支持的功能

- **AI 对话** - 直接发送消息与 AI 对话
- **系统控制** - 截图、获取窗口列表
- **记忆查询** - 搜索历史对话
- **命令系统** - `/help`, `/status`, `/windows`, `/screenshot`

## 文档

- [项目设计方案](docs/DESIGN.md) - 系统架构和设计方案
- [技术栈说明](docs/TECH_STACK.md) - 技术选型说明
- [消息平台集成指南](docs/PLATFORMS.md) - 配置和使用指南
- [使用示例](docs/examples/PLATFORMS_EXAMPLES.md) - 代码示例

## 项目进度

| 模块 | 进度 | 状态 |
|------|------|------|
| 前端 UI | 85% | ✅ 可用 |
| Tauri 框架 | 60% | 🟡 Rust 代码待完善 |
| Node.js 后端 | 85% | ✅ 核心功能完成 |
| Python 自动化 | 90% | ✅ 功能完整 |
| 记忆系统 | 60% | 🟡 基础完成 |
| **消息集成** | **95%** | **✅ 三大平台完成** |
| 打包部署 | 30% | 🟡 配置完成 |

## 许可证

MIT
