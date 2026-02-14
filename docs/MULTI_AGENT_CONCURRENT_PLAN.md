# 多 Agent 并发开发方案

> 更新时间：2026-02-13  
> 基于：auto-coding-agent-demo 项目分析  
> 状态：📋 方案设计完成

---

## 目录

1. [auto-coding-agent-demo 项目分析](#1-auto-coding-agent-demo-项目分析)
2. [当前模式的限制](#2-当前模式的限制)
3. [多 Agent 并发方案设计](#3-多-agent-并发方案设计)
4. [chubao-WIN-AI 集成方案](#4-chubao-win-ai-集成方案)
5. [实施路线图](#5-实施路线图)

---

## 1. auto-coding-agent-demo 项目分析

### 1.1 项目概述

| 项目 | 详情 |
|------|------|
| **来源** | 基于 [Anthropic 超长运行 Agent 文章](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| **定位** | 全自动编程 Agent 实验 — 100% 代码由 AI 生成 |
| **驱动** | Claude Code CLI (`claude -p --dangerously-skip-permissions`) |
| **实证** | 31 个任务全部完成，10 小时自动开发一个完整 Next.js 项目 |
| **产出** | Spring FES Video — AI 视频生成平台（前后端 + 数据库 + 第三方 API） |

### 1.2 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                auto-coding-agent-demo                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  task.json ──→ 任务定义 (31 个任务，passes: true/false) │
│       ↓                                                 │
│  CLAUDE.md ──→ Agent 工作流指令                          │
│       ↓                                                 │
│  run-automation.sh ──→ 循环执行器                        │
│       ↓                                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  循环 N 次:                                      │   │
│  │  1. 从 task.json 选 passes:false 的任务           │   │
│  │  2. 实现任务                                      │   │
│  │  3. npm run lint + npm run build 验证             │   │
│  │  4. MCP Playwright 浏览器测试                     │   │
│  │  5. 更新 progress.txt                             │   │
│  │  6. git add . && git commit                       │   │
│  │  7. 标记 passes: true                             │   │
│  └─────────────────────────────────────────────────┘   │
│       ↓                                                 │
│  progress.txt ──→ 进度日志 (1307 行实战记录)             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.3 优秀设计提炼

| 设计 | 说明 | 可借鉴指数 |
|------|------|-----------|
| **task.json 任务定义** | 结构化任务列表，每个任务有 id、title、description、steps、passes | ★★★★★ |
| **CLAUDE.md 工作流** | 6 步强制流程（初始化→选任务→实现→测试→记录→提交） | ★★★★★ |
| **阻塞处理** | 明确定义何时停止、如何报告、禁止假装完成 | ★★★★☆ |
| **progress.txt** | 每个任务的详细记录（做了什么、怎么测的、给后续 Agent 的建议） | ★★★★☆ |
| **init.sh** | 每次会话自动初始化环境 | ★★★☆☆ |
| **run-automation.sh** | 自动循环 + 日志 + 进度统计 | ★★★☆☆ |
| **单任务单提交** | 每个任务一个 commit，便于追溯和回滚 | ★★★★☆ |

### 1.4 执行模式分析

```
当前模式：串行单 Agent

时间线：
T=0h ─── Task 1 (基础配置)
T=0.3h ── Task 2 (数据库 Schema)
T=0.5h ── Task 3 (Supabase 客户端)
T=0.8h ── Task 4 (登录页面) → 阻塞！需人工配置 Supabase
T=1.0h ── [人工介入] 配置 .env.local
T=1.5h ── Task 4 (续) → Task 5 → Task 6 → Task 7
T=3.0h ── Task 8-10 (AI API 封装)
T=4.5h ── Task 11-13 (数据访问层)
T=6.0h ── Task 14-18 (API 实现)
T=8.0h ── Task 19-27 (前端 UI)
T=9.5h ── Task 28-31 (优化收尾 + Bug 修复)
T=10h ─── 完成！31 个任务全部通过
```

**关键观察：**
- 10 小时完成 31 个任务 ≈ 每个任务 ~19 分钟
- 实际很多任务之间没有依赖关系，可以并行
- Task 8-10（三个 API 封装）完全独立，可并行 → 节省 ~1 小时
- Task 19-27（UI 组件）部分可并行 → 节省 ~2 小时

---

## 2. 当前模式的限制

### 2.1 串行瓶颈

```
当前串行：━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 10 小时
理论并行：━━━━━━━━━━━━━━━━━ ~5-6 小时  (节省 40-50%)
```

### 2.2 无法并发的根本原因

| 限制 | 说明 |
|------|------|
| **单进程** | `run-automation.sh` 串行调用 `claude -p`，一个结束下一个才开始 |
| **共享 task.json** | 多个 Agent 同时读写 task.json 会冲突 |
| **共享 workspace** | 多个 Agent 同时修改相同文件会冲突 |
| **无锁机制** | 没有任务分配锁，可能两个 Agent 选到同一个任务 |
| **Git 冲突** | 多 Agent 同时 commit 会产生合并冲突 |
| **端口冲突** | 多个 `npm run dev` 监听同一端口 3000 |

---

## 3. 多 Agent 并发方案设计

### 3.1 方案概览：任务感知并发调度

```
┌─────────────────────────────────────────────────────────────────┐
│                    多 Agent 并发调度器 (Orchestrator)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  task.json (增强版)                                              │
│    ├── 依赖关系图 (depends_on)                                   │
│    ├── 并行分组 (parallel_group)                                 │
│    └── 角色标签 (role: frontend/backend/test)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              任务调度器 (Task Scheduler)                  │   │
│  │                                                         │   │
│  │  1. 解析依赖图，识别可并行任务                             │   │
│  │  2. 按角色分配任务给 Agent                                │   │
│  │  3. 原子锁定任务（防止重复选取）                           │   │
│  │  4. 监控 Agent 状态和进度                                 │   │
│  │  5. 冲突检测和合并                                        │   │
│  └──────┬──────────┬──────────┬──────────┬─────────────────┘   │
│         ↓          ↓          ↓          ↓                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Agent A  │ │ Agent B  │ │ Agent C  │ │ Agent D  │          │
│  │ 前端开发 │ │ 后端开发 │ │ API 开发 │ │ 测试 QA  │          │
│  │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │          │
│  │ Branch:  │ │ Branch:  │ │ Branch:  │ │ Branch:  │          │
│  │ feat/ui  │ │ feat/api │ │ feat/svc │ │ feat/qa  │          │
│  │ Port:    │ │ Port:    │ │ Port:    │ │ Port:    │          │
│  │ 3001     │ │ 3002     │ │ 3003     │ │ 3004     │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│         ↓          ↓          ↓          ↓                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  合并管理器 (Merge Manager)               │  │
│  │  • 每个 Agent 完成后自动 PR 到 main                       │  │
│  │  • 自动 lint + build 验证                                 │  │
│  │  • 冲突时通知 Orchestrator 或人工介入                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 增强版 task.json

```json
{
  "project": "my-project",
  "concurrency": {
    "max_agents": 4,
    "merge_strategy": "rebase",
    "conflict_policy": "notify"
  },
  "tasks": [
    {
      "id": 1,
      "title": "数据库 Schema",
      "role": "backend",
      "depends_on": [],
      "parallel_group": "foundation",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 2,
      "title": "Supabase 客户端封装",
      "role": "backend",
      "depends_on": [1],
      "parallel_group": "foundation",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 8,
      "title": "智谱AI API 封装",
      "role": "backend",
      "depends_on": [1],
      "parallel_group": "ai_services",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 9,
      "title": "火山引擎图片 API",
      "role": "backend",
      "depends_on": [1],
      "parallel_group": "ai_services",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 10,
      "title": "火山引擎视频 API",
      "role": "backend",
      "depends_on": [1],
      "parallel_group": "ai_services",
      "passes": false,
      "locked_by": null,
      "started_at": null
    },
    {
      "id": 19,
      "title": "首页 UI",
      "role": "frontend",
      "depends_on": [4, 5, 6],
      "parallel_group": "ui_pages",
      "passes": false,
      "locked_by": null,
      "started_at": null
    }
  ]
}
```

**新增字段：**

| 字段 | 说明 |
|------|------|
| `role` | 任务角色（frontend/backend/test/devops），用于分配给对应 Agent |
| `depends_on` | 前置任务 ID 列表，只有前置任务全部 passes:true 才能开始 |
| `parallel_group` | 同组任务可以并行执行 |
| `locked_by` | 当前锁定此任务的 Agent ID，防止重复选取 |
| `started_at` | 任务开始时间，用于超时检测 |
| `concurrency` | 全局并发控制（最大 Agent 数、合并策略、冲突处理） |

### 3.3 依赖图可视化（以 auto-coding-agent-demo 的 31 个任务为例）

```
Layer 0 (基础):     [1]
                     ↓
Layer 1 (基础完成):  [2] [3]
                     ↓   ↓
Layer 2 (认证):      [4] [5] [6] [7]     ← 可 4 并行
                     ↓
Layer 3 (服务封装):  [8] [9] [10]         ← 可 3 并行 ← 与 Layer 2 无关联的可同步
                     ↓
Layer 4 (数据层):    [11] [12] [13]       ← 可 3 并行
                     ↓
Layer 5 (API):       [14] [15] [16] [17] [18]  ← 可 5 并行
                     ↓
Layer 6 (UI 页面):   [19] [20] [21]       ← 可 3 并行
                     ↓
Layer 7 (详情页):    [22] [23] [24] [25] [26] [27]  ← 部分可并行
                     ↓
Layer 8 (收尾):      [28] [29] [30] [31]  ← 可 4 并行

串行执行:  31 个任务 × ~19分钟 = ~10 小时
4 Agent 并行:  8 层 × ~25分钟 = ~3.3 小时  (节省 67%!)
```

### 3.4 并发调度器核心逻辑

```typescript
// orchestrator.ts — 并发调度器
class MultiAgentOrchestrator {
  private tasks: Task[];
  private agents: Map<string, AgentProcess> = new Map();
  private maxConcurrent: number;
  private taskLock: AsyncMutex = new AsyncMutex();

  // 获取当前可执行的任务列表
  getReadyTasks(): Task[] {
    return this.tasks.filter(task => {
      if (task.passes || task.locked_by) return false;
      // 所有前置任务都已完成
      return task.depends_on.every(depId =>
        this.tasks.find(t => t.id === depId)?.passes === true
      );
    });
  }

  // 为指定角色的 Agent 分配任务
  async assignTask(agentId: string, role: string): Promise<Task | null> {
    const release = await this.taskLock.acquire();
    try {
      const readyTasks = this.getReadyTasks();
      // 优先分配匹配角色的任务
      const task = readyTasks.find(t => t.role === role)
                || readyTasks[0]; // 没有匹配角色则取任意可用任务
      if (task) {
        task.locked_by = agentId;
        task.started_at = new Date().toISOString();
        await this.saveTaskJson();
      }
      return task || null;
    } finally {
      release();
    }
  }

  // 标记任务完成
  async completeTask(taskId: number, agentId: string): Promise<void> {
    const release = await this.taskLock.acquire();
    try {
      const task = this.tasks.find(t => t.id === taskId);
      if (task && task.locked_by === agentId) {
        task.passes = true;
        task.locked_by = null;
        await this.saveTaskJson();
        // 触发检查是否有新的可执行任务
        await this.scheduleReadyTasks();
      }
    } finally {
      release();
    }
  }

  // 主循环：持续调度直到所有任务完成
  async run(): Promise<void> {
    while (!this.allTasksComplete()) {
      const readyTasks = this.getReadyTasks();
      const freeAgents = this.getFreeAgents();

      for (const agent of freeAgents) {
        if (readyTasks.length === 0) break;
        const task = await this.assignTask(agent.id, agent.role);
        if (task) {
          agent.execute(task); // 非阻塞
        }
      }

      await sleep(5000); // 5 秒检查一次
    }
  }
}
```

### 3.5 Agent 隔离方案

#### 方案 A：Git Branch 隔离（推荐）

```bash
# 调度器为每个 Agent 创建独立分支
git checkout -b agent-frontend main
git checkout -b agent-backend main
git checkout -b agent-test main

# 每个 Agent 在自己的分支上工作
# 完成后 PR 合并到 main
```

**优点：** 简单、Git 原生支持、冲突可追溯  
**缺点：** 合并时可能冲突

#### 方案 B：Git Worktree 隔离（高级）

```bash
# 为每个 Agent 创建独立工作区
git worktree add ../workspace-frontend agent-frontend
git worktree add ../workspace-backend agent-backend
git worktree add ../workspace-test agent-test

# 每个 Agent 在独立目录工作
# 完全避免文件系统冲突
```

**优点：** 完全文件隔离、无竞争  
**缺点：** 磁盘占用 N 倍、需要管理多个工作区

#### 方案 C：进程 + 端口隔离

```bash
# 每个 Agent 独立端口
Agent A: npm run dev -- --port 3001
Agent B: npm run dev -- --port 3002
Agent C: npm run dev -- --port 3003
Agent D: npm run dev -- --port 3004
```

### 3.6 合并策略

```
Agent A 完成 Task 8 (智谱 API)
    ↓
自动 PR: agent-backend → main
    ↓
CI 检查: lint + build + test
    ↓
无冲突 → 自动合并
有冲突 → 通知调度器
    ↓
调度器处理冲突:
  ├── 自动 rebase (简单冲突)
  ├── 暂停 Agent (复杂冲突)
  └── 人工介入 (无法自动解决)
    ↓
合并完成 → 通知所有 Agent 拉取最新 main
```

### 3.7 并发安全规则（来自 OpenClaw AGENTS.md）

```markdown
# 多 Agent 安全规则

1. 每个 Agent 只在自己的分支上工作
2. 提交时只提交自己任务相关的文件
3. 看到不认识的文件，忽略它，继续工作
4. 合并到 main 前，先 git pull --rebase
5. 不要修改其他 Agent 正在编辑的文件
6. 共享文件（如 package.json）的修改需要锁
7. task.json 的修改通过调度器 API，不要直接编辑
```

---

## 4. chubao-WIN-AI 集成方案

### 4.1 整合架构

将 auto-coding-agent-demo 的任务驱动模式与 chubao-WIN-AI 的 Agent 框架结合：

```
┌─────────────────────────────────────────────────────────────────┐
│                chubao-WIN-AI + 多 Agent 并发开发                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              调度 Agent (Orchestrator)                    │  │
│  │  职责：解析 task.json → 依赖分析 → 任务分配 → 合并审查    │  │
│  │  模型：Claude Sonnet (高质量推理)                         │  │
│  │  工具：git, task_assign, task_complete, merge_request     │  │
│  └────────┬──────────┬──────────┬──────────┬────────────────┘  │
│           ↓          ↓          ↓          ↓                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 前端 Dev │ │ 后端 Dev │ │ 数据 Dev │ │ QA Agent │          │
│  │ ──────── │ │ ──────── │ │ ──────── │ │ ──────── │          │
│  │ React    │ │ API/Node │ │ DB/ORM   │ │ 自动测试 │          │
│  │ 组件/样式│ │ 路由/中间│ │ Schema   │ │ lint     │          │
│  │          │ │ 件      │ │ 迁移     │ │ build    │          │
│  │ Sonnet   │ │ Sonnet   │ │ Haiku    │ │ Haiku    │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│       ↓              ↓            ↓            ↓               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   chubao 基础设施                         │  │
│  │  • AgentRuntime (多实例)                                  │  │
│  │  • MemoryManager (每 Agent 独立 namespace)                │  │
│  │  • ToolManager (共享 + 每 Agent 权限控制)                 │  │
│  │  • GatewayServer (WebSocket 多路复用)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   前端监控面板                             │  │
│  │  • 实时显示每个 Agent 的状态和当前任务                     │  │
│  │  • 依赖图可视化                                           │  │
│  │  • 进度统计 (完成/进行中/等待/阻塞)                       │  │
│  │  • 日志流                                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 新增工具定义

```typescript
// tools/orchestrator-tools.ts

// 调度器专用工具
export const taskAssignTool: Tool = {
  name: 'task_assign',
  description: '从 task.json 获取下一个可执行任务并锁定',
  parameters: z.object({
    agentId: z.string(),
    preferredRole: z.string().optional(),
  }),
};

export const taskCompleteTool: Tool = {
  name: 'task_complete',
  description: '标记任务完成并解锁',
  parameters: z.object({
    taskId: z.number(),
    agentId: z.string(),
    testResult: z.object({
      lint: z.boolean(),
      build: z.boolean(),
      browser: z.boolean().optional(),
    }),
  }),
};

export const taskStatusTool: Tool = {
  name: 'task_status',
  description: '获取所有任务的当前状态',
  parameters: z.object({}),
};

export const spawnAgentTool: Tool = {
  name: 'spawn_agent',
  description: '生成新的开发 Agent',
  parameters: z.object({
    role: z.enum(['frontend', 'backend', 'database', 'test']),
    branch: z.string(),
    port: z.number().optional(),
  }),
};

export const mergeRequestTool: Tool = {
  name: 'merge_request',
  description: '请求将 Agent 分支合并到 main',
  parameters: z.object({
    agentId: z.string(),
    branch: z.string(),
    taskId: z.number(),
  }),
};
```

### 4.3 CLAUDE.md 并发版

```markdown
# 并发多 Agent 工作流

## Agent 角色

你是 {AGENT_ROLE}，Agent ID: {AGENT_ID}，工作在分支: {AGENT_BRANCH}。

## 工作流程

### Step 1: 获取任务
调用 task_assign 获取下一个可执行任务。
如果没有可用任务，等待 30 秒后重试。

### Step 2: 同步代码
git pull origin main --rebase

### Step 3: 实现任务
- 只修改与任务相关的文件
- 遵循已有代码风格
- 不要修改其他 Agent 正在编辑的文件

### Step 4: 测试
- npm run lint
- npm run build
- 对 UI 变更使用浏览器测试

### Step 5: 提交
- git add . && git commit -m "[Task {ID}] {title}"
- 调用 task_complete 标记任务完成
- 调用 merge_request 请求合并

### Step 6: 下一个任务
回到 Step 1，获取下一个任务。

## 安全规则
- 只在 {AGENT_BRANCH} 分支上工作
- 只提交自己任务相关的文件
- 遇到合并冲突，停止并报告
- 看到不认识的文件，忽略继续工作
```

### 4.4 Windows 上的并发执行方案

```powershell
# run-concurrent.ps1 — Windows 并发执行器

$AgentCount = 4
$Agents = @(
    @{ Id="agent-frontend"; Role="frontend"; Branch="feat/frontend"; Port=3001 },
    @{ Id="agent-backend";  Role="backend";  Branch="feat/backend";  Port=3002 },
    @{ Id="agent-db";       Role="database"; Branch="feat/database"; Port=3003 },
    @{ Id="agent-qa";       Role="test";     Branch="feat/test";     Port=3004 }
)

# 创建分支
foreach ($agent in $Agents) {
    git checkout -b $agent.Branch main 2>$null
    git checkout main
}

# 并行启动 Agent (使用 PowerShell Jobs)
$jobs = @()
foreach ($agent in $Agents) {
    $jobs += Start-Job -ScriptBlock {
        param($agentId, $role, $branch, $port, $projectRoot)
        Set-Location $projectRoot
        git checkout $branch

        # 生成 Agent 专用 CLAUDE.md
        $prompt = @"
你是 $role 开发者，Agent ID: $agentId
工作在分支: $branch，端口: $port
请按照 CLAUDE.md 的并发工作流执行任务。
"@
        $prompt | claude -p --dangerously-skip-permissions 2>&1
    } -ArgumentList $agent.Id, $agent.Role, $agent.Branch, $agent.Port, $PWD
}

# 监控进度
while ($jobs | Where-Object { $_.State -eq 'Running' }) {
    $completed = (Get-Content task.json | ConvertFrom-Json).tasks |
        Where-Object { $_.passes -eq $true } | Measure-Object
    Write-Host "进度: $($completed.Count) / $totalTasks 任务完成"
    Start-Sleep -Seconds 30
}
```

---

## 5. 实施路线图

### 5.1 分阶段实施

```
Phase 1 (Day 1-2): 增强 task.json 格式
  ├── 添加 depends_on、role、locked_by 字段
  ├── 实现依赖解析器
  └── 实现任务锁（基于文件锁或 SQLite）

Phase 2 (Day 2-3): Agent 隔离
  ├── Git Branch 自动创建/管理
  ├── 端口隔离 (每 Agent 独立端口)
  └── 环境变量隔离

Phase 3 (Day 3-5): 调度器
  ├── 实现 MultiAgentOrchestrator
  ├── 任务分配 API
  ├── 进度监控
  └── 合并管理器

Phase 4 (Day 5-7): chubao 集成
  ├── 新增调度器工具 (task_assign/complete/status)
  ├── AgentRuntime 多实例支持
  ├── WebSocket 多路复用
  └── 前端监控面板

Phase 5 (Day 7-8): 验证
  ├── 用 auto-coding-agent-demo 的 31 个任务测试
  ├── 对比串行 vs 4 Agent 并发的耗时
  └── 冲突处理测试
```

### 5.2 预期效果

| 指标 | 串行 (当前) | 2 Agent 并发 | 4 Agent 并发 |
|------|------------|-------------|-------------|
| 31 任务完成时间 | ~10 小时 | ~6 小时 | ~3.5 小时 |
| 效率提升 | 基准 | 40% | 65% |
| Token 消耗 | 1x | ~2x | ~4x |
| 合并冲突概率 | 0 | 低 | 中 |
| 人工介入频率 | 低 | 低 | 中 |

### 5.3 成本优化

| 策略 | 说明 |
|------|------|
| **角色模型分级** | 调度器用 Sonnet，QA Agent 用 Haiku，降低总成本 |
| **智能并发** | 不是越多 Agent 越好，根据依赖图动态调整并发数 |
| **缓存复用** | 共享 lint/build 缓存，避免每个 Agent 重复构建 |
| **任务合并** | 小任务合并为批次，减少 Agent 启动开销 |
| **Token 预算** | 每个 Agent 每日 Token 上限，超出暂停 |

### 5.4 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Git 合并冲突 | 中 | 中 | 按模块分 Agent + worktree 隔离 |
| Token 超支 | 中 | 高 | 预算控制 + 模型分级 |
| Agent 卡死 | 低 | 中 | 超时检测 + 自动回滚 |
| 任务理解错误 | 低 | 高 | 详细的 task steps + 强制测试 |
| 依赖图死锁 | 极低 | 高 | 调度器死锁检测 |

---

*文档版本: v1.0 | 最后更新: 2026-02-13*
