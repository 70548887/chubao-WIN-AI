# Chubao AI - Agent Guidelines

## Project Overview

Chubao AI 是一个 Windows 本地 AI 自动化控制工具，基于 OpenClaw + Tauri 2.0 构建。

## Architecture

- **Frontend**: React + TypeScript + Vite (src/)
- **Desktop Framework**: Tauri 2.0 (src-tauri/)
- **AI Backend**: Node.js + TypeScript + Claude API (sidecars/node-backend/)
- **Automation**: Python + pywinauto + PaddleOCR (sidecars/python-automation/)
- **Memory**: SQLite + Markdown (memory/, life/)

## Key Features

1. AI 对话与工具调用 (Function Calling)
2. Windows GUI 自动化 (点击、输入、OCR)
3. 三层记忆系统 (知识图谱、每日笔记、隐性知识)
4. 多平台消息集成 (飞书、Telegram、WhatsApp)

## Tech Stack

- Node.js 22+, Python 3.9+, Rust 1.75+
- React 18, Express, WebSocket
- Anthropic SDK, sqlite-vec
- pywinauto, pyautogui, PaddleOCR

## Project Structure

```
chubao-WIN-AI/
├── src/                    # React frontend
├── src-tauri/              # Tauri Rust backend
├── sidecars/
│   ├── node-backend/       # AI service
│   └── python-automation/  # GUI automation
├── memory/                 # Memory storage
├── life/                   # Knowledge graph
├── docs/                   # Documentation
└── scripts/                # Startup scripts
```

## Development Guidelines

- Use TypeScript strict mode
- Follow existing code patterns
- Test in CLI mode before Tauri mode
- Keep sidecars independent
- Document API changes

## Commands

```bash
# Start all services
.\scripts\start.ps1 -Mode cli

# Build
npm run tauri:build
```

## Environment

Requires .env file with:
- ANTHROPIC_API_KEY
- Optional: LARK_APP_ID, TELEGRAM_BOT_TOKEN
