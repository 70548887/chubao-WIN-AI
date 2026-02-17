# 结构化日志系统使用指南

## 概述

Chubao AI 使用结构化日志系统 (`utils/logger.ts`) 提供一致的日志记录、级别管理和格式化输出。

## 快速开始

### 基本使用

```typescript
import { logger } from './utils/logger.js';

// 基本日志
logger.info('Server started');
logger.debug('Processing request');
logger.warn('Deprecated API used');
logger.error('Failed to connect');
logger.fatal('System crash');
```

### 带上下文的日志

```typescript
// 添加上下文信息
logger.info('User logged in', {
  userId: '123',
  ip: '192.168.1.1',
  timestamp: Date.now()
});

// 错误日志带堆栈追踪
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error, {
    operation: 'riskyOperation',
    retryCount: 3
  });
}
```

## 日志级别

| 级别 | 说明 | 使用场景 |
|------|------|---------|
| `DEBUG` | 调试信息 | 开发调试、详细的函数调用追踪 |
| `INFO` | 普通信息 | 正常业务流程、系统状态 |
| `WARN` | 警告信息 | 可恢复的错误、降级行为 |
| `ERROR` | 错误信息 | 需要关注的错误、操作失败 |
| `FATAL` | 致命错误 | 系统崩溃、无法恢复的错误 |

### 设置日志级别

```typescript
import { logger, LogLevel } from './utils/logger.js';

// 开发环境显示所有日志
logger.setLevel(LogLevel.DEBUG);

// 生产环境只显示重要日志
logger.setLevel(LogLevel.WARN);
```

### 环境变量配置

```bash
# .env 文件
LOG_LEVEL=debug   # 开发环境
# LOG_LEVEL=warn  # 生产环境
```

## 专用日志方法

### API 请求日志

```typescript
import { logger } from './utils/logger.js';

app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.apiRequest(req.method, req.path, res.statusCode, duration);
  });
  
  next();
});

// 输出: ℹ️ [2026-02-15T03:00:00.000Z] INFO: API request {"method":"GET","path":"/api/health","statusCode":200,"durationMs":"123.45"}
```

### 工具执行日志

```typescript
import { logger } from './utils/logger.js';

async function executeTool(toolName: string, args: any) {
  const startTime = Date.now();
  
  try {
    const result = await tool.execute(args);
    const duration = Date.now() - startTime;
    logger.toolExecution(toolName, true, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.toolExecution(toolName, false, duration, error.message);
    throw error;
  }
}

// 成功: 🔍 [2026-02-15T03:00:00.000Z] DEBUG: Tool executed: clickTool {"durationMs":"50.25"}
// 失败: ❌ [2026-02-15T03:00:00.000Z] ERROR: Tool failed: clickTool {"durationMs":"50.25","error":"Target not found"}
```

### Agent 动作日志

```typescript
import { logger } from './utils/logger.js';

logger.agentAction('think', { thought: 'Analyzing user request' });
logger.agentAction('tool_call', { tool: 'clickTool', args: { x: 100, y: 200 } });
logger.agentAction('respond', { tokensUsed: 256 });

// 输出: ℹ️ [2026-02-15T03:00:00.000Z] INFO: Agent action: think {"thought":"Analyzing user request"}
```

### 记忆操作日志

```typescript
import { logger } from './utils/logger.js';

async function storeMemory(key: string, value: any) {
  try {
    await memoryDb.set(key, value);
    logger.memoryOperation('store', true, { key });
  } catch (error) {
    logger.memoryOperation('store', false, { key, error: error.message });
  }
}

// 成功: 🔍 [2026-02-15T03:00:00.000Z] DEBUG: Memory operation: store {"key":"test-key"}
// 失败: ⚠️ [2026-02-15T03:00:00.000Z] WARN: Memory operation failed: store {"key":"test-key","error":"Database locked"}
```

## 子日志器

为不同模块创建独立的日志器：

```typescript
import { createLogger, LogLevel } from './utils/logger.js';

// 为特定服务创建日志器
const memoryLogger = createLogger('memory-service', LogLevel.DEBUG);
const agentLogger = createLogger('agent-service', LogLevel.INFO);

memoryLogger.info('Initializing vector database');
agentLogger.info('Agent runtime started');

// 输出: ℹ️ [2026-02-15T03:00:00.000Z] INFO: Initializing vector database
```

## 输出格式

### 开发环境（人类可读）

```
🔍 [2026-02-15T03:00:00.000Z] DEBUG: Processing request {"userId":"123"}
ℹ️ [2026-02-15T03:00:00.000Z] INFO: Server started {"port":3100}
⚠️ [2026-02-15T03:00:00.000Z] WARN: High memory usage {"heapMB":"512.50"}
❌ [2026-02-15T03:00:00.000Z] ERROR: Database connection failed {"host":"localhost"}
💀 [2026-02-15T03:00:00.000Z] FATAL: System crash {"reason":"Out of memory"}
```

### 生产环境（JSON 格式）

```json
{"timestamp":"2026-02-15T03:00:00.000Z","level":"info","message":"Server started","context":{"port":3100}}
{"timestamp":"2026-02-15T03:00:00.000Z","level":"error","message":"Database connection failed","context":{"host":"localhost","errorName":"Error","errorMessage":"ECONNREFUSED"},"stack":"Error: ECONNREFUSED\n    at ..."}
```

生产环境的 JSON 格式便于日志聚合系统（如 ELK、Splunk）解析和查询。

## 最佳实践

### 1. 选择合适的日志级别

```typescript
// ✅ 正确
logger.debug('User input validation passed', { input: sanitizedInput });
logger.info('User logged in', { userId: user.id });
logger.warn('Rate limit approaching', { current: 95, max: 100 });
logger.error('Payment failed', error, { orderId, amount });
logger.fatal('Database corrupted', error);

// ❌ 错误
logger.info('Variable x = 5'); // 太琐碎，应该用 DEBUG
logger.error('User clicked button'); // 正常行为，应该用 INFO 或 DEBUG
```

### 2. 提供有用的上下文

```typescript
// ✅ 正确
logger.error('Failed to process order', error, {
  orderId: '12345',
  userId: 'user-123',
  amount: 99.99,
  step: 'payment_processing'
});

// ❌ 错误
logger.error('Failed'); // 没有上下文，难以排查
```

### 3. 避免敏感信息

```typescript
// ✅ 正确
logger.info('User authenticated', {
  userId: user.id,
  role: user.role
});

// ❌ 错误
logger.info('User authenticated', {
  password: user.password, // 泄露密码！
  apiKey: user.apiKey // 泄露密钥！
});
```

### 4. 记录关键业务流程

```typescript
// Agent 推理循环
logger.agentAction('start', { sessionId });
logger.agentAction('think', { thought });
logger.agentAction('tool_call', { tool, args });
logger.agentAction('observe', { result });
logger.agentAction('respond', { response });

// API 请求追踪
logger.apiRequest(method, path, statusCode, duration);

// 工具执行监控
logger.toolExecution(toolName, success, duration, error);
```

### 5. 错误处理标准模式

```typescript
async function processTask(task: Task) {
  try {
    logger.info('Processing task', { taskId: task.id });
    
    const result = await executeTask(task);
    
    logger.info('Task completed', { taskId: task.id, result });
    return result;
  } catch (error) {
    logger.error('Task failed', error, {
      taskId: task.id,
      taskType: task.type,
      retryCount: task.retryCount
    });
    throw error;
  }
}
```

## 性能考虑

### 条件日志

```typescript
// ✅ 推荐：昂贵的日志操作应该检查级别
if (logger.shouldLog(LogLevel.DEBUG)) {
  const expensiveData = computeExpensiveDebugInfo();
  logger.debug('Debug info', expensiveData);
}

// ❌ 不推荐：即使不输出也会计算
logger.debug('Debug info', computeExpensiveDebugInfo());
```

注意：当前实现在内部会检查日志级别，但对于计算密集的上下文数据，仍然建议手动检查。

### 避免过度日志

```typescript
// ❌ 不要在高频循环中记录每次迭代
for (let i = 0; i < 1000000; i++) {
  logger.debug('Processing item', { index: i }); // 会严重影响性能！
}

// ✅ 记录批次或关键节点
logger.info('Processing started', { totalItems: 1000000 });
for (let i = 0; i < 1000000; i++) {
  // 处理逻辑...
  if (i % 10000 === 0) {
    logger.debug('Progress update', { processed: i });
  }
}
logger.info('Processing completed');
```

## 迁移旧代码

### 替换 console.log

```typescript
// 旧代码
console.log('Server started');
console.log('[INFO] User logged in:', userId);
console.error('Error:', error);

// 新代码
import { logger } from './utils/logger.js';

logger.info('Server started');
logger.info('User logged in', { userId });
logger.error('Error occurred', error);
```

### 批量替换建议

```bash
# 搜索需要替换的 console 调用
git grep "console.log\|console.error\|console.warn"

# 优先替换关键路径
# 1. API 路由和中间件
# 2. Agent 运行时
# 3. 工具执行
# 4. 错误处理
```

## 测试

日志系统包含完整的单元测试（27 个用例）：

```bash
# 运行日志系统测试
npx vitest run sidecars/node-backend/src/utils/logger.test.ts
```

测试覆盖：
- ✅ 基本日志功能（5 个用例）
- ✅ 日志级别过滤（3 个用例）
- ✅ 上下文日志（2 个用例）
- ✅ 错误日志（3 个用例）
- ✅ 专用日志方法（6 个用例）
- ✅ 子日志器（2 个用例）
- ✅ 生产模式（2 个用例）
- ✅ 边界场景（4 个用例）

## 常见问题

### Q: 如何在生产环境启用 DEBUG 日志？

A: 设置环境变量 `LOG_LEVEL=debug` 或在代码中调用 `logger.setLevel(LogLevel.DEBUG)`。

### Q: 日志会影响性能吗？

A: 日志系统在内部会检查级别，未启用的日志不会输出。但复杂的上下文对象仍会被评估，建议在高频路径中手动检查级别。

### Q: 如何将日志发送到外部系统？

A: 当前实现输出到 console。可以扩展 Logger 类添加自定义输出目标（如文件、Elasticsearch、Loki）：

```typescript
class CustomLogger extends Logger {
  info(message: string, context?: LogContext): void {
    super.info(message, context);
    // 发送到外部系统
    this.sendToExternal('info', message, context);
  }
}
```

### Q: 能否按模块过滤日志？

A: 使用子日志器为不同模块设置不同的日志级别：

```typescript
const verboseLogger = createLogger('debug-module', LogLevel.DEBUG);
const quietLogger = createLogger('stable-module', LogLevel.WARN);
```

## 参考

- **源码**: `sidecars/node-backend/src/utils/logger.ts`
- **测试**: `sidecars/node-backend/src/utils/logger.test.ts`
- **相关文档**: 
  - [性能监控系统](./PERFORMANCE_MONITORING.md)
  - [诊断系统](./DIAGNOSTICS.md)
