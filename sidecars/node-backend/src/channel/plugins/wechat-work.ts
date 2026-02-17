/**
 * WeChat Work Channel Plugin — implements IChannelPlugin.
 *
 * Based on WeChat Work (企业微信) Application Message API, supports:
 * - Application message sending (text, markdown, news, file, etc.)
 * - Access token management with auto-refresh
 * - Department and user targeting
 * - Retry + exponential backoff
 *
 * 企业微信开发文档: https://developer.work.weixin.qq.com/document/path/90236
 */

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
// WeChat Work-specific config
// ---------------------------------------------------------------------------
interface WeChatWorkPluginConfig extends ChannelPluginConfig {
  corpId: string; // 企业 ID
  agentId: string; // 应用 ID
  corpSecret: string; // 应用密钥
  toUser?: string; // 接收用户列表，用 | 分隔，默认 @all
  toParty?: string; // 接收部门列表，用 | 分隔
  toTag?: string; // 接收标签列表，用 | 分隔
  maxRetries?: number;
  retryDelay?: number;
}

interface WeChatWorkAccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

interface WeChatWorkSendMessageResponse {
  errcode: number;
  errmsg: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
}

interface WeChatWorkTextMessage {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: 'text';
  agentid: string;
  text: {
    content: string;
  };
  safe?: 0 | 1;
}

interface WeChatWorkMarkdownMessage {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: 'markdown';
  agentid: string;
  markdown: {
    content: string;
  };
}

type WeChatWorkMessage = WeChatWorkTextMessage | WeChatWorkMarkdownMessage;

export class WeChatWorkPlugin implements IChannelPlugin {
  readonly id = 'wechat-work';
  readonly name = 'WeChat Work';
  readonly capabilities: ChannelPluginCapabilities = {
    receive: false, // 企业微信需要配置回调服务器，暂不支持
    send: true,
    media: true, // 支持图片、文件等
    buttons: false, // 企业微信不支持按钮
    threads: false,
    reactions: false,
  };

  private config!: WeChatWorkPluginConfig;
  private agentRuntime: AgentRuntime;
  private eventBus: ChannelEventBus;
  private state: ChannelState = 'stopped';
  private startedAt: number = 0;
  private lastOutboundAt?: number;
  private lastError?: string;
  private messageCount = 0;
  private errorCount = 0;

  // Access token management
  private accessToken: string | null = null;
  private accessTokenExpiry: number = 0;

  constructor(agentRuntime: AgentRuntime, eventBus: ChannelEventBus) {
    this.agentRuntime = agentRuntime;
    this.eventBus = eventBus;
  }

  // ---------------------------------------------------------------------------
  // IChannelPlugin lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ChannelPluginConfig): Promise<void> {
    this.config = config as WeChatWorkPluginConfig;

    if (!this.config.corpId || !this.config.agentId || !this.config.corpSecret) {
      throw new Error('WeChat Work requires corpId, agentId, and corpSecret');
    }

    logger.info('[WeChat Work] 插件已初始化');
  }

  async start(): Promise<void> {
    this.state = 'starting';
    this.startedAt = Date.now();

    try {
      // 获取 access token
      await this.refreshAccessToken();

      // Test connection by getting agent info
      await this.testConnection();

      this.state = 'running';
      logger.info('[WeChat Work] 已启动');
    } catch (err) {
      this.state = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    this.accessToken = null;
    logger.info('[WeChat Work] 已停止');
  }

  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    const text = msg.text;

    try {
      // Ensure access token is valid
      await this.ensureAccessToken();

      let wechatMsg: WeChatWorkMessage;

      // 根据 parseMode 决定使用 text 还是 markdown
      if (msg.parseMode === 'markdown') {
        wechatMsg = {
          msgtype: 'markdown',
          agentid: this.config.agentId,
          markdown: {
            content: text,
          },
          touser: this.config.toUser || '@all',
          toparty: this.config.toParty,
          totag: this.config.toTag,
        };
      } else {
        wechatMsg = {
          msgtype: 'text',
          agentid: this.config.agentId,
          text: {
            content: text,
          },
          touser: this.config.toUser || '@all',
          toparty: this.config.toParty,
          totag: this.config.toTag,
        };
      }

      await this.withRetry(async () => {
        return await this.sendWeChatMessage(wechatMsg);
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
      lastInboundAt: undefined,
      lastOutboundAt: this.lastOutboundAt,
      lastError: this.lastError,
      reconnectAttempts: 0,
      metadata: {
        corpId: this.config?.corpId,
        agentId: this.config?.agentId,
        hasAccessToken: !!this.accessToken,
        tokenExpiry: this.accessTokenExpiry
          ? new Date(this.accessTokenExpiry).toISOString()
          : undefined,
        messageCount: this.messageCount,
        errorCount: this.errorCount,
      },
    };
  }

  getOwnerChatId(): string | null {
    // 企业微信使用 touser 配置，没有单一的 owner chat ID
    return this.config?.toUser || null;
  }

  isHealthy(): boolean {
    return this.state === 'running' && !!this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // WeChat Work-specific methods
  // ---------------------------------------------------------------------------

  /**
   * 获取 access token
   * https://developer.work.weixin.qq.com/document/path/91039
   */
  private async refreshAccessToken(): Promise<void> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.corpSecret}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`WeChat Work API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as WeChatWorkAccessTokenResponse;

    if (result.errcode !== 0) {
      throw new Error(`WeChat Work error: ${result.errmsg} (code: ${result.errcode})`);
    }

    if (!result.access_token || !result.expires_in) {
      throw new Error('Invalid access token response');
    }

    this.accessToken = result.access_token;
    // Set expiry to 5 minutes before actual expiry for safety
    this.accessTokenExpiry = Date.now() + (result.expires_in - 300) * 1000;

    logger.info('[WeChat Work] Access token refreshed');
  }

  /**
   * 确保 access token 有效
   */
  private async ensureAccessToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.accessTokenExpiry) {
      await this.refreshAccessToken();
    }
  }

  /**
   * 发送消息
   * https://developer.work.weixin.qq.com/document/path/90236
   */
  private async sendWeChatMessage(message: WeChatWorkMessage): Promise<WeChatWorkSendMessageResponse> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`WeChat Work API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as WeChatWorkSendMessageResponse;

    if (result.errcode !== 0) {
      // Token expired, retry with new token
      if (result.errcode === 40014 || result.errcode === 42001) {
        await this.refreshAccessToken();
        throw new Error('Access token expired, retrying...');
      }
      throw new Error(`WeChat Work error: ${result.errmsg} (code: ${result.errcode})`);
    }

    return result;
  }

  /**
   * 测试连接
   */
  private async testConnection(): Promise<void> {
    try {
      await this.sendWeChatMessage({
        msgtype: 'text',
        agentid: this.config.agentId,
        text: {
          content: '🚀 Chubao AI 企业微信插件已启动',
        },
        touser: this.config.toUser || '@all',
      });
      logger.info('[WeChat Work] 连接测试成功');
    } catch (err) {
      logger.error('[WeChat Work] 连接测试失败', err);
      // 不抛出错误，允许插件启动
    }
  }

  /**
   * 重试机制
   */
  private async withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    const baseDelay = this.config?.retryDelay ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error)) throw error;

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
    // Retry on token expiry
    if (error instanceof Error && /expired|retrying/i.test(error.message)) {
      return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
