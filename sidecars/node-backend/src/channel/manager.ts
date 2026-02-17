/**
 * ChannelManager — plugin lifecycle management for all messaging channels.
 *
 * Responsibilities:
 * - Register / unregister channel plugins
 * - Start / stop plugins in correct order
 * - Route outbound messages to the correct plugin
 * - Health monitoring for all channels
 * - Expose status for health endpoint
 *
 * Usage:
 *   const manager = new ChannelManager(eventBus);
 *   manager.register(new TelegramPlugin(config, agentRuntime));
 *   await manager.startAll();
 *   // ...later
 *   await manager.stopAll();
 */

import { ChannelEventBus } from './eventBus.js';
import { logger } from '../utils/logger.js';
import type {
  IChannelPlugin,
  ChannelPluginConfig,
  ChannelPluginStatus,
  OutboundMessage,
  InboundMessage,
} from './types.js';

export class ChannelManager {
  private plugins = new Map<string, IChannelPlugin>();
  private configs = new Map<string, ChannelPluginConfig>();
  private eventBus: ChannelEventBus;
  private startedAt: number | null = null;

  constructor(eventBus: ChannelEventBus) {
    this.eventBus = eventBus;
    this.setupInternalListeners();
  }

  // ---------------------------------------------------------------------------
  // Plugin registration
  // ---------------------------------------------------------------------------

  /**
   * Register a channel plugin. The plugin is NOT started yet.
   */
  register(plugin: IChannelPlugin, config: ChannelPluginConfig): void {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`[ChannelManager] Plugin "${plugin.id}" already registered, replacing...`);
      // Stop old plugin if running
      const old = this.plugins.get(plugin.id);
      if (old) {
        old.stop().catch((err) => {
          logger.error(`[ChannelManager] Failed to stop old "${plugin.id}"`, err);
        });
      }
    }

    this.plugins.set(plugin.id, plugin);
    this.configs.set(plugin.id, config);

    this.eventBus.emit('channel:registered', {
      channel: plugin.id,
      timestamp: Date.now(),
    });

    logger.info(`[ChannelManager] Registered: ${plugin.id} (${plugin.name})`);
  }

  /**
   * Unregister and stop a channel plugin.
   */
  async unregister(channelId: string): Promise<void> {
    const plugin = this.plugins.get(channelId);
    if (!plugin) return;

    try {
      await plugin.stop();
    } catch (err) {
      logger.error(`[ChannelManager] Error stopping "${channelId}"`, err);
    }

    this.plugins.delete(channelId);
    this.configs.delete(channelId);

    this.eventBus.emit('channel:unregistered', {
      channel: channelId,
      timestamp: Date.now(),
    });

    logger.info(`[ChannelManager] Unregistered: ${channelId}`);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle management
  // ---------------------------------------------------------------------------

  /**
   * Initialize and start all registered plugins.
   */
  async startAll(): Promise<void> {
    this.startedAt = Date.now();
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const [id, plugin] of this.plugins) {
      const config = this.configs.get(id);
      if (!config?.enabled) {
        logger.info(`[ChannelManager] Skipping disabled channel: ${id}`);
        results.push({ id, ok: true });
        continue;
      }

      try {
        this.eventBus.emit('channel:state', {
          channel: id,
          state: 'starting',
          timestamp: Date.now(),
        });

        await plugin.initialize(config);
        await plugin.start();

        this.eventBus.emit('channel:state', {
          channel: id,
          state: 'running',
          timestamp: Date.now(),
        });

        results.push({ id, ok: true });
        logger.info(`[ChannelManager] Started: ${id}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        this.eventBus.emit('channel:state', {
          channel: id,
          state: 'error',
          error: errMsg,
          timestamp: Date.now(),
        });

        results.push({ id, ok: false, error: errMsg });
        logger.error(`[ChannelManager] Failed to start "${id}"`, err);
      }
    }

    const started = results.filter((r) => r.ok).map((r) => r.id);
    this.eventBus.emit('system:startup', {
      timestamp: Date.now(),
      services: started,
    });
  }

  /**
   * Gracefully stop all plugins.
   */
  async stopAll(reason?: string): Promise<void> {
    this.eventBus.emit('system:shutdown', {
      timestamp: Date.now(),
      reason,
    });

    const promises = Array.from(this.plugins.entries()).map(async ([id, plugin]) => {
      try {
        this.eventBus.emit('channel:state', {
          channel: id,
          state: 'stopped',
          timestamp: Date.now(),
        });
        await plugin.stop();
      } catch (err) {
        logger.error(`[ChannelManager] Error stopping "${id}"`, err);
      }
    });

    await Promise.allSettled(promises);
    logger.info('[ChannelManager] All channels stopped');
  }

  // ---------------------------------------------------------------------------
  // Message routing
  // ---------------------------------------------------------------------------

  /**
   * Send a message via a specific channel plugin.
   */
  async sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }> {
    const plugin = this.plugins.get(msg.channel);
    if (!plugin) {
      throw new Error(`Channel "${msg.channel}" not registered`);
    }
    if (!plugin.isHealthy()) {
      throw new Error(`Channel "${msg.channel}" is not healthy`);
    }

    try {
      const result = await plugin.sendMessage(msg);

      this.eventBus.emit('message:sent', {
        channel: msg.channel,
        chatId: msg.chatId,
        messageId: result.messageId,
        timestamp: Date.now(),
      });

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      this.eventBus.emit('message:failed', {
        channel: msg.channel,
        chatId: msg.chatId,
        error: errMsg,
        timestamp: Date.now(),
      });

      throw err;
    }
  }

  /**
   * Broadcast a message to all healthy channels (for notifications).
   */
  async broadcast(text: string, options?: { parseMode?: 'markdown' | 'html' | 'plain'; silent?: boolean }): Promise<Array<{ channel: string; ok: boolean; error?: string }>> {
    const results: Array<{ channel: string; ok: boolean; error?: string }> = [];

    for (const [id, plugin] of this.plugins) {
      if (!plugin.isHealthy()) continue;

      const ownerChatId = plugin.getOwnerChatId();
      if (!ownerChatId) continue;

      try {
        await plugin.sendMessage({
          channel: id,
          chatId: ownerChatId,
          text,
          parseMode: options?.parseMode,
          silent: options?.silent,
        });
        results.push({ channel: id, ok: true });
      } catch (err) {
        results.push({
          channel: id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Get a specific plugin by ID. */
  getPlugin(channelId: string): IChannelPlugin | undefined {
    return this.plugins.get(channelId);
  }

  /** Get all registered plugin IDs. */
  getRegisteredChannels(): string[] {
    return Array.from(this.plugins.keys());
  }

  /** Get status of all channels. */
  getAllStatus(): Record<string, ChannelPluginStatus & { config: ChannelPluginConfig }> {
    const result: Record<string, ChannelPluginStatus & { config: ChannelPluginConfig }> = {};

    for (const [id, plugin] of this.plugins) {
      const config = this.configs.get(id);
      if (config) {
        result[id] = { ...plugin.getStatus(), config };
      }
    }

    return result;
  }

  /** Check if any channel is healthy and can send messages. */
  hasHealthyChannel(): boolean {
    for (const plugin of this.plugins.values()) {
      if (plugin.isHealthy()) return true;
    }
    return false;
  }

  /** Get the first healthy channel's owner chat ID (for fallback notifications). */
  getDefaultOwnerChatId(): { channel: string; chatId: string } | null {
    for (const [id, plugin] of this.plugins) {
      if (plugin.isHealthy()) {
        const chatId = plugin.getOwnerChatId();
        if (chatId) return { channel: id, chatId };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private setupInternalListeners(): void {
    // Log all inbound messages
    this.eventBus.on('message:inbound', (msg: InboundMessage) => {
      logger.info(`[ChannelManager] Inbound from ${msg.channel}: ${msg.text.substring(0, 60)}...`);
    });

    // Log channel state changes
    this.eventBus.on('channel:state', (event) => {
      if (event.state === 'error') {
        logger.error(`[ChannelManager] Channel "${event.channel}" error: ${event.error}`);
      }
    });
  }
}
