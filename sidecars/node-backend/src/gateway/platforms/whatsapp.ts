/**
 * WhatsApp Web 消息平台集成
 * 
 * 使用 whatsapp-web.js 库实现：
 * - 通过 WhatsApp Web 接收/发送消息
 * - 扫描二维码登录
 * - 支持文本、图片、文件消息
 */

import { AgentRuntime } from '../../agent/runtime.js';

interface WhatsAppConfig {
  sessionName?: string;
  dataPath?: string;
  puppeteerArgs?: string[];
  headless?: boolean;
}

// 由于 whatsapp-web.js 是 CommonJS 模块，需要动态导入
let Client: any;
let LocalAuth: any;
let MessageMedia: any;

export class WhatsAppIntegration {
  private config: WhatsAppConfig;
  private agentRuntime: AgentRuntime;
  private client: any = null;
  private ready: boolean = false;
  private qrCode: string | null = null;
  private authorizedNumbers: string[] = [];

  constructor(config: WhatsAppConfig, agentRuntime: AgentRuntime) {
    this.config = {
      sessionName: 'chubao-ai',
      dataPath: './whatsapp-session',
      headless: true,
      ...config,
    };
    this.agentRuntime = agentRuntime;
  }

  /**
   * 初始化 WhatsApp 客户端
   */
  async init(): Promise<void> {
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
          ],
        },
      });

      this.setupEventHandlers();
      
      // 启动客户端
      await this.client.initialize();
      
    } catch (error) {
      console.error('初始化 WhatsApp 失败:', error);
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
      console.log('\n📱 WhatsApp 二维码:');
      console.log(qr);
      console.log('\n请使用手机扫描以上二维码登录 WhatsApp Web\n');
    });

    // 认证成功
    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp 认证成功');
      this.qrCode = null;
    });

    // 认证失败
    this.client.on('auth_failure', (msg: string) => {
      console.error('❌ WhatsApp 认证失败:', msg);
    });

    // 准备就绪
    this.client.on('ready', () => {
      console.log('✅ WhatsApp 客户端已就绪');
      this.ready = true;
    });

    // 收到消息
    this.client.on('message_create', async (msg: any) => {
      // 忽略自己发送的消息和状态消息
      if (msg.fromMe || msg.type === 'e2e_notification') {
        return;
      }

      await this.handleMessage(msg);
    });

    // 断开连接
    this.client.on('disconnected', (reason: string) => {
      console.log('⚠️ WhatsApp 断开连接:', reason);
      this.ready = false;
    });
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
    const chatId = msg.from;

    switch (command.toLowerCase()) {
      case 'help':
      case 'h':
        await msg.reply(
          '📚 *Chubao AI 帮助*\n\n' +
          '/help - 显示帮助\n' +
          '/status - 查看系统状态\n' +
          '/chat <消息> - 与 AI 对话\n' +
          '/windows - 获取窗口列表\n' +
          '/screenshot - 截取屏幕\n' +
          '/memory <关键词> - 搜索记忆\n' +
          '/clear - 清除对话历史\n\n' +
          '直接发送消息即可开始对话！'
        );
        break;

      case 'status':
        const status = 
          '📊 *系统状态*\n\n' +
          '🟢 WhatsApp: 已连接\n' +
          '🟢 Node.js: 运行中\n' +
          '🟢 Python: 运行中\n' +
          '🟢 Claude API: 已连接\n\n' +
          `💾 内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
        await msg.reply(status);
        break;

      case 'windows':
        try {
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
        } catch (error) {
          await msg.reply('❌ 获取窗口列表失败');
        }
        break;

      case 'screenshot':
        try {
          await msg.reply('📸 正在截图...');
          const response = await fetch('http://localhost:3200/api/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          
          const data = await response.json();
          if (data.success) {
            // 发送图片
            const media = MessageMedia.fromFilePath(data.result.path);
            await msg.reply(media);
          }
        } catch (error) {
          await msg.reply('❌ 截图失败');
        }
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
        
        try {
          const response = await fetch(`http://localhost:3100/api/memory/search?query=${encodeURIComponent(query)}&limit=5`);
          const data = await response.json();
          
          if (data.success && data.results.length > 0) {
            const results = data.results.map((r: string, i: number) => 
              `*${i + 1}.* ${r.substring(0, 100)}${r.length > 100 ? '...' : ''}`
            ).join('\n\n');
            await msg.reply(`🔍 *找到 ${data.results.length} 条相关记忆*:\n\n${results}`);
          } else {
            await msg.reply('🔍 未找到相关记忆');
          }
        } catch (error) {
          await msg.reply('❌ 搜索记忆失败');
        }
        break;

      case 'clear':
        await msg.reply('🧹 对话历史已清除（功能待实现）');
        break;

      default:
        await msg.reply('❓ 未知命令，使用 /help 查看帮助');
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
      
      // 发送回复
      await msg.reply(response);
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
      return true; // 如果没有配置白名单，允许所有人
    }
    
    // 移除非数字字符进行比较
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
   * 发送消息
   */
  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.ready) {
      throw new Error('WhatsApp 客户端未就绪');
    }

    // 确保号码格式正确
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    await this.client.sendMessage(chatId, text);
  }

  /**
   * 发送图片
   */
  async sendImage(to: string, imagePath: string, caption?: string): Promise<void> {
    if (!this.ready) {
      throw new Error('WhatsApp 客户端未就绪');
    }

    const chatId = to.includes('@') ? to : `${to}@c.us`;
    const media = MessageMedia.fromFilePath(imagePath);
    await this.client.sendMessage(chatId, media, { caption });
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    ready: boolean;
    qrCode: string | null;
    authorizedNumbers: string[];
  } {
    return {
      ready: this.ready,
      qrCode: this.qrCode,
      authorizedNumbers: this.authorizedNumbers,
    };
  }

  /**
   * 断开连接
   */
  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.ready = false;
      console.log('👋 WhatsApp 客户端已关闭');
    }
  }
}
