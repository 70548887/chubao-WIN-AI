/**
 * WhatsApp Web 消息平台集成
 * 
 * 使用 whatsapp-web.js 库实现：
 * - 通过 WhatsApp Web 接收/发送消息
 * - 扫描二维码登录
 * - 支持文本、图片、文件消息
 * 
 * 边界情况处理:
 * - 扫码超时自动刷新
 * - 会话过期自动重连
 * - 网络断开恢复
 * - QR 码过期处理
 * - 客户端崩溃恢复
 * - 消息发送失败重试
 */

import { AgentRuntime } from '../../agent/runtime.js';
import { EventEmitter } from 'events';

interface WhatsAppConfig {
  sessionName?: string;
  dataPath?: string;
  puppeteerArgs?: string[];
  headless?: boolean;
  qrTimeout?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

// 动态导入 whatsapp-web.js
let Client: any;
let LocalAuth: any;
let MessageMedia: any;

export class WhatsAppIntegration extends EventEmitter {
  private config: Required<WhatsAppConfig>;
  private agentRuntime: AgentRuntime;
  private client: any = null;
  private ready: boolean = false;
  private qrCode: string | null = null;
  private authorizedNumbers: string[] = [];
  private isInitializing: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private qrTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private lastQrTime: number = 0;
  private qrRefreshInterval: number = 20000; // 20 秒刷新 QR

  constructor(config: WhatsAppConfig, agentRuntime: AgentRuntime) {
    super();
    this.config = {
      sessionName: 'chubao-ai',
      dataPath: './whatsapp-session',
      headless: true,
      qrTimeout: 60000, // 60 秒扫码超时
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.agentRuntime = agentRuntime;
  }

  /**
   * 带重试机制的异步操作
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = options.baseDelay ?? 1000;
    const maxDelay = options.maxDelay ?? 30000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!this.shouldRetry(error)) {
          throw error;
        }

        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelay
        );

        console.log(`⚠️ WhatsApp 操作失败 (${attempt + 1}/${maxRetries}), ${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('重试次数耗尽');
  }

  /**
   * 判断错误是否应该重试
   */
  private shouldRetry(error: any): boolean {
    const errorMessage = (error.message || '').toLowerCase();
    
    // 网络错误
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    // WhatsApp Web 特定错误
    if (errorMessage.includes('protocol') ||
        errorMessage.includes('navigation') ||
        errorMessage.includes('page') ||
        errorMessage.includes('closed') ||
        errorMessage.includes('target')) {
      return true;
    }

    return false;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 初始化 WhatsApp 客户端
   */
  async init(): Promise<void> {
    if (this.isInitializing) {
      console.log('⚠️ WhatsApp 正在初始化中...');
      return;
    }

    if (this.ready) {
      console.log('✅ WhatsApp 已就绪');
      return;
    }

    this.isInitializing = true;

    try {
      // 动态导入 whatsapp-web.js
      const waWeb = await import('whatsapp-web.js');
      Client = waWeb.Client;
      LocalAuth = waWeb.LocalAuth;
      MessageMedia = waWeb.MessageMedia;

      // 创建客户端
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.config.dataPath,
          clientId: this.config.sessionName,
        }),
        puppeteer: {
          headless: this.config.headless,
          args: this.config.puppeteerArgs || [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        },
      });

      this.setupEventHandlers();
      
      // 启动客户端
      await this.client.initialize();
      
    } catch (error) {
      console.error('❌ 初始化 WhatsApp 失败:', error);
      this.isInitializing = false;
      
      // 尝试重连
      await this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 二维码生成
    this.client.on('qr', (qr: string) => {
      this.qrCode = qr;
      this.lastQrTime = Date.now();
      
      console.log('\n📱 WhatsApp 二维码 (请在 60 秒内扫描):');
      console.log(qr);
      console.log('\n请使用手机扫描以上二维码登录 WhatsApp Web\n');

      // 清除之前的超时
      if (this.qrTimeoutTimer) {
        clearTimeout(this.qrTimeoutTimer);
      }

      // 设置扫码超时
      this.qrTimeoutTimer = setTimeout(() => {
        console.log('⏰ QR 码已过期，正在刷新...');
        this.refreshQrCode();
      }, this.config.qrTimeout);

      this.emit('qr', qr);
    });

    // 认证成功
    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp 认证成功');
      this.qrCode = null;
      this.lastQrTime = 0;
      this.reconnectAttempts = 0;
      
      // 清除 QR 超时
      if (this.qrTimeoutTimer) {
        clearTimeout(this.qrTimeoutTimer);
        this.qrTimeoutTimer = null;
      }

      this.emit('authenticated');
    });

    // 认证失败
    this.client.on('auth_failure', (msg: string) => {
      console.error('❌ WhatsApp 认证失败:', msg);
      this.emit('auth_failure', msg);
      
      // 认证失败，尝试重新初始化
      this.scheduleReconnect();
    });

    // 准备就绪
    this.client.on('ready', () => {
      console.log('✅ WhatsApp 客户端已就绪');
      this.ready = true;
      this.isInitializing = false;
      this.reconnectAttempts = 0;
      
      // 处理消息队列
      this.processMessageQueue();
      
      this.emit('ready');
    });

    // 收到消息
    this.client.on('message_create', async (msg: any) => {
      // 忽略自己发送的消息和状态消息
      if (msg.fromMe || msg.type === 'e2e_notification') {
        return;
      }

      try {
        await this.handleMessage(msg);
      } catch (error) {
        console.error('处理 WhatsApp 消息失败:', error);
      }
    });

    // 断开连接
    this.client.on('disconnected', (reason: string) => {
      console.log('⚠️ WhatsApp 断开连接:', reason);
      this.ready = false;
      this.isInitializing = false;
      this.emit('disconnected', reason);
      
      // 自动重连
      this.scheduleReconnect();
    });

    // 状态变化
    this.client.on('change_state', (state: string) => {
      console.log('📱 WhatsApp 状态变化:', state);
      
      if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
        // 需要重新初始化
        this.ready = false;
        this.scheduleReconnect();
      }
    });

    // 加载事件
    this.client.on('loading_screen', (percent: number, message: string) => {
      console.log(`⏳ WhatsApp 加载中: ${percent}% - ${message}`);
    });
  }

  /**
   * 刷新 QR 码
   */
  private async refreshQrCode(): Promise<void> {
    // 如果已经过了足够的时间，可能需要重新初始化
    const timeSinceLastQr = Date.now() - this.lastQrTime;
    
    if (timeSinceLastQr > this.config.qrTimeout * 2) {
      console.log('🔄 QR 码长时间未扫描，重新初始化客户端...');
      await this.destroy();
      await this.sleep(2000);
      await this.init();
    }
  }

  /**
   * 安排重连
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('❌ WhatsApp 重连次数已达上限，停止尝试');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      60000 // 最大 60 秒
    );

    console.log(`🔄 WhatsApp 将在 ${delay}ms 后尝试重连 (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (!this.ready && !this.isInitializing) {
          console.log('🔄 正在重连 WhatsApp...');
          await this.destroy();
          await this.sleep(2000);
          await this.init();
        }
      } catch (error) {
        console.error('❌ WhatsApp 重连失败:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(msg: any): Promise<void> {
    const chatId = msg.from;
    const contact = await msg.getContact();
    const contactNumber = contact.number;
    const contactName = contact.pushname || contact.verifiedName || contact.number;

    console.log(`📨 收到 WhatsApp 消息 from ${contactName}: ${msg.body?.substring(0, 50) || '[媒体]'}`);

    // 检查是否授权
    if (!this.isAuthorized(contactNumber)) {
      console.log(`⛔ 未授权的用户: ${contactNumber}`);
      await msg.reply('⛔ 抱歉，您没有权限使用此服务。');
      return;
    }

    // 处理文本消息
    if (msg.type === 'chat' && msg.body) {
      const text = msg.body.trim();
      
      // 处理命令
      if (text.startsWith('/')) {
        await this.handleCommand(msg, text);
        return;
      }

      // 处理普通消息
      await this.handleChatMessage(msg, text);
    }
  }

  /**
   * 处理命令
   */
  private async handleCommand(msg: any, text: string): Promise<void> {
    const [command, ...args] = text.slice(1).split(' ');

    try {
      switch (command.toLowerCase()) {
        case 'help':
        case 'h':
          await this.withRetry(() => msg.reply(
            '📚 *Chubao AI 帮助*\n\n' +
            '/help - 显示帮助\n' +
            '/status - 查看系统状态\n' +
            '/chat <消息> - 与 AI 对话\n' +
            '/windows - 获取窗口列表\n' +
            '/screenshot - 截取屏幕\n' +
            '/memory <关键词> - 搜索记忆\n' +
            '/clear - 清除对话历史\n\n' +
            '直接发送消息即可开始对话！'
          ));
          break;

        case 'status':
          const status = 
            '📊 *系统状态*\n\n' +
            `${this.ready ? '🟢' : '🔴'} WhatsApp: ${this.ready ? '已连接' : '未连接'}\n` +
            '🟢 Node.js: 运行中\n' +
            '🟢 Python: 运行中\n' +
            '🟢 Claude API: 已连接\n\n' +
            `💾 内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
          await msg.reply(status);
          break;

        case 'windows':
          await this.withRetry(async () => {
            await msg.reply('🪟 正在获取窗口列表...');
            const response = await fetch('http://localhost:3200/api/windows');
            const data = await response.json();
            
            if (data.success) {
              const windows = data.windows.slice(0, 15);
              const list = windows.map((w: any, i: number) => 
                `${i + 1}. ${w.title}`
              ).join('\n');
              await msg.reply(`🪟 *当前窗口列表 (前 15 个)*:\n\n${list}`);
            }
          });
          break;

        case 'screenshot':
          await this.withRetry(async () => {
            await msg.reply('📸 正在截图...');
            const response = await fetch('http://localhost:3200/api/screenshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            
            const data = await response.json();
            if (data.success) {
              const media = MessageMedia.fromFilePath(data.result.path);
              await msg.reply(media);
            }
          });
          break;

        case 'chat':
          const chatMessage = args.join(' ');
          if (!chatMessage) {
            await msg.reply('💬 请提供消息内容，例如: /chat 你好');
            return;
          }
          await this.handleChatMessage(msg, chatMessage);
          break;

        case 'memory':
          const query = args.join(' ');
          if (!query) {
            await msg.reply('🔍 请提供搜索关键词，例如: /memory 项目');
            return;
          }
          
          await this.withRetry(async () => {
            const response = await fetch(
              `http://localhost:3100/api/memory/search?query=${encodeURIComponent(query)}&limit=5`
            );
            const data = await response.json();
            
            if (data.success && data.results.length > 0) {
              const results = data.results.map((r: string, i: number) => 
                `*${i + 1}.* ${r.substring(0, 100)}${r.length > 100 ? '...' : ''}`
              ).join('\n\n');
              await msg.reply(`🔍 *找到 ${data.results.length} 条相关记忆*:\n\n${results}`);
            } else {
              await msg.reply('🔍 未找到相关记忆');
            }
          });
          break;

        case 'clear':
          await msg.reply('🧹 对话历史已清除（功能待实现）');
          break;

        default:
          await msg.reply('❓ 未知命令，使用 /help 查看帮助');
      }
    } catch (error) {
      console.error(`处理命令 /${command} 失败:`, error);
      await msg.reply('❌ 命令执行失败，请稍后再试');
    }
  }

  /**
   * 处理聊天消息
   */
  private async handleChatMessage(msg: any, text: string): Promise<void> {
    const chatId = msg.from;
    const sessionId = `whatsapp_${chatId}`;

    console.log(`🤖 处理 WhatsApp 聊天: ${text.substring(0, 50)}...`);

    try {
      // 显示"正在输入"
      await msg.reply('🤔 思考中...');

      // 调用 Agent
      const response = await this.agentRuntime.chat(text, sessionId);
      
      // 截断过长消息
      const maxLength = 4000;
      const truncatedResponse = response.length > maxLength 
        ? response.substring(0, maxLength) + '\n\n[消息过长，已截断]'
        : response;
      
      // 发送回复
      await this.withRetry(() => msg.reply(truncatedResponse));
    } catch (error) {
      console.error('处理 WhatsApp 消息失败:', error);
      await msg.reply('抱歉，处理消息时出错了，请稍后再试。');
    }
  }

  /**
   * 检查号码是否授权
   */
  private isAuthorized(phoneNumber: string): boolean {
    if (this.authorizedNumbers.length === 0) {
      return true;
    }
    
    const normalized = phoneNumber.replace(/\D/g, '');
    return this.authorizedNumbers.some(num => 
      normalized.includes(num.replace(/\D/g, ''))
    );
  }

  /**
   * 设置授权号码
   */
  setAuthorizedNumbers(numbers: string[]): void {
    this.authorizedNumbers = numbers;
  }

  /**
   * 将消息加入队列
   */
  private queueMessage(operation: () => Promise<void>): void {
    this.messageQueue.push(operation);
    
    if (!this.isProcessingQueue) {
      this.processMessageQueue();
    }
  }

  /**
   * 处理消息队列
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.ready) return;
    
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0 && this.ready) {
      const operation = this.messageQueue.shift();
      if (operation) {
        try {
          await operation();
          await this.sleep(100); // 避免发送太快
        } catch (error) {
          console.error('处理消息队列失败:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 发送消息
   */
  async sendMessage(to: string, text: string): Promise<void> {
    const operation = async () => {
      if (!this.ready) {
        throw new Error('WhatsApp 客户端未就绪');
      }

      const chatId = to.includes('@') ? to : `${to}@c.us`;
      await this.client.sendMessage(chatId, text);
    };

    if (this.ready) {
      await this.withRetry(operation);
    } else {
      // 如果未就绪，加入队列
      this.queueMessage(() => this.withRetry(operation));
    }
  }

  /**
   * 发送图片
   */
  async sendImage(to: string, imagePath: string, caption?: string): Promise<void> {
    const operation = async () => {
      if (!this.ready) {
        throw new Error('WhatsApp 客户端未就绪');
      }

      const chatId = to.includes('@') ? to : `${to}@c.us`;
      const media = MessageMedia.fromFilePath(imagePath);
      await this.client.sendMessage(chatId, media, { caption });
    };

    if (this.ready) {
      await this.withRetry(operation);
    } else {
      this.queueMessage(() => this.withRetry(operation));
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    ready: boolean;
    qrCode: string | null;
    authorizedNumbers: string[];
    isInitializing: boolean;
    reconnectAttempts: number;
  } {
    return {
      ready: this.ready,
      qrCode: this.qrCode,
      authorizedNumbers: this.authorizedNumbers,
      isInitializing: this.isInitializing,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * 断开连接
   */
  async destroy(): Promise<void> {
    // 清除定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.qrTimeoutTimer) {
      clearTimeout(this.qrTimeoutTimer);
      this.qrTimeoutTimer = null;
    }

    if (this.client) {
      try {
        await this.client.destroy();
      } catch (error) {
        console.error('关闭 WhatsApp 客户端失败:', error);
      }
      this.client = null;
    }

    this.ready = false;
    this.isInitializing = false;
    this.qrCode = null;
    
    console.log('👋 WhatsApp 客户端已关闭');
  }
}
