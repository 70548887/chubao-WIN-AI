# 无限运行开发 AI 系统 & 多角色并行开发 — 可行性分析

> 更新时间：2026-02-13  
> 状态：📋 分析完成

---

## 目录

1. [问题定义](#1-问题定义)
2. [当前系统能力诊断](#2-当前系统能力诊断)
3. [OpenClaw 上游已有能力](#3-openclaw-上游已有能力)
4. [可行性结论](#4-可行性结论)
5. [实施方案](#5-实施方案)
6. [架构设计](#6-架构设计)

---

## 1. 问题定义

### 1.1 无限运行开发 AI 系统

> **需求：** AI 系统能够长久运行，持续进行开发任务，不断迭代优化，无需人工频繁干预。

核心要素：

| 要素 | 说明 |
|------|------|
| **持久运行** | 7×24 不间断服务，进程崩溃自动恢复 |
| **任务持续性** | 一个开发任务可以跨越多轮对话，中断后能恢复 |
| **自主循环** | Agent 能自主决定下一步：分析→编码→测试→修复→提交 |
| **定时触发** | 支持 Cron 定时任务，定期执行代码检查、进度汇报等 |
| **会话持久化** | 对话历史、任务进度、中间状态可持久化到磁盘 |
| **错误恢复** | 工具调用失败能重试，Agent 卡住能超时中断 |

### 1.2 多角色并行开发

> **需求：** 多个 AI 角色同时工作，各司其职，互不干扰地并行开发不同模块。

核心要素：

| 要素 | 说明 |
|------|------|
| **角色隔离** | 每个角色有独立的 workspace、session、工具权限 |
| **并行执行** | 多个角色可同时运行，不阻塞彼此 |
| **任务分配** | 主 Agent 能拆解任务并分配给子 Agent |
| **结果汇总** | 子 Agent 完成后将结果报告回主 Agent |
| **冲突处理** | 多 Agent 同时修改代码时的 Git 冲突管理 |
| **资源管控** | 并发数上限、Token 消耗控制、超时中断 |

---

## 2. 当前系统能力诊断

### 2.1 当前 Agent 运行时 — 关键限制

文件：`sidecars/node-backend/src/agent/runtime.ts`

```
❌ 限制 1：循环上限仅 5 轮
   → maxIterations: 5  (L16)
   → 超过 5 轮返回"请简化问题"

❌ 限制 2：无会话持久化
   → messages 数组每次调用从零构建 (L59-61)
   → sessionId 参数接收但从未使用
   → 下次调用完全丢失上下文

❌ 限制 3：单轮工具调用
   → 只读 response.content[0]  (L82)
   → Claude 返回多个 tool_use blocks 时只执行第一个
   → tool_result 不按 Claude API 规范回传

❌ 限制 4：无任务队列
   → 每个 POST /api/chat 是独立的 request-response
   → 无异步任务、无队列、无后台执行
   → 无 Cron 定时任务

❌ 限制 5：单实例 Agent
   → 整个系统只有 1 个 AgentRuntime 实例 (index.ts L151)
   → 无多角色支持、无 Agent 路由
   → 无子 Agent 生成能力
```

### 2.2 当前记忆系统 — 能力边界

文件：`sidecars/node-backend/src/memory/manager.ts`

```
✅ 有：SQLite 持久化 + 每日日志 + 知识图谱 + MEMORY.md
⚠️ 缺：不支持任务状态持久化（只记录对话，不记录进度）
⚠️ 缺：无向量搜索（sqlite-vec 可选但未启用）
⚠️ 缺：无会话恢复机制（记忆是追加型，不能重建会话上下文）
```

### 2.3 当前 WebSocket 网关 — 能力边界

文件：`sidecars/node-backend/src/gateway/server.ts`

```
✅ 有：WebSocket 多客户端连接
✅ 有：消息广播能力
⚠️ 缺：无会话路由（所有客户端共享同一个 Agent）
⚠️ 缺：无消息队列（消息直接同步处理）
⚠️ 缺：无认证/鉴权（任何连接都能操作）
```

### 2.4 能力评分

| 能力维度 | 当前分 | 满分 | 占比 |
|----------|--------|------|------|
| 持久运行 | 2 | 10 | 20% |
| 任务持续性 | 0 | 10 | 0% |
| 自主循环 | 2 | 10 | 20% |
| 定时触发 | 0 | 10 | 0% |
| 多角色支持 | 0 | 10 | 0% |
| 并行执行 | 0 | 10 | 0% |
| **总计** | **4** | **60** | **7%** |

**结论：当前系统不支持无限运行开发和多角色并行。**

---

## 3. OpenClaw 上游已有能力

> chubao-WIN-AI 基于 OpenClaw 二次开发，但目前只用了其极小部分能力。  
> OpenClaw 上游（`openclaw-main/`）已经实现了我们需要的绝大多数功能。

### 3.1 Agent 循环（已有 ✅）

来源：`openclaw-main/docs/concepts/agent-loop.md`

```
agent RPC → agentCommand → runEmbeddedPiAgent → pi-agent-core 运行时
    ↕                         ↕
 session 持久化           per-session + global 队列序列化
    ↕                         ↕
 lifecycle 事件流          timeout → 自动中断
```

**关键特性：**
- 会话持久化（文件 + DB）
- 运行序列化（per-session 队列保证一致性）
- 超时自动中断
- lifecycle 事件流（start → tool → assistant → end/error）

### 3.2 命令队列（已有 ✅）

来源：`openclaw-main/docs/concepts/queue.md`

```
入站消息 → Lane-aware FIFO 队列 → 按 session 序列化 → 全局并发上限
                                                        ↓
                                              main lane: 4 并发
                                              subagent lane: 8 并发
                                              cron lane: 1 并发
```

**关键特性：**
- 多 Lane 队列（main / subagent / cron）
- 可配置并发上限（`agents.defaults.maxConcurrent`）
- 消息去重和合并（collect / steer / followup 模式）
- 纯 TypeScript 实现，无外部依赖

### 3.3 Cron 定时任务（已有 ✅）

来源：`openclaw-main/docs/zh-CN/automation/cron-jobs.md`

```json5
{
  "name": "Morning brief",
  "schedule": { "kind": "cron", "expr": "0 7 * * *" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "检查代码库变更，汇报开发进度"
  }
}
```

**关键特性：**
- 一次性（at）/ 周期性（cron/every）调度
- 主会话或隔离会话执行
- 模型/思维级别覆盖
- 支持结果投递到聊天渠道

### 3.4 子 Agent / 并行任务（已有 ✅）

来源：`openclaw-main/docs/tools/subagents.md`

```
主 Agent
  ├─ sessions_spawn("研究 Node.js 最佳实践") → 子 Agent A (独立会话)
  ├─ sessions_spawn("分析服务器日志")       → 子 Agent B (独立会话)
  └─ sessions_spawn("编写单元测试")         → 子 Agent C (独立会话)
      ↓         ↓         ↓
   各自独立运行，完成后 announce 回主 Agent
```

**关键特性：**
- 非阻塞生成（立即返回 runId）
- 独立会话隔离（`agent:<agentId>:subagent:<uuid>`）
- 专用队列 Lane（`subagent`，默认 8 并发）
- 工具策略（deny 危险工具，可自定义 allow/deny 列表）
- 自动归档（默认 60 分钟后归档，保留记录）
- 不允许嵌套生成（子 Agent 不能再生成子 Agent）

### 3.5 多 Agent 路由（已有 ✅）

来源：`openclaw-main/docs/concepts/multi-agent.md`

```json5
{
  agents: {
    list: [
      { id: "architect",  workspace: "~/.openclaw/workspace-architect" },
      { id: "frontend",   workspace: "~/.openclaw/workspace-frontend" },
      { id: "backend",    workspace: "~/.openclaw/workspace-backend" },
      { id: "tester",     workspace: "~/.openclaw/workspace-tester" },
    ]
  },
  bindings: [
    { agentId: "architect", match: { channel: "telegram", peer: { kind: "direct", id: "..." } } },
    { agentId: "frontend",  match: { channel: "whatsapp" } },
    // ...
  ]
}
```

**每个 Agent 完全隔离：**
- 独立 workspace（代码/文件/配置）
- 独立 agentDir（认证/模型注册/配置）
- 独立 session store（对话历史/路由状态）
- 独立 skills（插件/工具）

### 3.6 多 Agent 安全规范（已有 ✅）

来源：`openclaw-main/AGENTS.md` L146-150

```markdown
- Multi-agent safety: git pull --rebase 合并（不丢弃其他 Agent 的工作）
- Multi-agent safety: 不创建/删除/修改 git worktree（除非明确要求）
- Multi-agent safety: 不切换分支（除非明确要求）
- Multi-agent safety: 每个 Agent 有自己的 session
- Multi-agent safety: 看到不认识的文件继续工作，只提交自己的变更
```

### 3.7 能力对照表

| 能力 | chubao 当前 | OpenClaw 上游 | 差距 |
|------|-------------|---------------|------|
| Agent 多轮循环 | 5轮上限，单 tool | 无限轮，多 tool，完整 lifecycle | **极大** |
| 会话持久化 | 无 | 文件 + DB 完整持久化 | **极大** |
| 任务队列 | 无 | Lane-aware FIFO，多级并发 | **极大** |
| Cron 定时 | 无 | 完整 cron/at/every 调度 | **极大** |
| 子 Agent | 无 | sessions_spawn，8 并发 | **极大** |
| 多 Agent 路由 | 无 | 完整 binding + routing | **极大** |
| 安全隔离 | 无 | 沙箱 + 工具白名单 + per-agent | **极大** |
| 错误恢复 | break on error | timeout + abort + retry | **大** |

---

## 4. 可行性结论

### 4.1 回答：能否实现无限运行开发 AI？

**可以实现，但需要大幅改造。**

| 维度 | 可行性 | 路径 |
|------|--------|------|
| **技术可行性** | ✅ 高 | OpenClaw 上游已有完整实现，不需从零构建 |
| **集成难度** | ⚠️ 中高 | 需替换简化版 runtime.ts，引入上游的 Agent Loop + Queue + Cron |
| **运行时稳定性** | ⚠️ 需验证 | Node.js 长时间运行的内存泄漏、Python sidecar 重连 |
| **成本控制** | ⚠️ 需设计 | 无限运行 = 无限 Token 消耗，需要预算控制机制 |

**实现路径：**

```
方案 A（推荐）: 深度集成 OpenClaw 上游
  → 引入 agent-loop + command-queue + cron 模块
  → 复用上游的 session 持久化
  → 工作量 ~5-8 天

方案 B: 自研简化版
  → 重写 runtime.ts 支持多轮 + session 持久化
  → 自建简单任务队列 + setInterval 定时
  → 工作量 ~3-5 天（功能较弱）
```

### 4.2 回答：能否支持多角色并行开发？

**可以实现，OpenClaw 已有成熟方案。**

| 维度 | 可行性 | 路径 |
|------|--------|------|
| **技术可行性** | ✅ 高 | OpenClaw 的 Multi-Agent Routing 和 Sub-Agents 已经过生产验证 |
| **集成难度** | ⚠️ 高 | 需引入完整的 agents 配置体系、session 路由、queue lane |
| **Git 冲突** | ⚠️ 需设计 | 多 Agent 同时提交需要 worktree 或 branch 隔离 |
| **资源消耗** | ⚠️ 成倍增长 | 每个 Agent 独立上下文 = N 倍 Token 消耗 |

**推荐的多角色分工方案：**

```
┌─────────────────────────────────────────────────────────────┐
│                    主 Agent (Architect)                       │
│  职责：需求分析 → 任务拆解 → 分配 → 汇总 → 代码审查         │
├─────────────────────────────────────────────────────────────┤
│         ↓ sessions_spawn          ↓ sessions_spawn           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Frontend Dev │  │ Backend Dev  │  │ Tester       │       │
│  │ ──────────── │  │ ──────────── │  │ ──────────── │       │
│  │ React/UI     │  │ API/数据库   │  │ 自动化测试   │       │
│  │ 样式/组件    │  │ 业务逻辑    │  │ 回归测试     │       │
│  │ i18n         │  │ 安全/性能   │  │ 集成测试     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         ↓ announce         ↓ announce         ↓ announce     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              主 Agent 汇总审查 + git merge             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 实施方案

### 5.1 Phase 1：Agent 循环升级（Day 1-3）

**目标：** 从"5 轮单 tool"升级到"无限轮多 tool + session 持久化"

#### 改动 1：重写 `agent/runtime.ts`

```typescript
// 核心改造点
class AgentRuntime {
  private sessions: Map<string, ConversationHistory> = new Map();  // 新增：会话持久化
  private maxIterations: number = 50;  // 从 5 → 50

  async chat(message: string, sessionId: string): Promise<string> {
    // 1. 加载或创建会话历史
    const history = this.getOrCreateSession(sessionId);
    history.push({ role: 'user', content: message });

    // 2. ReAct 循环 — 遍历所有 content blocks
    while (iteration < this.maxIterations) {
      const response = await this.client.messages.create({
        messages: history,  // 传完整历史
        tools: toolDefinitions,
      });

      // 3. 处理所有 content blocks（不止第一个）
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await this.executeTool(block.name, block.input);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }

      // 4. 追加 assistant 消息和 tool_result 到历史
      history.push({ role: 'assistant', content: response.content });
      if (toolResults.length > 0) {
        history.push({ role: 'user', content: toolResults });
      }

      // 5. 判断是否继续
      if (response.stop_reason === 'end_turn') break;
    }

    // 6. 持久化会话
    await this.saveSession(sessionId, history);
  }
}
```

#### 改动 2：新增 session 持久化

```typescript
// 新增文件：agent/session-store.ts
class SessionStore {
  async load(sessionId: string): Promise<Message[]>
  async save(sessionId: string, messages: Message[]): Promise<void>
  async list(): Promise<SessionInfo[]>
  async delete(sessionId: string): Promise<void>
  // 存储位置：memory/sessions/<sessionId>.json
}
```

### 5.2 Phase 2：任务队列 + Cron（Day 3-5）

**目标：** 支持异步任务执行和定时触发

#### 改动 1：简化版命令队列

```typescript
// 新增文件：agent/task-queue.ts
class TaskQueue {
  private queue: Task[] = [];
  private running: Map<string, Task> = new Map();
  private maxConcurrent: number = 4;

  async enqueue(task: Task): Promise<string>          // 返回 taskId
  async getStatus(taskId: string): Promise<TaskStatus>
  async cancel(taskId: string): Promise<void>

  // 持久化到 memory/tasks/pending.json
  // 进程重启后自动恢复
}
```

#### 改动 2：Cron 定时调度

```typescript
// 新增文件：agent/cron.ts
class CronScheduler {
  addJob(name: string, cronExpr: string, message: string): string
  removeJob(jobId: string): void
  listJobs(): CronJob[]

  // 实现：node-cron 或简单 setInterval
  // 每个 Job 触发时 → enqueue 到 TaskQueue
}
```

#### 新增 API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/tasks` | POST | 提交异步任务 |
| `/api/tasks/:id` | GET | 查询任务状态 |
| `/api/tasks/:id` | DELETE | 取消任务 |
| `/api/tasks` | GET | 列出所有任务 |
| `/api/cron` | POST | 添加定时任务 |
| `/api/cron` | GET | 列出定时任务 |
| `/api/cron/:id` | DELETE | 删除定时任务 |
| `/api/sessions` | GET | 列出所有会话 |
| `/api/sessions/:id/history` | GET | 获取会话历史 |

### 5.3 Phase 3：子 Agent 并行（Day 5-8）

**目标：** 主 Agent 能生成子 Agent 执行后台任务

#### 改动 1：SubAgent 注册中心

```typescript
// 新增文件：agent/subagent-registry.ts
class SubagentRegistry {
  private runs: Map<string, SubagentRun> = new Map();

  async spawn(task: string, options?: SpawnOptions): Promise<{
    runId: string;
    sessionId: string;
    status: 'accepted';
  }>

  async stop(runId: string): Promise<void>
  async list(): Promise<SubagentRun[]>
  async getResult(runId: string): Promise<SubagentResult | null>
}
```

#### 改动 2：注册为 Agent 工具

```typescript
// 在 tools/index.ts 中新增
export const spawnSubagentTool: Tool = {
  name: 'spawn_subagent',
  description: '生成子 Agent 在后台执行任务，不阻塞当前对话',
  parameters: z.object({
    task: z.string().describe('子 Agent 要执行的任务描述'),
    label: z.string().optional().describe('简短标签'),
    timeoutSeconds: z.number().optional().describe('超时秒数'),
  }),
  execute: async (args) => {
    return await subagentRegistry.spawn(args.task, args);
  }
};
```

### 5.4 Phase 4：多角色路由（Day 8-10）

**目标：** 支持多个独立 Agent 同时运行

#### 改动 1：Agent 配置体系

```json5
// config/agents.json
{
  "agents": [
    {
      "id": "architect",
      "name": "架构师",
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": "你是项目架构师，负责需求分析和任务拆解...",
      "tools": { "allow": ["all"] },
      "workspace": "./workspaces/architect"
    },
    {
      "id": "frontend",
      "name": "前端开发",
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": "你是前端开发者，负责 React 组件和样式...",
      "tools": { "allow": ["read", "write", "edit", "screenshot"] },
      "workspace": "./workspaces/frontend"
    },
    {
      "id": "backend",
      "name": "后端开发",
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": "你是后端开发者，负责 API 和数据库...",
      "tools": { "allow": ["read", "write", "edit", "exec"] },
      "workspace": "./workspaces/backend"
    },
    {
      "id": "tester",
      "name": "测试工程师",
      "model": "claude-haiku-4-20250514",
      "systemPrompt": "你是测试工程师，负责编写和执行测试...",
      "tools": { "allow": ["read", "exec", "screenshot"] },
      "workspace": "./workspaces/tester"
    }
  ]
}
```

#### 改动 2：Agent 路由器

```typescript
// 新增文件：agent/router.ts
class AgentRouter {
  private agents: Map<string, AgentRuntime> = new Map();

  async initialize(config: AgentsConfig): Promise<void>
  getAgent(agentId: string): AgentRuntime
  routeMessage(channel: string, senderId: string): AgentRuntime
  listAgents(): AgentInfo[]
}
```

#### 改动 3：WebSocket 网关升级

```typescript
// gateway/server.ts 改造
// 消息格式增加 agentId 字段
interface WSMessage {
  type: string;
  payload: unknown;
  id?: string;
  agentId?: string;  // 新增：指定目标 Agent
}

// 路由到指定 Agent
case 'chat':
  const agent = router.getAgent(message.agentId || 'architect');
  const response = await agent.chat(message.payload, message.id);
  // ...
```

---

## 6. 架构设计

### 6.1 无限运行架构

```
┌────────────────────────────────────────────────────────────────────┐
│                     Chubao AI — 无限运行架构                       │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    进程管理层 (Tauri/PM2)                    │  │
│  │  • 进程崩溃自动重启                                          │  │
│  │  • 健康检查心跳                                              │  │
│  │  • 资源监控（内存/CPU）                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    调度层 (Scheduler)                        │  │
│  │                                                             │  │
│  │  Cron 定时器 ──→ ┌─────────────────┐ ←── 用户消息           │  │
│  │  Webhook    ──→ │   Task Queue     │ ←── 子 Agent 结果     │  │
│  │  内部触发   ──→ │   (FIFO + Lane)  │ ←── 错误重试          │  │
│  │                  └────────┬────────┘                        │  │
│  │                           ↓                                 │  │
│  │              ┌────────────┴────────────┐                    │  │
│  │              ↓                         ↓                    │  │
│  │    ┌─────────────────┐    ┌──────────────────┐              │  │
│  │    │ Main Lane (4)   │    │ Subagent Lane (8) │              │  │
│  │    └────────┬────────┘    └────────┬─────────┘              │  │
│  └─────────────┼──────────────────────┼────────────────────────┘  │
│                ↓                      ↓                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   执行层 (Agent Runtime)                     │  │
│  │                                                             │  │
│  │  ┌───────────────────────────────────────────────┐          │  │
│  │  │            ReAct 循环 (max 50 轮)              │          │  │
│  │  │                                               │          │  │
│  │  │  Claude API ←→ Tool Execution ←→ Vision       │          │  │
│  │  │       ↓                                       │          │  │
│  │  │  Session 持久化 (memory/sessions/*.json)       │          │  │
│  │  └───────────────────────────────────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   持久化层 (Storage)                         │  │
│  │                                                             │  │
│  │  SQLite ─── 记忆 + 任务状态 + Cron Jobs                     │  │
│  │  JSON   ─── 会话历史 + Agent 配置 + 子 Agent 注册表          │  │
│  │  Markdown ─ 每日日志 + 知识图谱 + MEMORY.md                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 多角色并行架构

```
┌────────────────────────────────────────────────────────────────────┐
│                   Chubao AI — 多角色并行架构                       │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  用户 (WebSocket / Telegram / WhatsApp)                            │
│       ↓                                                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Agent Router (路由器)                      │  │
│  │  • 根据 agentId / channel / senderId 路由                   │  │
│  │  • 默认路由到 architect                                      │  │
│  └────────┬──────────┬──────────┬──────────┬───────────────────┘  │
│           ↓          ↓          ↓          ↓                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │Architect │ │ Frontend │ │ Backend  │ │ Tester   │             │
│  │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │             │
│  │ Session A│ │ Session B│ │ Session C│ │ Session D│             │
│  │ Tools:ALL│ │ Tools:UI │ │ Tools:API│ │ Tools:QA │             │
│  │ Model:S4 │ │ Model:S4 │ │ Model:S4 │ │ Model:H4 │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│       ↓              ↓            ↓            ↓                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │               共享基础设施                                   │  │
│  │  • Python Sidecar (GUI 控制 / OCR / 浏览器)                 │  │
│  │  • Memory DB (SQLite, 每个 Agent 独立表)                    │  │
│  │  • Git Repo (worktree 或 branch 隔离)                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Git 冲突策略：                                                    │
│  • 每个 Agent 工作在独立 branch                                   │
│  • Architect Agent 负责 merge + 冲突解决                          │
│  • 提交时只提交自己的变更                                          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 6.3 开发自动化循环示例

```
Cron: 每天 9:00 触发
    ↓
Architect Agent:
  1. 读取 DESIGN.md + SPRINT_NEXT_PLAN.md
  2. 检查 git log 昨日进度
  3. 拆解今日任务
    ↓
spawn_subagent("实现 /api/hotkey 路由") → Frontend Dev
spawn_subagent("重写 Agent 多轮循环")  → Backend Dev
spawn_subagent("编写 hotkey 测试用例") → Tester
    ↓
各 Agent 独立工作 (并行)
    ↓
完成后 announce 回 Architect
    ↓
Architect:
  1. 审查各 Agent 的代码变更
  2. 合并到主分支
  3. 运行完整测试
  4. 生成进度报告
  5. 更新 SPRINT 看板
    ↓
Cron: 每天 18:00 汇报
  → 投递到 Telegram/飞书："今日完成 3 个任务，通过 12 个测试"
```

### 6.4 成本控制设计

| 控制手段 | 说明 |
|----------|------|
| **Token 预算** | 每天/每周的 Token 上限，超出暂停执行 |
| **模型分级** | 主 Agent 用 Sonnet (高质量)，子 Agent 用 Haiku (低成本) |
| **循环上限** | 单任务最大 50 轮，超出强制中断 |
| **超时** | 每个子 Agent 最大运行 5 分钟 |
| **去重** | 相同任务合并，避免重复执行 |
| **缓存** | 工具结果缓存，减少重复调用 |

### 6.5 总时间线

```
Day  1-3  ─── Phase 1: Agent 循环升级 (多轮 + session 持久化)
Day  3-5  ─── Phase 2: 任务队列 + Cron 定时
Day  5-8  ─── Phase 3: 子 Agent 并行
Day  8-10 ─── Phase 4: 多角色路由 + 配置体系
Day 10-12 ─── Phase 5: 联调验收 + 稳定性测试
```

**完成后能力评分预估：**

| 能力维度 | 当前分 | Phase 1-4 后 | 满分 |
|----------|--------|-------------|------|
| 持久运行 | 2 | 9 | 10 |
| 任务持续性 | 0 | 8 | 10 |
| 自主循环 | 2 | 9 | 10 |
| 定时触发 | 0 | 9 | 10 |
| 多角色支持 | 0 | 8 | 10 |
| 并行执行 | 0 | 8 | 10 |
| **总计** | **4 (7%)** | **51 (85%)** | **60** |

---

*文档版本: v1.0 | 最后更新: 2026-02-13*
