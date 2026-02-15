/**
 * Channel System — Core type definitions
 *
 * Defines the plugin interface, event contracts, and message types
 * for the extensible channel architecture.
 */

// ---------------------------------------------------------------------------
// Event types — all events flowing through the EventBus
// ---------------------------------------------------------------------------

/** Inbound message from a channel (user → AI) */
export interface InboundMessage {
  /** Unique message identifier */
  id: string;
  /** Channel that received this message */
  channel: string;
  /** Chat / conversation identifier within the channel */
  chatId: string;
  /** Sender identifier */
  senderId: string;
  /** Sender display name */
  senderName?: string;
  /** Message text content */
  text: string;
  /** Optional media attachment path */
  mediaPath?: string;
  /** Original platform-specific message object */
  raw?: unknown;
  /** Timestamp */
  timestamp: number;
}

/** Outbound reply from Agent → channel */
export interface OutboundMessage {
  /** Target channel (e.g. "telegram", "lark") */
  channel: string;
  /** Target chat id */
  chatId: string;
  /** Message text */
  text: string;
  /** Parse mode hint */
  parseMode?: 'markdown' | 'html' | 'plain';
  /** Reply to a specific message id */
  replyToMessageId?: string | number;
  /** Optional media URL to send */
  mediaUrl?: string;
  /** Send silently (no notification sound) */
  silent?: boolean;
}

/** Notification event (AI → user, proactive push) */
export interface NotificationEvent {
  /** Notification category */
  category: 'upgrade' | 'error' | 'health' | 'system' | 'progress' | 'custom';
  /** Short title */
  title: string;
  /** Detailed message body */
  body: string;
  /** Severity level */
  level: 'info' | 'warn' | 'error' | 'success';
  /** Extra structured data */
  data?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

/** Channel lifecycle events */
export type ChannelState = 'stopped' | 'starting' | 'running' | 'error' | 'reconnecting';

export interface ChannelStateEvent {
  channel: string;
  state: ChannelState;
  error?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// EventBus event map — strongly typed
// ---------------------------------------------------------------------------

export interface ChannelEventMap {
  // Message events
  'message:inbound': InboundMessage;
  'message:outbound': OutboundMessage;
  'message:sent': { channel: string; chatId: string; messageId?: string; timestamp: number };
  'message:failed': { channel: string; chatId: string; error: string; timestamp: number };

  // Notification events (AI proactively pushes to user)
  'notify': NotificationEvent;
  'notify:upgrade': NotificationEvent;
  'notify:error': NotificationEvent;
  'notify:health': NotificationEvent;
  'notify:progress': NotificationEvent;

  // Channel lifecycle
  'channel:state': ChannelStateEvent;
  'channel:registered': { channel: string; timestamp: number };
  'channel:unregistered': { channel: string; timestamp: number };

  // System events
  'system:startup': { timestamp: number; services: string[] };
  'system:shutdown': { timestamp: number; reason?: string };
  'system:restart': { timestamp: number; reason?: string; delayMs?: number };
}

// Helper type to get event payload by name
export type EventPayload<K extends keyof ChannelEventMap> = ChannelEventMap[K];

// ---------------------------------------------------------------------------
// Channel Plugin interface — all channel plugins must implement this
// ---------------------------------------------------------------------------

export interface ChannelPluginConfig {
  /** Unique channel identifier */
  id: string;
  /** Display name */
  name: string;
  /** Whether this channel is enabled */
  enabled: boolean;
  /** Channel-specific config */
  [key: string]: unknown;
}

export interface ChannelPluginCapabilities {
  /** Can receive inbound messages */
  receive: boolean;
  /** Can send outbound messages */
  send: boolean;
  /** Can send media (images, files) */
  media: boolean;
  /** Supports inline buttons / keyboards */
  buttons: boolean;
  /** Supports threading */
  threads: boolean;
  /** Supports reactions */
  reactions: boolean;
}

export interface ChannelPluginStatus {
  state: ChannelState;
  uptime: number;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  metadata?: Record<string, unknown>;
}

/**
 * ChannelPlugin — the contract every channel must implement.
 *
 * Lifecycle: register → start → (running) → stop
 * Each plugin is self-contained: it manages its own connection,
 * emits events to the EventBus, and listens for outbound requests.
 */
export interface IChannelPlugin {
  /** Unique channel identifier (e.g. "telegram", "lark", "whatsapp") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** What this channel can do */
  readonly capabilities: ChannelPluginCapabilities;

  /** Initialize the plugin (called once at registration) */
  initialize(config: ChannelPluginConfig): Promise<void>;

  /** Start receiving / sending messages */
  start(): Promise<void>;

  /** Gracefully stop the channel */
  stop(): Promise<void>;

  /** Send a message through this channel */
  sendMessage(msg: OutboundMessage): Promise<{ messageId?: string }>;

  /** Get current status */
  getStatus(): ChannelPluginStatus;

  /** Get the owner/admin chat ID for proactive notifications */
  getOwnerChatId(): string | null;

  /** Whether this channel is currently healthy and can send messages */
  isHealthy(): boolean;
}

// ---------------------------------------------------------------------------
// Notifier config — controls which notifications go where
// ---------------------------------------------------------------------------

export interface NotifierRule {
  /** Which categories to match (empty = all) */
  categories?: NotificationEvent['category'][];
  /** Minimum level to trigger */
  minLevel?: NotificationEvent['level'];
  /** Target channels (empty = all enabled channels) */
  channels?: string[];
  /** Format template (supports {title}, {body}, {level}, {category}) */
  template?: string;
}

export interface NotifierConfig {
  /** Whether proactive notifications are enabled */
  enabled: boolean;
  /** Default channels for notifications */
  defaultChannels: string[];
  /** Rules for routing different notification types */
  rules: NotifierRule[];
  /** Throttle: min interval between notifications in ms */
  throttleMs: number;
}
