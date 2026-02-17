# Sprint 4 可执行并行看板（稳定性补强）

更新时间：2026-02-14  
周期：5 天  
目标：把 `opencode / oh-my-opencode / multi-agent` 从“可用”提升到“可回归、可观测、可持续迭代”。

## 并发开发策略

- 泳道 A（Backend Test）：补齐工具层与路由层单测，保障回归速度。
- 泳道 B（Observability）：补 CLI 健康探针与可观测信息输出。
- 泳道 C（QA + Docs）：补 smoke 与运维文档，形成可执行验收链路。

## 任务拆解（按任务/负责人/验收命令）

| ID | 任务 | 负责人 | 依赖 | 并发泳道 | 验收命令 | 状态 |
|---|---|---|---|---|---|---|
| S4-01 | 为 `opencode.ts`/`ohmyopencode.ts` 增加单测（前台、后台、取消、列表） | Backend Agent A | 无 | A | `node ./node_modules/vitest/vitest.mjs run sidecars/node-backend/src/tools/opencode.test.ts sidecars/node-backend/src/tools/ohmyopencode.test.ts` | ✅ 完成 |
| S4-02 | 为多 Agent 路由补充异常分支测试（4xx/5xx 映射） | Backend Agent A | S4-01 | A | `node ./node_modules/vitest/vitest.mjs run sidecars/node-backend/src/routes/multiAgent.test.ts` | ✅ 完成 |
| S4-03 | 增加 OpenCode/OhMy CLI 健康探针（命令可用性 + 版本） | Backend Agent B | 无 | B | `node ./node_modules/vitest/vitest.mjs run sidecars/node-backend/src/tools/opencode.test.ts sidecars/node-backend/src/tools/ohmyopencode.test.ts` + `npm run smoke` | ✅ 完成 |
| S4-04 | 将 CLI 健康态暴露到 `/api/tools` 与设置页状态摘要 | Backend Agent B + Frontend Agent | S4-03 | B | `npm run build` + `npm run smoke` | ✅ 完成 |
| S4-05 | smoke 增加 multi-agent 正向用例与关键契约断言 | QA Agent | S4-01,S4-03 | C | `npm run verify` | ✅ 完成 |
| S4-06 | 完成 Sprint 4 运维手册（故障定位、回滚、重试流程） | Docs Agent | S4-03,S4-05 | C | 文档评审 + `npm run verify:static` | ✅ 完成 |
| S4-07 | CI 补充 Node backend tests 阶段与失败日志输出 | QA Agent | S4-01,S4-02 | C | GitHub Actions `verify` 绿灯 | ✅ 完成 |

## 并发节奏建议

- Day 1：A/B 并行启动（S4-01 与 S4-03）。
- Day 2：A 收敛测试覆盖（S4-02），B 联动前端展示（S4-04）。
- Day 3-4：C 补 smoke 与文档（S4-05、S4-06）。
- Day 5：CI 收口（S4-07）+ 全链路回归。

## 完成定义（DoD）

- `npm run test:node-backend` 稳定通过。
- `npm run verify` 可在本地一键跑通。
- 设置页可见 OpenCode/OhMy 可用性与失败原因。
- 故障场景有明确 runbook（命令、日志路径、恢复动作）。
