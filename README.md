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
- 💬 多平台集成 (飞书、Telegram)

## 许可证

MIT
