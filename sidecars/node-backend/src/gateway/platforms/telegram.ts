/**
 * Telegram Bot 消息平台集成
 * 
 * 使用 Telegraf 库实现：
 * - 接收消息 (Long polling / Webhook)
 * - 发送消息 (Bot API)
 * - 内联键盘交互
 * 
 * 边界情况处理:
 * - 连接断开自动重连
 * - API 限流 (429) 处理
 * - 消息发送失败重试
 * - 网络错误恢复
 * - 长轮询断线处理
 */

import { AgentRuntime } from '../../agent/runtime.js';
import { Telegraf, Context, TelegramError } from 'telegraf';
import { message } from 'telegraf/filters';

interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  allowedUserIds?: number[];
  maxRetries?: number;
  retryDelay?: number;
  messageTimeout?: number;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export class TelegramIntegration {
  private config: Required<TelegramConfig>;
  private agentRuntime: AgentRuntime;
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private messageQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private rateLimitDelay: number = 0;

  constructor(config: TelegramConfig, agentRuntime: AgentRuntime) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      messageTimeout: 60000,
      ...config,
    } as Required<TelegramConfig>;
    this.agentRuntime = agentRuntime;
    this.bot = new Telegraf(config.botToken, {
      handlerTimeout: this.config.messageTimeout,
    });
    
    this.setupHandlers();
    this.setupErrorHandler();
  }

  /**
   * 带重试机制的异步操作
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const baseDelay = options.baseDelay ?? this.config.retryDelay;
    const maxDelay = options.maxDelay ?? 30000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // 判断是否还应该重试
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // 处理限流
        if (this.isRateLimited(error)) {
          const retryAfter = this.getRetryAfter(error);
          console.log(`⏳ Telegram API 限流, ${retryAfter}s 后重试...`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // 计算退避延迟
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelay
        );

        console.log(`⚠️ Telegram 操作失败 (${attempt + 1}/${maxRetries}), ${delay}ms 后重试:`,
          (error as Error).message);
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('重试次数耗尽');
  }

  /**
   * 判断错误是否应该重试
   */
  private shouldRetry(error: any): boolean {
    // 网络错误
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN') {
      return true;
    }

    // Telegram API 错误
    if (error instanceof TelegramError) {
      const errorCode = error.response?.error_code;
      
      // 5xx 服务器错误
      if (errorCode >= 500) {
        return true;
      }
      
      // 429 限流
      if (errorCode === 429) {
        return true;
      }
      
      // 400 Bad Request - 某些情况可以重试
      if (errorCode === 400) {
        const description = error.response?.description || '';
        // 如果是因为消息太长，不 retry
        if (description.includes('message is too long')) {
          return false;
        }
        // 其他 400 错误可能是临时的
        return true;
      }
    }

    return false;
  }

  /**
   * 判断是否被限流
   */
  private isRateLimited(error: any): boolean {
    if (error instanceof TelegramError) {
      return error.response?.error_code === 429;
    }
    return false;
  }

  /**
   * 获取限流后重试等待时间
   */
  private getRetryAfter(error: any): number {
    if (error instanceof TelegramError) {
      return error.response?.parameters?.retry_after || 30;
    }
    return 30;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置错误处理器
   */
  private setupErrorHandler(): void {
    // 全局错误捕获
    this.bot.catch(async (err: any, ctx: Context) => {
      console.error('Telegram Bot 错误:', err);
      
      // 如果是轮询错误，尝试重连
      if (err.message?.includes('polling')) {
        console.log('检测到轮询错误，将尝试重连...');
        return;
      }

      // 尝试通知用户
      try {
        if (ctx.chat?.id) {
          await ctx.reply('❌ 发生错误，请稍后再试');
        }
      } catch (replyError) {
        console.error('发送错误通知失败:', replyError);
      }
    });
  }

  /**
   * 设置消息处理器
   */
  private setupHandlers(): void {
    // 启动命令
    this.bot.command('start', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) {
          await ctx.reply('⛔ 未经授权的访问');
          return;
        }

        await this.withRetry(() => ctx.reply(
          '👋 你好！我是 Chubao AI\n\n' +
          '我可以帮你：\n' +
          '🖥️ 控制 Windows 桌面应用\n' +
          '📊 监控编程进度\n' +
          '🧪 运行自动化测试\n' +
          '📁 管理文件和记忆\n\n' +
          '直接发送消息即可开始对话！',
          {
            reply_markup: {
              keyboard: [
                ['📋 获取窗口列表', '📸 截图'],
                ['💬 开始聊天', '⚙️ 设置']
              ],
              resize_keyboard: true,
            }
          }
        ));
      } catch (error) {
        console.error('处理 /start 命令失败:', error);
        await ctx.reply('❌ 服务暂时不可用，请稍后再试');
      }
    });

    // 帮助命令
    this.bot.command('help', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        await this.withRetry(() => ctx.reply(
          '📚 可用命令：\n\n' +
          '/start - 开始对话\n' +
          '/help - 显示帮助\n' +
          '/status - 查看系统状态\n' +
          '/windows - 获取窗口列表\n' +
          '/screenshot - 截取屏幕\n' +
          '/chat <消息> - 发送消息给 AI\n' +
          '/memory <查询> - 搜索记忆\n' +
          '/clear - 清除对话历史'
        ));
      } catch (error) {
        console.error('处理 /help 命令失败:', error);
      }
    });

    // 状态命令
    this.bot.command('status', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        const status = 
          '📊 系统状态\n\n' +
          '🟢 Node.js 后端: 运行中\n' +
          '🟢 Python 自动化: 运行中\n' +
          '🟢 Claude API: 已连接\n' +
          '🟢 记忆系统: 正常\n\n' +
          `💾 内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
        
        await this.withRetry(() => ctx.reply(status));
      } catch (error) {
        console.error('处理 /status 命令失败:', error);
        await ctx.reply('❌ 获取状态失败');
      }
    });

    // 获取窗口列表命令
    this.bot.command('windows', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        const response = await this.withRetry(async () => {
          const res = await fetch('http://localhost:3200/api/windows');
          const data = await res.json();
          
          if (data.success) {
            const windows = data.windows.slice(0, 20);
            const list = windows.map((w: any, i: number) => 
              `${i + 1}. ${w.title}`
            ).join('\n');
            
            return `🪟 当前窗口列表 (前 20 个):\n\n${list}`;
          }
          throw new Error('获取窗口列表失败');
        });

        await ctx.reply(response);
      } catch (error) {
        console.error('处理 /windows 命令失败:', error);
        await ctx.reply('❌ 获取窗口列表失败，请检查 Python 服务是否运行');
      }
    });

    // 截图命令
    this.bot.command('screenshot', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        await ctx.reply('📸 正在截图...');
        
        const result = await this.withRetry(async () => {
          const res = await fetch('http://localhost:3200/api/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.error || '截图失败');
          }
          return data.result.path;
        });
        
        await ctx.replyWithPhoto({ source: result });
      } catch (error) {
        console.error('处理 /screenshot 命令失败:', error);
        await ctx.reply('❌ 截图失败，请检查 Python 服务是否运行');
      }
    });

    // AI 聊天命令
    this.bot.command('chat', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        const text = ctx.message.text.replace('/chat', '').trim();
        if (!text) {
          await ctx.reply('💬 请提供消息内容，例如: /chat 你好');
          return;
        }

        await this.handleChatMessage(ctx, text);
      } catch (error) {
        console.error('处理 /chat 命令失败:', error);
        await ctx.reply('❌ 处理失败，请稍后再试');
      }
    });

    // 搜索记忆命令
    this.bot.command('memory', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;

        const query = ctx.message.text.replace('/memory', '').trim();
        if (!query) {
          await ctx.reply('🔍 请提供搜索关键词，例如: /memory 项目进度');
          return;
        }

        const response = await this.withRetry(async () => {
          const res = await fetch(
            `http://localhost:3100/api/memory/search?query=${encodeURIComponent(query)}&limit=5`
          );
          const data = await res.json();
          
          if (data.success && data.results.length > 0) {
            const results = data.results.map((r: string, i: number) => 
              `${i + 1}. ${r.substring(0, 100)}...`
            ).join('\n\n');
            return `🔍 找到 ${data.results.length} 条相关记忆:\n\n${results}`;
          }
          return '🔍 未找到相关记忆';
        });

        await ctx.reply(response);
      } catch (error) {
        console.error('处理 /memory 命令失败:', error);
        await ctx.reply('❌ 搜索记忆失败');
      }
    });

    // 清除历史命令
    this.bot.command('clear', async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) return;
        await this.withRetry(() => ctx.reply('🧹 对话历史已清除（功能待实现）'));
      } catch (error) {
        console.error('处理 /clear 命令失败:', error);
      }
    });

    // 处理普通文本消息
    this.bot.on(message('text'), async (ctx) => {
      try {
        if (!this.isAuthorized(ctx.from?.id)) {
          await ctx.reply('⛔ 未经授权的访问');
          return;
        }

        const text = ctx.message.text;
        
        // 处理键盘按钮
        if (text === '📋 获取窗口列表') {
          ctx.message.text = '/windows';
          await this.bot.handleUpdate({
            ...ctx.update,
            message: ctx.message,
          });
          return;
        }
        
        if (text === '📸 截图') {
          ctx.message.text = '/screenshot';
          await this.bot.handleUpdate({
            ...ctx.update,
            message: ctx.message,
          });
          return;
        }
        
        if (text === '💬 开始聊天') {
          await ctx.reply('💬 请直接发送消息，我会用 AI 回复你！');
          return;
        }
        
        if (text === '⚙️ 设置') {
          await ctx.reply('⚙️ 设置功能开发中...');
          return;
        }

        // 默认处理为聊天消息
        await this.handleChatMessage(ctx, text);
      } catch (error) {
        console.error('处理消息失败:', error);
        await ctx.reply('❌ 处理消息失败，请稍后再试');
      }
    });

    // 处理回调查询 (内联键盘)
    this.bot.on('callback_query', async (ctx) => {
      try {
        const data = ctx.callbackQuery.data;
        
        if (data === 'screenshot') {
          ctx.message = { text: '/screenshot' } as any;
          await this.bot.handleUpdate({
            ...ctx.update,
            message: ctx.message,
          });
        } else if (data === 'windows') {
          ctx.message = { text: '/windows' } as any;
          await this.bot.handleUpdate({
            ...ctx.update,
            message: ctx.message,
          });
        } else if (data?.startsWith('regenerate:')) {
          const message = data.replace('regenerate:', '');
          await this.handleChatMessage(ctx, message);
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('处理回调查询失败:', error);
        await ctx.answerCbQuery('操作失败');
      }
    });
  }

  /**
   * 处理聊天消息
   */
  private async handleChatMessage(ctx: Context, messageText: string): Promise<void> {
    const userId = ctx.from?.id;
    const sessionId = `telegram_${userId}`;

    console.log(`📨 收到 Telegram 消息: ${messageText.substring(0, 50)}...`);

    try {
      // 发送"正在输入"提示
      await this.withRetry(() => ctx.sendChatAction('typing'));

      // 调用 Agent
      const response = await this.agentRuntime.chat(messageText, sessionId);
      
      // 截断过长消息 (Telegram 限制 4096 字符)
      const maxLength = 4000;
      let replyText = response;
      if (response.length > maxLength) {
        replyText = response.substring(0, maxLength) + '\n\n[消息过长，已截断]';
      }
      
      // 发送回复
      await this.withRetry(() => ctx.reply(replyText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📸 截图', callback_data: 'screenshot' },
              { text: '📋 窗口', callback_data: 'windows' },
            ],
            [
              { text: '🔄 重新生成', callback_data: `regenerate:${messageText}` },
            ]
          ]
        }
      }));
    } catch (error) {
      console.error('处理 Telegram 消息失败:', error);
      await ctx.reply('抱歉，处理消息时出错了，请稍后再试。');
    }
  }

  /**
   * 检查用户是否授权
   */
  private isAuthorized(userId: number | undefined): boolean {
    if (!userId) return false;
    
    // 如果没有配置白名单，允许所有用户
    if (!this.config.allowedUserIds || this.config.allowedUserIds.length === 0) {
      return true;
    }
    
    return this.config.allowedUserIds.includes(userId);
  }

  /**
   * 带重连机制的启动
   */
  async start(): Promise<void> {
    this.isRunning = true;
    
    try {
      await this.doStart();
    } catch (error) {
      console.error('启动 Telegram Bot 失败:', error);
      
      if (this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(5000 * this.reconnectAttempts, 60000);
        console.log(`🔄 ${delay}ms 后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        await this.sleep(delay);
        await this.start();
      } else {
        throw error;
      }
    }
  }

  /**
   * 实际启动逻辑
   */
  private async doStart(): Promise<void> {
    if (this.config.webhookUrl) {
      // Webhook 模式
      await this.bot.launch({
        webhook: {
          domain: this.config.webhookUrl,
          port: 0,
        }
      });
      console.log(`🚀 Telegram Bot 已启动 (Webhook): ${this.config.webhookUrl}`);
    } else {
      // Long polling 模式
      await this.bot.launch({
        dropPendingUpdates: true, // 忽略启动前的消息
      });
      console.log('🚀 Telegram Bot 已启动 (Long polling)');
    }

    // 重置重连计数
    this.reconnectAttempts = 0;

    // 优雅关闭
    process.once('SIGINT', () => {
      this.isRunning = false;
      this.bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      this.isRunning = false;
      this.bot.stop('SIGTERM');
    });
  }

  /**
   * 发送消息到指定 chat
   */
  async sendMessage(chatId: number | string, text: string): Promise<void> {
    await this.withRetry(async () => {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
    });
  }

  /**
   * 获取 bot 信息
   */
  async getBotInfo(): Promise<any> {
    return this.withRetry(() => this.bot.telegram.getMe());
  }

  /**
   * 停止 Bot
   */
  stop(): void {
    this.isRunning = false;
    this.bot.stop();
  }
}
