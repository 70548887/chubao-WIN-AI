# Chubao AI - Windows 本地 AI 自动化控制工具

> 基于 OpenClaw + Tauri 2.0 构建的 Windows 桌面 AI 助手

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)

## ✨ 核心功能

- 🤖 **AI 对话** - 基于 Claude API 的智能对话，支持工具调用
- 🖥️ **Windows 自动化** - GUI 控制、OCR 识别、窗口管理
- 📝 **三层记忆系统** - 知识图谱 + 每日笔记 + 隐性知识
- 💬 **多平台集成** - 飞书、Telegram、WhatsApp 消息接入
- 🎨 **现代化 UI** - React + Tauri 2.0 桌面应用

## 📦 项目结构

```
chubao-WIN-AI/
├── src/                    # 前端 React 代码
├── src-tauri/              # Tauri Rust 后端
├── sidecars/
│   ├── node-backend/       # Node.js AI 后端 (OpenClaw)
│   └── python-automation/  # Python GUI 自动化
├── memory/                 # 记忆存储 (SQLite + Markdown)
├── life/                   # 知识图谱
├── docs/                   # 文档
└── scripts/                # 启动脚本
```

## 🚀 快速开始

### 环境要求

- **Node.js** 22+
- **Rust** 1.75+ (仅 Tauri 开发需要)
- **Python** 3.9+
- **Windows** 10/11

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/your-repo/chubao-WIN-AI.git
cd chubao-WIN-AI

# 2. 安装依赖
npm install
cd sidecars/node-backend && npm install
cd ../python-automation && pip install -r requirements.txt
cd ../..

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY
```

### 运行

```powershell
# 方式 1: 完整开发环境 (推荐)
.\scripts\start.ps1 -Mode all

# 方式 2: 仅 Node 后端服务
.\scripts\start.ps1 -Mode cli

# 方式 3: Node + Python 服务
.\scripts\start.ps1 -Mode server

# 方式 4: 一键联调验证（启动服务 + smoke + 自动清理）
.\scripts\start.ps1 -Mode verify

# 方式 5: 仅检查端口占用，不自动清理（冲突时直接报错退出）
.\scripts\start.ps1 -Mode verify -SkipPortCleanup
```

### 回归验证

```powershell
# 手动回归（需先启动 Node + Python）
npm run smoke
# 或
.\scripts\smoke.ps1

# 本地一键联调回归（推荐，会自动拉起服务）
npm run verify

# 静态契约回归（不启动服务，适合 CI）
npm run verify:static

# 前端核心单测（core + coding skills）
npm run test:core
```

`scripts/start.ps1` 在 `cli/server/verify` 模式下会先做端口占用预检查，默认会尝试关闭占用进程树后再启动（避免 `EADDRINUSE`）；若不希望自动清理，可传 `-SkipPortCleanup` 改为仅检查并报错。脚本会输出占用进程 PID/命令行以便排查。

`smoke` 会校验：
- Node/Python 健康接口契约
- 关键错误码契约（`INVALID_ARGUMENT`）
- Python OCR 端到端识别契约（当 `deps.ocr=ok` 时）
- Tauri 命令契约在 Rust 与前端的静态一致性

设置页服务状态面板支持：
- 多规则服务筛选（全部/异常/离线/外部托管/仅错误）
- 诊断 JSON 导出（默认脱敏，可切换原始导出）
- 可选附带最近日志导出（支持按服务勾选与日志条数设置）
- 导出文件名自动包含筛选规则与日志选项
- 导出 JSON 包含 `schemaVersion` 与 `appVersion`
- 一键复制诊断摘要（简版/详细版，可选仅复制当前筛选结果）
- 编程进度面板（Qoder）：支持查看分支状态、文件变更统计、最近提交，并可按 `sinceDays/maxFiles/includeUntracked` 刷新
- 导入两份诊断 JSON 一键对比差异（状态/健康/依赖）
- 对比结果支持一键复制与导出 `diff.json`
- 对比视图支持按分组折叠（元信息/Node/Python）与“仅显示变化字段”过滤
- 对比项支持字段关键字搜索（如 `deps`、`uptime`、`version`）
- 对比搜索支持字段前缀快捷标签（`deps` / `health` / `pid` / `managed`）
- 对比搜索支持多标签组合过滤（AND）与最近筛选历史
- 最近筛选支持“固定（Pin）/置顶”，并跨会话保持排序
- 最近筛选支持“仅清空未固定 / 清空全部”批量操作
- 批量清空最近筛选前增加二次确认，降低误操作风险
- 最近筛选支持“一键仅看固定 / 显示全部”视图切换
- 对比复制与导出支持“仅当前筛选”范围（含分组/仅变化/关键词条件）
- 对比结果支持导出 `diff.txt`（便于工单/IM 粘贴）

### CI 验证

仓库内置了 Windows CI 工作流：`.github/workflows/verify.yml`。  
该流程会执行前端/Node sidecar 构建、Python 语法检查，以及 `npm run verify:static` 静态契约检查。

另外还包含：
- Secret 扫描：`.github/workflows/secret-scan.yml`
- Windows 端到端回归（含一次重试与日志产物）：`.github/workflows/e2e-windows.yml`

本地提交前可启用仓库 hook：
```powershell
npm run hooks:install
```

版本控制安全与 E2E 验收基线见：`docs/REPO_GUARDRAILS.md`
## 📚 功能模块

### 1. AI 助手 (Agent)

基于 Claude API，支持 Function Calling:

- **智能对话** - 自然语言理解，上下文记忆
- **工具调用** - 自动调用 GUI 自动化工具
- **ReAct 模式** - 推理 + 行动循环

```typescript
// 示例：Agent 自动执行截图和 OCR
const response = await agentRuntime.chat("帮我看看屏幕上有什么文字");
// Agent 会自动调用 screenshot -> ocr_recognize -> 返回结果
```

### 2. Windows 自动化 (Python Sidecar)

- **窗口控制** - 获取列表、点击、输入、菜单操作
- **屏幕识别** - 截图、OCR 文字识别 (PaddleOCR)
- **智能定位** - 通过文字查找并点击

支持工具:
- `list_windows` - 获取窗口列表
- `click` / `type_text` - 点击和输入
- `screenshot` - 截图
- `ocr_recognize` / `ocr_find_text` - 文字识别

### 3. 三层记忆系统

**Layer 1 - 知识图谱** (`life/areas/`)
- 存储：实体、项目、人物
- 格式：Markdown + JSON
- 自动更新：从对话中提取事实

**Layer 2 - 每日笔记** (`memory/daily/`)
- 存储：事件日志、对话记录
- 格式：Markdown，按日期组织

**Layer 3 - 隐性知识** (`memory/MEMORY.md`)
- 存储：用户偏好、学习到的模式
- 自动归纳：AI 从对话中学习

### 4. 消息平台集成

支持三大平台:

| 平台 | 状态 | 特性 |
|------|------|------|
| **飞书 (Lark)** | ✅ | Webhook、签名验证、消息卡片 |
| **Telegram** | ✅ | Bot API、命令系统、内联键盘 |
| **WhatsApp** | ✅ | Web 扫码、自动重连、消息队列 |

配置方法见 [消息平台集成指南](docs/PLATFORMS.md)

## 📖 文档

- [项目设计方案](docs/DESIGN.md) - 系统架构和设计方案
- [技术栈说明](docs/TECH_STACK.md) - 技术选型说明
- [消息平台集成指南](docs/PLATFORMS.md) - 配置和使用指南
- [部署指南](docs/DEPLOY.md) - 打包和发布说明
- [使用示例](docs/examples/PLATFORMS_EXAMPLES.md) - 代码示例

## 📊 开发进度

| 模块 | 进度 | 状态 | 说明 |
|------|------|------|------|
| **前端 UI** | 90% | 🟢 | React 界面完成，待优化 |
| **Tauri 框架** | 85% | 🟢 | Rust 后端完成，Sidecar 管理就绪 |
| **Node.js 后端** | 90% | 🟢 | AI 服务、记忆系统、消息平台完成 |
| **Python 自动化** | 95% | 🟢 | GUI 控制、OCR 完成 |
| **三层记忆** | 85% | 🟢 | 知识图谱、每日笔记、隐性记忆完成 |
| **消息集成** | 95% | 🟢 | 飞书、Telegram、WhatsApp 完成 |
| **Agent Tools** | 90% | 🟢 | 工具注册、Function Calling 完成 |
| **打包部署** | 70% | 🟡 | 配置完成，待测试 |

**总体进度: 88%** 🎉

## 🛠️ 技术栈

### 前端
- **React** 18 + TypeScript
- **Vite** - 构建工具
- **Tauri** 2.0 - 桌面框架

### 后端
- **Node.js** 22+ + TypeScript
- **Express** - HTTP 服务
- **WebSocket** - 实时通信
- **Anthropic SDK** - Claude API
- **SQLite** + **sqlite-vec** - 向量数据库

### 自动化
- **Python** 3.9+
- **pywinauto** - Windows UI 自动化
- **pyautogui** - 鼠标键盘模拟
- **PaddleOCR** - 文字识别

### 消息平台
- **Lark SDK** - 飞书集成
- **Telegraf** - Telegram Bot
- **whatsapp-web.js** - WhatsApp Web

## 🔧 API 接口

### 健康检查
```bash
GET http://localhost:3100/health
GET http://localhost:3200/health
```

### AI 对话
```bash
POST http://localhost:3100/api/chat
Content-Type: application/json

{
  "message": "你好",
  "sessionId": "optional-session-id"
}
```

### 记忆搜索
```bash
GET http://localhost:3100/api/memory/search?query=关键词&limit=10
```

### 平台状态
```bash
GET http://localhost:3100/api/platforms/status
```

### 编程进度跟踪（Qoder）
```bash
GET http://localhost:3100/api/coding/progress?sinceDays=7&maxFiles=30&includeUntracked=true
```

## 📝 环境变量

```bash
# 必需
ANTHROPIC_API_KEY=sk-ant-xxx

# 服务端口
NODE_PORT=3100
PYTHON_PORT=3200

# 飞书 (可选)
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx

# Telegram (可选)
TELEGRAM_BOT_TOKEN=123456:ABC...

# WhatsApp (可选)
WHATSAPP_ENABLED=false
```

完整配置见 [.env.example](.env.example)

## 📦 打包发布

```bash
# 开发模式
npm run tauri:dev

# 生产构建
npm run tauri:build

# 安装包位置
src-tauri/target/release/bundle/nsis/*.exe
```

详细部署指南见 [DEPLOY.md](docs/DEPLOY.md)

## 🤝 贡献

欢迎贡献！请遵循以下步骤:

1. Fork 仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 架构参考
- [Tauri](https://tauri.app) - 桌面应用框架
- [Claude](https://anthropic.com) - AI 能力
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - 文字识别

---

**Made with ❤️ by Chubao Team**

*最后更新: 2026-02-13*

