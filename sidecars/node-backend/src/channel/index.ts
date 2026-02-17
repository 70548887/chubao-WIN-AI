/**
 * Channel System — unified export.
 *
 * Architecture:
 *   EventBus  ←→  ChannelManager  ←→  Plugins (Telegram, Lark, ...)
 *                       ↕
 *                   Notifier
 */

export { ChannelEventBus, getEventBus, resetEventBus } from './eventBus.js';
export { ChannelManager } from './manager.js';
export { Notifier } from './notifier.js';

// Types
export type {
  IChannelPlugin,
  ChannelPluginConfig,
  ChannelPluginCapabilities,
  ChannelPluginStatus,
  ChannelState,
  InboundMessage,
  OutboundMessage,
  NotificationEvent,
  NotifierConfig,
  NotifierRule,
  ChannelEventMap,
  ChannelStateEvent,
  EventPayload,
} from './types.js';

// Plugins
export { TelegramPlugin } from './plugins/telegram.js';
export { DingTalkPlugin } from './plugins/dingtalk.js';
export { WeChatWorkPlugin } from './plugins/wechat-work.js';
