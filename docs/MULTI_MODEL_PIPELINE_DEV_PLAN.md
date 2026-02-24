# 多模型流水线开发计划

> 目标：实现 Model Router 服务，支持多模型协同工作
> 创建时间：2026-02-17
> 预估工时：10-14 天
> 优先级：P2（单模型走通后实施）

---

## 架构概述

```
用户输入
   ↓
┌─────────────────────────────────────────┐
│  Stage 1: 意图识别 (Intent Classifier)   │
│  模型: GPT-4o-mini / Qwen-7B            │
│  成本: $0.0001/次 | 延迟: 200ms         │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Stage 2: 任务路由 (Task Router)         │
│  本地决策: 选择执行路径                   │
│  无需模型调用                            │
└──────────┬──────────────┬───────────────┘
           ↓              ↓               ↓
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 本地工具  │  │ 推理模型  │  │ 代码模型  │
    │ 直接执行  │  │ Claude   │  │ Codex    │
    └──────────┘  └──────────┘  └──────────┘
           ↓              ↓               ↓
    ┌─────────────────────────────────────┐
    │  Stage 3: 结果聚合 (Result Aggregator)│
    │  整合多阶段输出为最终回复              │
    └─────────────────────────────────────┘
```

---

## 阶段规划

### Phase 1: 基础架构 (Day 1-3)

#### T1.1: Model Router 核心服务
**文件**: `sidecars/node-backend/src/services/modelRouter.ts`

**功能**:
- 模型配置管理
- 请求路由分发
- 失败重试机制
- 成本统计追踪

```typescript
interface ModelRoute {
  id: string;
  provider: 'anthropic' | 'openai' | 'ohmygpt' | 'local';
  model: string;
  purpose: 'intent' | 'reasoning' | 'coding' | 'vision';
  costPer1K: number;
  maxTokens: number;
  timeout: number;
}

class ModelRouter {
  async route(request: RouterRequest): Promise<RouterResponse>;
  async classifyIntent(input: string): Promise<IntentResult>;
  async executeWithModel(routeId: string, input: string): Promise<string>;
}
```

#### T1.2: 意图识别服务
**文件**: `sidecars/node-backend/src/services/intentClassifier.ts`

**支持意图类型**:
```typescript
type IntentType = 
  | 'SCREENSHOT'      // 截图相关
  | 'OCR'            // 文字识别
  | 'GUI_ACTION'     // 界面操作
  | 'FILE_OPERATION' // 文件读写
  | 'CODE_GENERATION'// 代码生成
  | 'CODE_REVIEW'    // 代码审查
  | 'DEBUG'          // 调试分析
  | 'QUESTION'       // 一般问答
  | 'CHAT'           // 闲聊
  | 'COMPLEX_TASK';  // 复杂多步任务
```

#### T1.3: 成本追踪系统
**文件**: `sidecars/node-backend/src/services/costTracker.ts`

**功能**:
- 按模型统计调用次数和成本
- 按用户统计使用量
- 成本告警阈值
- 月度成本报告

---

### Phase 2: 模型集成 (Day 4-6)

#### T2.1: 轻量级模型接入
**目标模型**:
- GPT-4o-mini (OpenAI)
- Qwen-7B/14B (阿里)
- Gemini Flash (Google)

**文件**: `sidecars/node-backend/src/providers/`
- `openaiProvider.ts`
- `qwenProvider.ts`
- `geminiProvider.ts`

#### T2.2: 专业模型接入
**目标模型**:
- Claude 3.5 Sonnet (推理)
- Codex (代码生成)
- GPT-4o (视觉任务)

#### T2.3: 本地模型支持 (可选)
- Ollama 集成
- LM Studio 集成
- 完全离线模式

---

### Phase 3: 智能路由 (Day 7-9)

#### T3.1: 路由策略引擎
**文件**: `sidecars/node-backend/src/services/routingEngine.ts`

**策略类型**:
```typescript
type RoutingStrategy =
  | 'cost_first'     // 成本优先
  | 'quality_first'  // 质量优先
  | 'speed_first'    // 速度优先
  | 'adaptive';      // 自适应（根据任务复杂度）
```

#### T3.2: 任务复杂度评估
```typescript
interface ComplexityScore {
  codeRelated: number;    // 0-1
  multiStep: number;      // 0-1
  creativity: number;     // 0-1
  accuracy: number;       // 0-1
  overall: number;        // 综合评分
}
```

#### T3.3: 动态模型选择
- 简单任务 → 便宜模型
- 复杂任务 → 高质量模型
- 代码任务 → Codex
- 视觉任务 → GPT-4o

---

### Phase 4: 流水线编排 (Day 10-12)

#### T4.1: 多阶段流水线
**文件**: `sidecars/node-backend/src/services/pipelineOrchestrator.ts`

**示例流程**:
```typescript
// 代码审查流水线
const codeReviewPipeline = [
  { stage: 'intent', model: 'gpt-4o-mini', output: 'intent' },
  { stage: 'analyze', model: 'claude-sonnet', input: '{intent}', output: 'analysis' },
  { stage: 'generate', model: 'codex', input: '{analysis}', output: 'code' },
  { stage: 'review', model: 'claude-sonnet', input: '{code}', output: 'final' },
];
```

#### T4.2: 并行执行优化
- 独立任务并行调用
- 结果缓存复用
- 超时降级处理

#### T4.3: 错误恢复机制
- 模型失败自动切换
- 重试策略（指数退避）
- 降级到本地模型

---

### Phase 5: 监控与优化 (Day 13-14)

#### T5.1: 性能监控面板
**文件**: `src/components/ModelRouterPanel.tsx`

**展示内容**:
- 实时调用分布
- 成本统计图表
- 延迟分析
- 模型性能对比

#### T5.2: A/B 测试框架
- 路由策略对比
- 模型效果评估
- 自动优化建议

#### T5.3: 配置管理界面
- 模型参数调整
- 路由规则编辑
- 成本预算设置

---

## 技术架构

### 核心组件

```
sidecars/node-backend/src/
├── services/
│   ├── modelRouter.ts        # 模型路由核心
│   ├── intentClassifier.ts   # 意图识别
│   ├── costTracker.ts        # 成本追踪
│   ├── routingEngine.ts      # 路由策略
│   └── pipelineOrchestrator.ts # 流水线编排
├── providers/
│   ├── anthropicProvider.ts  # Claude
│   ├── openaiProvider.ts     # OpenAI
│   ├── ohmygptProvider.ts    # OhMyGPT
│   ├── qwenProvider.ts       # 通义千问
│   └── localProvider.ts      # 本地模型
├── models/
│   ├── modelRegistry.ts      # 模型注册表
│   └── routeConfig.ts        # 路由配置
└── api/
    └── modelRouter.ts        # API 端点
```

### 数据流

```
用户请求
  ↓
Intent Classifier (轻量模型)
  ↓
Routing Engine (本地决策)
  ↓
Model Router (分发到具体模型)
  ├─→ 本地工具 (直接执行)
  ├─→ 推理模型 (Claude)
  ├─→ 代码模型 (Codex)
  └─→ 视觉模型 (GPT-4o)
  ↓
Result Aggregator (结果聚合)
  ↓
返回给用户
```

---

## 成本估算

### 模型定价参考

| 模型 | 输入/1K tokens | 输出/1K tokens | 用途 |
|------|---------------|---------------|------|
| GPT-4o-mini | $0.00015 | $0.0006 | 意图识别 |
| Claude 3.5 Haiku | $0.00025 | $0.00125 | 轻量推理 |
| Claude 3.5 Sonnet | $0.003 | $0.015 | 复杂推理 |
| Codex | $0.015 | $0.06 | 代码生成 |
| GPT-4o | $0.005 | $0.015 | 视觉任务 |

### 月度成本估算 (10K 次调用)

| 方案 | 单次成本 | 月成本 | 年成本 |
|------|---------|--------|--------|
| 纯 Claude Sonnet | $0.03 | $300 | $3,600 |
| 轻量组合 | $0.005 | $50 | $600 |
| **多模型流水线** | **$0.008** | **$80** | **$960** |

**节省: 73%** (相比纯 Claude)

---

## 前置依赖

### 必须先完成的模块

1. ✅ 单模型流程走通 (当前)
2. ✅ 工具系统完善
3. ✅ 成本追踪基础
4. ⏳ 模型 Provider 抽象层

### 外部依赖

- OhMyGPT API Key
- OpenAI API Key (可选)
- Anthropic API Key (可选)
- 阿里云 API Key (可选)

---

## 验收标准

### 功能验收
- [ ] 意图识别准确率 > 90%
- [ ] 路由决策延迟 < 50ms
- [ ] 支持 5+ 种模型 Provider
- [ ] 成本节省 > 50%
- [ ] 故障自动切换 < 3s

### 性能验收
- [ ] 整体延迟 < 2s (简单任务)
- [ ] 并发支持 100+ QPS
- [ ] 内存占用 < 500MB

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 多模型增加复杂度 | 高 | 完善的测试覆盖 |
| 模型 API 不稳定 | 中 | 多 Provider 备份 |
| 成本估算偏差 | 中 | 实时监控告警 |
| 延迟增加 | 中 | 并行优化 + 缓存 |

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 单模型流程完善
3. ⏳ 收集使用数据
4. ⏳ 评估 ROI
5. ⏳ 启动 Phase 1 开发

---

*文档版本: v1.0 | 状态: 规划中 | 预计启动: 单模型稳定后*
