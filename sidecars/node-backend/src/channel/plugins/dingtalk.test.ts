import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DingTalkPlugin } from './dingtalk.js';
import type { AgentRuntime } from '../../agent/runtime.js';
import type { ChannelEventBus } from '../eventBus.js';
import type { ChannelPluginConfig } from '../types.js';

// Mock crypto module
vi.mock('crypto', () => ({
  createHmac: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked-signature'),
  })),
}));

// Mock fetch
global.fetch = vi.fn();

describe('DingTalkPlugin', () => {
  let plugin: DingTalkPlugin;
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

    plugin = new DingTalkPlugin(mockAgentRuntime, mockEventBus);

    // Mock fetch for successful responses
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0, errmsg: 'ok' }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct id and name', () => {
      expect(plugin.id).toBe('dingtalk');
      expect(plugin.name).toBe('DingTalk');
    });

    it('should have correct capabilities', () => {
      expect(plugin.capabilities).toEqual({
        receive: false, // 钉钉 Webhook 仅支持发送
        send: true,
        media: false,
        buttons: true,
        threads: false,
        reactions: false,
      });
    });
  });

  describe('lifecycle', () => {
    const mockConfig: ChannelPluginConfig & { webhook: string } = {
      id: 'dingtalk',
      name: 'DingTalk',
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test123',
    };

    it('should initialize successfully with valid webhook', async () => {
      await expect(plugin.initialize(mockConfig)).resolves.not.toThrow();
    });

    it('should throw error if webhook is missing', async () => {
      const invalidConfig = { ...mockConfig, webhook: '' };
      await expect(plugin.initialize(invalidConfig)).rejects.toThrow('DingTalk webhook URL is required');
    });

    it('should throw error if webhook URL is invalid', async () => {
      const invalidConfig = { ...mockConfig, webhook: 'https://invalid.com/webhook' };
      await expect(plugin.initialize(invalidConfig)).rejects.toThrow('Invalid DingTalk webhook URL');
    });

    it('should start successfully', async () => {
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
  });

  describe('message sending', () => {
    const mockConfig: ChannelPluginConfig & { webhook: string } = {
      id: 'dingtalk',
      name: 'DingTalk',
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test123',
    };

    beforeEach(async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
    });

    it('should send text message successfully', async () => {
      const result = await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: 'Hello, DingTalk!',
      });

      expect(result.messageId).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('oapi.dingtalk.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send markdown message', async () => {
      const result = await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: '# Hello\n\nThis is **markdown**',
        parseMode: 'markdown',
      });

      expect(result.messageId).toBeDefined();
      const callArgs = (global.fetch as any).mock.calls[1]; // 第二次调用（第一次是 start 的测试连接）
      const body = JSON.parse(callArgs[1].body);
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.text).toContain('# Hello');
    });

    it('should handle @ configuration', async () => {
      const configWithAt = {
        ...mockConfig,
        atAll: true,
        atMobiles: ['13800138000', '13900139000'],
      };
      
      await plugin.initialize(configWithAt);
      await plugin.start();
      
      await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: 'Attention please!',
      });

      const callArgs = (global.fetch as any).mock.calls[1];
      const body = JSON.parse(callArgs[1].body);
      expect(body.at.isAtAll).toBe(true);
      expect(body.at.atMobiles).toEqual(['13800138000', '13900139000']);
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 310000, errmsg: 'sign not match' }),
      });

      await expect(
        plugin.sendMessage({
          channel: 'dingtalk',
          chatId: 'test-chat',
          text: 'This will fail',
        })
      ).rejects.toThrow('sign not match');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        plugin.sendMessage({
          channel: 'dingtalk',
          chatId: 'test-chat',
          text: 'This will fail',
        })
      ).rejects.toThrow();
    });
  });

  describe('security signature', () => {
    const mockConfig: ChannelPluginConfig & { webhook: string; secret: string } = {
      id: 'dingtalk',
      name: 'DingTalk',
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test123',
      secret: 'SECxxxxxx',
    };

    it('should add timestamp and signature when secret is provided', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();

      await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: 'Secured message',
      });

      const callArgs = (global.fetch as any).mock.calls[1];
      const url = callArgs[0] as string;
      expect(url).toContain('timestamp=');
      expect(url).toContain('sign=');
    });

    it('should not add signature when secret is not provided', async () => {
      const configWithoutSecret = { ...mockConfig };
      delete (configWithoutSecret as any).secret;

      await plugin.initialize(configWithoutSecret);
      await plugin.start();

      await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: 'Unsecured message',
      });

      const callArgs = (global.fetch as any).mock.calls[1];
      const url = callArgs[0] as string;
      expect(url).not.toContain('timestamp=');
      expect(url).not.toContain('sign=');
    });
  });

  describe('status and health', () => {
    const mockConfig: ChannelPluginConfig & { webhook: string } = {
      id: 'dingtalk',
      name: 'DingTalk',
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test123',
    };

    it('should return correct status', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();

      const status = plugin.getStatus();
      expect(status.state).toBe('running');
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.metadata?.webhook).toContain('oapi.dingtalk.com');
    });

    it('should return null for owner chat ID', () => {
      expect(plugin.getOwnerChatId()).toBeNull();
    });

    it('should be healthy when running', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);
    });

    it('should not be healthy when stopped', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('retry mechanism', () => {
    const mockConfig: ChannelPluginConfig & { webhook: string } = {
      id: 'dingtalk',
      name: 'DingTalk',
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test123',
    };

    it('should retry on network errors', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();

      // Mock first two calls failing, third succeeding
      (global.fetch as any)
        .mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'ECONNRESET' }))
        .mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'ECONNRESET' }))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errcode: 0, errmsg: 'ok' }),
        });

      const result = await plugin.sendMessage({
        channel: 'dingtalk',
        chatId: 'test-chat',
        text: 'Retry test',
      });

      expect(result.messageId).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(4); // 1 from start + 3 attempts
    });

    it('should not retry on non-retryable errors', async () => {
      await plugin.initialize(mockConfig);
      await plugin.start();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 310000, errmsg: 'sign not match' }),
      });

      await expect(
        plugin.sendMessage({
          channel: 'dingtalk',
          chatId: 'test-chat',
          text: 'Non-retryable error',
        })
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 from start + 1 attempt (no retry)
    });
  });
});
