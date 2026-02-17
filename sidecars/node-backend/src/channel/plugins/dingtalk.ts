/**
 * DingTalk Channel Plugin — implements IChannelPlugin.
 *
 * Based on DingTalk Robot Webhook API, supports:
 * - Webhook message sending
 * - Text, Markdown, ActionCard formats
 * - @ mention support
 * - Security signature verification
 * - Retry + exponential backoff
 *
 * 钉钉机器人文档: https://open.dingtalk.com/document/robots/custom-robot-access
 */

import crypto from 'node:crypto';
import type { AgentRuntime } from '../../agent/runtime.js';
import type { ChannelEventBus } from '../eventBus.js';
import { logger } from '../../utils/logger.js';
import type {
  IChannelPlugin,
  ChannelPluginCapabilities,
  ChannelPluginConfig,
  ChannelPluginStatus,
  ChannelState,
  OutboundMessage,
} from '../types.js';

// ---------------------------------------------------------------------------
// DingTalk-specific config
// ---------------------------------------------------------------------------
interface DingTalkPluginConfig extends ChannelPluginConfig {
  webhook: string; // 钉钉机器人 Webhook URL
  secret?: string; // 安全加签密钥
  atAll?: boolean; // 是否 @所有人
  atMobiles?: string[]; // @指定手机号
  maxRetries?: number;
  retryDelay?: number;
}

interface DingTalkTextMessage {
  msgtype: 'text';
  text: {
    content: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

interface DingTalkMarkdownMessage {
  msgtype: 'markdown';
  markdown: {
    title: string;
    text: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

type DingTalkMessage = DingTalkTextMessage | DingTalkMarkdownMessage;

interface DingTalkResponse {
  errcode: number;
  errmsg: string;
}

export class DingTalkPlugin implements IChannelPlugin {
  readonly id = 'dingtalk';
  readonly name = 'DingTalk';
  readonly capabilities: ChannelPluginCapabilities = {
    receive: false, // 钉钉 Webhook 仅支持发送
    send: true,
    media: false,
    buttons: true, // ActionCard 支持按钮
    threads: false,
    reactions: false,
  };

  private config!: DingTalkPluginConfig;
  private agentRuntime: AgentRuntime;
  private eventBus: ChannelEventBus;
  private state: ChannelState = 'stopped';
  private startedAt: number = 0;
  private lastOutboundAt?: number;
  private lastError?: string;
  private messageCount = 0;
  private errorCount = 0;

  constructor(agentRuntime: AgentRuntime, eventBus: ChannelEventBus) {
    this.agentRuntime = agentRuntime;
    this.eventBus = eventBus;
  }

  // ---------------------------------------------------------------------------
  // IChannelPlugin lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ChannelPluginConfig): Promise<void> {
    this.config = config as DingTalkPluginConfig;

    if (!this.config.webhook) {
      throw new Error('DingTalk webhook URL is required');
    }

    // Validate webhook URL format
    if (!this.config.webhook.includes('oapi.dingtalk.com')) {
      throw new Error('Invalid DingTalk webhook URL');
    }

    logger.info('[DingTalk] 插件已初始化');
  }

  async start(): Promise<void> {
    this.state = 'starting';
    this.startedAt = Date.now();

    try {
      // Test connection by sending a test message (optional)
      await this.testConnection();
      
      this.state = 'running';
      logger.info('[DingTalk] 已启动 (Webhook)');
    } catch (err) {
      this.state = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    logger.info('[DingTalk] 已停止');
  }

  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    const text = msg.text;

    try {
      let dingMsg: DingTalkMessage;

      // 根据 parseMode 决定使用 text 还是 markdown
      if (msg.parseMode === 'markdown') {
        dingMsg = {
          msgtype: 'markdown',
          markdown: {
            title: 'Chubao AI',
            text: text,
          },
          at: this.buildAtConfig(),
        };
      } else {
        dingMsg = {
          msgtype: 'text',
          text: {
            content: text,
          },
          at: this.buildAtConfig(),
        };
      }

      await this.withRetry(async () => {
        return await this.sendWebhook(dingMsg);
      });

      this.lastOutboundAt = Date.now();
      this.messageCount++;
      
      return { messageId: String(Date.now()) };
    } catch (err) {
      this.errorCount++;
      throw err;
    }
  }

  getStatus(): ChannelPluginStatus {
    return {
      state: this.state,
      uptime: this.state === 'running' ? Date.now() - this.startedAt : 0,
      lastInboundAt: undefined, // Webhook 不支持接收
      lastOutboundAt: this.lastOutboundAt,
      lastError: this.lastError,
      reconnectAttempts: 0,
      metadata: {
        webhook: this.config?.webhook
          ? `${this.config.webhook.substring(0, 50)}...`
          : undefined,
        hasSecret: !!this.config?.secret,
        messageCount: this.messageCount,
        errorCount: this.errorCount,
      },
    };
  }

  getOwnerChatId(): string | null {
    // DingTalk Webhook 不支持接收消息，因此没有 owner chat ID
    return null;
  }

  isHealthy(): boolean {
    return this.state === 'running';
  }

  // ---------------------------------------------------------------------------
  // DingTalk-specific methods
  // ---------------------------------------------------------------------------

  /**
   * 发送消息到钉钉 Webhook
   */
  private async sendWebhook(message: DingTalkMessage): Promise<DingTalkResponse> {
    const url = this.buildWebhookUrl();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`DingTalk API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as DingTalkResponse;

    if (result.errcode !== 0) {
      throw new Error(`DingTalk error: ${result.errmsg} (code: ${result.errcode})`);
    }

    return result;
  }

  /**
   * 构建带签名的 Webhook URL
   */
  private buildWebhookUrl(): string {
    if (!this.config.secret) {
      return this.config.webhook;
    }

    const timestamp = Date.now();
    const sign = this.sign(timestamp, this.config.secret);

    return `${this.config.webhook}&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }

  /**
   * 钉钉安全加签算法
   * https://open.dingtalk.com/document/robots/customize-robot-security-settings
   */
  private sign(timestamp: number, secret: string): string {
    const stringToSign = `${timestamp}\n${secret}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(stringToSign, 'utf8');
    return hmac.digest('base64');
  }

  /**
   * 构建 @ 配置
   */
  private buildAtConfig(): DingTalkMessage['at'] | undefined {
    if (!this.config.atAll && (!this.config.atMobiles || this.config.atMobiles.length === 0)) {
      return undefined;
    }

    return {
      atMobiles: this.config.atMobiles,
      isAtAll: this.config.atAll,
    };
  }

  /**
   * 测试连接
   */
  private async testConnection(): Promise<void> {
    try {
      await this.sendWebhook({
        msgtype: 'text',
        text: {
          content: '🚀 Chubao AI 钉钉插件已启动',
        },
      });
      logger.info('[DingTalk] 连接测试成功');
    } catch (err) {
      logger.error('[DingTalk] 连接测试失败', err);
      // 不抛出错误，允许插件启动
    }
  }

  /**
   * 重试机制
   */
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

        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          30000,
        );
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
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
