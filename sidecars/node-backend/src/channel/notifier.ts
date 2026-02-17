/**
 * Notifier — proactive notification push layer.
 *
 * Listens to EventBus notification events and routes them to
 * the appropriate channels via ChannelManager.
 *
 * Features:
 * - Category-based routing (upgrade → telegram, error → all, etc.)
 * - Throttling to avoid spamming
 * - Level-based formatting (emoji prefixes)
 * - Queue for when no channel is available yet
 * - Supports custom templates
 */

import type { ChannelEventBus } from './eventBus.js';
import type { ChannelManager } from './manager.js';
import type { NotificationEvent, NotifierConfig } from './types.js';
import { logger } from '../utils/logger.js';

const LEVEL_EMOJI: Record<NotificationEvent['level'], string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
};

const CATEGORY_EMOJI: Record<NotificationEvent['category'], string> = {
  upgrade: '🔄',
  error: '💥',
  health: '💓',
  system: '🖥️',
  progress: '📊',
  custom: '📌',
};

const DEFAULT_CONFIG: NotifierConfig = {
  enabled: true,
  defaultChannels: ['telegram'],
  rules: [],
  throttleMs: 2000,
};

interface QueuedNotification {
  event: NotificationEvent;
  targetChannels: string[];
  queuedAt: number;
}

export class Notifier {
  private eventBus: ChannelEventBus;
  private channelManager: ChannelManager;
  private config: NotifierConfig;
  private lastSentAt = new Map<string, number>();
  private queue: QueuedNotification[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(
    eventBus: ChannelEventBus,
    channelManager: ChannelManager,
    config?: Partial<NotifierConfig>,
  ) {
    this.eventBus = eventBus;
    this.channelManager = channelManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start listening for notification events.
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('[Notifier] Disabled by config');
      return;
    }

    // Listen to all notify events
    this.unsubscribers.push(
      this.eventBus.on('notify', (event) => this.handleNotification(event)),
      this.eventBus.on('notify:upgrade', (event) => this.handleNotification(event)),
      this.eventBus.on('notify:error', (event) => this.handleNotification(event)),
      this.eventBus.on('notify:health', (event) => this.handleNotification(event)),
      this.eventBus.on('notify:progress', (event) => this.handleNotification(event)),
    );

    // Listen for system events and auto-generate notifications
    this.unsubscribers.push(
      this.eventBus.on('system:startup', (event) => {
        this.handleNotification({
          category: 'system',
          title: '系统启动',
          body: `服务已启动，已激活通道: ${event.services.join(', ') || '无'}`,
          level: 'success',
          timestamp: event.timestamp,
        });
      }),
      this.eventBus.on('system:restart', (event) => {
        this.handleNotification({
          category: 'system',
          title: '服务重启',
          body: `${event.reason || '自我升级'} — ${event.delayMs ? `${event.delayMs}ms后` : '立即'}重启`,
          level: 'warn',
          timestamp: event.timestamp,
        });
      }),
      this.eventBus.on('channel:state', (event) => {
        if (event.state === 'error') {
          this.handleNotification({
            category: 'error',
            title: `通道错误: ${event.channel}`,
            body: event.error || '未知错误',
            level: 'error',
            timestamp: event.timestamp,
          });
        }
      }),
    );

    // Start queue flush timer
    this.flushTimer = setInterval(() => this.flushQueue(), 5000);

    logger.info('[Notifier] Started, listening for notifications');
  }

  /**
   * Stop the notifier and clean up.
   */
  stop(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    logger.info('[Notifier] Stopped');
  }

  /**
   * Send a notification directly (from tools or code).
   */
  async notify(event: Omit<NotificationEvent, 'timestamp'>): Promise<{ sent: boolean; channels: string[] }> {
    const fullEvent: NotificationEvent = {
      ...event,
      timestamp: Date.now(),
    };

    return this.handleNotification(fullEvent);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async handleNotification(event: NotificationEvent): Promise<{ sent: boolean; channels: string[] }> {
    const targetChannels = this.resolveTargetChannels(event);
    const formatted = this.formatNotification(event);
    const sentTo: string[] = [];

    for (const channelId of targetChannels) {
      // Throttle check
      if (this.isThrottled(channelId, event.category)) {
        continue;
      }

      const plugin = this.channelManager.getPlugin(channelId);
      if (!plugin || !plugin.isHealthy()) {
        // Queue for later
        this.queue.push({
          event,
          targetChannels: [channelId],
          queuedAt: Date.now(),
        });
        continue;
      }

      const ownerChatId = plugin.getOwnerChatId();
      if (!ownerChatId) continue;

      try {
        await this.channelManager.sendMessage({
          channel: channelId,
          chatId: ownerChatId,
          text: formatted,
          parseMode: 'markdown',
          silent: event.level === 'info',
        });
        sentTo.push(channelId);
        this.lastSentAt.set(`${channelId}:${event.category}`, Date.now());
      } catch (err) {
        logger.error(`[Notifier] Failed to send via ${channelId}`, err);
      }
    }

    return { sent: sentTo.length > 0, channels: sentTo };
  }

  private resolveTargetChannels(event: NotificationEvent): string[] {
    // Check rules first
    for (const rule of this.config.rules) {
      if (rule.categories && !rule.categories.includes(event.category)) {
        continue;
      }
      if (rule.minLevel && !this.meetsMinLevel(event.level, rule.minLevel)) {
        continue;
      }
      if (rule.channels && rule.channels.length > 0) {
        return rule.channels;
      }
    }

    // Fall back to default channels
    return this.config.defaultChannels;
  }

  private formatNotification(event: NotificationEvent): string {
    const levelEmoji = LEVEL_EMOJI[event.level] || '';
    const categoryEmoji = CATEGORY_EMOJI[event.category] || '';

    const lines: string[] = [];
    lines.push(`${categoryEmoji}${levelEmoji} *${event.title}*`);
    lines.push('');
    lines.push(event.body);

    if (event.data && Object.keys(event.data).length > 0) {
      lines.push('');
      for (const [key, value] of Object.entries(event.data)) {
        lines.push(`• ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
    }

    const time = new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    lines.push('');
    lines.push(`🕐 ${time}`);

    return lines.join('\n');
  }

  private isThrottled(channelId: string, category: string): boolean {
    const key = `${channelId}:${category}`;
    const lastSent = this.lastSentAt.get(key);
    if (!lastSent) return false;
    return Date.now() - lastSent < this.config.throttleMs;
  }

  private meetsMinLevel(
    actual: NotificationEvent['level'],
    min: NotificationEvent['level'],
  ): boolean {
    const levels: NotificationEvent['level'][] = ['info', 'warn', 'error', 'success'];
    return levels.indexOf(actual) >= levels.indexOf(min);
  }

  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    // Remove stale entries (older than 5 minutes)
    const now = Date.now();
    this.queue = this.queue.filter((item) => now - item.queuedAt < 5 * 60 * 1000);

    // Try to send queued notifications
    const toRetry = [...this.queue];
    this.queue = [];

    for (const item of toRetry) {
      await this.handleNotification(item.event);
    }
  }
}
