import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GatewayServer } from './server.js';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentRuntime } from '../agent/runtime.js';

describe('GatewayServer', () => {
  let mockWss: WebSocketServer;
  let mockAgentRuntime: AgentRuntime;
  let server: GatewayServer;

  beforeEach(() => {
    mockWss = {
      on: vi.fn(),
    } as unknown as WebSocketServer;

    mockAgentRuntime = {
      chat: vi.fn().mockResolvedValue('Test response'),
    } as unknown as AgentRuntime;

    server = new GatewayServer(mockWss, mockAgentRuntime);
  });

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
  });
});
