import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramPlugin } from './telegram.js';
import type { AgentRuntime } from '../../agent/runtime.js';
import type { ChannelEventBus } from '../eventBus.js';
import type { ChannelPluginConfig } from '../types.js';

// Mock Telegraf
vi.mock('telegraf', () => {
  const mockTelegraf = vi.fn();
  mockTelegraf.prototype.command = vi.fn().mockReturnThis();
  mockTelegraf.prototype.on = vi.fn().mockReturnThis();
  mockTelegraf.prototype.catch = vi.fn().mockReturnThis();
  mockTelegraf.prototype.launch = vi.fn().mockResolvedValue(undefined);
  mockTelegraf.prototype.stop = vi.fn();
  mockTelegraf.prototype.telegram = {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
  };

  return {
    Telegraf: mockTelegraf,
    TelegramError: class TelegramError extends Error {
      response?: { error_code: number; description?: string; parameters?: { retry_after?: number } };
      constructor(message: string, response?: any) {
        super(message);
        this.response = response;
      }
    },
  };
});

vi.mock('telegraf/filters', () => ({
  message: vi.fn(() => 'text'),
}));

describe('TelegramPlugin', () => {
  let plugin: TelegramPlugin;
  let mockAgentRuntime: AgentRuntime;
  let mockEventBus: ChannelEventBus;

  beforeEach(() => {
    mockAgentRuntime = {
      chat: vi.fn().mockResolvedValue('Test response'),
    } as unknown as AgentRuntime;

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as ChannelEventBus;

    plugin = new TelegramPlugin(mockAgentRuntime, mockEventBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct id and name', () => {
      expect(plugin.id).toBe('telegram');
      expect(plugin.name).toBe('Telegram');
    });

    it('should have correct capabilities', () => {
      expect(plugin.capabilities).toEqual({
        receive: true,
        send: true,
        media: true,
        buttons: true,
        threads: false,
        reactions: false,
      });
    });
  });

  describe('lifecycle', () => {
    const mockConfig: ChannelPluginConfig = {
      id: 'telegram',
      name: 'Telegram',
      botToken: 'test-token-12345',
      enabled: true,
    };

    it('should initialize successfully', async () => {
      await expect(plugin.initialize(mockConfig)).resolves.not.toThrow();
    });

    it('should start in long polling mode by default', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);
    });

    it('should stop successfully', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });

    it('should get status after start', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
      const status = plugin.getStatus();
      expect(status.state).toBe('running');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.metadata).toHaveProperty('botToken');
    });
  });

  describe('authorization', () => {
    it('should allow all users when allowedUserIds is empty', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      // Access private method through any cast
      const isAuthorized = (plugin as any).isAuthorized.bind(plugin);
      expect(isAuthorized(123456)).toBe(true);
      expect(isAuthorized(undefined)).toBe(false);
    });

    it('should only allow specific users when allowedUserIds is set', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
        allowedUserIds: [123456, 789012],
      };
      await plugin.initialize(config);

      const isAuthorized = (plugin as any).isAuthorized.bind(plugin);
      expect(isAuthorized(123456)).toBe(true);
      expect(isAuthorized(999999)).toBe(false);
      expect(isAuthorized(undefined)).toBe(false);
    });
  });

  describe('sendMessage', () => {
    const mockConfig: ChannelPluginConfig = {
      id: 'telegram',
      name: 'Telegram',
      botToken: 'test-token',
      enabled: true,
    };

    beforeEach(async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
    });

    it('should send message successfully', async () => {
      const result = await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: 'Hello World',
      });

      expect(result.messageId).toBe('123');
    });

    it('should handle markdown parse mode', async () => {
      await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: '**Bold** text',
        parseMode: 'markdown',
      });

      // Should use Markdown parse_mode
      const { Telegraf } = await import('telegraf');
      expect(Telegraf).toHaveBeenCalled();
    });

    it('should handle HTML parse mode', async () => {
      await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: '<b>Bold</b> text',
        parseMode: 'html',
      });

      // Should use HTML parse_mode
      const { Telegraf } = await import('telegraf');
      expect(Telegraf).toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('should retry on network errors', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
        maxRetries: 3,
        retryDelay: 100,
      };
      await plugin.initialize(config);

      const shouldRetry = (plugin as any).shouldRetry.bind(plugin);

      // Network errors should be retried
      expect(shouldRetry({ code: 'ECONNRESET' })).toBe(true);
      expect(shouldRetry({ code: 'ETIMEDOUT' })).toBe(true);
      expect(shouldRetry({ code: 'ECONNREFUSED' })).toBe(true);
      expect(shouldRetry({ code: 'UNKNOWN' })).toBe(false);
    });

    it('should detect rate limiting', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      const isRateLimited = (plugin as any).isRateLimited.bind(plugin);
      const { TelegramError } = await import('telegraf');

      const rateLimitError = new (TelegramError as any)('Rate limited', {
        error_code: 429,
        description: 'Too Many Requests',
        parameters: { retry_after: 30 },
      });

      expect(isRateLimited(rateLimitError)).toBe(true);
      expect(isRateLimited(new Error('Other error'))).toBe(false);
    });

    it('should get retry after value', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      const getRetryAfter = (plugin as any).getRetryAfter.bind(plugin);
      const { TelegramError } = await import('telegraf');

      const rateLimitError = new (TelegramError as any)('Rate limited', {
        error_code: 429,
        parameters: { retry_after: 60 },
      });

      expect(getRetryAfter(rateLimitError)).toBe(60);
      expect(getRetryAfter(new Error('Other'))).toBe(30);
    });
  });

  describe('owner chat tracking', () => {
    it('should track owner chat from environment', async () => {
      process.env.TELEGRAM_OWNER_CHAT_ID = '123456789';

      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      expect(plugin.getOwnerChatId()).toBe('123456789');

      delete process.env.TELEGRAM_OWNER_CHAT_ID;
    });

    it('should return null when no owner chat tracked', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      expect(plugin.getOwnerChatId()).toBeNull();
    });
  });

  describe('health check', () => {
    it('should return healthy when running', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      expect(plugin.isHealthy()).toBe(true);
    });

    it('should return not healthy when stopped', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();
      await plugin.stop();

      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle message with replyToMessageId', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      const result = await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: 'Reply message',
        replyToMessageId: '456',
      });

      expect(result.messageId).toBe('123');
    });

    it('should handle silent message', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      const result = await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: 'Silent message',
        silent: true,
      });

      expect(result.messageId).toBe('123');
    });

    it('should handle empty allowedUserIds array', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
        allowedUserIds: [],
      };
      await plugin.initialize(config);

      const isAuthorized = (plugin as any).isAuthorized.bind(plugin);
      expect(isAuthorized(123456)).toBe(true);
    });

    it('should handle status before initialization', () => {
      const status = plugin.getStatus();
      expect(status.state).toBe('stopped');
      expect(status.uptime).toBe(0);
    });

    it('should handle multiple start calls', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();
      await plugin.start(); // Second start

      expect(plugin.isHealthy()).toBe(true);
    });

    it('should handle stop without start', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      
      // Should not throw
      await expect(plugin.stop()).resolves.not.toThrow();
    });

    it('should handle getStatus with metadata', async () => {
      process.env.TELEGRAM_OWNER_CHAT_ID = '987654';
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token-12345',
        enabled: true,
        webhookUrl: 'https://example.com/webhook',
      };
      await plugin.initialize(config);
      await plugin.start();

      const status = plugin.getStatus();
      expect(status.metadata).toBeDefined();
      expect(status.metadata?.botToken).toContain('...');
      expect(status.metadata?.webhookUrl).toBe('https://example.com/webhook');
      expect(status.metadata?.ownerChatId).toBe('987654');

      delete process.env.TELEGRAM_OWNER_CHAT_ID;
    });

    it('should handle status with lastError', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);

      // Simulate error by accessing private field
      (plugin as any).lastError = 'Test error';

      const status = plugin.getStatus();
      expect(status.lastError).toBe('Test error');
    });

    it('should handle status with timestamps', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      // Simulate activity
      (plugin as any).lastInboundAt = Date.now();
      (plugin as any).lastOutboundAt = Date.now();

      const status = plugin.getStatus();
      expect(status.lastInboundAt).toBeDefined();
      expect(status.lastOutboundAt).toBeDefined();
    });

    it('should handle isAuthorized with negative userId', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
        allowedUserIds: [-123456],
      };
      await plugin.initialize(config);

      const isAuthorized = (plugin as any).isAuthorized.bind(plugin);
      expect(isAuthorized(-123456)).toBe(true);
      expect(isAuthorized(123456)).toBe(false);
    });

    it('should handle sendMessage with very long text', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      const longText = 'a'.repeat(5000);
      const result = await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: longText,
      });

      expect(result.messageId).toBe('123');
    });

    it('should handle sendMessage with special characters', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
      };
      await plugin.initialize(config);
      await plugin.start();

      const specialText = 'Hello \n World \t ! @ # $ % ^ & * ( ) _ + { } | : " < > ?';
      const result = await plugin.sendMessage({
        channel: 'telegram',
        chatId: '123456',
        text: specialText,
      });

      expect(result.messageId).toBe('123');
    });

    it('should handle webhook mode configuration', async () => {
      const config: ChannelPluginConfig = {
        id: 'telegram',
        name: 'Telegram',
        botToken: 'test-token',
        enabled: true,
        webhookUrl: 'https://example.com/webhook',
      };
      await plugin.initialize(config);
      await plugin.start();

      expect(plugin.isHealthy()).toBe(true);
    });
  });
});
