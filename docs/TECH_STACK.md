# 技术栈确认清单

> 更新时间: 2026-02-13
> 状态: ✅ 已确认

---

## 桌面应用框架: Tauri 2.0 (已确认 ✅)

| 对比项 | Tauri 2.0 | Electron | 选择原因 |
|--------|-----------|----------|----------|
| **安装包大小** | ~30-50 MB | ~150-200 MB | ✅ 小 5 倍 |
| **运行内存** | ~80 MB | ~300 MB | ✅ 省 4 倍 |
| **冷启动** | ~1-2 秒 | ~3-5 秒 | ✅ 快 2 倍 |
| **后端语言** | Rust | Node.js | 高性能 |
| **前端** | WebView2 | Chromium | 系统原生 |
| **Sidecar** | ✅ 支持 | - | 嵌入 Node/Python |

---

## OpenClaw 核心架构

**OpenClaw** (原 Clawdbot/Moltbot) 是 2026 年 GitHub 最火项目 (163k+ Stars)

| 组件 | 技术 | 说明 |
|------|------|------|
| **架构模式** | 微核 + 插件 + 网关 | Gateway + Agent Runtime + Tools |
| **运行时** | Node.js 22+ | 强制要求，原生 fetch/sqlite |
| **语言** | TypeScript | 全栈 TS，TypeBox/Zod 校验 |
| **HTTP** | Express 5 + Hono 4.x | 路由处理 |
| **WebSocket** | ws 库 | 聊天流与控制流 |
| **向量存储** | sqlite-vec | 本地向量检索 |
| **编排模式** | ReAct + Function Calling | 动态任务编排 |
| **开源协议** | MIT License | 完全开源 |

**Agent 四要素：**
- **LLM (大脑)**: Claude/GPT/Gemini/Ollama
- **Tools (手)**: Skills 插件系统
- **Memory (记忆)**: 三层记忆架构
- **Planning (规划)**: ReAct 动态编排

---

## 核心技术栈

| 模块 | 技术选型 | 版本/说明 | 状态 |
|------|----------|----------|------|
| **桌面框架** | Tauri 2.0 | Rust 后端 + WebView2 | ✅ |
| **核心框架** | OpenClaw 二次开发 | Node.js Sidecar | ✅ |
| **主开发语言** | TypeScript/Rust | Node.js 22+ / Rust 1.75+ | ✅ |
| **GUI 自动化** | pywinauto + PaddleOCR | Python Sidecar，API 优先 | ✅ |
| **LLM 引擎** | Claude API | claude-sonnet-4-20250514 | ✅ |
| **记忆存储** | OpenClaw 三层记忆 + sqlite-vec | 会话上下文+每日日志+精选记忆 | ✅ |
| **部署方式** | Tauri + NSIS | EXE安装包，创建快捷方式 | ✅ |

---

## 部署方式详细要求 (已确认 ✅)

| 要求 | 说明 | 状态 |
|------|------|------|
| 打包格式 | 单个 EXE 安装包 (~30-50MB) | ✅ |
| 桌面快捷方式 | 安装后自动创建 | ✅ |
| 开始菜单 | 安装后自动创建 | ✅ |
| 直接运行 | 无需安装 Node.js/Rust | ✅ |
| 可卸载 | 通过 "程序和功能" | ✅ |
| Sidecar 嵌入 | Node.js + Python 运行时 | ✅ |

---

## 消息平台集成

| 平台 | 集成方式 | 优先级 | 状态 |
|------|----------|--------|------|
| 本地 CLI | 内置终端 | P0 | ✅ 开发必选 |
| 飞书 (Lark) | lark-openapi-mcp | P0 | ✅ 国内企业 |
| Telegram | OpenClaw 原生 | P1 | ✅ 海外 |
| WhatsApp | Web Bridge | P2 | ✅ 海外 |

---

## 技术栈依赖

### Tauri Rust 依赖 (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2.0", features = ["shell-sidecar", "tray-icon"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
```

### Node.js Sidecar 依赖 (sidecars/node-backend/package.json)
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",  // Claude API
    "sqlite-vec": "^0.1.7",           // 向量存储
    "telegraf": "^4.16.0",            // Telegram Bot
    "express": "^5.2.0",              // HTTP 服务
    "ws": "^8.19.0",                  // WebSocket
    "dotenv": "^16.4.0"               // 环境变量
  }
}
```

### Python 依赖 (桌面识别相关 - 本地免费)
```
# OCR 文字识别 (首选)
paddlepaddle>=2.5.0        # PaddleOCR 基础框架
paddleocr>=2.7.0           # PaddleOCR 主包
pytesseract>=0.3.10        # Tesseract OCR (备选)

# GUI 自动化 (首选)
pywinauto>=0.6.8           # Windows UI Automation API
pyautogui>=0.9.54          # 鼠标/键盘模拟
pillow>=10.0.0             # 图像处理

# 视觉识别 (OmniParser/UI-TARS)
torch>=2.0.0               # PyTorch
torchvision>=0.15.0        # 视觉模型
transformers>=4.36.0       # Hugging Face
```

---

## 环境要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| 操作系统 | Windows 10 (22H2) | Windows 11 |
| Node.js | 22.0.0 | 最新 LTS |
| PostgreSQL | 15.0 | 16.0 + pgvector |
| 内存 | 8GB | 16GB+ |
| 显卡 | - | NVIDIA (UI-TARS 加速) |

---

## 关键 API 密钥

| 服务 | 环境变量 | 获取方式 |
|------|----------|----------|
| Claude API | `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| 飞书 | `LARK_APP_ID`, `LARK_APP_SECRET` | https://open.feishu.cn |
| Telegram | `TELEGRAM_BOT_TOKEN` | @BotFather |
| OpenAI (嵌入) | `OPENAI_API_KEY` | https://platform.openai.com |

---

## 架构图 (Tauri 2.0)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Tauri 2.0 桌面应用                              │
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
│  │ • React/Vue      │ │ • OpenClaw  │ │ • pywinauto      │        │
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
│                      Windows 操作系统                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

*此文件由技术栈确认流程自动生成*
