# OpenClaw 本地知识库开发计划

**目标**：为触宝 AI 建立基于 OpenClaw 的本地向量知识库，实现"越用越聪明"的持续学习能力。

---

## 📋 项目概述

### 背景
- OpenClaw 项目包含丰富的文档（400+ Markdown 文件）和 52 个技能
- 当前用户每次询问都需要 AI 从零理解，缺少知识积累
- 需要建立本地知识库，实现语义检索和增量学习

### 目标
1. **索引 OpenClaw 知识** - 文档、技能、API 参考
2. **增量学习** - 记录用户交互、最佳实践、故障排查
3. **智能检索** - 根据用户问题自动补充相关上下文
4. **持续优化** - 监控变化、自动更新、权重调整

---

## 🏗️ 架构设计

### 技术栈
- **向量数据库**: sqlite-vec（已集成到触宝 AI）
- **Embedding 模型**: text-embedding-3-small (OpenAI)
- **文档解析**: Markdown → 分块 → 向量化
- **检索引擎**: 语义搜索 + 关键词过滤

### 数据结构
```typescript
interface KnowledgeChunk {
  id: string;
  source: 'openclaw-doc' | 'skill' | 'user-interaction';
  category: string;  // 'concept' | 'api' | 'tool' | 'best-practice'
  title: string;
  content: string;
  embedding: number[];  // 1536维向量
  metadata: {
    filePath: string;
    timestamp: number;
    tags: string[];
    priority: number;  // 0-100，使用频率权重
  };
}
```

### 索引范围
1. **OpenClaw 文档** (`openclaw-main/docs/`)
   - concepts/ - 核心概念
   - tools/ - 工具 API
   - cli/ - 命令行接口
   - providers/ - AI 提供商配置
   
2. **技能库** (`openclaw-main/skills/`)
   - 52 个技能的 SKILL.md
   - 用法示例、参数说明
   
3. **用户交互记录**
   - 成功的命令 → 最佳实践
   - 错误修复 → 故障排查知识

---

## 📅 开发阶段

### Phase 1: 基础设施（1-2天）✅
**目标**: 搭建知识库核心框架

#### 1.1 向量数据库初始化
- [ ] 创建 SQLite 表结构
  ```sql
  CREATE TABLE knowledge_chunks (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  
  CREATE INDEX idx_source ON knowledge_chunks(source);
  CREATE INDEX idx_category ON knowledge_chunks(category);
  ```
- [ ] 配置 sqlite-vec 扩展
- [ ] 实现向量相似度搜索

#### 1.2 Embedding 服务封装
- [ ] 创建 `src/core/knowledge/embedding.ts`
  - `generateEmbedding(text: string): Promise<number[]>`
  - 支持批量处理（减少 API 调用）
  - 错误重试机制

#### 1.3 文档解析器
- [ ] 创建 `src/core/knowledge/parser.ts`
  - Markdown 解析（提取标题、代码块、列表）
  - 智能分块（400 tokens/chunk，80 tokens overlap）
  - 元数据提取（标题、标签、分类）

**验收标准**:
- 数据库表创建成功
- 能生成单个文本的 embedding
- 能解析 Markdown 文件并分块

---

### Phase 2: OpenClaw 文档索引（2-3天）📚
**目标**: 索引 OpenClaw 核心文档

#### 2.1 批量索引脚本
- [ ] 创建 `scripts/index-openclaw-docs.mjs`
  - 扫描 `openclaw-main/docs/` 目录
  - 过滤有效文档（排除 README、CHANGELOG）
  - 按分类索引（concepts → tools → cli → providers）
  - 进度显示（已索引 / 总文件数）

#### 2.2 文档分类规则
```typescript
const categoryMap = {
  'concepts/': 'concept',
  'tools/': 'tool-api',
  'cli/': 'cli-usage',
  'providers/': 'provider-config',
  'channels/': 'channel-integration',
  'install/': 'installation',
};
```

#### 2.3 去重与更新策略
- [ ] 计算文件 hash，避免重复索引
- [ ] 检测文件变化，增量更新
- [ ] 保留历史版本（最多 3 个版本）

**验收标准**:
- 成功索引 400+ 文档
- 数据库中有 2000+ knowledge chunks
- 能通过语义搜索找到相关文档

**测试用例**:
```bash
# 搜索测试
node scripts/test-search.mjs "how to create a skill"
# 预期返回: skills/skill-creator 相关文档
```

---

### Phase 3: 技能库索引（1天）🛠️
**目标**: 索引 52 个技能的 SKILL.md

#### 3.1 技能文档解析
- [ ] 扫描 `openclaw-main/skills/*/SKILL.md`
- [ ] 提取：
  - 技能名称、描述
  - 工具列表（函数名、参数、示例）
  - 使用场景、注意事项

#### 3.2 技能元数据增强
```typescript
interface SkillChunk extends KnowledgeChunk {
  metadata: {
    skillName: string;
    tools: string[];  // 工具函数名
    useCases: string[];  // 使用场景
    dependencies: string[];  // 依赖工具
  };
}
```

**验收标准**:
- 52 个技能全部索引
- 能通过工具名搜索到对应技能
- 能通过使用场景搜索到相关技能

**测试用例**:
```bash
node scripts/test-search.mjs "send message to telegram"
# 预期返回: skills/telegram 技能
```

---

### Phase 4: 语义检索集成（1-2天）🔍
**目标**: 将知识库集成到触宝 AI 对话流程

#### 4.1 检索服务
- [ ] 创建 `src/core/knowledge/retriever.ts`
  ```typescript
  async function retrieve(
    query: string,
    options: {
      topK?: number;  // 返回前 K 个结果，默认 5
      minScore?: number;  // 最低相似度，默认 0.7
      category?: string[];  // 限定分类
      source?: string[];  // 限定来源
    }
  ): Promise<KnowledgeChunk[]>
  ```

#### 4.2 上下文增强
- [ ] 修改 `runtime.ts` 的 `buildSystemPrompt`
  - 用户问题 → 向量检索 → 相关知识
  - 将检索结果注入 System Prompt
  - 格式化为清晰的参考资料

**示例**:
```typescript
// 用户问: "如何创建一个新技能?"
// 检索结果 → skill-creator 文档
// 注入 System Prompt:
`
## 📚 相关知识库参考

### 技能创建指南
文档来源: openclaw-main/skills/skill-creator/SKILL.md

创建技能的步骤：
1. 创建技能目录 skills/my-skill/
2. 编写 SKILL.md 描述技能功能
3. 实现工具函数 ...
`
```

#### 4.3 检索日志
- [ ] 记录每次检索：查询、结果、是否有用
- [ ] 用于后续优化权重

**验收标准**:
- 用户提问时自动检索相关知识
- AI 回答引用知识库内容
- 检索日志记录完整

---

### Phase 5: 增量学习（2天）🧠
**目标**: 记录用户交互，持续积累知识

#### 5.1 交互记录
- [ ] 创建 `src/core/knowledge/learner.ts`
  - 监听用户对话
  - 提取有价值的信息：
    - 成功的命令 → 最佳实践
    - 错误修复 → 故障排查
    - 用户偏好 → 个性化配置

#### 5.2 知识提取规则
```typescript
interface InteractionKnowledge {
  type: 'best-practice' | 'troubleshooting' | 'preference';
  trigger: string;  // 触发场景
  solution: string;  // 解决方案
  context: {
    userInput: string;
    aiResponse: string;
    toolsCalled: string[];
    success: boolean;
  };
}
```

#### 5.3 自动索引
- [ ] 每天凌晨 2 点自动运行
- [ ] 从对话历史中提取知识
- [ ] 去重、评分、入库

**验收标准**:
- 能从对话历史中提取知识
- 新知识自动入库
- 后续对话能利用学到的知识

---

### Phase 6: 持续优化（1天）🚀
**目标**: 监控、更新、优化知识库

#### 6.1 文件变化监控
- [ ] 使用 chokidar 监控 `openclaw-main/`
- [ ] 文件变化 → 增量更新索引
- [ ] 去重与版本管理

#### 6.2 知识权重调整
- [ ] 根据检索频率调整 priority
- [ ] 高频知识 → 权重 +10
- [ ] 过时知识 → 权重 -5（90天未使用）

#### 6.3 知识库统计
- [ ] 创建 `GET /api/knowledge/stats` 接口
  ```json
  {
    "totalChunks": 2543,
    "bySource": {
      "openclaw-doc": 2100,
      "skill": 400,
      "user-interaction": 43
    },
    "byCategory": {
      "concept": 500,
      "tool-api": 800,
      "best-practice": 43
    },
    "lastUpdated": "2026-02-17T12:00:00Z"
  }
  ```

**验收标准**:
- 文件变化自动更新索引
- 知识权重动态调整
- 统计接口正常工作

---

## 🧪 测试计划

### 单元测试
- [ ] Embedding 生成测试
- [ ] 文档解析测试
- [ ] 向量搜索测试
- [ ] 知识提取测试

### 集成测试
- [ ] 完整索引流程测试
- [ ] 检索准确率测试（准确率 > 80%）
- [ ] 增量学习测试

### 性能测试
- [ ] 索引速度：1000 文档 < 10 分钟
- [ ] 检索延迟：< 100ms
- [ ] 数据库大小：< 500MB（100万 chunks）

---

## 📊 预期效果

### 短期（1周后）
- ✅ 索引 400+ OpenClaw 文档
- ✅ 索引 52 个技能
- ✅ 用户提问自动检索相关知识
- ✅ AI 回答更加准确、详细

### 中期（1个月后）
- ✅ 积累 100+ 用户交互知识
- ✅ 检索准确率 > 85%
- ✅ 自动监控文档变化
- ✅ 知识权重动态调整

### 长期（3个月后）
- ✅ 知识库规模 > 5000 chunks
- ✅ 检索准确率 > 90%
- ✅ 用户个性化知识积累
- ✅ 真正实现"越用越聪明"

---

## 🚧 风险与挑战

### 技术风险
1. **Embedding 成本** - OpenAI API 调用费用
   - 缓解：批量处理、本地缓存
   
2. **向量搜索性能** - 大规模数据检索慢
   - 缓解：索引优化、分片策略
   
3. **知识质量** - 自动提取的知识可能不准确
   - 缓解：人工审核、评分机制

### 业务风险
1. **存储空间** - 知识库持续增长
   - 缓解：定期清理低权重知识
   
2. **隐私问题** - 用户对话记录
   - 缓解：本地存储、不上传云端

---

## 📦 依赖项

### 必需
- [x] sqlite-vec（已集成）
- [x] OpenAI API Key（已配置）
- [ ] chokidar（文件监控）
- [ ] markdown-it（Markdown 解析）

### 可选
- [ ] LanceDB（更强大的向量数据库）
- [ ] 本地 Embedding 模型（降低成本）

---

## 🎯 里程碑

| 阶段 | 预计时间 | 交付物 |
|------|----------|--------|
| Phase 1 | 2天 | 知识库基础设施 |
| Phase 2 | 3天 | OpenClaw 文档索引 |
| Phase 3 | 1天 | 技能库索引 |
| Phase 4 | 2天 | 语义检索集成 |
| Phase 5 | 2天 | 增量学习 |
| Phase 6 | 1天 | 持续优化 |
| **总计** | **11天** | **完整知识库系统** |

---

## ✅ 下一步行动

1. **立即开始**: Phase 1 - 基础设施搭建
2. **评审节点**: Phase 2 完成后进行中期评审
3. **最终验收**: Phase 6 完成后进行完整测试

**准备开始开发了吗？** 🚀
