/**
 * EventBus — typed event emitter for the channel system.
 *
 * All cross-module communication flows through this bus:
 *   Channel Plugin  →  EventBus  →  Agent Runtime / Notifier / Logger
 *
 * Features:
 * - Strongly typed events via ChannelEventMap
 * - Wildcard listeners (listen to all events)
 * - Error isolation (one listener failure doesn't break others)
 * - Event history for debugging
 * - Singleton access via getEventBus()
 */

import { EventEmitter } from 'node:events';
import type { ChannelEventMap, EventPayload } from './types.js';

type EventName = keyof ChannelEventMap;
type WildcardListener = (eventName: EventName, payload: unknown) => void;

interface EventHistoryEntry {
  event: string;
  timestamp: number;
  payloadPreview?: string;
}

const MAX_HISTORY = 200;
const MAX_LISTENERS_PER_EVENT = 50;

export class ChannelEventBus {
  private emitter = new EventEmitter();
  private wildcardListeners = new Set<WildcardListener>();
  private history: EventHistoryEntry[] = [];
  private listenerCounts = new Map<string, number>();

  constructor() {
    this.emitter.setMaxListeners(MAX_LISTENERS_PER_EVENT);
  }

  /**
   * Emit a typed event.
   */
  emit<K extends EventName>(event: K, payload: EventPayload<K>): void {
    // Record history
    this.history.push({
      event,
      timestamp: Date.now(),
      payloadPreview: this.previewPayload(payload),
    });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    // Emit to specific listeners (error-isolated)
    try {
      this.emitter.emit(event, payload);
    } catch (err) {
      console.error(`[EventBus] Listener error on "${event}":`, err);
    }

    // Emit to wildcard listeners
    for (const listener of this.wildcardListeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error(`[EventBus] Wildcard listener error on "${event}":`, err);
      }
    }
  }

  /**
   * Listen for a specific typed event.
   */
  on<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): () => void {
    const count = (this.listenerCounts.get(event) ?? 0) + 1;
    this.listenerCounts.set(event, count);

    // Wrap listener for error isolation
    const safeListener = (payload: unknown) => {
      try {
        listener(payload as EventPayload<K>);
      } catch (err) {
        console.error(`[EventBus] Listener error on "${event}":`, err);
      }
    };

    this.emitter.on(event, safeListener);

    // Return unsubscribe function
    return () => {
      this.emitter.off(event, safeListener);
      const newCount = Math.max(0, (this.listenerCounts.get(event) ?? 1) - 1);
      this.listenerCounts.set(event, newCount);
    };
  }

  /**
   * Listen for a specific event, but only once.
   */
  once<K extends EventName>(event: K, listener: (payload: EventPayload<K>) => void): () => void {
    const safeListener = (payload: unknown) => {
      try {
        listener(payload as EventPayload<K>);
      } catch (err) {
        console.error(`[EventBus] Once listener error on "${event}":`, err);
      }
    };

    this.emitter.once(event, safeListener);

    return () => {
      this.emitter.off(event, safeListener);
    };
  }

  /**
   * Listen for ALL events (useful for logging, diagnostics).
   */
  onAny(listener: WildcardListener): () => void {
    this.wildcardListeners.add(listener);
    return () => {
      this.wildcardListeners.delete(listener);
    };
  }

  /**
   * Get recent event history (for debugging).
   */
  getHistory(limit = 50): EventHistoryEntry[] {
    return this.history.slice(-limit);
  }

  /**
   * Get listener count per event.
   */
  getListenerCounts(): Record<string, number> {
    return Object.fromEntries(this.listenerCounts);
  }

  /**
   * Remove all listeners (for shutdown).
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.wildcardListeners.clear();
    this.listenerCounts.clear();
  }

  private previewPayload(payload: unknown): string {
    try {
      const str = JSON.stringify(payload);
      return str.length > 120 ? str.substring(0, 120) + '...' : str;
    } catch {
      return '[unserializable]';
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: ChannelEventBus | null = null;

export function getEventBus(): ChannelEventBus {
  if (!_instance) {
    _instance = new ChannelEventBus();
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetEventBus(): void {
  if (_instance) {
    _instance.removeAllListeners();
    _instance = null;
  }
}
