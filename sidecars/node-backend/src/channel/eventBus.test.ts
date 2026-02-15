import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelEventBus, getEventBus, resetEventBus } from './eventBus.js';

describe('ChannelEventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  it('should emit and receive events', () => {
    const bus = new ChannelEventBus();
    const listener = vi.fn();

    bus.on('message:inbound', listener);
    bus.emit('message:inbound', {
      id: 'msg-1',
      channel: 'telegram',
      chatId: '123',
      senderId: 'user-1',
      text: 'Hello',
      timestamp: Date.now(),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-1',
        channel: 'telegram',
        text: 'Hello',
      })
    );
  });

  it('should support multiple listeners', () => {
    const bus = new ChannelEventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.on('message:outbound', listener1);
    bus.on('message:outbound', listener2);
    bus.emit('message:outbound', {
      channel: 'telegram',
      chatId: '123',
      text: 'Reply',
    });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should support once listener', () => {
    const bus = new ChannelEventBus();
    const listener = vi.fn();

    bus.once('notify', listener);
    bus.emit('notify', {
      category: 'system',
      title: 'Test',
      body: 'Test body',
      level: 'info',
      timestamp: Date.now(),
    });
    bus.emit('notify', {
      category: 'system',
      title: 'Test 2',
      body: 'Test body 2',
      level: 'info',
      timestamp: Date.now(),
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should support wildcard listeners', () => {
    const bus = new ChannelEventBus();
    const listener = vi.fn();

    bus.onAny(listener);
    bus.emit('message:inbound', { id: '1', channel: 'test', chatId: '1', senderId: '1', text: 'test', timestamp: 1 });
    bus.emit('channel:registered', { channel: 'test', timestamp: 1 });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should return unsubscribe function', () => {
    const bus = new ChannelEventBus();
    const listener = vi.fn();

    const unsubscribe = bus.on('message:inbound', listener);
    unsubscribe();

    bus.emit('message:inbound', { id: '1', channel: 'test', chatId: '1', senderId: '1', text: 'test', timestamp: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('should track event history', () => {
    const bus = new ChannelEventBus();

    bus.emit('message:inbound', { id: '1', channel: 'test', chatId: '1', senderId: '1', text: 'test1', timestamp: 1 });
    bus.emit('message:inbound', { id: '2', channel: 'test', chatId: '1', senderId: '1', text: 'test2', timestamp: 2 });
    bus.emit('message:inbound', { id: '3', channel: 'test', chatId: '1', senderId: '1', text: 'test3', timestamp: 3 });

    const history = bus.getHistory(2);
    expect(history).toHaveLength(2);
    expect(history[0].event).toBe('message:inbound');
  });

  it('should return listener counts', () => {
    const bus = new ChannelEventBus();

    bus.on('message:inbound', vi.fn());
    bus.on('message:inbound', vi.fn());
    bus.on('message:outbound', vi.fn());
    bus.onAny(vi.fn());

    const counts = bus.getListenerCounts();
    expect(counts['message:inbound']).toBe(2);
    expect(counts['message:outbound']).toBe(1);
    expect(counts['*']).toBe(1);
  });

  it('should isolate errors in listeners', () => {
    const bus = new ChannelEventBus();
    const errorListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    const successListener = vi.fn();

    bus.on('message:inbound', errorListener);
    bus.on('message:inbound', successListener);

    // Should not throw
    expect(() => {
      bus.emit('message:inbound', { id: '1', channel: 'test', chatId: '1', senderId: '1', text: 'test', timestamp: 1 });
    }).not.toThrow();

    expect(errorListener).toHaveBeenCalled();
    expect(successListener).toHaveBeenCalled();
  });
});

describe('getEventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  it('should return singleton instance', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it('should create new instance after reset', () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });
});
