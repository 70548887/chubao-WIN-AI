import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GatewayServer } from './server.js';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentRuntime } from '../agent/runtime.js';
import { EventEmitter } from 'events';

describe('GatewayServer', () => {
  let mockWss: WebSocketServer;
  let mockAgentRuntime: AgentRuntime;
  let server: GatewayServer;
  let connectionHandler: ((ws: any) => void) | null = null;

  beforeEach(() => {
    mockWss = {
      on: vi.fn((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
    } as unknown as WebSocketServer;

    mockAgentRuntime = {
      chat: vi.fn().mockResolvedValue('Test response'),
    } as unknown as AgentRuntime;

    server = new GatewayServer(mockWss, mockAgentRuntime);
  });

  afterEach(() => {
    connectionHandler = null;
    vi.clearAllMocks();
  });

  function createMockWebSocket(): any {
    const ws = new EventEmitter() as any;
    ws.readyState = WebSocket.OPEN;
    ws.send = vi.fn();
    return ws;
  }

  function triggerConnection(ws: any) {
    if (connectionHandler) {
      connectionHandler(ws);
    }
  }

  it('should setup WebSocket on construction', () => {
    expect(mockWss.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  describe('broadcast', () => {
    it('should broadcast message to all clients', () => {
      const mockClient1 = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
      };
      const mockClient2 = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
      };

      // Add clients manually
      (server as any).clients.add(mockClient1);
      (server as any).clients.add(mockClient2);

      server.broadcast({
        type: 'test',
        payload: 'test message',
      });

      expect(mockClient1.send).toHaveBeenCalled();
      expect(mockClient2.send).toHaveBeenCalled();
    });

    it('should not send to closed clients', () => {
      const mockClient = {
        readyState: WebSocket.CLOSED,
        send: vi.fn(),
      };

      (server as any).clients.add(mockClient);

      server.broadcast({
        type: 'test',
        payload: 'test message',
      });

      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should broadcast to multiple clients with mixed states', () => {
      const openClient1 = { readyState: WebSocket.OPEN, send: vi.fn() };
      const openClient2 = { readyState: WebSocket.OPEN, send: vi.fn() };
      const closedClient = { readyState: WebSocket.CLOSED, send: vi.fn() };
      const connectingClient = { readyState: WebSocket.CONNECTING, send: vi.fn() };

      (server as any).clients.add(openClient1);
      (server as any).clients.add(closedClient);
      (server as any).clients.add(openClient2);
      (server as any).clients.add(connectingClient);

      server.broadcast({ type: 'test', payload: 'hello' });

      expect(openClient1.send).toHaveBeenCalledTimes(1);
      expect(openClient2.send).toHaveBeenCalledTimes(1);
      expect(closedClient.send).not.toHaveBeenCalled();
      expect(connectingClient.send).not.toHaveBeenCalled();
    });
  });

  describe('connection lifecycle', () => {
    it('should send welcome message on connection', async () => {
      const mockWs = createMockWebSocket();
      triggerConnection(mockWs);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
    });

    it('should remove client on close', async () => {
      const mockWs = createMockWebSocket();
      triggerConnection(mockWs);
      
      expect((server as any).clients.size).toBe(1);
      
      mockWs.emit('close');
      
      expect((server as any).clients.size).toBe(0);
    });

    it('should remove client on error', async () => {
      const mockWs = createMockWebSocket();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      triggerConnection(mockWs);
      
      mockWs.emit('error', new Error('Connection error'));
      
      expect((server as any).clients.size).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should handle multiple concurrent connections', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();
      
      triggerConnection(ws1);
      triggerConnection(ws2);
      triggerConnection(ws3);

      expect((server as any).clients.size).toBe(3);
    });
  });

  describe('message handling', () => {
    it('should handle chat message', async () => {
      const mockWs = createMockWebSocket();
      triggerConnection(mockWs);
      
      mockWs.send.mockClear(); // Clear welcome message
      
      mockWs.emit('message', Buffer.from(JSON.stringify({
        type: 'chat',
        payload: 'Hello AI',
        id: 'test-123'
      })));

      await vi.waitFor(() => {
        expect(mockAgentRuntime.chat).toHaveBeenCalledWith('Hello AI', 'test-123');
      });

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"chat_response"')
      );
    });

    it('should handle ping/pong', async () => {
      const mockWs = createMockWebSocket();
      triggerConnection(mockWs);
      
      mockWs.send.mockClear();
      
      mockWs.emit('message', Buffer.from(JSON.stringify({ 
        type: 'ping', 
        payload: null 
      })));

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"pong"')
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      const mockWs = createMockWebSocket();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      triggerConnection(mockWs);
      
      mockWs.send.mockClear();
      
      mockWs.emit('message', Buffer.from('invalid json {{{'));

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      consoleSpy.mockRestore();
    });

    it('should handle unknown message type', async () => {
      const mockWs = createMockWebSocket();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      triggerConnection(mockWs);
      
      mockWs.emit('message', Buffer.from(JSON.stringify({
        type: 'unknown_type',
        payload: 'test'
      })));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('未知消息类型'),
        'unknown_type'
      );
      consoleSpy.mockRestore();
    });

    it('should handle agent runtime errors', async () => {
      mockAgentRuntime.chat = vi.fn().mockRejectedValueOnce(new Error('Agent failed'));
      const mockWs = createMockWebSocket();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      triggerConnection(mockWs);
      
      mockWs.send.mockClear();
      
      mockWs.emit('message', Buffer.from(JSON.stringify({
        type: 'chat',
        payload: 'test',
        id: 'test-id'
      })));

      await vi.waitFor(() => {
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
      });
      consoleSpy.mockRestore();
    });

    it('should preserve message id in response', async () => {
      const mockWs = createMockWebSocket();
      triggerConnection(mockWs);
      
      mockWs.send.mockClear();
      
      const messageId = 'unique-message-id-123';
      mockWs.emit('message', Buffer.from(JSON.stringify({
        type: 'chat',
        payload: 'Test',
        id: messageId
      })));

      await vi.waitFor(() => {
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining(`"id":"${messageId}"`)
        );
      });
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket send errors gracefully', () => {
      const mockClient1 = {
        readyState: WebSocket.OPEN,
        send: vi.fn(), // Success
      };
      const mockClient2 = {
        readyState: WebSocket.OPEN,
        send: vi.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
      };

      (server as any).clients.add(mockClient1);
      (server as any).clients.add(mockClient2);

      // Should throw because broadcast doesn't catch errors
      expect(() => {
        server.broadcast({ type: 'test', payload: 'data' });
      }).toThrow('Send failed');
      
      // First client should have received the message
      expect(mockClient1.send).toHaveBeenCalled();
    });

    it('should handle malformed message data', async () => {
      const mockWs = createMockWebSocket();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      triggerConnection(mockWs);
      
      mockWs.emit('message', Buffer.from(''));
      mockWs.emit('message', Buffer.from('null'));
      mockWs.emit('message', Buffer.from('undefined'));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
