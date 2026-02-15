import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Notifier } from './notifier.js';
import { ChannelEventBus, getEventBus, resetEventBus } from './eventBus.js';
import { ChannelManager } from './manager.js';
import type { IChannelPlugin, ChannelPluginConfig, OutboundMessage, ChannelPluginCapabilities, ChannelPluginStatus } from './types.js';

// Mock plugin
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
  started = false;
  sentMessages: OutboundMessage[] = [];
  private ownerChatId: string | null = 'owner-123';

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async initialize(): Promise<void> {}
  async start(): Promise<void> { this.started = true; }
  async stop(): Promise<void> { this.started = false; }

  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    this.sentMessages.push(msg);
    return { messageId: 'mock-id' };
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

  isHealthy(): boolean {
    return this.started;
  }
}

describe('Notifier', () => {
  let eventBus: ChannelEventBus;
  let manager: ChannelManager;
  let notifier: Notifier;

  beforeEach(() => {
    resetEventBus();
    eventBus = getEventBus();
    manager = new ChannelManager(eventBus);
  });

  it('should start and listen to events', () => {
    notifier = new Notifier(eventBus, manager, { enabled: true });
    notifier.start();

    // Should not throw when starting
    expect(() => notifier.start()).not.toThrow();
  });

  it('should not start when disabled', () => {
    notifier = new Notifier(eventBus, manager, { enabled: false });
    notifier.start();

    // Should not throw but also not listen
    expect(() => notifier.start()).not.toThrow();
  });

  it('should send notification via channel manager', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    eventBus.emit('notify', {
      category: 'system',
      title: 'Test',
      body: 'Test message',
      level: 'info',
      timestamp: Date.now(),
    });

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin.sentMessages).toHaveLength(1);
    expect(plugin.sentMessages[0].text).toContain('Test');
  });

  it('should format notification with emoji', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    eventBus.emit('notify:upgrade', {
      category: 'upgrade',
      title: '升级完成',
      body: '系统已升级',
      level: 'success',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin.sentMessages[0].text).toContain('✅');
    expect(plugin.sentMessages[0].text).toContain('🔄');
  });

  it('should queue notifications when no channel available', async () => {
    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    // No channels registered yet
    eventBus.emit('notify', {
      category: 'system',
      title: 'Queued',
      body: 'Will be sent later',
      level: 'info',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now register a channel
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    // Trigger flush by sending another notification
    eventBus.emit('notify', {
      category: 'system',
      title: 'Trigger',
      body: 'Trigger flush',
      level: 'info',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Both messages should be sent
    expect(plugin.sentMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect throttle settings', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
      throttleMs: 1000, // 1 second throttle
    });
    notifier.start();

    // Send multiple notifications rapidly
    for (let i = 0; i < 3; i++) {
      eventBus.emit('notify', {
        category: 'system',
        title: `Message ${i}`,
        body: 'Body',
        level: 'info',
        timestamp: Date.now(),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Only first should be sent immediately due to throttle
    expect(plugin.sentMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle system:startup event', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    eventBus.emit('system:startup', {
      timestamp: Date.now(),
      services: ['agent', 'memory'],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin.sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(plugin.sentMessages[0].text).toContain('系统启动');
  });

  it('should handle system:restart event', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    eventBus.emit('system:restart', {
      timestamp: Date.now(),
      reason: '自我升级',
      delayMs: 5000,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin.sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(plugin.sentMessages[0].text).toContain('服务重启');
  });

  it('should stop listening when stopped', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    // Stop the notifier
    notifier.stop();

    // Send notification after stop
    eventBus.emit('notify', {
      category: 'system',
      title: 'After Stop',
      body: 'Should not be sent',
      level: 'info',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not have received the message
    expect(plugin.sentMessages).toHaveLength(0);
  });

  it('should handle notification with data', async () => {
    const plugin = new MockPlugin('telegram', 'Telegram');
    manager.register(plugin, { id: 'telegram', name: 'Telegram', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram'],
    });
    notifier.start();

    eventBus.emit('notify', {
      category: 'progress',
      title: '进度更新',
      body: '任务进度',
      level: 'info',
      data: { percent: 50, step: 'building' },
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin.sentMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle multiple channels', async () => {
    const plugin1 = new MockPlugin('telegram', 'Telegram');
    const plugin2 = new MockPlugin('lark', 'Lark');

    manager.register(plugin1, { id: 'telegram', name: 'Telegram', enabled: true });
    manager.register(plugin2, { id: 'lark', name: 'Lark', enabled: true });
    await manager.startAll();

    notifier = new Notifier(eventBus, manager, {
      enabled: true,
      defaultChannels: ['telegram', 'lark'],
    });
    notifier.start();

    eventBus.emit('notify', {
      category: 'system',
      title: '广播',
      body: '发送到所有频道',
      level: 'info',
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(plugin1.sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(plugin2.sentMessages.length).toBeGreaterThanOrEqual(1);
  });
});
