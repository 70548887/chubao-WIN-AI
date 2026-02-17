# Sprint 4 运维手册 (Runbook)

> **版本**: v1.0  
> **更新日期**: 2026-02-16  
> **适用范围**: Chubao AI Sprint 4 稳定性补强阶段  
> **目标读者**: 运维人员、开发人员、QA

---

## 目录

1. [快速诊断](#1-快速诊断)
2. [故障场景与恢复](#2-故障场景与恢复)
3. [回滚流程](#3-回滚流程)
4. [重试机制](#4-重试机制)
5. [日志与监控](#5-日志与监控)
6. [联系与升级](#6-联系与升级)

---

## 1. 快速诊断

### 1.1 一键健康检查

```powershell
# 执行完整验证
npm run verify

# 仅执行静态检查
npm run verify:static

# 执行 smoke 测试
npm run smoke
```

### 1.2 服务状态检查

```powershell
# 检查 Node.js 后端
curl http://localhost:3100/health | ConvertFrom-Json

# 检查 Python 自动化服务
curl http://localhost:3200/health | ConvertFrom-Json

# 检查 CLI 工具状态
curl http://localhost:3100/api/tools | ConvertFrom-Json | Select-Object -ExpandProperty cli
```

### 1.3 关键指标检查清单

| 检查项 | 正常状态 | 检查命令 |
|--------|----------|----------|
| Node.js 后端 | `status: ok` | `curl http://localhost:3100/health` |
| Python 自动化 | `status: ok` | `curl http://localhost:3200/health` |
| CLI 工具 (OpenCode) | `available: true` | `curl http://localhost:3100/api/tools` |
| CLI 工具 (OhMy) | `available: true` | `curl http://localhost:3100/api/tools` |
| 任务队列 | 无堆积 | `curl http://localhost:3100/api/tasks` |
| 定时任务 | 正常调度 | `curl http://localhost:3100/api/cron` |

---

## 2. 故障场景与恢复

### 2.1 场景 A: Node.js 后端无法启动

**现象**:
- 端口 3100 被占用
- 启动时报 `EADDRINUSE` 错误

**诊断**:
```powershell
# 检查端口占用
Get-NetTCPConnection -LocalPort 3100

# 查看占用进程
Get-Process -Id (Get-NetTCPConnection -LocalPort 3100).OwningProcess
```

**恢复步骤**:
```powershell
# 步骤 1: 优雅停止现有进程
npm run stop:all

# 步骤 2: 强制清理端口 (如需要)
$port = 3100
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
}

# 步骤 3: 重新启动
npm run start:server
```

### 2.2 场景 B: Python 自动化服务异常

**现象**:
- OCR 功能不可用
- GUI 控制无响应
- 健康检查返回 `degraded`

**诊断**:
```powershell
# 检查 Python 服务日志
curl http://localhost:3200/health

# 检查依赖状态
python -c "import paddle; import paddleocr; print('OK')"
```

**恢复步骤**:
```powershell
# 步骤 1: 重启 Python sidecar
npm run restart:python

# 步骤 2: 重新初始化 OCR
npm run setup:ocr

# 步骤 3: 验证恢复
curl http://localhost:3200/health
```

### 2.3 场景 C: CLI 工具不可用

**现象**:
- OpenCode/OhMyOpenCode 显示 `available: false`
- 执行工具时返回 `SERVICE_UNAVAILABLE`

**诊断**:
```powershell
# 检查 CLI 工具状态
curl http://localhost:3100/api/tools | ConvertFrom-Json | Select-Object -ExpandProperty cli

# 手动检查命令
npx opencode --version
npx oh-my-opencode --version
```

**恢复步骤**:
```powershell
# 步骤 1: 安装缺失的 CLI 工具
npm install -g opencode
npm install -g oh-my-opencode

# 步骤 2: 或使用 npx 临时安装
npx --yes opencode --version
npx --yes oh-my-opencode --version

# 步骤 3: 验证
npm run smoke
```

### 2.4 场景 D: 任务队列堆积

**现象**:
- 任务执行延迟
- `/api/tasks` 返回大量 pending 任务

**诊断**:
```powershell
# 检查任务队列状态
curl http://localhost:3100/api/tasks | ConvertFrom-Json

# 查看任务统计
$tasks = curl http://localhost:3100/api/tasks | ConvertFrom-Json
$tasks.tasks | Group-Object status
```

**恢复步骤**:
```powershell
# 步骤 1: 清理失败任务 (谨慎操作)
# 手动取消特定任务
curl -X DELETE http://localhost:3100/api/tasks/{taskId}

# 步骤 2: 重启任务队列服务
npm run restart:server

# 步骤 3: 监控恢复
watch -n 5 'curl -s http://localhost:3100/api/tasks | ConvertFrom-Json | Select-Object -ExpandProperty tasks | Measure-Object'
```

### 2.5 场景 E: Multi-Agent 执行失败

**现象**:
- Agent 组启动失败
- 返回 `FORBIDDEN` 或 `SERVICE_UNAVAILABLE`

**诊断**:
```powershell
# 检查 Agent 组状态
curl http://localhost:3100/api/multi-agent/groups | ConvertFrom-Json

# 检查安全策略
curl http://localhost:3100/api/tools | ConvertFrom-Json | Select-Object -ExpandProperty security
```

**恢复步骤**:
```powershell
# 步骤 1: 检查环境变量
$env:CHUBAO_SECURITY_MODE
$env:CHUBAO_ALLOWED_TOOLS

# 步骤 2: 临时放宽安全策略 (开发环境)
$env:CHUBAO_SECURITY_MODE = "warn"

# 步骤 3: 重启服务
npm run restart:server

# 步骤 4: 取消卡住的 Agent 组
$groups = curl http://localhost:3100/api/multi-agent/groups | ConvertFrom-Json
$groups.groups | Where-Object { $_.status -eq "running" } | ForEach-Object {
    curl -X POST "http://localhost:3100/api/multi-agent/groups/$($_.id)/cancel"
}
```

---

## 3. 回滚流程

### 3.1 代码回滚

```powershell
# 步骤 1: 查看最近提交
git log --oneline -10

# 步骤 2: 回滚到指定版本 (保留更改)
git revert HEAD --no-edit

# 步骤 3: 或强制回滚到指定提交 (丢弃更改)
git reset --hard <commit-hash>

# 步骤 4: 重新构建
npm run build

# 步骤 5: 重启服务
npm run restart:all
```

### 3.2 配置回滚

```powershell
# 备份当前配置
copy .env .env.backup.$(Get-Date -Format "yyyyMMdd-HHmmss")

# 恢复默认配置
copy .env.example .env

# 重启服务
npm run restart:all
```

### 3.3 数据库/状态回滚

```powershell
# 任务队列状态回滚
Remove-Item -Path "memory/tasks/pending.json" -Force

# Cron 任务状态回滚
Remove-Item -Path "memory/cron/jobs.json" -Force

# Multi-Agent 组状态回滚
Remove-Item -Path "memory/multi-agent/groups.json" -Force

# 重启服务
npm run restart:server
```

---

## 4. 重试机制

### 4.1 自动重试配置

```powershell
# 设置环境变量启用自动重试
$env:CHUBAO_AUTO_RETRY = "true"
$env:CHUBAO_MAX_RETRIES = "3"
$env:CHUBAO_RETRY_DELAY_MS = "1000"
```

### 4.2 手动重试命令

```powershell
# 重试失败的 smoke 测试
npm run smoke

# 重试特定测试文件
npm run test:node-backend -- routes/multiAgent.test.ts

# 带重试的验证
for ($i = 1; $i -le 3; $i++) {
    npm run verify
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 5
}
```

### 4.3 指数退避重试

```powershell
function Invoke-WithRetry {
    param(
        [scriptblock]$Script,
        [int]$MaxRetries = 3,
        [int]$BaseDelayMs = 1000
    )
    
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            & $Script
            return
        } catch {
            if ($i -eq $MaxRetries - 1) { throw }
            $delay = $BaseDelayMs * [Math]::Pow(2, $i)
            Write-Host "Retry $($i + 1)/$MaxRetries after ${delay}ms..."
            Start-Sleep -Milliseconds $delay
        }
    }
}

# 使用示例
Invoke-WithRetry -Script { npm run smoke } -MaxRetries 3
```

---

## 5. 日志与监控

### 5.1 日志位置

| 组件 | 日志路径 | 说明 |
|------|----------|------|
| Node.js 后端 | `logs/node-backend.log` | 主服务日志 |
| Python 自动化 | `logs/python-automation.log` | GUI/OCR 日志 |
| 任务队列 | `memory/tasks/*.json` | 任务状态持久化 |
| Cron 调度 | `memory/cron/*.json` | 定时任务状态 |
| Smoke 测试 | `logs/smoke-test.log` | 验收测试日志 |

### 5.2 实时监控

```powershell
# 实时监控 Node.js 日志
Get-Content logs/node-backend.log -Wait -Tail 50

# 实时监控 Python 日志
Get-Content logs/python-automation.log -Wait -Tail 50

# 监控服务状态 (每 5 秒)
while ($true) {
    $health = curl -s http://localhost:3100/health | ConvertFrom-Json
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - Status: $($health.status)"
    Start-Sleep 5
}
```

### 5.3 关键指标告警

```powershell
# 检查 CLI 工具可用性
$cli = curl -s http://localhost:3100/api/tools | ConvertFrom-Json
if ($cli.cli.summary.available -eq 0) {
    Write-Warning "⚠️ 所有 CLI 工具不可用!"
}

# 检查任务队列堆积
$tasks = curl -s http://localhost:3100/api/tasks | ConvertFrom-Json
$pendingCount = ($tasks.tasks | Where-Object { $_.status -eq "pending" }).Count
if ($pendingCount -gt 10) {
    Write-Warning "⚠️ 任务队列堆积: $pendingCount 个待处理任务"
}
```

---

## 6. 联系与升级

### 6.1 故障升级路径

```
Level 1 (本地处理) → Level 2 (团队协助) → Level 3 (外部支持)
     ↓                      ↓                      ↓
  查看 Runbook         联系 Tech Lead        创建 Issue
  执行恢复流程         团队群讨论            外部社区
```

### 6.2 关键信息收集

故障报告模板:

```markdown
## 故障报告

**时间**: 2026-02-16 14:30
**环境**: Windows 11 / Node 20 / Python 3.13
**现象**: [描述故障现象]

### 诊断信息
- Node Health: [粘贴 /health 输出]
- Python Health: [粘贴 /health 输出]
- CLI Status: [粘贴 /api/tools 输出]
- 相关日志: [粘贴关键日志]

### 已尝试的恢复步骤
1. [步骤 1]
2. [步骤 2]

### 当前状态
- [ ] 已恢复
- [ ] 部分恢复
- [ ] 未恢复
```

### 6.3 常用命令速查

```powershell
# 快速诊断
npm run verify                    # 完整验证
npm run smoke                     # Smoke 测试
npm run test:node-backend         # 单元测试

# 服务管理
npm run start:all                 # 启动所有服务
npm run stop:all                  # 停止所有服务
npm run restart:all               # 重启所有服务

# 日志查看
Get-Content logs/node-backend.log -Tail 100
Get-Content logs/python-automation.log -Tail 100

# 健康检查
curl http://localhost:3100/health
curl http://localhost:3200/health
curl http://localhost:3100/api/tools
```

---

## 附录

### A. 环境变量参考

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CHUBAO_SECURITY_MODE` | `enforce` | 安全模式: off/warn/enforce |
| `CHUBAO_AUTO_RETRY` | `false` | 启用自动重试 |
| `CHUBAO_MAX_RETRIES` | `3` | 最大重试次数 |
| `NODE_PORT` | `3100` | Node.js 服务端口 |
| `PYTHON_PORT` | `3200` | Python 服务端口 |

### B. 相关文档

- [SPRINT4_EXEC_BOARD.md](./SPRINT4_EXEC_BOARD.md) - Sprint 4 执行看板
- [DESIGN.md](./DESIGN.md) - 系统设计文档
- [TECH_STACK.md](./TECH_STACK.md) - 技术栈说明

---

*文档维护: Chubao AI Team*  
*最后更新: 2026-02-16*
