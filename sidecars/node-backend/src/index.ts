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
import { MemoryManager } from './memory/manager.js';
import { analyzeCodingProgress } from './coding/progress.js';
import { toolManager } from './tools/index.js';
import { GatewayServer } from './gateway/server.js';
import { registerMultiAgentRoutes } from './routes/multiAgent.js';
import {
  LarkIntegration,
  TelegramIntegration,
  WhatsAppIntegration,
} from './gateway/platforms/index.js';

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
  console.log('🚀 Chubao AI Node.js 后端启动中...');

  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const onListenError = (error: NodeJS.ErrnoException): void => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error('   Stop the existing process, or set NODE_PORT/PORT to another value.');
      process.exit(1);
      return;
    }
    console.error('❌ HTTP server listen error:', error);
    process.exit(1);
  };
  server.on('error', onListenError);
  wss.on('error', (error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE') {
      return;
    }
    console.error('❌ WebSocket server error:', getErrorMessage(error));
  });

  const dependencies: Record<string, DependencyState> = {
    memory: 'degraded',
    gateway: 'degraded',
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
    console.warn('Skill tools initialize warning:', getErrorMessage(error));
  }

  const agentRuntime = new AgentRuntime(memoryManager);
  new GatewayServer(wss, agentRuntime);
  dependencies.gateway = 'ok';

  console.log('📱 初始化消息平台...');

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
      console.log('✅ 飞书集成已启用');
    } catch (error) {
      dependencies.lark = 'error';
      console.error('❌ 飞书集成初始化失败:', error);
    }
  } else {
    dependencies.lark = 'disabled';
    console.log('⚠️  飞书集成未启用 (缺少 LARK_APP_ID 或 LARK_APP_SECRET)');
  }

  let telegramIntegration: TelegramIntegration | null = null;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      telegramIntegration = new TelegramIntegration(
        {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
          allowedUserIds: process.env.TELEGRAM_ALLOWED_USERS
            ? process.env.TELEGRAM_ALLOWED_USERS
                .split(',')
                .map((id) => parseInt(id.trim(), 10))
                .filter((id) => Number.isFinite(id))
            : undefined,
        },
        agentRuntime
      );

      await telegramIntegration.start();
      dependencies.telegram = 'ok';
      console.log('✅ Telegram 集成已启用');
    } catch (error) {
      dependencies.telegram = 'error';
      console.error('❌ Telegram 集成初始化失败:', error);
    }
  } else {
    dependencies.telegram = 'disabled';
    console.log('⚠️  Telegram 集成未启用 (缺少 TELEGRAM_BOT_TOKEN)');
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
      console.log('✅ WhatsApp 集成已启用');
    } catch (error) {
      dependencies.whatsapp = 'error';
      console.error('❌ WhatsApp 集成初始化失败:', error);
    }
  } else {
    dependencies.whatsapp = 'disabled';
    console.log('⚠️  WhatsApp 集成未启用 (设置 WHATSAPP_ENABLED=true 以启用)');
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
    const { message, sessionId } = req.body ?? {};
    if (typeof message !== 'string' || message.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'message is required', {
        field: 'message',
      });
      return;
    }

    try {
      const response = await agentRuntime.chat(message, sessionId);
      res.json({ success: true, response });
    } catch (error) {
      console.error('Chat error:', error);
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

    if (telegramIntegration) {
      try {
        const botInfo = await telegramIntegration.getBotInfo();
        status.telegram = {
          enabled: true,
          state: dependencies.telegram,
          username: botInfo.username,
          firstName: botInfo.first_name,
        };
      } catch (error) {
        status.telegram = {
          enabled: true,
          state: 'error',
          error: getErrorMessage(error),
        };
      }
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

  server.listen(PORT, () => {
    console.log(`✅ Node.js 后端已启动: http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  });

  process.on('SIGINT', async () => {
    console.log('\n正在关闭服务器...');

    if (telegramIntegration) {
      console.log('正在关闭 Telegram...');
    }

    if (whatsappIntegration) {
      console.log('正在关闭 WhatsApp...');
      await whatsappIntegration.destroy();
    }

    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
});
