import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { toolManagerMock, anthropicCreateMock } = vi.hoisted(() => ({
  toolManagerMock: {
    initializeSkills: vi.fn(async () => {}),
    getToolDefinitions: vi.fn(() => [{ name: 'dummy_tool', description: 'dummy' }]),
    getAllTools: vi.fn(() => [{ name: 'dummy_tool', description: 'dummy' }]),
    executeTool: vi.fn(async () => ({ ok: true })),
  },
  anthropicCreateMock: vi.fn(),
}));

vi.mock('../tools/index.js', () => ({
  toolManager: toolManagerMock,
  ToolManager: class ToolManager {},
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = {
        create: anthropicCreateMock,
      };
    },
  };
});

import { AgentRuntime } from './runtime.js';

describe('AgentRuntime session and iteration behavior', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CHUBAO_AI_PROVIDER = 'anthropic';
    anthropicCreateMock.mockReset();
    toolManagerMock.initializeSkills.mockClear();
    toolManagerMock.getToolDefinitions.mockClear();
    toolManagerMock.getAllTools.mockClear();
    toolManagerMock.executeTool.mockClear();
  });

  it('persists session messages and reuses them across calls', async () => {
    const tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'agent-session-test-'));
    const sessionPath = path.join(tmpDir, 'agent-sessions.json');

    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.CHUBAO_SESSION_STATE_ENABLED = 'true';
    process.env.CHUBAO_SESSION_STATE_PATH = sessionPath;

    anthropicCreateMock
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'resp-1' }],
        stop_reason: 'end_turn',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'resp-2' }],
        stop_reason: 'end_turn',
      });

    const memoryManager = {
      search: vi.fn(async () => []),
      addDaily: vi.fn(async () => {}),
    };

    const runtime = new AgentRuntime(memoryManager as any);
    await runtime.chatSimple('hello-1', 'session-a');
    await runtime.chatSimple('hello-2', 'session-a');

    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
    const secondCallArg = anthropicCreateMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(secondCallArg.messages.length).toBeGreaterThanOrEqual(3);
    expect(secondCallArg.messages[0]?.role).toBe('user');
    expect(
      secondCallArg.messages.some(
        (entry) => entry.role === 'user' && entry.content === 'hello-2',
      ),
    ).toBe(true);

    const persisted = JSON.parse(fsSync.readFileSync(sessionPath, 'utf8')) as {
      sessions: Array<{ id: string; messages: Array<{ role: string }> }>;
    };
    expect(persisted.sessions[0]?.id).toBe('session-a');
    expect(persisted.sessions[0]?.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('uses default maxIterations=50 when env is not set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.CHUBAO_AGENT_MAX_ITERATIONS;
    process.env.CHUBAO_SESSION_STATE_ENABLED = 'false';

    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'dummy_tool',
          input: {},
        },
      ],
      stop_reason: 'tool_use',
    });

    const memoryManager = {
      search: vi.fn(async () => []),
      addDaily: vi.fn(async () => {}),
    };

    const runtime = new AgentRuntime(memoryManager as any);
    await runtime.chat('loop-test', 'session-loop');

    expect(anthropicCreateMock).toHaveBeenCalledTimes(50);
  });
});
