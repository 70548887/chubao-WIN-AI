# Chubao AI 并行开发看板（Sprint 1）

更新时间：2026-02-13  
周期：3 天（可按实际人力缩放）

## 目标

在现有基础上，把项目从“可运行原型”推进到“可稳定联调”：

1. `src-tauri` 负责 sidecar 生命周期管理（启动、状态、重启）
2. 前端可见真实服务状态并可执行基础运维动作
3. Node/Python 健康检查和错误格式统一
4. 有最小化的联调验收脚本与发布前检查

## 角色与分支

1. 技术负责人（你/我）：接口冻结、合并策略、风险清单
2. Tauri 核心组：`feat/tauri-supervisor`
3. Node 后端组：`feat/node-health-contract`
4. Python 自动化组：`feat/python-health-contract`
5. 前端组：`feat/frontend-service-console`
6. QA/发布组：`feat/qa-smoke-release`

## 并行任务（10 项）

| ID | 角色 | 任务 | 依赖 | 交付（DoD） | 验收命令 | 状态 |
|---|---|---|---|---|---|---|
| T0 | 技术负责人 | 冻结状态接口契约（JSON 字段、错误码） | 无 | `docs/SIDECAR_STATUS_CONTRACT.md` 完成并评审通过 | `rg "sidecar_status|errorCode" docs` | ✅ Done |
| T1 | Tauri 核心组 | 增加 `restart_sidecar(service)` 命令 | T0 | 支持 `node/python` 单服务重启，返回新状态 | 前端按钮触发后状态变更 | ✅ Done |
| T2 | Tauri 核心组 | 增加 sidecar 守护与退避重启 | T0 | 服务异常退出后自动重启，最多 N 次并记录错误 | 手动 kill 进程后自动恢复 | ✅ Done |
| T3 | Tauri 核心组 | 增加运行日志缓存查询命令 | T0 | `sidecar_logs(service, limit)` 可读最近日志 | 前端可查看日志片段 | ✅ Done |
| T4 | Node 后端组 | 统一 `/health` 输出结构 | T0 | 包含 `status/version/uptime/deps` 字段 | `curl http://127.0.0.1:3100/health` | ✅ Done |
| T5 | Node 后端组 | API 错误响应标准化 | T0 | 全部接口返回 `{ success, errorCode, message }` | `curl` 异常场景验证 | ✅ Done |
| T6 | Python 自动化组 | 统一 `/health` 输出结构 | T0 | 与 Node 契约一致并含 OCR/GUI 可用性摘要 | `curl http://127.0.0.1:3200/health` | ✅ Done |
| T7 | Python 自动化组 | 接口异常分类（参数/运行时/依赖） | T0 | 统一错误码与可读 message | 调用非法参数接口验证 | ✅ Done |
| T8 | 前端组 | 服务控制台：状态、重启按钮、日志面板 | T1,T3,T4,T6 | 设置页支持“刷新/重启/查看日志” | `npm run build` + 手工验证 | ✅ Done |
| T9 | QA/发布组 | 新增联调 smoke 脚本与清单 | T4,T6,T8 | `scripts/smoke.ps1` 覆盖 health/chat/windows/status | `.\scripts\smoke.ps1` | ✅ Done |

## 执行顺序（并行）

1. Day 1 上午：先完成 T0（接口冻结），不冻结不开发。
2. Day 1 下午：Tauri（T1/T2/T3）、Node（T4/T5）、Python（T6/T7）并行。
3. Day 2：前端接入 T8，与后端联调。
4. Day 3：QA 完成 T9，修复阻塞项后合并 `develop`。

## 合并规则

1. 每个任务单独 PR，标题带任务号（如 `T4: unify node health payload`）。
2. 必须附验收截图或命令输出摘要。
3. 未通过 smoke 脚本的 PR 不合并。
4. 每天 18:00 做一次集成合并窗口。

## 风险与约束

1. 当前机器缺 `rustc/cargo`，Tauri 本地编译验证受限。
2. Windows 上多进程拉起需避免端口抢占，`scripts/start.ps1` 与 Tauri 启动策略要一致。
3. Python OCR 初次加载较慢，健康检查建议分“存活”和“就绪”两级状态。

## 本迭代完成定义

1. 桌面应用启动后可自动拉起 Node/Python，前端实时看到状态。
2. 前端可对异常服务执行重启并看到恢复结果。
3. 三端（Tauri/Node/Python）错误格式一致，便于排障。
4. 有可复用的 smoke 脚本用于回归。
