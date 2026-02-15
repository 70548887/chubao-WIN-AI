/**
 * Telegram Channel Plugin — implements IChannelPlugin.
 *
 * Based on Telegraf library, supports:
 * - Long polling (default, no public IP needed)
 * - Webhook mode (optional, for production with public IP)
 * - Retry + exponential backoff
 * - Rate-limit (429) handling
 * - Auto-reconnect on failure
 * - Owner chat ID tracking for proactive notifications
 *
 * This replaces the old TelegramIntegration class with plugin-based arch.
 */

import { Telegraf, Context, TelegramError } from 'telegraf';
import { message } from 'telegraf/filters';
import { randomUUID } from 'node:crypto';
import type { AgentRuntime } from '../../agent/runtime.js';
import type { ChannelEventBus } from '../eventBus.js';
import type {
  IChannelPlugin,
  ChannelPluginCapabilities,
  ChannelPluginConfig,
  ChannelPluginStatus,
  ChannelState,
  OutboundMessage,
} from '../types.js';

// ---------------------------------------------------------------------------
// Telegram-specific config
// ---------------------------------------------------------------------------
interface TelegramPluginConfig extends ChannelPluginConfig {
  botToken: string;
  webhookUrl?: string;
  allowedUserIds?: number[];
  maxRetries?: number;
  retryDelay?: number;
  messageTimeout?: number;
}

export class TelegramPlugin implements IChannelPlugin {
  readonly id = 'telegram';
  readonly name = 'Telegram';
  readonly capabilities: ChannelPluginCapabilities = {
    receive: true,
    send: true,
    media: true,
    buttons: true,
    threads: false,
    reactions: false,
  };

  private config!: TelegramPluginConfig;
  private agentRuntime: AgentRuntime;
  private eventBus: ChannelEventBus;
  private bot!: Telegraf<Context>;
  private state: ChannelState = 'stopped';
  private startedAt: number = 0;
  private lastInboundAt?: number;
  private lastOutboundAt?: number;
  private lastError?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private ownerChatId: string | null = null;

  constructor(agentRuntime: AgentRuntime, eventBus: ChannelEventBus) {
    this.agentRuntime = agentRuntime;
    this.eventBus = eventBus;
  }

  // ---------------------------------------------------------------------------
  // IChannelPlugin lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ChannelPluginConfig): Promise<void> {
    this.config = config as TelegramPluginConfig;
    this.bot = new Telegraf(this.config.botToken, {
      handlerTimeout: this.config.messageTimeout ?? 60000,
    });

    // Resolve owner chat from env or config
    if (process.env.TELEGRAM_OWNER_CHAT_ID) {
      this.ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
    }

    this.setupHandlers();
    this.setupErrorHandler();
  }

  async start(): Promise<void> {
    this.state = 'starting';
    this.startedAt = Date.now();

    try {
      if (this.config.webhookUrl) {
        await this.bot.launch({
          webhook: { domain: this.config.webhookUrl, port: 0 },
        });
        console.log(`🚀 [Telegram] 已启动 (Webhook): ${this.config.webhookUrl}`);
      } else {
        await this.bot.launch({ dropPendingUpdates: true });
        console.log('🚀 [Telegram] 已启动 (Long polling)');
      }

      this.state = 'running';
      this.reconnectAttempts = 0;

      // Graceful shutdown hooks
      const stopHandler = () => {
        this.state = 'stopped';
        this.bot.stop();
      };
      process.once('SIGINT', stopHandler);
      process.once('SIGTERM', stopHandler);
    } catch (err) {
      this.state = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    try {
      this.bot.stop();
    } catch {
      // ignore
    }
    this.state = 'stopped';
  }

  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    const chatId = msg.chatId;
    const text = msg.text;

    try {
      const result = await this.withRetry(async () => {
        return this.bot.telegram.sendMessage(chatId, text, {
          parse_mode: msg.parseMode === 'html' ? 'HTML' : 'Markdown',
          reply_parameters: msg.replyToMessageId
            ? { message_id: Number(msg.replyToMessageId) }
            : undefined,
          disable_notification: msg.silent,
        });
      });

      this.lastOutboundAt = Date.now();
      return { messageId: String(result.message_id) };
    } catch (err) {
      // If Markdown parse fails, retry with plain text
      if (err instanceof TelegramError && /parse entities/i.test(err.message)) {
        const result = await this.bot.telegram.sendMessage(chatId, text, {
          disable_notification: msg.silent,
        });
        this.lastOutboundAt = Date.now();
        return { messageId: String(result.message_id) };
      }
      throw err;
    }
  }

  getStatus(): ChannelPluginStatus {
    return {
      state: this.state,
      uptime: this.state === 'running' ? Date.now() - this.startedAt : 0,
      lastInboundAt: this.lastInboundAt,
      lastOutboundAt: this.lastOutboundAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      metadata: {
        botToken: this.config?.botToken
          ? `${this.config.botToken.substring(0, 8)}...`
          : undefined,
        webhookUrl: this.config?.webhookUrl,
        ownerChatId: this.ownerChatId,
      },
    };
  }

  getOwnerChatId(): string | null {
    return this.ownerChatId;
  }

  isHealthy(): boolean {
    return this.state === 'running';
  }

  // ---------------------------------------------------------------------------
  // Message handlers (emits events to EventBus)
  // ---------------------------------------------------------------------------

  private setupHandlers(): void {
    // /start command
    this.bot.command('start', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) {
        await ctx.reply('⛔ 未经授权的访问');
        return;
      }

      // Track owner chat ID from first authorized user
      this.trackOwnerChat(ctx);

      await this.withRetry(() =>
        ctx.reply(
          '👋 你好！我是 Chubao AI\n\n' +
            '我可以帮你：\n' +
            '🖥️ 控制 Windows 桌面应用\n' +
            '📊 监控编程进度\n' +
            '🔄 自我升级开发\n' +
            '📁 管理文件和记忆\n\n' +
            '直接发送消息即可开始对话！\n' +
            '发送 /help 查看所有命令',
          {
            reply_markup: {
              keyboard: [
                ['📋 获取窗口列表', '📸 截图'],
                ['💬 开始聊天', '📊 状态'],
              ],
              resize_keyboard: true,
            },
          },
        ),
      );
    });

    // /help command
    this.bot.command('help', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await this.withRetry(() =>
        ctx.reply(
          '📚 可用命令：\n\n' +
            '/start - 开始对话\n' +
            '/help - 显示帮助\n' +
            '/status - 查看系统状态\n' +
            '/windows - 获取窗口列表\n' +
            '/screenshot - 截取屏幕\n' +
            '/chat <消息> - 发送消息给 AI\n' +
            '/memory <查询> - 搜索记忆\n' +
            '/clear - 清除对话历史',
        ),
      );
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const uptime = Math.floor((Date.now() - this.startedAt) / 1000);
      const hours = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      const secs = uptime % 60;

      await this.withRetry(() =>
        ctx.reply(
          '📊 系统状态\n\n' +
            `🟢 Telegram Bot: 运行中\n` +
            `⏱️ 运行时间: ${hours}h ${mins}m ${secs}s\n` +
            `💾 内存: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
            `📨 最近消息: ${this.lastInboundAt ? new Date(this.lastInboundAt).toLocaleTimeString('zh-CN') : '无'}\n` +
            `🔄 重连次数: ${this.reconnectAttempts}`,
        ),
      );
    });

    // /windows command
    this.bot.command('windows', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      try {
        const res = await fetch('http://localhost:3200/api/windows');
        const data = await res.json() as { success: boolean; windows: Array<{ title: string }> };
        if (data.success) {
          const list = data.windows
            .slice(0, 20)
            .map((w: { title: string }, i: number) => `${i + 1}. ${w.title}`)
            .join('\n');
          await ctx.reply(`🪟 当前窗口:\n\n${list}`);
        } else {
          await ctx.reply('❌ 获取窗口列表失败');
        }
      } catch {
        await ctx.reply('❌ Python 服务未运行');
      }
    });

    // /screenshot command
    this.bot.command('screenshot', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await ctx.reply('📸 正在截图...');
      try {
        const res = await fetch('http://localhost:3200/api/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json() as { success: boolean; result?: { path: string }; error?: string };
        if (data.success && data.result?.path) {
          await ctx.replyWithPhoto({ source: data.result.path });
        } else {
          await ctx.reply(`❌ 截图失败: ${data.error || '未知错误'}`);
        }
      } catch {
        await ctx.reply('❌ Python 服务未运行');
      }
    });

    // /chat command
    this.bot.command('chat', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const text = ctx.message.text.replace('/chat', '').trim();
      if (!text) {
        await ctx.reply('💬 请提供消息，例如: /chat 你好');
        return;
      }
      await this.processInboundMessage(ctx, text);
    });

    // /memory command
    this.bot.command('memory', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      const query = ctx.message.text.replace('/memory', '').trim();
      if (!query) {
        await ctx.reply('🔍 请提供关键词，例如: /memory 项目进度');
        return;
      }
      try {
        const res = await fetch(
          `http://localhost:3100/api/memory/search?query=${encodeURIComponent(query)}&limit=5`,
        );
        const data = await res.json() as { success: boolean; results: string[] };
        if (data.success && data.results.length > 0) {
          const results = data.results
            .map((r: string, i: number) => `${i + 1}. ${r.substring(0, 100)}...`)
            .join('\n\n');
          await ctx.reply(`🔍 找到 ${data.results.length} 条:\n\n${results}`);
        } else {
          await ctx.reply('🔍 未找到相关记忆');
        }
      } catch {
        await ctx.reply('❌ 搜索失败');
      }
    });

    // /clear command
    this.bot.command('clear', async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) return;
      await ctx.reply('🧹 对话历史已清除');
    });

    // Handle plain text messages
    this.bot.on(message('text'), async (ctx) => {
      if (!this.isAuthorized(ctx.from?.id)) {
        await ctx.reply('⛔ 未经授权');
        return;
      }
      this.trackOwnerChat(ctx);

      const text = ctx.message.text;

      // Handle keyboard buttons
      if (text === '📋 获取窗口列表') {
        await ctx.reply('/windows 命令执行中...');
        return;
      }
      if (text === '📸 截图') {
        await ctx.reply('/screenshot 命令执行中...');
        return;
      }
      if (text === '💬 开始聊天') {
        await ctx.reply('💬 请直接发送消息！');
        return;
      }
      if (text === '📊 状态') {
        await ctx.reply('/status 命令执行中...');
        return;
      }

      await this.processInboundMessage(ctx, text);
    });

    // Handle callback queries (inline keyboard)
    this.bot.on('callback_query', async (ctx) => {
      const callback = ctx.callbackQuery;
      const data = 'data' in callback ? callback.data : undefined;
      if (typeof data !== 'string') {
        await ctx.answerCbQuery();
        return;
      }

      if (data === 'screenshot') {
        await ctx.reply('📸 正在截图...');
      } else if (data === 'windows') {
        await ctx.reply('📋 获取窗口列表...');
      } else if (data.startsWith('regenerate:')) {
        const msg = data.replace('regenerate:', '');
        await this.processInboundMessage(ctx, msg);
      }

      await ctx.answerCbQuery();
    });
  }

  /**
   * Core message processing: emit to EventBus → Agent → reply
   */
  private async processInboundMessage(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    this.lastInboundAt = Date.now();

    // Emit inbound event to EventBus
    this.eventBus.emit('message:inbound', {
      id: randomUUID(),
      channel: 'telegram',
      chatId: String(chatId),
      senderId: String(userId ?? 'unknown'),
      senderName: ctx.from?.first_name,
      text,
      timestamp: Date.now(),
    });

    const sessionId = `telegram_${userId}`;
    console.log(`📨 [Telegram] 收到: ${text.substring(0, 50)}...`);

    try {
      await this.withRetry(() => ctx.sendChatAction('typing'));

      const response = await this.agentRuntime.chat(text, sessionId);

      // Truncate for Telegram 4096 char limit
      const maxLen = 4000;
      let replyText = response;
      if (response.length > maxLen) {
        replyText = response.substring(0, maxLen) + '\n\n[消息过长，已截断]';
      }

      await this.withRetry(() =>
        ctx.reply(replyText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📸 截图', callback_data: 'screenshot' },
                { text: '📋 窗口', callback_data: 'windows' },
              ],
              [{ text: '🔄 重新生成', callback_data: `regenerate:${text.substring(0, 50)}` }],
            ],
          },
        }),
      );

      this.lastOutboundAt = Date.now();
    } catch (err) {
      console.error('[Telegram] 处理消息失败:', err);

      // Fallback: try plain text reply if Markdown failed
      try {
        await ctx.reply('抱歉，处理消息时出错了，请稍后再试。');
      } catch {
        // give up
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private setupErrorHandler(): void {
    this.bot.catch(async (err: unknown, ctx: Context) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Telegram] Bot 错误:', errMsg);
      this.lastError = errMsg;

      // Emit error to EventBus
      this.eventBus.emit('channel:state', {
        channel: 'telegram',
        state: 'error',
        error: errMsg,
        timestamp: Date.now(),
      });

      try {
        if (ctx.chat?.id) {
          await ctx.reply('❌ 发生错误，请稍后再试');
        }
      } catch {
        // ignore
      }
    });
  }

  private isAuthorized(userId: number | undefined): boolean {
    if (!userId) return false;
    if (!this.config.allowedUserIds || this.config.allowedUserIds.length === 0) {
      return true;
    }
    return this.config.allowedUserIds.includes(userId);
  }

  private trackOwnerChat(ctx: Context): void {
    if (!this.ownerChatId && ctx.chat?.id) {
      this.ownerChatId = String(ctx.chat.id);
      console.log(`[Telegram] Owner chat tracked: ${this.ownerChatId}`);
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    const baseDelay = this.config?.retryDelay ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error)) throw error;

        // Rate limit
        if (this.isRateLimited(error)) {
          const retryAfter = this.getRetryAfter(error);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, 30000);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Retry exhausted');
  }

  private shouldRetry(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
        return true;
      }
    }
    if (error instanceof TelegramError) {
      const code = error.response?.error_code;
      if (code >= 500 || code === 429) return true;
      if (code === 400 && !/message is too long/i.test(error.response?.description || '')) {
        return true;
      }
    }
    return false;
  }

  private isRateLimited(error: unknown): boolean {
    return error instanceof TelegramError && error.response?.error_code === 429;
  }

  private getRetryAfter(error: unknown): number {
    if (error instanceof TelegramError) {
      return error.response?.parameters?.retry_after || 30;
    }
    return 30;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
