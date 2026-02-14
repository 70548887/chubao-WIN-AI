import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express, { type Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerMultiAgentRoutes,
  type MultiAgentErrorCode,
  type MultiAgentSendError,
} from './multiAgent.js';

interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function createSendError(): MultiAgentSendError {
  return (
    res: Response,
    statusCode: number,
    errorCode: MultiAgentErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) => {
    res.status(statusCode).json({
      success: false,
      errorCode,
      message,
      details,
      requestId: randomUUID(),
    });
  };
}

async function startTestServer(config: {
  initializeSkills: () => Promise<void>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  inferErrorCode: (error: unknown) => MultiAgentErrorCode;
}): Promise<RunningServer> {
  const app = express();
  app.use(express.json());
  registerMultiAgentRoutes({
    app,
    initializeSkills: config.initializeSkills,
    executeTool: config.executeTool,
    inferErrorCode: config.inferErrorCode,
    sendError: createSendError(),
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

describe('multi-agent routes', () => {
  const runningServers: RunningServer[] = [];

  afterEach(async () => {
    while (runningServers.length > 0) {
      const item = runningServers.pop();
      if (item) {
        await item.close();
      }
    }
  });

  it('returns INVALID_ARGUMENT when start payload is invalid', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({}));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
      details?: Record<string, unknown>;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_ARGUMENT');
    expect(body.details?.field).toBe('tasks');
    expect(initializeSkills).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('starts group with valid payload and executes expected tool', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({
      groupId: 'group-1',
      state: 'running',
      summary: { total: 1 },
    }));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: [
          {
            kind: 'delegate',
            agentType: 'frontend',
            taskDescription: 'build panel',
          },
        ],
        projectPath: 'C:\\repo\\demo',
        timeoutMs: 120000,
      }),
    });
    const body = (await response.json()) as {
      success: boolean;
      group: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.group.groupId).toBe('group-1');
    expect(initializeSkills).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('multi_agent_start', {
      tasks: [
        {
          kind: 'delegate',
          agentType: 'frontend',
          taskDescription: 'build panel',
        },
      ],
      projectPath: 'C:\\repo\\demo',
      timeoutMs: 120000,
    });
  });

  it('returns group list payload', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({
      count: 1,
      groups: [{ groupId: 'g-1', state: 'running' }],
    }));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups`);
    const body = (await response.json()) as {
      success: boolean;
      groups: { count: number; groups: Array<{ groupId: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.groups.count).toBe(1);
    expect(body.groups.groups[0]?.groupId).toBe('g-1');
    expect(executeTool).toHaveBeenCalledWith('multi_agent_group_list', {});
  });

  it('passes state/limit/offset query to list tool', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({
      count: 2,
      groups: [{ groupId: 'g-2', state: 'running' }],
      page: { limit: 1, offset: 1, returned: 1 },
    }));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups?state=running&limit=1&offset=1`);
    const body = (await response.json()) as {
      success: boolean;
      groups: { count: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.groups.count).toBe(2);
    expect(executeTool).toHaveBeenCalledWith('multi_agent_group_list', {
      state: 'running',
      limit: 1,
      offset: 1,
    });
  });

  it('returns INVALID_ARGUMENT for invalid list state query', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({}));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups?state=invalid-state`);
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_ARGUMENT');
    expect(body.message).toContain('state must be one of');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('returns INVALID_ARGUMENT for invalid list limit query', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({}));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups?limit=0`);
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_ARGUMENT');
    expect(body.message).toContain('limit must be an integer >= 1');
    expect(initializeSkills).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('returns INVALID_ARGUMENT for invalid list offset query', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({}));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups?offset=-1`);
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_ARGUMENT');
    expect(body.message).toContain('offset must be an integer >= 0');
    expect(initializeSkills).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('maps not-found group status to 404 NOT_FOUND', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => {
      throw new Error('multi-agent group not found: missing-group');
    });
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>((error) => {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      return message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    });
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups/missing-group`);
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('NOT_FOUND');
    expect(body.message).toContain('not found');
  });

  it('cancels group and returns result payload', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => ({
      groupId: 'group-2',
      state: 'canceled',
      cancelResults: [],
    }));
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'INTERNAL_ERROR');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups/group-2/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as {
      success: boolean;
      result: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.state).toBe('canceled');
    expect(executeTool).toHaveBeenCalledWith('multi_agent_group_cancel', {
      groupId: 'group-2',
    });
  });

  it('maps SERVICE_UNAVAILABLE to HTTP 503', async () => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => {
      throw new Error('multi-agent service unavailable: running task limit reached (21/20)');
    });
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => 'SERVICE_UNAVAILABLE');
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: [
          {
            kind: 'task',
            taskCategory: 'backend',
            taskPrompt: 'overflow',
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('SERVICE_UNAVAILABLE');
    expect(body.message).toContain('service unavailable');
  });

  it.each([
    {
      code: 'FORBIDDEN' as const,
      status: 403,
      message: 'blocked by security policy',
      expected: 'FORBIDDEN',
    },
    {
      code: 'DEPENDENCY_UNAVAILABLE' as const,
      status: 503,
      message: 'dependency not configured',
      expected: 'DEPENDENCY_UNAVAILABLE',
    },
    {
      code: 'TIMEOUT' as const,
      status: 504,
      message: 'execution timeout',
      expected: 'TIMEOUT',
    },
    {
      code: 'INTERNAL_ERROR' as const,
      status: 500,
      message: 'unexpected crash',
      expected: 'INTERNAL_ERROR',
    },
  ])('maps $code to HTTP $status', async ({ code, status, message, expected }) => {
    const initializeSkills = vi.fn(async () => {});
    const executeTool = vi.fn(async () => {
      throw new Error(message);
    });
    const inferErrorCode = vi.fn<(_: unknown) => MultiAgentErrorCode>(() => code);
    const server = await startTestServer({
      initializeSkills,
      executeTool,
      inferErrorCode,
    });
    runningServers.push(server);

    const response = await fetch(`${server.baseUrl}/api/multi-agent/groups/group-mapping`);
    const body = (await response.json()) as {
      success: boolean;
      errorCode: string;
      message: string;
    };

    expect(response.status).toBe(status);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe(expected);
    expect(body.message).toContain(message);
  });
});
