# Chubao AI API 参考

> **版本**: v0.1.0  
> **基础 URL**: `http://localhost:3100`

---

## 目录

1. [通用](#1-通用)
2. [AI 对话](#2-ai-对话)
3. [工具调用](#3-工具调用)
4. [记忆系统](#4-记忆系统)
5. [多 Agent](#5-多-agent)
6. [任务队列](#6-任务队列)
7. [定时任务](#7-定时任务)
8. [监控](#8-监控)
9. [提示词模板](#9-提示词模板)

---

## 1. 通用

### 健康检查

```http
GET /health
```

**响应：**
```json
{
  "status": "ok",
  "service": "node-backend",
  "version": "0.1.0",
  "uptimeSec": 3600,
  "timestamp": "2026-02-17T00:00:00.000Z",
  "deps": {
    "memory": "ok",
    "gateway": "ok",
    "taskQueue": "ok",
    "cronScheduler": "ok"
  }
}
```

### 获取工具列表

```http
GET /api/tools
```

**响应：**
```json
{
  "success": true,
  "tools": [
    {"name": "screenshot", "description": "..."},
    {"name": "click", "description": "..."}
  ]
}
```

---

## 2. AI 对话

### 发送消息

```http
POST /api/chat
Content-Type: application/json
```

**请求体：**
```json
{
  "message": "Hello",
  "sessionId": "optional-session-id",
  "stream": false
}
```

**响应（非流式）：**
```json
{
  "success": true,
  "response": "Hello! How can I help you?",
  "sessionId": "http_xxx"
}
```

**流式响应：**
```
data: {"type":"chunk","content":"Hello"}
data: {"type":"chunk","content":"!"}
data: {"type":"done","response":"Hello!","sessionId":"..."}
```

### 获取对话历史

```http
GET /api/chat/history?sessionId=xxx&limit=50
```

**响应：**
```json
{
  "success": true,
  "messages": [
    {"sessionId": "...", "user": "Hello", "assistant": "Hi!"}
  ],
  "count": 1,
  "sessionId": "xxx"
}
```

---

## 3. 工具调用

### 执行工具

```http
POST /api/tools/execute
Content-Type: application/json
```

**请求体：**
```json
{
  "tool": "screenshot",
  "args": {"fullScreen": true}
}
```

**响应：**
```json
{
  "success": true,
  "result": {...}
}
```

---

## 4. 记忆系统

### 搜索记忆

```http
GET /api/memory/search?query=关键词&limit=10
```

**响应：**
```json
{
  "success": true,
  "results": [
    {"id": 1, "type": "conversation", "content": "..."}
  ]
}
```

### 添加记忆

```http
POST /api/memory/add
Content-Type: application/json
```

**请求体：**
```json
{
  "type": "note",
  "content": "重要信息",
  "tags": ["重要"]
}
```

---

## 5. 多 Agent

### 启动 Agent 组

```http
POST /api/multi-agent/start
Content-Type: application/json
```

**请求体：**
```json
{
  "groupId": "my-team",
  "agents": [
    {"role": "coder", "task": "Write code"},
    {"role": "reviewer", "task": "Review code"}
  ]
}
```

### 获取 Agent 组状态

```http
GET /api/multi-agent/groups
```

---

## 6. 任务队列

### 提交任务

```http
POST /api/tasks/enqueue
Content-Type: application/json
```

**请求体：**
```json
{
  "type": "analysis",
  "payload": {"target": "codebase"},
  "priority": "normal"
}
```

**响应：**
```json
{
  "success": true,
  "taskId": "task_xxx"
}
```

### 获取任务状态

```http
GET /api/tasks/status?taskId=xxx
```

### 取消任务

```http
POST /api/tasks/cancel
Content-Type: application/json
```

**请求体：**
```json
{"taskId": "task_xxx"}
```

---

## 7. 定时任务

### 添加定时任务

```http
POST /api/cron/add
Content-Type: application/json
```

**请求体：**
```json
{
  "name": "daily-report",
  "schedule": "0 9 * * *",
  "task": {"type": "report", "target": "daily"}
}
```

### 列出定时任务

```http
GET /api/cron/list
```

### 删除定时任务

```http
POST /api/cron/remove
Content-Type: application/json
```

**请求体：**
```json
{"name": "daily-report"}
```

---

## 8. 监控

### 性能指标

```http
GET /api/metrics
```

**响应：**
```json
{
  "success": true,
  "metrics": {
    "timestamp": "2026-02-17T00:00:00.000Z",
    "memory": {
      "heapUsed": "23.52 MB",
      "heapTotal": "35.21 MB"
    },
    "requests": {
      "count": 100,
      "averageLatency": "120.50ms"
    }
  }
}
```

### 工具执行统计

```http
GET /api/metrics/tools
```

### 健康详情

```http
GET /api/health/detailed
```

---

## 9. 提示词模板

### 获取所有模板

```http
GET /api/prompts
```

**响应：**
```json
{
  "success": true,
  "templates": [
    {
      "id": "code-review",
      "name": "代码审查",
      "category": "coding",
      "variables": ["code"]
    }
  ]
}
```

### 获取模板类别

```http
GET /api/prompts/categories
```

### 按类别获取模板

```http
GET /api/prompts/category/coding
```

### 获取特定模板

```http
GET /api/prompts/code-review
```

### 应用模板

```http
POST /api/prompts/code-review/apply
Content-Type: application/json
```

**请求体：**
```json
{
  "variables": {
    "code": "function add(a, b) { return a + b; }"
  }
}
```

**响应：**
```json
{
  "success": true,
  "prompt": "请审查以下代码...",
  "templateId": "code-review"
}
```

---

## 错误处理

### 错误响应格式

```json
{
  "success": false,
  "error": "错误描述",
  "code": "ERROR_CODE",
  "details": {...}
}
```

### 错误代码

| 代码 | 描述 |
|------|------|
| `INVALID_ARGUMENT` | 参数错误 |
| `NOT_FOUND` | 资源不存在 |
| `SERVICE_UNAVAILABLE` | 服务不可用 |
| `FORBIDDEN` | 安全策略阻止 |

---

## Python 自动化 API

基础 URL: `http://localhost:3200`

### GUI 控制

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/click` | POST | 点击坐标 |
| `/api/type` | POST | 输入文字 |
| `/api/hotkey` | POST | 快捷键 |
| `/api/screenshot` | POST | 截图 |
| `/api/ocr` | POST | OCR 识别 |

### 浏览器控制

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/browser/launch` | POST | 启动浏览器 |
| `/api/browser/navigate` | POST | 导航 |
| `/api/browser/click` | POST | 点击元素 |
| `/api/browser/screenshot` | POST | 页面截图 |
| `/api/browser/close` | POST | 关闭浏览器 |

---

*Chubao AI API v0.1.0*
