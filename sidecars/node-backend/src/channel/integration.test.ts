/**
 * Channel System Integration Tests
 * Tests interaction between EventBus, ChannelManager, and Notifier
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelEventBus } from './eventBus.js';
import { ChannelManager } from './manager.js';
import type { IChannelPlugin, ChannelPluginConfig, OutboundMessage } from './types.js';

describe('Channel System Integration', () => {
  let eventBus: ChannelEventBus;
  let channelManager: ChannelManager;

  // Mock plugin for testing
  class MockPlugin implements IChannelPlugin {
    readonly id = 'mock';
    readonly name = 'Mock Plugin';
    readonly capabilities = {
      receive: true,
      send: true,
      media: false,
      buttons: false,
      threads: false,
      reactions: false,
    };

    initialized = false;
    started = false;
    stopped = false;
    lastMessage?: OutboundMessage;

    async initialize(): Promise<void> {
      this.initialized = true;
    }

    async start(): Promise<void> {
      this.started = true;
    }

    async stop(): Promise<void> {
      this.stopped = true;
    }

    async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
      this.lastMessage = msg;
      return { messageId: '123' };
    }

    getStatus() {
      return {
        state: this.started ? 'running' : 'stopped',
        uptime: 0,
      } as any;
    }

    isHealthy() {
      return this.started;
    }

    getOwnerChatId(): string | null {
      return 'owner-chat-id';
    }
  }

  beforeEach(() => {
    eventBus = new ChannelEventBus();
    channelManager = new ChannelManager(eventBus);
  });

  afterEach(async () => {
    await channelManager.stopAll();
    vi.clearAllMocks();
  });

  describe('EventBus Integration', () => {
    it('should emit and receive events', () => {
      const handler = vi.fn();
      eventBus.on('message:inbound', handler);
      eventBus.emit('message:inbound', {
        id: 'msg-1',
        channel: 'mock',
        chatId: 'chat-1',
        senderId: 'user-1',
        text: 'Hello',
        timestamp: Date.now(),
      });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello' }));
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      eventBus.on('message:inbound', handler1);
      eventBus.on('message:inbound', handler2);
      eventBus.emit('message:inbound', {
        id: 'msg-1',
        channel: 'mock',
        chatId: 'chat-1',
        senderId: 'user-1',
        text: 'Hello',
        timestamp: Date.now(),
      });
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('message:inbound', handler);
      unsubscribe();
      eventBus.emit('message:inbound', {
        id: 'msg-1',
        channel: 'mock',
        chatId: 'chat-1',
        senderId: 'user-1',
        text: 'Hello',
        timestamp: Date.now(),
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('ChannelManager with Plugins', () => {
    it('should register plugin with config', async () => {
      const plugin = new MockPlugin();
      const config: ChannelPluginConfig = {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      };

      channelManager.register(plugin, config);

      expect(channelManager.getAllStatus()).toHaveProperty('mock');
    });

    it('should start and stop all plugins', async () => {
      const plugin = new MockPlugin();
      const config: ChannelPluginConfig = {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      };

      channelManager.register(plugin, config);
      await channelManager.startAll();

      expect(plugin.started).toBe(true);

      await channelManager.stopAll();
      expect(plugin.stopped).toBe(true);
    });

    it('should get status of all plugins', async () => {
      const plugin = new MockPlugin();
      const config: ChannelPluginConfig = {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      };

      channelManager.register(plugin, config);
      const status = channelManager.getAllStatus();
      expect(status).toHaveProperty('mock');
    });
  });

  describe('Message Flow Integration', () => {
    it('should handle inbound message flow', async () => {
      const handler = vi.fn();
      eventBus.on('message:inbound', handler);

      // Simulate inbound message
      eventBus.emit('message:inbound', {
        id: 'msg-1',
        channel: 'mock',
        chatId: 'chat-1',
        senderId: 'user-1',
        text: 'Hello',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Hello',
        channel: 'mock',
      }));
    });

    it('should handle channel state changes', async () => {
      const handler = vi.fn();
      eventBus.on('channel:state', handler);

      const plugin = new MockPlugin();
      channelManager.register(plugin, {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      });

      // State change should be emitted during lifecycle
      await channelManager.startAll();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle plugin start errors gracefully', async () => {
      class ErrorPlugin extends MockPlugin {
        async start(): Promise<void> {
          throw new Error('Start failed');
        }
      }
      const errorPlugin = new ErrorPlugin();

      channelManager.register(errorPlugin, {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      });
      
      // startAll catches errors and emits events, doesn't throw
      await channelManager.startAll();
      
      // Plugin should not be started
      expect(errorPlugin.started).toBe(false);
    });

    it('should handle plugin send errors gracefully', async () => {
      class ErrorPlugin extends MockPlugin {
        async sendMessage(): Promise<{ messageId?: string }> {
          throw new Error('Send failed');
        }
      }
      const errorPlugin = new ErrorPlugin();

      channelManager.register(errorPlugin, {
        id: 'mock',
        name: 'Mock',
        enabled: true,
      });
      await channelManager.startAll();

      await expect(
        channelManager.sendMessage({ channel: 'mock', chatId: '123', text: 'Test' })
      ).rejects.toThrow('Send failed');
    });
  });
});
