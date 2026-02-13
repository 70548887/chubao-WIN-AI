/**
 * 飞书 (Lark) 消息平台集成
 * 
 * 使用 Lark OpenAPI 实现：
 * - 接收消息 (Webhook/Event)
 * - 发送消息 (IM API)
 * - 消息卡片交互
 * 
 * 边界情况处理:
 * - 网络错误自动重试 (指数退避)
 * - Token 刷新失败恢复
 * - 消息发送失败重试
 * - API 限流处理
 * - 连接超时处理
 */

import { AgentRuntime } from '../../agent/runtime.js';
import express from 'express';
import crypto from 'crypto';

interface LarkConfig {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  maxRetries?: number;
  retryDelay?: number;
}

interface LarkMessage {
  message_id: string;
  chat_id: string;
  chat_type: string;
  sender: {
    sender_id: {
      open_id: string;
    };
    sender_type: string;
  };
  content: string;
  msg_type: string;
  create_time: string;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export class LarkIntegration {
  private config: Required<LarkConfig>;
  private agentRuntime: AgentRuntime;
  private tenantAccessToken: string | null = null;
  private tokenExpireTime: number = 0;
  private messageQueue: Map<string, any[]> = new Map();
  private isProcessingQueue: boolean = false;

  constructor(config: LarkConfig, agentRuntime: AgentRuntime) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    } as Required<LarkConfig>;
    this.agentRuntime = agentRuntime;
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
        
        // 判断是否应该重试
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // 计算退避延迟 (指数退避 + 抖动)
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelay
        );

        console.log(`⚠️ 操作失败 (${attempt + 1}/${maxRetries}), ${delay}ms 后重试:`,
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
        error.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP 错误码
    if (error.status) {
      // 5xx 服务器错误应该重试
      if (error.status >= 500 && error.status < 600) {
        return true;
      }
      // 429 限流应该重试
      if (error.status === 429) {
        return true;
      }
    }

    // Lark API 特定错误码
    if (error.code !== undefined) {
      // token 过期或无效，应该刷新后重试
      if (error.code === 99991663 || // token 过期
          error.code === 99991664 || // token 无效
          error.code === 99991661) { // 需要刷新 token
        return true;
      }
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
   * 获取 Tenant Access Token
   * 带缓存和自动刷新
   */
  private async getTenantAccessToken(): Promise<string> {
    // 如果 token 未过期，直接返回
    if (this.tenantAccessToken && Date.now() < this.tokenExpireTime) {
      return this.tenantAccessToken;
    }

    // 重新获取 token
    const token = await this.withRetry(async () => {
      const response = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: this.config.appId,
            app_secret: this.config.appSecret,
          }),
        }
      );

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      if (data.code !== 0) {
        const error = new Error(`获取 Lark token 失败: ${data.msg} (code: ${data.code})`);
        (error as any).code = data.code;
        throw error;
      }

      return data;
    }, {
      maxRetries: 5,  // token 获取更激进的重试
      baseDelay: 2000,
    });

    this.tenantAccessToken = token.tenant_access_token;
    this.tokenExpireTime = Date.now() + (token.expire - 300) * 1000; // 提前 5 分钟过期
    
    if (!this.tenantAccessToken) {
      throw new Error('获取 Lark token 失败: 返回的 token 为空');
    }
    
    console.log('✅ Lark Token 刷新成功');
    return this.tenantAccessToken;
  }

  /**
   * 刷新 Token (强制)
   */
  private async refreshToken(): Promise<void> {
    this.tenantAccessToken = null;
    this.tokenExpireTime = 0;
    await this.getTenantAccessToken();
  }

  /**
   * 验证 Lark Webhook 签名
   */
  verifySignature(timestamp: string, nonce: string, body: string, signature: string): boolean {
    if (!this.config.encryptKey) {
      return true; // 如果没有配置密钥，跳过验证
    }

    try {
      const encryptKey = Buffer.from(this.config.encryptKey, 'base64');
      const content = `${timestamp}${nonce}${encryptKey}${body}`;
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      
      return hash === signature;
    } catch (error) {
      console.error('验证 Lark 签名失败:', error);
      return false;
    }
  }

  /**
   * 解密 Lark 消息
   */
  decryptMessage(encrypt: string): string {
    if (!this.config.encryptKey) {
      return Buffer.from(encrypt, 'base64').toString('utf8');
    }

    try {
      const encryptKey = Buffer.from(this.config.encryptKey, 'base64');
      const encrypted = Buffer.from(encrypt, 'base64');
      
      // 使用 AES-256-CBC 解密
      const iv = encrypted.slice(0, 16);
      const cipher = encrypted.slice(16);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', encryptKey, iv);
      let decrypted = decipher.update(cipher);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('解密 Lark 消息失败:', error);
      throw new Error('解密消息失败');
    }
  }

  /**
   * 处理 Lark 事件回调
   */
  async handleEvent(body: any): Promise<any> {
    try {
      // 处理 URL 验证挑战
      if (body.type === 'url_verification') {
        return {
          challenge: body.challenge,
        };
      }

      // 处理消息事件
      if (body.header?.event_type === 'im.message.receive_v1') {
        // 使用队列异步处理消息，避免阻塞 webhook 响应
        this.queueMessage(body.event);
      }

      return { status: 'ok' };
    } catch (error) {
      console.error('处理 Lark 事件失败:', error);
      // 即使处理失败也返回 ok，避免飞书重试
      return { status: 'ok' };
    }
  }

  /**
   * 消息队列处理
   */
  private queueMessage(event: any): void {
    const chatId = event.message?.chat_id;
    if (!chatId) return;

    if (!this.messageQueue.has(chatId)) {
      this.messageQueue.set(chatId, []);
    }

    this.messageQueue.get(chatId)!.push(event);

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * 处理消息队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.messageQueue.size > 0) {
      for (const [chatId, events] of this.messageQueue.entries()) {
        if (events.length === 0) {
          this.messageQueue.delete(chatId);
          continue;
        }

        const event = events.shift()!;
        try {
          await this.handleMessage(event);
        } catch (error) {
          console.error(`处理 Lark 消息失败 (chat: ${chatId}):`, error);
        }

        // 添加小延迟避免 API 限流
        await this.sleep(100);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(event: any): Promise<void> {
    const message: LarkMessage = event.message;
    const sender = event.sender;

    // 忽略自己发送的消息
    if (sender.sender_type === 'bot') {
      return;
    }

    // 解析消息内容
    let content: string;
    try {
      switch (message.msg_type) {
        case 'text':
          const parsed = JSON.parse(message.content);
          content = parsed.text || '';
          break;
        case 'post':
          // 富文本消息，简化处理
          content = '[富文本消息]';
          break;
        case 'image':
          content = '[图片]';
          break;
        default:
          content = `[${message.msg_type} 消息]`;
      }
    } catch {
      content = message.content;
    }

    if (!content.trim()) {
      console.log('⚠️ 收到空消息，忽略');
      return;
    }

    console.log(`📨 收到 Lark 消息: ${content.substring(0, 50)}...`);

    // 构建上下文
    const sessionId = `lark_${sender.sender_id.open_id}`;
    
    // 调用 Agent 处理消息
    try {
      const response = await this.agentRuntime.chat(content, sessionId);
      
      // 截断过长回复
      const maxLength = 4000; // 飞书消息长度限制
      const truncatedResponse = response.length > maxLength 
        ? response.substring(0, maxLength) + '\n\n[消息过长，已截断]'
        : response;
      
      // 回复消息
      await this.sendMessage(message.chat_id, truncatedResponse, 'text');
    } catch (error) {
      console.error('处理 Lark 消息失败:', error);
      await this.sendMessage(
        message.chat_id, 
        '抱歉，处理消息时出错了，请稍后再试。',
        'text'
      );
    }
  }

  /**
   * 发送消息到 Lark
   * 带重试机制
   */
  async sendMessage(
    chatId: string, 
    content: string, 
    msgType: string = 'text'
  ): Promise<void> {
    await this.withRetry(async () => {
      const token = await this.getTenantAccessToken();

      let messageContent: any;
      
      switch (msgType) {
        case 'text':
          messageContent = { text: content };
          break;
        case 'markdown':
          messageContent = { content };
          break;
        default:
          messageContent = { text: content };
      }

      const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: msgType,
          content: JSON.stringify(messageContent),
        }),
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        // Token 过期，刷新后重试
        if (data.code === 99991663 || data.code === 99991664) {
          await this.refreshToken();
          throw new Error(`Token 过期，已刷新: ${data.msg}`);
        }
        
        const error = new Error(`发送 Lark 消息失败: ${data.msg} (code: ${data.code})`);
        (error as any).code = data.code;
        throw error;
      }

      console.log(`📤 已发送 Lark 消息到: ${chatId}`);
    }, {
      maxRetries: 3,
      baseDelay: 1000,
    });
  }

  /**
   * 获取 Router 用于 Express 集成
   */
  getRouter(): express.Router {
    const router = express.Router();

    // Lark Webhook 回调
    router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
      try {
        const timestamp = req.headers['x-lark-request-timestamp'] as string;
        const nonce = req.headers['x-lark-request-nonce'] as string;
        const signature = req.headers['x-lark-signature'] as string;
        const body = req.body.toString('utf8');

        // 验证签名
        if (!this.verifySignature(timestamp, nonce, body, signature)) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }

        // 解析消息
        const event = JSON.parse(body);
        
        // 处理事件 (异步，快速返回)
        this.handleEvent(event).catch(error => {
          console.error('处理 Lark 事件失败:', error);
        });

        // 立即返回成功，避免飞书重试
        res.json({ status: 'ok' });
      } catch (error) {
        console.error('处理 Lark webhook 失败:', error);
        // 即使失败也返回 200，避免飞书重试
        res.json({ status: 'ok' });
      }
    });

    // 健康检查
    router.get('/health', async (req, res) => {
      try {
        await this.getTenantAccessToken();
        res.json({ status: 'ok', platform: 'lark' });
      } catch (error) {
        res.status(503).json({ 
          status: 'error', 
          platform: 'lark',
          error: (error as Error).message 
        });
      }
    });

    return router;
  }

  /**
   * 获取 bot 信息
   */
  async getBotInfo(): Promise<any> {
    return this.withRetry(async () => {
      const token = await this.getTenantAccessToken();
      
      const response = await fetch('https://open.feishu.cn/open-apis/bot/v3/info', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    });
  }
}
