/**
 * Gateway 服务器 - WebSocket 消息处理
 */

import { WebSocketServer, WebSocket } from 'ws';
import { AgentRuntime } from '../agent/runtime.js';
import { logger } from '../utils/logger.js';

interface WSMessage {
  type: string;
  payload: unknown;
  id?: string;
}

export class GatewayServer {
  private wss: WebSocketServer;
  private agentRuntime: AgentRuntime;
  private clients: Set<WebSocket> = new Set();

  constructor(wss: WebSocketServer, agentRuntime: AgentRuntime) {
    this.wss = wss;
    this.agentRuntime = agentRuntime;
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('📡 新客户端连接');
      this.clients.add(ws);

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error('消息处理错误', error);
          this.sendError(ws, String(error));
        }
      });

      ws.on('close', () => {
        logger.info('📡 客户端断开');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket 错误', error);
        this.clients.delete(ws);
      });

      // 发送欢迎消息
      this.send(ws, {
        type: 'connected',
        payload: { message: 'Chubao AI 已连接' }
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: WSMessage): Promise<void> {
    switch (message.type) {
      case 'chat':
        const response = await this.agentRuntime.chat(
          message.payload as string,
          message.id
        );
        this.send(ws, {
          type: 'chat_response',
          payload: response,
          id: message.id
        });
        break;

      case 'ping':
        this.send(ws, { type: 'pong', payload: null });
        break;

      default:
        logger.info(`未知消息类型: ${message.type}`, { type: message.type });
    }
  }

  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, { type: 'error', payload: { error } });
  }

  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}
