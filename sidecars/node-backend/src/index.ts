/**
 * Chubao AI - Node.js 后端入口
 * 基于 OpenClaw 架构
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { config } from 'dotenv';
import { AgentRuntime } from './agent/runtime.js';
import { MemoryManager } from './memory/manager.js';
import { GatewayServer } from './gateway/server.js';
import { LarkIntegration, TelegramIntegration, WhatsAppIntegration } from './gateway/platforms/index.js';

config();

const PORT = parseInt(process.env.NODE_PORT || process.env.PORT || '3100', 10);

async function main() {
  console.log('🚀 Chubao AI Node.js 后端启动中...');

  // 初始化 Express
  const app = express();
  app.use(express.json());

  // 创建 HTTP 服务器
  const server = createServer(app);

  // 初始化 WebSocket
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 初始化记忆管理器
  const memoryManager = new MemoryManager();
  await memoryManager.init();

  // 初始化 Agent 运行时
  const agentRuntime = new AgentRuntime(memoryManager);

  // 初始化 Gateway
  const gateway = new GatewayServer(wss, agentRuntime);

  // 初始化消息平台集成
  console.log('📱 初始化消息平台...');
  
  // 飞书集成
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
      
      // 注册飞书 webhook 路由
      app.use('/lark', larkIntegration.getRouter());
      console.log('✅ 飞书集成已启用');
    } catch (error) {
      console.error('❌ 飞书集成初始化失败:', error);
    }
  } else {
    console.log('⚠️  飞书集成未启用 (缺少 LARK_APP_ID 或 LARK_APP_SECRET)');
  }

  // Telegram 集成
  let telegramIntegration: TelegramIntegration | null = null;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      telegramIntegration = new TelegramIntegration(
        {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
          allowedUserIds: process.env.TELEGRAM_ALLOWED_USERS
            ? process.env.TELEGRAM_ALLOWED_USERS.split(',').map(id => parseInt(id.trim()))
            : undefined,
        },
        agentRuntime
      );
      
      await telegramIntegration.start();
      console.log('✅ Telegram 集成已启用');
    } catch (error) {
      console.error('❌ Telegram 集成初始化失败:', error);
    }
  } else {
    console.log('⚠️  Telegram 集成未启用 (缺少 TELEGRAM_BOT_TOKEN)');
  }

  // WhatsApp 集成
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
      
      // 设置授权号码
      if (process.env.WHATSAPP_AUTHORIZED_NUMBERS) {
        whatsappIntegration.setAuthorizedNumbers(
          process.env.WHATSAPP_AUTHORIZED_NUMBERS.split(',').map(n => n.trim())
        );
      }
      
      await whatsappIntegration.init();
      console.log('✅ WhatsApp 集成已启用');
    } catch (error) {
      console.error('❌ WhatsApp 集成初始化失败:', error);
    }
  } else {
    console.log('⚠️  WhatsApp 集成未启用 (设置 WHATSAPP_ENABLED=true 以启用)');
  }

  // REST API 路由
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, sessionId } = req.body;
      const response = await agentRuntime.chat(message, sessionId);
      res.json({ success: true, response });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/memory/search', async (req, res) => {
    try {
      const { query, limit } = req.query;
      const results = await memoryManager.search(String(query), Number(limit) || 10);
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // 消息平台状态 API
  app.get('/api/platforms/status', async (req, res) => {
    const status: Record<string, any> = {};

    // 飞书状态
    if (larkIntegration) {
      try {
        const botInfo = await larkIntegration.getBotInfo();
        status.lark = {
          enabled: true,
          bot: botInfo.bot,
        };
      } catch (error) {
        status.lark = { enabled: true, error: String(error) };
      }
    } else {
      status.lark = { enabled: false };
    }

    // Telegram 状态
    if (telegramIntegration) {
      try {
        const botInfo = await telegramIntegration.getBotInfo();
        status.telegram = {
          enabled: true,
          username: botInfo.username,
          first_name: botInfo.first_name,
        };
      } catch (error) {
        status.telegram = { enabled: true, error: String(error) };
      }
    } else {
      status.telegram = { enabled: false };
    }

    // WhatsApp 状态
    if (whatsappIntegration) {
      const waStatus = whatsappIntegration.getStatus();
      status.whatsapp = {
        enabled: true,
        ready: waStatus.ready,
        hasQrCode: !!waStatus.qrCode,
        authorizedNumbers: waStatus.authorizedNumbers.length,
      };
    } else {
      status.whatsapp = { enabled: false };
    }

    res.json({ success: true, platforms: status });
  });

  // 启动服务器
  server.listen(PORT, () => {
    console.log(`✅ Node.js 后端已启动: http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  });

  // 处理进程信号
  process.on('SIGINT', async () => {
    console.log('\n正在关闭服务器...');
    
    // 关闭消息平台
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

main().catch(console.error);
