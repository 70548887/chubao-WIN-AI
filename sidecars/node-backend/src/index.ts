/**
 * Chubao AI - Node.js 后端入口
 * 基于 OpenClaw 架构
 */

import express, { type Response } from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { AgentRuntime } from './agent/runtime.js';
import { ContinuousDevMonitor } from './agent/continuous-monitor.js';
import { MemoryManager } from './memory/manager.js';
import { analyzeCodingProgress } from './coding/progress.js';
import { toolManager } from './tools/index.js';
import { GatewayServer } from './gateway/server.js';
import { registerMultiAgentRoutes } from './routes/multiAgent.js';
import { registerTaskSchedulerRoutes } from './routes/taskScheduler.js';
import {
  LarkIntegration,
  WhatsAppIntegration,
} from './gateway/platforms/index.js';
// Channel system (plugin-based EventBus architecture)
import { getEventBus, ChannelManager, Notifier, TelegramPlugin, DingTalkPlugin, WeChatWorkPlugin } from './channel/index.js';
// Task queue and cron scheduler
import { TaskQueue } from './agent/taskQueue.js';
import { CronScheduler } from './agent/cronScheduler.js';
import { initializeSubagentRegistry } from './agent/subagentRegistry.js';
import { initializeAgentRouter } from './agent/agentRouter.js';
import { performanceMonitor } from './monitoring/performance.js';
import { createMonitoringRouter } from './monitoring/routes.js';
import { createPromptsRouter } from './prompts/routes.js';
import { logger } from './utils/logger.js';

config();

type HealthState = 'ok' | 'degraded' | 'error';
type DependencyState = HealthState | 'disabled';
type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

interface ErrorResponsePayload {
  success: false;
  errorCode: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

const PORT = parseInt(process.env.NODE_PORT || process.env.PORT || '3100', 10);
const STARTED_AT = Date.now();
const APP_VERSION = process.env.npm_package_version || '0.1.0';

function createRequestId(): string {
  return randomUUID();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferErrorCode(error: unknown): ErrorCode {
  if (error instanceof SyntaxError || error instanceof TypeError) {
    return 'INVALID_ARGUMENT';
  }

  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('not allowed by sandbox policy')) {
    return 'FORBIDDEN';
  }
  if (message.includes('blocked by security policy')) {
    return 'FORBIDDEN';
  }
  if (message.includes('not found')) {
    return 'NOT_FOUND';
  }
  if (message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('not configured') || message.includes('dependency')) {
    return 'DEPENDENCY_UNAVAILABLE';
  }
  if (message.includes('unavailable') || message.includes('refused')) {
    return 'SERVICE_UNAVAILABLE';
  }
  return 'INTERNAL_ERROR';
}

function sendError(
  res: Response,
  statusCode: number,
  errorCode: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): void {
  const payload: ErrorResponsePayload = {
    success: false,
    errorCode,
    message,
    requestId: createRequestId(),
  };

  if (details) {
    payload.details = details;
  }

  res.status(statusCode).json(payload);
}

function computeHealthStatus(deps: Record<string, DependencyState>): HealthState {
  const values = Object.values(deps);
  if (values.includes('error')) {
    return 'error';
  }
  if (values.includes('degraded')) {
    return 'degraded';
  }
  return 'ok';
}

async function main() {
  logger.info('Chubao AI Node.js 后端启动中...');

  const app = express();

  // CORS middleware - allow frontend dev server & Tauri webview
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Performance monitoring middleware
  app.use((req, res, next) => {
    const start = Date.now();
    performanceMonitor.incrementConnections();

    res.on('finish', () => {
      const duration = Date.now() - start;
      performanceMonitor.recordRequest(duration);
      performanceMonitor.decrementConnections();
    });

    next();
  });

  // Monitoring routes
  app.use('/api', createMonitoringRouter());

  // Prompt templates routes
  app.use('/api', createPromptsRouter());

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const onListenError = (error: NodeJS.ErrnoException): void => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use.`);
      logger.error('Stop the existing process, or set NODE_PORT/PORT to another value');
      process.exit(1);
      return;
    }
    logger.error('HTTP server listen error', error);
    process.exit(1);
  };
  server.on('error', onListenError);
  wss.on('error', (error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE') {
      return;
    }
    logger.error('WebSocket server error', error);
  });

  const dependencies: Record<string, DependencyState> = {
    memory: 'degraded',
    gateway: 'degraded',
    taskQueue: 'degraded',
    cronScheduler: 'degraded',
    lark: 'disabled',
    telegram: 'disabled',
    whatsapp: 'disabled',
  };

  const memoryManager = new MemoryManager();
  await memoryManager.init();
  dependencies.memory = 'ok';

  try {
    await toolManager.initializeSkills();
  } catch (error) {
    logger.warn('Skill tools initialize warning', { error: getErrorMessage(error) });
  }

  const agentRuntime = new AgentRuntime(memoryManager);
  const continuousDevMonitor = new ContinuousDevMonitor(agentRuntime);
  new GatewayServer(wss, agentRuntime);
  dependencies.gateway = 'ok';

  // ---------------------------------------------------------------------------
  // Task Queue & Cron Scheduler
  // ---------------------------------------------------------------------------
  logger.info('初始化任务队列...');
  const taskQueue = new TaskQueue({
    executeTask: async (payload, task) => {
      logger.info(`Executing task ${task.id}: ${payload.kind}`);
      try {
        if (payload.kind === 'chat') {
          const message = payload.message as string;
          const sessionId = payload.sessionId as string | undefined;
          const response = await agentRuntime.chat(message, sessionId);
          return { success: true, response };
        }
        // Add more task kinds as needed
        return { success: false, error: `Unknown task kind: ${payload.kind}` };
      } catch (error) {
        logger.error(`Task ${task.id} failed`, error);
        throw error;
      }
    },
    maxConcurrent: 4,
    stateEnabled: true,
  });

  logger.info('初始化定时调度器...');
  const cronScheduler = new CronScheduler({
    enqueueTask: (payload) => taskQueue.enqueue(payload),
    tickMs: 15_000, // Check every 15 seconds
    stateEnabled: true,
  });

  dependencies.taskQueue = 'ok';
  dependencies.cronScheduler = 'ok';

  // Initialize subagent registry
  logger.info('初始化子 Agent 注册表...');
  initializeSubagentRegistry({
    agentRuntime,
    memoryManager,
  });
  logger.info('子 Agent 系统已启用');

  // Initialize agent router
  logger.info('初始化多 Agent 路由系统...');
  const agentRouter = initializeAgentRouter({
    memoryManager,
  });
  logger.info('多 Agent 路由已启用', { agentCount: agentRouter.listAgentConfigs().length });

  logger.info('初始化消息平台...');

  let larkIntegration: LarkIntegration | null = null;
  if (process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) {
    try {
      larkIntegration = new LarkIntegration(
        {
          appId: process.env.LARK_APP_ID,
          appSecret: process.env.LARK_APP_SECRET,
          encryptKey: process.env.LARK_ENCRYPT_KEY,
          verificationToken: process.env.LARK_VERIFICATION_TOKEN,
        },
        agentRuntime
      );

      app.use('/lark', larkIntegration.getRouter());
      dependencies.lark = 'ok';
      logger.info('飞书集成已启用');
    } catch (error) {
      dependencies.lark = 'error';
      logger.error('飞书集成初始化失败', error);
    }
  } else {
    dependencies.lark = 'disabled';
    logger.warn('飞书集成未启用 (缺少 LARK_APP_ID 或 LARK_APP_SECRET)');
  }

  // ---------------------------------------------------------------------------
  // Channel System — plugin-based EventBus architecture
  // ---------------------------------------------------------------------------
  const eventBus = getEventBus();
  const channelManager = new ChannelManager(eventBus);
  const notifier = new Notifier(eventBus, channelManager, {
    enabled: true,
    defaultChannels: ['telegram'],
    rules: [],
    throttleMs: 2000,
  });

  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      // Create plugin-based Telegram channel
      const telegramPlugin = new TelegramPlugin(agentRuntime, eventBus);
      channelManager.register(telegramPlugin, {
        id: 'telegram',
        name: 'Telegram',
        enabled: true,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
        allowedUserIds: process.env.TELEGRAM_ALLOWED_USERS
          ? process.env.TELEGRAM_ALLOWED_USERS
              .split(',')
              .map((id) => parseInt(id.trim(), 10))
              .filter((id) => Number.isFinite(id))
          : undefined,
      });

      // Register DingTalk plugin
      if (process.env.DINGTALK_WEBHOOK) {
        const dingtalkPlugin = new DingTalkPlugin(agentRuntime, eventBus);
        channelManager.register(dingtalkPlugin, {
          id: 'dingtalk',
          name: 'DingTalk',
          enabled: true,
          webhook: process.env.DINGTALK_WEBHOOK,
          secret: process.env.DINGTALK_SECRET,
          atAll: process.env.DINGTALK_AT_ALL === 'true',
          atMobiles: process.env.DINGTALK_AT_MOBILES
            ? process.env.DINGTALK_AT_MOBILES.split(',')
            : undefined,
        });
        logger.info('[Channel] DingTalk plugin registered');
      }

      // Register WeChat Work plugin
      if (process.env.WECHAT_WORK_CORP_ID && process.env.WECHAT_WORK_AGENT_ID && process.env.WECHAT_WORK_CORP_SECRET) {
        const wechatWorkPlugin = new WeChatWorkPlugin(agentRuntime, eventBus);
        channelManager.register(wechatWorkPlugin, {
          id: 'wechat-work',
          name: 'WeChat Work',
          enabled: true,
          corpId: process.env.WECHAT_WORK_CORP_ID,
          agentId: process.env.WECHAT_WORK_AGENT_ID,
          corpSecret: process.env.WECHAT_WORK_CORP_SECRET,
          toUser: process.env.WECHAT_WORK_TO_USER,
          toParty: process.env.WECHAT_WORK_TO_PARTY,
          toTag: process.env.WECHAT_WORK_TO_TAG,
        });
        logger.info('[Channel] WeChat Work plugin registered');
      }

      await channelManager.startAll();
      notifier.start();

      // Listen for outbound messages from tools and route them
      eventBus.on('message:outbound', async (msg) => {
        try {
          await channelManager.sendMessage(msg);
        } catch (err) {
          logger.error(`[Channel] Failed to send outbound to ${msg.channel}`, err);
        }
      });

      // Listen for inbound messages and route to agent
      eventBus.on('message:inbound', (msg) => {
        logger.info(`[Channel] Inbound: ${msg.channel} | ${msg.text.substring(0, 50)}`);
      });

      dependencies.telegram = 'ok';
      logger.info('Telegram 集成已启用 (Channel Plugin Architecture)');
    } catch (error) {
      dependencies.telegram = 'error';
      logger.error('Telegram 集成初始化失败', error);
    }
  } else {
    dependencies.telegram = 'disabled';
    logger.warn('Telegram 集成未启用 (缺少 TELEGRAM_BOT_TOKEN)');
  }

  let whatsappIntegration: WhatsAppIntegration | null = null;
  if (process.env.WHATSAPP_ENABLED === 'true') {
    try {
      whatsappIntegration = new WhatsAppIntegration(
        {
          sessionName: process.env.WHATSAPP_SESSION_NAME || 'chubao-ai',
          dataPath: process.env.WHATSAPP_DATA_PATH || './whatsapp-session',
          headless: process.env.WHATSAPP_HEADLESS !== 'false',
        },
        agentRuntime
      );

      if (process.env.WHATSAPP_AUTHORIZED_NUMBERS) {
        whatsappIntegration.setAuthorizedNumbers(
          process.env.WHATSAPP_AUTHORIZED_NUMBERS.split(',').map((n) => n.trim())
        );
      }

      await whatsappIntegration.init();
      dependencies.whatsapp = 'ok';
      logger.info('WhatsApp 集成已启用');
    } catch (error) {
      dependencies.whatsapp = 'error';
      logger.error('WhatsApp 集成初始化失败', error);
    }
  } else {
    dependencies.whatsapp = 'disabled';
    logger.warn('WhatsApp 集成未启用 (设置 WHATSAPP_ENABLED=true 以启用)');
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: computeHealthStatus(dependencies),
      service: 'node-backend',
      version: APP_VERSION,
      uptimeSec: Math.max(0, Math.floor((Date.now() - STARTED_AT) / 1000)),
      timestamp: new Date().toISOString(),
      deps: dependencies,
    });
  });

  app.post('/api/chat', async (req, res) => {
    const { message, sessionId, stream } = req.body ?? {};
    if (typeof message !== 'string' || message.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'message is required', {
        field: 'message',
      });
      return;
    }
    if (sessionId !== undefined && typeof sessionId !== 'string') {
      sendError(res, 400, 'INVALID_ARGUMENT', 'sessionId must be a string', {
        field: 'sessionId',
      });
      return;
    }

    const isStream = stream === true;

    try {
      const resolvedSessionId = normalizeSessionId(sessionId) ?? `http_${createRequestId()}`;

      if (isStream) {
        // Stream response using Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamCallback = (chunk: string) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        };

        const response = await agentRuntime.chatStream(message, resolvedSessionId, streamCallback);
        res.write(`data: ${JSON.stringify({ type: 'done', response, sessionId: resolvedSessionId })}\n\n`);
        res.end();
      } else {
        // Non-streaming response
        const response = await agentRuntime.chat(message, resolvedSessionId);
        res.json({ success: true, response, sessionId: resolvedSessionId });
      }
    } catch (error) {
      logger.error('Chat error', error);
      if (isStream && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: getErrorMessage(error) })}\n\n`);
        res.end();
      } else {
        sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
      }
    }
  });

  // Chat History API
  app.get('/api/chat/history', async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;
    const limitValue = req.query.limit;
    const limit = Number(limitValue ?? 50);

    if (!Number.isFinite(limit) || limit <= 0 || limit > 1000) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'limit must be between 1 and 1000', {
        field: 'limit',
      });
      return;
    }

    try {
      const conversations = await memoryManager.getRecent('conversation', limit);

      // Parse and filter by sessionId if provided
      let messages = conversations.map((item) => {
        try {
          return JSON.parse(item.content);
        } catch {
          return null;
        }
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      if (sessionId) {
        messages = messages.filter((m) => m.sessionId === sessionId);
      }

      res.json({
        success: true,
        messages,
        count: messages.length,
        sessionId,
      });
    } catch (error) {
      logger.error('Chat history error', error);
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.get('/api/memory/search', async (req, res) => {
    const query = req.query.query;
    const limitValue = req.query.limit;
    const limit = Number(limitValue ?? 10);

    if (typeof query !== 'string' || query.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'query is required', {
        field: 'query',
      });
      return;
    }

    if (!Number.isFinite(limit) || limit <= 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'limit must be a positive number', {
        field: 'limit',
      });
      return;
    }

    try {
      const results = await memoryManager.search(query, limit);
      res.json({ success: true, results });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.get('/api/coding/progress', async (req, res) => {
    const sinceDaysRaw = req.query.sinceDays;
    const maxFilesRaw = req.query.maxFiles;
    const includeUntrackedRaw = req.query.includeUntracked;

    const sinceDays = sinceDaysRaw === undefined ? undefined : Number(sinceDaysRaw);
    const maxFiles = maxFilesRaw === undefined ? undefined : Number(maxFilesRaw);
    const includeUntracked = includeUntrackedRaw === undefined
      ? undefined
      : `${includeUntrackedRaw}`.toLowerCase() !== 'false';

    if (sinceDays !== undefined && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'sinceDays must be a positive number', {
        field: 'sinceDays',
      });
      return;
    }
    if (maxFiles !== undefined && (!Number.isFinite(maxFiles) || maxFiles <= 0)) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'maxFiles must be a positive number', {
        field: 'maxFiles',
      });
      return;
    }

    try {
      const progress = await analyzeCodingProgress({
        sinceDays,
        maxFiles,
        includeUntracked,
      });
      res.json({
        success: true,
        progress,
      });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.get('/api/tools', async (_req, res) => {
    try {
      await toolManager.initializeSkills();
      const cli = await toolManager.getCliHealth();
      res.json({
        success: true,
        tools: agentRuntime.getAvailableTools(),
        sandbox: toolManager.getSandboxPolicy(),
        security: agentRuntime.getSecurityPolicy(),
        cli,
      });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  registerMultiAgentRoutes({
    app,
    initializeSkills: () => toolManager.initializeSkills(),
    executeTool: async (name, args) => agentRuntime.executeTool(name, args),
    inferErrorCode,
    sendError,
  });

  // Register task scheduler routes (Task Queue + Cron)
  registerTaskSchedulerRoutes({
    app,
    taskQueue,
    cronScheduler,
    inferErrorCode: inferErrorCode as any,
    sendError: sendError as any,
  });

  app.get('/api/skills', async (_req, res) => {
    try {
      await toolManager.initializeSkills();
      const skills = toolManager.getInstalledSkills().map((skill) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        enabled: skill.enabled,
        description: skill.description,
        tags: skill.tags,
        source: skill.source,
        installedAt: skill.installedAt,
      }));
      res.json({
        success: true,
        skills,
        warnings: toolManager.getSkillWarnings(),
        toolCount: toolManager.getAllTools().length,
      });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/skills/install', async (req, res) => {
    const skillPath = req.body?.path;
    if (typeof skillPath !== 'string' || skillPath.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'path is required', {
        field: 'path',
      });
      return;
    }

    try {
      const result = await toolManager.installSkill(skillPath);
      res.json({
        success: true,
        skill: result.manifest,
        loadedTools: result.loadedTools,
        warnings: result.warnings,
      });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.get('/api/platforms/status', async (_req, res) => {
    const status: Record<string, unknown> = {};

    if (larkIntegration) {
      try {
        const botInfo = await larkIntegration.getBotInfo();
        status.lark = {
          enabled: true,
          state: dependencies.lark,
          bot: botInfo.bot,
        };
      } catch (error) {
        status.lark = {
          enabled: true,
          state: 'error',
          error: getErrorMessage(error),
        };
      }
    } else {
      status.lark = { enabled: false, state: dependencies.lark };
    }

    // Telegram status via new Channel Plugin system
    const telegramPlugin = channelManager.getPlugin('telegram');
    if (telegramPlugin) {
      const pluginStatus = telegramPlugin.getStatus();
      status.telegram = {
        enabled: true,
        state: dependencies.telegram,
        pluginState: pluginStatus.state,
        uptime: pluginStatus.uptime,
        ownerChatId: telegramPlugin.getOwnerChatId(),
        lastInboundAt: pluginStatus.lastInboundAt,
        lastOutboundAt: pluginStatus.lastOutboundAt,
        lastError: pluginStatus.lastError,
      };
    } else {
      status.telegram = { enabled: false, state: dependencies.telegram };
    }

    if (whatsappIntegration) {
      const waStatus = whatsappIntegration.getStatus();
      status.whatsapp = {
        enabled: true,
        state: dependencies.whatsapp,
        ready: waStatus.ready,
        hasQrCode: !!waStatus.qrCode,
        authorizedNumbers: waStatus.authorizedNumbers.length,
      };
    } else {
      status.whatsapp = { enabled: false, state: dependencies.whatsapp };
    }

    res.json({ success: true, platforms: status });
  });

  // ---- Model Config routes ----

  app.get('/api/config/model', (_req, res) => {
    try {
      res.json({ success: true, config: agentRuntime.getModelConfig() });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.put('/api/config/model', (req, res) => {
    try {
      const body = req.body ?? {};
      agentRuntime.updateModelConfig({
        provider: typeof body.provider === 'string' ? body.provider : undefined,
        openaiModel: typeof body.openaiModel === 'string' ? body.openaiModel : undefined,
        openaiBaseUrl: typeof body.openaiBaseUrl === 'string' ? body.openaiBaseUrl : undefined,
        openaiApiKey: typeof body.openaiApiKey === 'string' ? body.openaiApiKey : undefined,
        anthropicModel: typeof body.anthropicModel === 'string' ? body.anthropicModel : undefined,
        anthropicBaseUrl: typeof body.anthropicBaseUrl === 'string' ? body.anthropicBaseUrl : undefined,
        anthropicApiKey: typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey : undefined,
      });
      res.json({ success: true, config: agentRuntime.getModelConfig() });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/config/model/persist', (req, res) => {
    const body = req.body ?? {};

    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
      sendError(res, 400, 'INVALID_ARGUMENT', 'dryRun must be a boolean', {
        field: 'dryRun',
      });
      return;
    }

    if (body.includeSecrets !== undefined && typeof body.includeSecrets !== 'boolean') {
      sendError(res, 400, 'INVALID_ARGUMENT', 'includeSecrets must be a boolean', {
        field: 'includeSecrets',
      });
      return;
    }

    try {
      const result = agentRuntime.persistModelConfig({
        dryRun: typeof body.dryRun === 'boolean' ? body.dryRun : true,
        includeSecrets: body.includeSecrets === true,
      });

      res.json({
        success: true,
        config: agentRuntime.getModelConfig(),
        result,
      });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  // ---- Claude Code Config Sync routes ----

  app.get('/api/config/claude-code', (_req, res) => {
    try {
      const ccConfig = AgentRuntime.readClaudeCodeConfig();
      res.json({ success: true, ...ccConfig });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/config/sync-claude-code', (_req, res) => {
    try {
      const result = agentRuntime.syncFromClaudeCode();
      res.json({ ...result, config: agentRuntime.getModelConfig() });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  // ---- Continuous Dev Monitor routes ----

  app.post('/api/continuous-dev/start', async (req, res) => {
    const { taskDescription, intervalSeconds, maxCycles, projectPath, windowTitle, pauseOnError, maxConsecutiveErrors } = req.body ?? {};
    if (typeof taskDescription !== 'string' || taskDescription.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'taskDescription is required', { field: 'taskDescription' });
      return;
    }
    try {
      await continuousDevMonitor.start({
        taskDescription: taskDescription.trim(),
        intervalSeconds: typeof intervalSeconds === 'number' ? intervalSeconds : undefined,
        maxCycles: typeof maxCycles === 'number' ? maxCycles : undefined,
        projectPath: typeof projectPath === 'string' ? projectPath.trim() : undefined,
        windowTitle: typeof windowTitle === 'string' ? windowTitle.trim() : undefined,
        pauseOnError: typeof pauseOnError === 'boolean' ? pauseOnError : undefined,
        maxConsecutiveErrors: typeof maxConsecutiveErrors === 'number' ? maxConsecutiveErrors : undefined,
      });
      res.json({ success: true, state: continuousDevMonitor.getState() });
    } catch (error) {
      sendError(res, 409, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/continuous-dev/stop', async (_req, res) => {
    try {
      await continuousDevMonitor.stop();
      res.json({ success: true, state: continuousDevMonitor.getState() });
    } catch (error) {
      sendError(res, 500, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/continuous-dev/pause', async (_req, res) => {
    try {
      await continuousDevMonitor.pause();
      res.json({ success: true, state: continuousDevMonitor.getState() });
    } catch (error) {
      sendError(res, 409, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.post('/api/continuous-dev/resume', async (_req, res) => {
    try {
      await continuousDevMonitor.resume();
      res.json({ success: true, state: continuousDevMonitor.getState() });
    } catch (error) {
      sendError(res, 409, inferErrorCode(error), getErrorMessage(error));
    }
  });

  app.get('/api/continuous-dev/status', (_req, res) => {
    res.json({ success: true, state: continuousDevMonitor.getState() });
  });

  server.listen(PORT, () => {
    logger.info('Node.js 后端已启动', { url: `http://localhost:${PORT}`, port: PORT });
    logger.info('WebSocket 服务已启动', { url: `ws://localhost:${PORT}/ws` });
    logger.info('性能监控服务已启动', { url: `http://localhost:${PORT}/api/metrics` });

    // Start performance monitoring
    performanceMonitor.startCollection(60000); // Collect every minute
    logger.info('Performance monitoring started');
  });

  process.on('SIGINT', async () => {
    logger.info('正在关闭服务器...');

    // Stop cron scheduler
    try {
      cronScheduler.stop();
      logger.info('Cron scheduler stopped');
    } catch (err) {
      logger.error('Error stopping cron scheduler', err);
    }

    // Stop channel system (Telegram, future channels...)
    try {
      notifier.stop();
      await channelManager.stopAll('SIGINT shutdown');
      logger.info('Channel system stopped');
    } catch (err) {
      logger.error('Error stopping channel system', err);
    }

    if (whatsappIntegration) {
      logger.info('正在关闭 WhatsApp...');
      await whatsappIntegration.destroy();
    }

    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.fatal('Fatal startup error', error);
});
