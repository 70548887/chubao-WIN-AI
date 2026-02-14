# Sidecar 状态与健康检查契约（Sprint 1）

更新时间：2026-02-13  
版本：`v1.2.2`  
状态：`frozen`（本迭代冻结，变更需评审）

## 1. 目标与范围

本契约统一以下接口，作为 Tauri、Node、Python、Frontend、QA 并行开发的共同基线：

1. Tauri 命令：`ensure_sidecars`、`sidecar_status`、`restart_sidecar`、`sidecar_logs`、`sidecar_diagnostics`
2. Sidecar 健康接口：`GET /health`（Node、Python）
3. HTTP 业务错误响应格式（Node、Python）

## 2. 命名规范

1. JSON 字段统一使用 `camelCase`
2. 布尔字段使用明确语义：`running`、`healthy`、`managed`
3. 错误码使用全大写下划线：`SERVICE_UNAVAILABLE`

## 3. Tauri 命令契约

### 3.1 `ensure_sidecars`

功能：确保 Node/Python sidecar 已启动，并返回当前状态快照。  
返回类型：`SidecarStatus`

### 3.2 `sidecar_status`

功能：仅返回当前状态快照，不主动重启服务。  
返回类型：`SidecarStatus`

### 3.3 `restart_sidecar`

功能：按服务名重启 sidecar，并返回重启后的状态快照。  
请求参数：

```json
{
  "service": "node"
}
```

参数规则：

1. `service` 允许值：`node`、`python`
2. 若目标服务为“外部托管”（`managed=false` 且 `healthy=true`），返回错误（禁止重启外部进程）

返回类型：`SidecarStatus`

### 3.4 `sidecar_logs`

功能：读取 sidecar 最近日志（按服务维度）。  
请求参数：

```json
{
  "service": "python",
  "limit": 120
}
```

参数规则：

1. `service` 允许值：`node`、`python`
2. `limit` 可选，范围 `1..500`

返回类型：

```json
{
  "service": "python",
  "lines": [
    "[1739450000000][Python Automation] process started, pid=12345",
    "[1739450001000][Python Automation stdout] ...",
    "[1739450002000][Python Automation] health check passed on port 3200"
  ]
}
```

### 3.5 `SidecarStatus` 结构

```json
{
  "node": {
    "name": "Node.js Backend",
    "running": true,
    "healthy": true,
    "managed": true,
    "pid": 12345,
    "port": 3100,
    "endpoint": "http://127.0.0.1:3100/health",
    "lastError": null
  },
  "python": {
    "name": "Python Automation",
    "running": true,
    "healthy": true,
    "managed": true,
    "pid": 12346,
    "port": 3200,
    "endpoint": "http://127.0.0.1:3200/health",
    "lastError": null
  }
}
```

字段说明（`ServiceStatus`）：

1. `name: string` 服务名（展示用途）
2. `running: boolean` 服务是否在运行（进程存活或健康端点可达）
3. `healthy: boolean` `/health` 是否通过
4. `managed: boolean` 是否由 Tauri 当前进程托管
5. `pid: number | null` 托管进程 PID；外部托管时为 `null`
6. `port: number` 监听端口
7. `endpoint: string` 健康检查地址
8. `lastError: string | null` 最近一次启动或状态检查错误

### 3.6 `sidecar_diagnostics`

功能：返回 Sidecar 状态 + `/health` 详情，供前端展示版本、依赖状态等信息。  
语义：只读查询，不主动重启服务。  
返回类型：`SidecarDiagnostics`

```json
{
  "node": {
    "status": {
      "name": "Node.js Backend",
      "running": true,
      "healthy": true,
      "managed": true,
      "pid": 12345,
      "port": 3100,
      "endpoint": "http://127.0.0.1:3100/health",
      "lastError": null
    },
    "health": {
      "status": "ok",
      "service": "node-backend",
      "version": "0.1.0",
      "uptimeSec": 27,
      "timestamp": "2026-02-13T14:00:00.000Z",
      "deps": {
        "memory": "ok",
        "gateway": "ok"
      }
    },
    "healthError": null
  },
  "python": {
    "status": {
      "name": "Python Automation",
      "running": true,
      "healthy": true,
      "managed": true,
      "pid": 12346,
      "port": 3200,
      "endpoint": "http://127.0.0.1:3200/health",
      "lastError": null
    },
    "health": {
      "status": "ok",
      "service": "python-automation",
      "version": "0.1.0",
      "uptimeSec": 24,
      "timestamp": "2026-02-13T14:00:01.000Z",
      "deps": {
        "gui": "ok",
        "ocr": "ok",
        "screenshot": "ok"
      }
    },
    "healthError": null
  }
}
```

## 4. Sidecar `/health` 统一契约

Node 与 Python 都必须返回以下结构（字段齐全）：

```json
{
  "status": "ok",
  "service": "node-backend",
  "version": "0.1.0",
  "uptimeSec": 12,
  "timestamp": "2026-02-13T14:00:00.000Z",
  "deps": {
    "memory": "ok",
    "ocr": "ok"
  }
}
```

字段规则：

1. `status: "ok" | "degraded" | "error"`
2. `service: string`（`node-backend` 或 `python-automation`）
3. `version: string`（语义版本）
4. `uptimeSec: number`（进程启动后秒数）
5. `timestamp: string`（ISO-8601）
6. `deps: Record<string, string>`（依赖组件健康摘要，值建议 `ok/degraded/error/disabled`）

## 5. HTTP 错误响应契约

所有业务接口失败时，返回：

```json
{
  "success": false,
  "errorCode": "INVALID_ARGUMENT",
  "message": "window_title is required",
  "details": {
    "field": "window_title"
  },
  "requestId": "3dc8756e-61f8-4cc8-bd58-bac2b7e29e8c"
}
```

字段规则：

1. `success` 固定为 `false`
2. `errorCode` 机器可读错误码
3. `message` 人类可读错误信息
4. `details` 可选，结构化补充信息
5. `requestId` 可选，用于日志追踪

建议错误码集合（Sprint 1）：

1. `INVALID_ARGUMENT`
2. `SERVICE_UNAVAILABLE`
3. `DEPENDENCY_UNAVAILABLE`
4. `TIMEOUT`
5. `INTERNAL_ERROR`

## 6. 兼容策略

在 Sprint 1 内允许短期兼容旧字段，但前端只依赖本契约字段。  
兼容窗口结束后，旧字段应移除。

## 7. 验收命令

1. `Invoke-RestMethod http://127.0.0.1:3100/health | ConvertTo-Json -Depth 4`
2. `Invoke-RestMethod http://127.0.0.1:3200/health | ConvertTo-Json -Depth 4`
3. 前端调用 `ensure_sidecars` 与 `sidecar_status`，确认字段齐全且类型符合本契约

## 8. 非兼容变更规则

本文件标记为 `frozen` 后：

1. 新增字段：允许（向后兼容）
2. 删除字段：禁止
3. 字段重命名：禁止
4. 字段类型修改：禁止

如需修改，必须先更新本文件版本并通过评审。
