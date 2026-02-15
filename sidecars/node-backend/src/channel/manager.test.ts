import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager } from './manager.js';
import { ChannelEventBus, getEventBus, resetEventBus } from './eventBus.js';
import type { IChannelPlugin, ChannelPluginConfig, OutboundMessage, ChannelPluginCapabilities, ChannelPluginStatus } from './types.js';

// Mock plugin for testing
class MockPlugin implements IChannelPlugin {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ChannelPluginCapabilities = {
    send: true,
    receive: true,
    media: false,
    buttons: false,
    threads: false,
    reactions: false,
  };
  initialized = false;
  started = false;
  stopped = false;
  lastMessage: OutboundMessage | null = null;
  private ownerChatId: string | null = null;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.started = false;
  }

  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    this.lastMessage = msg;
    return { messageId: 'mock-msg-id' };
  }

  getStatus(): ChannelPluginStatus {
    return {
      state: this.started ? 'running' : 'stopped',
      uptime: this.started ? 1 : 0,
      reconnectAttempts: 0,
    };
  }

  getOwnerChatId(): string | null {
    return this.ownerChatId;
  }

  setOwnerChatId(id: string): void {
    this.ownerChatId = id;
  }

  isHealthy(): boolean {
    return this.started;
  }
}

describe('ChannelManager', () => {
  let eventBus: ChannelEventBus;
  let manager: ChannelManager;

  beforeEach(() => {
    resetEventBus();
    eventBus = getEventBus();
    manager = new ChannelManager(eventBus);
  });

  it('should register a plugin', () => {
    const plugin = new MockPlugin('test', 'Test Plugin');
    manager.register(plugin, { id: 'test', name: 'Test', enabled: true });

    const status = manager.getAllStatus();
    expect(status.test).toBeDefined();
  });

  it('should unregister a plugin', async () => {
    const plugin = new MockPlugin('test', 'Test Plugin');
    manager.register(plugin, { id: 'test', name: 'Test', enabled: true });

    await manager.unregister('test');

    const status = manager.getAllStatus();
    expect(status.test).toBeUndefined();
    expect(plugin.stopped).toBe(true);
  });

  it('should start all plugins', async () => {
    const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
    const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

    manager.register(plugin1, { id: 'plugin1', name: 'Plugin 1', enabled: true });
    manager.register(plugin2, { id: 'plugin2', name: 'Plugin 2', enabled: true });

    await manager.startAll();

    expect(plugin1.started).toBe(true);
    expect(plugin2.started).toBe(true);
  });

  it('should stop all plugins', async () => {
    const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
    manager.register(plugin1, { id: 'plugin1', name: 'Plugin 1', enabled: true });
    await manager.startAll();

    await manager.stopAll();

    expect(plugin1.stopped).toBe(true);
  });

  it('should send message to specific channel', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    const msg: OutboundMessage = {
      channel: 'telegram',
      chatId: '123',
      text: 'Hello',
    };

    const result = await manager.sendMessage(msg);

    expect(result.messageId).toBe('mock-msg-id');
    expect(plugin.lastMessage).toEqual(msg);
  });

  it('should broadcast to all channels', async () => {
    const plugin1 = new MockPlugin('channel1', 'Channel 1');
    const plugin2 = new MockPlugin('channel2', 'Channel 2');

    manager.register(plugin1, { id: 'channel1', name: 'Channel 1', enabled: true });
    manager.register(plugin2, { id: 'channel2', name: 'Channel 2', enabled: true });
    await manager.startAll();

    const results = await manager.broadcast('Broadcast message');

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(plugin1.lastMessage?.text).toBe('Broadcast message');
    expect(plugin2.lastMessage?.text).toBe('Broadcast message');
  });

  it('should return error for non-existent channel', async () => {
    const msg: OutboundMessage = {
      channel: 'non-existent',
      chatId: '123',
      text: 'Hello',
    };

    await expect(manager.sendMessage(msg)).rejects.toThrow('Channel "non-existent" not found');
  });

  it('should return error for unhealthy channel', async () => {
    const plugin = new MockPlugin('unhealthy', 'Unhealthy');
    manager.register(plugin, { id: 'unhealthy', name: 'Unhealthy', enabled: true });
    // Not started, so unhealthy

    const msg: OutboundMessage = {
      channel: 'unhealthy',
      chatId: '123',
      text: 'Hello',
    };

    await expect(manager.sendMessage(msg)).rejects.toThrow('Channel "unhealthy" is not healthy');
  });

  it('should get plugin instance', () => {
    const plugin = new MockPlugin('test', 'Test');
    manager.register(plugin, { id: 'test', name: 'Test', enabled: true });

    const retrieved = manager.getPlugin('test');
    expect(retrieved).toBe(plugin);
  });

  it('should return undefined for non-existent plugin', () => {
    const retrieved = manager.getPlugin('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should check if has healthy channel', async () => {
    expect(manager.hasHealthyChannel()).toBe(false);

    const plugin = new MockPlugin('test', 'Test');
    manager.register(plugin, { id: 'test', name: 'Test', enabled: true });
    await manager.startAll();

    expect(manager.hasHealthyChannel()).toBe(true);
  });

  it('should get default owner chat id', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    plugin.setOwnerChatId('owner-123');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    const defaultOwner = manager.getDefaultOwnerChatId();
    expect(defaultOwner).toEqual({ channel: 'telegram', chatId: 'owner-123' });
  });

  it('should return null for default owner when no channels', () => {
    const defaultOwner = manager.getDefaultOwnerChatId();
    expect(defaultOwner).toBeNull();
  });

  it('should replace existing plugin on register', async () => {
    const plugin1 = new MockPlugin('test', 'Plugin 1');
    const plugin2 = new MockPlugin('test', 'Plugin 2');

    manager.register(plugin1, { id: 'test', name: 'Test', enabled: true });
    await manager.startAll();

    manager.register(plugin2, { id: 'test', name: 'Test', enabled: true });

    const retrieved = manager.getPlugin('test');
    expect(retrieved).toBe(plugin2);
  });

  it('should emit events on register/unregister', async () => {
    const registeredListener = vi.fn();
    const unregisteredListener = vi.fn();

    eventBus.on('channel:registered', registeredListener);
    eventBus.on('channel:unregistered', unregisteredListener);

    const plugin = new MockPlugin('test', 'Test');
    manager.register(plugin, { id: 'test', name: 'Test', enabled: true });

    expect(registeredListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'test' })
    );

    await manager.unregister('test');

    expect(unregisteredListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'test' })
    );
  });

  it('should handle broadcast with options', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    await manager.broadcast('Message', {
      parseMode: 'markdown',
      silent: true,
    });

    expect(plugin.lastMessage?.parseMode).toBe('markdown');
    expect(plugin.lastMessage?.silent).toBe(true);
  });

  it('should get all status', async () => {
    const plugin1 = new MockPlugin('plugin1', 'Plugin 1');
    const plugin2 = new MockPlugin('plugin2', 'Plugin 2');

    manager.register(plugin1, { id: 'plugin1', name: 'Plugin 1', enabled: true });
    manager.register(plugin2, { id: 'plugin2', name: 'Plugin 2', enabled: true });

    const status = manager.getAllStatus();
    expect(Object.keys(status)).toHaveLength(2);
  });
});
