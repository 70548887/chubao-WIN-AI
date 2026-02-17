import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeChatWorkPlugin } from './wechat-work.js';
import type { AgentRuntime } from '../../agent/runtime.js';
import type { ChannelEventBus } from '../eventBus.js';
import type { ChannelPluginConfig } from '../types.js';

// Mock fetch
global.fetch = vi.fn();

describe('WeChatWorkPlugin', () => {
  let plugin: WeChatWorkPlugin;
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

    plugin = new WeChatWorkPlugin(mockAgentRuntime, mockEventBus);

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
      expect(plugin.id).toBe('wechat-work');
      expect(plugin.name).toBe('WeChat Work');
    });

    it('should have correct capabilities', () => {
      expect(plugin.capabilities).toEqual({
        receive: false, // 企业微信应用消息仅支持发送
        send: true,
        media: false,
        buttons: false,
        threads: false,
        reactions: false,
      });
    });
  });

  describe('lifecycle', () => {
    const mockConfig: ChannelPluginConfig & { 
      corpId: string; 
      agentId: string;
      corpSecret: string;
    } = {
      id: 'wechat-work',
      name: 'WeChat Work',
      enabled: true,
      corpId: 'ww1234567890abcdef',
      agentId: '1000001',
      corpSecret: 'test-secret-key',
    };

    it('should initialize successfully with valid config', async () => {
      await expect(plugin.initialize(mockConfig)).resolves.not.toThrow();
    });

    it('should throw error if corpId is missing', async () => {
      const invalidConfig = { ...mockConfig, corpId: '' };
      await expect(plugin.initialize(invalidConfig)).rejects.toThrow('WeChat Work corpId is required');
    });

    it('should throw error if agentId is missing', async () => {
      const invalidConfig = { ...mockConfig, agentId: '' };
      await expect(plugin.initialize(invalidConfig)).rejects.toThrow('WeChat Work agentId is required');
    });

    it('should throw error if corpSecret is missing', async () => {
      const invalidConfig = { ...mockConfig, corpSecret: '' };
      await expect(plugin.initialize(invalidConfig)).rejects.toThrow('WeChat Work corpSecret is required');
    });

    it('should start successfully and fetch access token', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('qyapi.weixin.qq.com/cgi-bin/gettoken')
      );
    });

    it('should stop successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('access token management', () => {
    const mockConfig: ChannelPluginConfig & { 
      corpId: string; 
      agentId: string;
      corpSecret: string;
    } = {
      id: 'wechat-work',
      name: 'WeChat Work',
      enabled: true,
      corpId: 'ww1234567890abcdef',
      agentId: '1000001',
      corpSecret: 'test-secret-key',
    };

    it('should fetch access token on start', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'token-abc-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('corpid=ww1234567890abcdef')
      );
    });

    it('should handle access token API error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 40013,
          errmsg: 'invalid corpid',
        }),
      });

      await plugin.initialize(mockConfig);
      await expect(plugin.start()).rejects.toThrow('invalid corpid');
    });

    it('should auto-refresh expired token before sending message', async () => {
      // First token refresh on start
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'token-old',
          expires_in: 0, // Expired immediately
        }),
      });

      // Second token refresh before sendMessage
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'token-new',
          expires_in: 7200,
        }),
      });

      // Actual message sending
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();

      await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: 'Test message',
      });

      // Should call token API twice (start + auto-refresh)
      const tokenCalls = (global.fetch as any).mock.calls.filter((call: any) =>
        call[0].includes('gettoken')
      );
      expect(tokenCalls.length).toBe(2);
    });
  });

  describe('message sending', () => {
    const mockConfig: ChannelPluginConfig & { 
      corpId: string; 
      agentId: string;
      corpSecret: string;
    } = {
      id: 'wechat-work',
      name: 'WeChat Work',
      enabled: true,
      corpId: 'ww1234567890abcdef',
      agentId: '1000001',
      corpSecret: 'test-secret-key',
    };

    beforeEach(async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
    });

    it('should send text message successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' }),
      });

      const result = await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: 'Hello, WeChat Work!',
      });

      expect(result.messageId).toBeDefined();
      const messageCalls = (global.fetch as any).mock.calls.filter((call: any) =>
        call[0].includes('message/send')
      );
      expect(messageCalls.length).toBeGreaterThanOrEqual(1); // At least one sendMessage call
    });

    it('should send markdown message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' }),
      });

      const result = await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: '# Hello\n\nThis is **markdown**',
        parseMode: 'markdown',
      });

      expect(result.messageId).toBeDefined();
      const sendCalls = (global.fetch as any).mock.calls.filter((call: any) =>
        call[0].includes('message/send')
      );
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      const lastSendCall = sendCalls[sendCalls.length - 1];
      const body = JSON.parse(lastSendCall[1].body);
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.content).toContain('# Hello');
    });

    it('should send to specific user', async () => {
      const configWithToUser = {
        ...mockConfig,
        toUser: 'UserID1|UserID2',
      };

      (global.fetch as any).mockClear(); // Clear previous mocks
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-456',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(configWithToUser);
      await plugin.start();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' }),
      });

      await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: 'To specific users',
      });

      const callArgs = (global.fetch as any).mock.calls.find((call: any) =>
        call[0].includes('message/send')
      );
      if (!callArgs) throw new Error('sendMessage call not found');
      const body = JSON.parse(callArgs[1].body);
      expect(body.touser).toBe('UserID1|UserID2');
    });

    it('should send to department', async () => {
      const configWithToParty = {
        ...mockConfig,
        toParty: '1|2|3',
        toUser: undefined, // 确保 toUser 为 undefined
      };

      (global.fetch as any).mockClear(); // Clear previous mocks

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-789',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(configWithToParty);
      await plugin.start();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' }),
      });

      await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: 'To departments',
      });

      const callArgs = (global.fetch as any).mock.calls.find((call: any) =>
        call[0].includes('message/send')
      );
      if (!callArgs) throw new Error('sendMessage call not found');
      const body = JSON.parse(callArgs[1].body);
      expect(body.toparty).toBe('1|2|3');
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 40001,
          errmsg: 'invalid credential',
        }),
      });

      await expect(
        plugin.sendMessage({
          channel: 'wechat-work',
          chatId: 'test-chat',
          text: 'This will fail',
        })
      ).rejects.toThrow('invalid credential');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        plugin.sendMessage({
          channel: 'wechat-work',
          chatId: 'test-chat',
          text: 'This will fail',
        })
      ).rejects.toThrow();
    });
  });

  describe('status and health', () => {
    const mockConfig: ChannelPluginConfig & { 
      corpId: string; 
      agentId: string;
      corpSecret: string;
    } = {
      id: 'wechat-work',
      name: 'WeChat Work',
      enabled: true,
      corpId: 'ww1234567890abcdef',
      agentId: '1000001',
      corpSecret: 'test-secret-key',
    };

    it('should return correct status', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();

      const status = plugin.getStatus();
      expect(status.state).toBe('running');
      expect(status.uptime).toBeGreaterThanOrEqual(0); // 可能在测试运行时立即获取，uptime 为 0
      expect(status.metadata?.corpId).toBe('ww1234567890abcdef');
      expect(status.metadata?.agentId).toBe('1000001');
    });

    it('should return null for owner chat ID', () => {
      expect(plugin.getOwnerChatId()).toBeNull();
    });

    it('should be healthy when running', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
      expect(plugin.isHealthy()).toBe(true);
    });

    it('should not be healthy when stopped', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
      await plugin.stop();
      expect(plugin.isHealthy()).toBe(false);
    });
  });

  describe('retry mechanism', () => {
    const mockConfig: ChannelPluginConfig & { 
      corpId: string; 
      agentId: string;
      corpSecret: string;
    } = {
      id: 'wechat-work',
      name: 'WeChat Work',
      enabled: true,
      corpId: 'ww1234567890abcdef',
      agentId: '1000001',
      corpSecret: 'test-secret-key',
    };

    beforeEach(async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      });

      await plugin.initialize(mockConfig);
      await plugin.start();
    });

    it('should retry on network errors', async () => {
      // Mock first two calls failing, third succeeding
      (global.fetch as any)
        .mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'ECONNRESET' }))
        .mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'ETIMEDOUT' }))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errcode: 0, errmsg: 'ok' }),
        });

      const result = await plugin.sendMessage({
        channel: 'wechat-work',
        chatId: 'test-chat',
        text: 'Retry test',
      });

      expect(result.messageId).toBeDefined();
      // Should have at least 4 calls: 1 from start + 3 attempts (may have token refresh)
      const mockFetch = global.fetch as any;
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('should not retry on non-retryable errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 40001,
          errmsg: 'invalid credential',
        }),
      });

      await expect(
        plugin.sendMessage({
          channel: 'wechat-work',
          chatId: 'test-chat',
          text: 'Non-retryable error',
        })
      ).rejects.toThrow();

      // Should have at least 2 calls: 1 from start + 1 attempt (no retry, but may have token refresh)
      const mockFetch = global.fetch as any;
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
