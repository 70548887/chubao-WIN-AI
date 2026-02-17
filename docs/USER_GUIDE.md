# Chubao AI 使用指南

> **版本**: v0.1.0  
> **更新日期**: 2026-02-17  
> **适用平台**: Windows 10/11

---

## 目录

1. [快速开始](#1-快速开始)
2. [核心功能](#2-核心功能)
3. [AI 对话](#3-ai-对话)
4. [Windows 自动化](#4-windows-自动化)
5. [浏览器自动化](#5-浏览器自动化)
6. [提示词模板](#6-提示词模板)
7. [多 Agent 系统](#7-多-agent-系统)
8. [消息推送](#8-消息推送)
9. [故障排除](#9-故障排除)

---

## 1. 快速开始

### 1.1 安装

1. 下载 `Chubao AI_0.1.0_x64-setup.exe`
2. 双击运行安装程序
3. 按向导完成安装
4. 从桌面快捷方式启动

### 1.2 首次配置

启动后需要配置 AI 提供商：

1. 点击左侧 **设置** 标签
2. 选择 AI 提供商（Anthropic/OpenAI）
3. 输入 API 密钥
4. 点击 **保存**

### 1.3 验证安装

```bash
# 检查服务状态
curl http://localhost:3100/health
```

---

## 2. 核心功能

### 2.1 功能概览

| 功能模块 | 描述 | 入口 |
|---------|------|------|
| **AI 对话** | 与 Claude/GPT 对话 | 聊天标签 |
| **代码助手** | 编程辅助、代码审查 | 控制台标签 |
| **自动化** | Windows GUI 自动化 | 自动化标签 |
| **技能管理** | 安装/管理技能 | 技能标签 |
| **系统设置** | 配置和监控 | 设置标签 |

### 2.2 界面布局

```
┌─────────────────────────────────────────┐
│  [聊天] [控制台] [自动化] [技能] [设置]  │  ← 侧边栏
├─────────────────────────────────────────┤
│                                         │
│           主内容区域                     │
│                                         │
└─────────────────────────────────────────┘
```

---

## 3. AI 对话

### 3.1 基础对话

1. 在聊天输入框输入消息
2. 按 **Enter** 发送
3. AI 会实时回复

### 3.2 使用提示词模板

1. 点击输入框旁的 **模板** 按钮
2. 选择模板类别（代码/自动化/分析）
3. 选择具体模板
4. 填写变量（如代码片段）
5. 点击 **应用**

**示例 - 代码解释：**

```javascript
// 选择 "解释代码" 模板
// 输入代码：
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```

### 3.3 流式响应

在设置中开启 **流式输出**，AI 回复会实时显示，无需等待完整响应。

### 3.4 查看对话历史

```bash
# 获取最近 50 条消息
curl "http://localhost:3100/api/chat/history?limit=50"
```

---

## 4. Windows 自动化

### 4.1 截图和 OCR

**让 AI 看到屏幕：**

1. 在聊天中输入："请截图并告诉我看到了什么"
2. AI 会自动调用截图工具
3. 使用 Vision 能力分析屏幕内容

**OCR 识别文字：**

```bash
# API 调用
curl -X POST http://localhost:3200/api/ocr \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 100, "width": 300, "height": 200}'
```

### 4.2 GUI 操作

**可用操作：**

| 操作 | 描述 | 示例 |
|------|------|------|
| `click` | 点击坐标 | 点击按钮 |
| `right_click` | 右键点击 | 打开菜单 |
| `double_click` | 双击 | 打开文件 |
| `type_text` | 输入文字 | 填写表单 |
| `hotkey` | 快捷键 | Ctrl+C |
| `scroll` | 滚动 | 浏览页面 |
| `drag` | 拖拽 | 移动文件 |

**示例对话：**

```
用户：请帮我打开记事本并输入 "Hello World"
AI：我会帮您完成这个任务。
[执行：点击开始菜单 → 搜索记事本 → 打开 → 输入文字]
```

### 4.3 自动化任务

**录制和回放：**

1. 在自动化面板点击 **录制**
2. 执行要录制的操作
3. 点击 **停止**
4. 保存为宏
5. 随时点击 **播放** 回放

---

## 5. 浏览器自动化

### 5.1 启动浏览器

```bash
# 启动浏览器
curl -X POST http://localhost:3200/api/browser/launch \
  -d '{"headless": false, "width": 1280, "height": 720}'
```

### 5.2 常用操作

| 操作 | API |
|------|-----|
| 导航 | `POST /api/browser/navigate` |
| 点击 | `POST /api/browser/click` |
| 输入 | `POST /api/browser/type` |
| 截图 | `POST /api/browser/screenshot` |
| 关闭 | `POST /api/browser/close` |

### 5.3 示例：自动登录

```javascript
// 1. 启动浏览器
await browser_launch({ headless: false });

// 2. 导航到登录页
await browser_navigate({ url: "https://example.com/login" });

// 3. 输入用户名密码
await browser_type({ selector: "#username", text: "user" });
await browser_type({ selector: "#password", text: "pass" });

// 4. 点击登录
await browser_click({ selector: "#login-btn" });
```

---

## 6. 提示词模板

### 6.1 内置模板

| 类别 | 模板 | 用途 |
|------|------|------|
| **coding** | 代码审查 | 审查代码质量 |
| **coding** | 解释代码 | 理解代码逻辑 |
| **coding** | 重构代码 | 改进代码结构 |
| **coding** | 生成测试 | 创建单元测试 |
| **automation** | 自动化任务 | 创建自动化流程 |
| **automation** | 调试 UI | 解决 UI 问题 |
| **analysis** | 分析错误 | 排查错误原因 |
| **analysis** | 总结文本 | 提取关键信息 |
| **general** | 头脑风暴 | 产生创意 |
| **general** | 分步指导 | 详细步骤说明 |

### 6.2 使用模板 API

```bash
# 获取所有模板
curl http://localhost:3100/api/prompts

# 应用模板
curl -X POST http://localhost:3100/api/prompts/code-review/apply \
  -H "Content-Type: application/json" \
  -d '{"variables":{"code":"function add(a,b) { return a+b; }"}}'
```

---

## 7. 多 Agent 系统

### 7.1 创建子 Agent

```bash
# 创建专门的代码审查 Agent
curl -X POST http://localhost:3100/api/multi-agent/start \
  -d '{
    "groupId": "code-review-team",
    "agents": [
      {"role": "reviewer", "task": "审查代码质量"},
      {"role": "tester", "task": "生成测试用例"}
    ]
  }'
```

### 7.2 任务队列

```bash
# 提交任务
curl -X POST http://localhost:3100/api/tasks/enqueue \
  -d '{"type": "analysis", "payload": {"target": "codebase"}}'

# 查看队列状态
curl http://localhost:3100/api/tasks/status
```

### 7.3 定时任务

```bash
# 创建定时任务（每 5 分钟检查一次）
curl -X POST http://localhost:3100/api/cron/add \
  -d '{
    "name": "health-check",
    "schedule": "*/5 * * * *",
    "task": {"type": "health", "target": "system"}
  }'
```

---

## 8. 消息推送

### 8.1 配置 Telegram

1. 在设置中启用 Telegram
2. 输入 Bot Token
3. 设置 Chat ID
4. 测试连接

### 8.2 发送通知

```bash
# API 发送通知
curl -X POST http://localhost:3100/api/notify \
  -d '{
    "channel": "telegram",
    "message": "任务完成！",
    "priority": "normal"
  }'
```

### 8.3 自动通知

在设置中配置：
- 任务完成时通知
- 出错时通知
- 定时报告

---

## 9. 故障排除

### 9.1 常见问题

**Q: 启动失败，端口被占用**
```bash
# 检查端口占用
netstat -ano | findstr :3100

# 终止占用进程
taskkill /PID <PID> /F
```

**Q: AI 回复慢**
- 检查网络连接
- 查看 API 配额
- 考虑切换提供商

**Q: 截图失败**
- 确保有屏幕访问权限
- 检查 OCR 依赖是否安装
- 查看 Python sidecar 日志

### 9.2 查看日志

```bash
# Node 后端日志
tail -f logs/node-backend.log

# Python 自动化日志
tail -f logs/python-automation.log
```

### 9.3 监控指标

```bash
# 查看性能指标
curl http://localhost:3100/api/metrics

# 详细健康检查
curl http://localhost:3100/api/health/detailed
```

### 9.4 重置配置

```bash
# 删除配置重新初始化
rm config/settings.json
```

---

## 附录

### API 参考

完整 API 文档见：`docs/API_REFERENCE.md`

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API 密钥 | - |
| `OPENAI_API_KEY` | OpenAI API 密钥 | - |
| `NODE_PORT` | Node 后端端口 | 3100 |
| `PYTHON_PORT` | Python 端口 | 3200 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Enter` | 发送消息 |
| `Ctrl+Shift+S` | 截图 |
| `Ctrl+Shift+R` | 重新加载 |

---

*Chubao AI - Windows 原生 AI 助手*
