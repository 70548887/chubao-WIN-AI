import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan } from '../planner/types';
import { executePlan } from './taskExecutor';

type MockResponseBody = Record<string, unknown>;

function createResponse(body: MockResponseBody, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('executePlan', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns guard text when plan has no steps', async () => {
    const plan: ExecutionPlan = {
      intent: 'general_chat',
      originalMessage: 'hello',
      steps: [],
    };
    await expect(executePlan(plan)).resolves.toBe('No executable plan steps.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('executes chat step', async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        success: true,
        response: 'chat ok',
      }),
    );

    const plan: ExecutionPlan = {
      intent: 'general_chat',
      originalMessage: 'hello',
      steps: [
        {
          id: 'chat-1',
          action: 'call_chat',
          reason: 'fallback',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/1] chat-1 (call_chat, required, timeout=');
    expect(output).toContain('chat ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3100/api/chat',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('executes coding progress step and formats summary', async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        success: true,
        progress: {
          branch: 'main',
          upstream: 'origin/main',
          ahead: 2,
          behind: 1,
          clean: false,
          counts: {
            staged: 1,
            unstaged: 2,
            untracked: 3,
            modified: 0,
            added: 0,
            deleted: 0,
            renamed: 0,
            conflicted: 0,
            totalFiles: 6,
          },
          changedFiles: ['a.ts', 'b.ts'],
          recentCommits: [
            {
              hash: '1234567890abcdef',
              author: 'dev',
              date: '2026-02-14T00:00:00.000Z',
              subject: 'update feature',
            },
          ],
          commitCountSince: 5,
          sinceDays: 7,
          generatedAt: '2026-02-14T00:00:00.000Z',
        },
      }),
    );

    const plan: ExecutionPlan = {
      intent: 'coding_progress',
      originalMessage: 'progress',
      steps: [
        {
          id: 'coding-progress-1',
          action: 'fetch_coding_progress',
          reason: 'coding',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/1] coding-progress-1 (fetch_coding_progress, required, timeout=');
    expect(output).toContain('Coding progress snapshot');
    expect(output).toContain('branch=main');
    expect(output).toContain('ahead=2 behind=1');
    expect(output).toContain('changed_files=a.ts, b.ts');
  });

  it('executes multi-step plan and aggregates step results', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          status: 'ok',
          service: 'node-backend',
          version: '0.1.0',
          uptimeSec: 10,
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          status: 'ok',
          service: 'python-automation',
          version: '0.1.0',
          uptimeSec: 12,
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          success: true,
          windows: [
            { title: 'Editor', class_name: 'WinClass' },
          ],
        }),
      );

    const plan: ExecutionPlan = {
      intent: 'automation_windows',
      originalMessage: 'list windows',
      steps: [
        {
          id: 'automation-status-precheck-1',
          action: 'check_services',
          reason: 'precheck',
          required: false,
        },
        {
          id: 'automation-windows-fetch-2',
          action: 'fetch_windows',
          reason: 'fetch',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/2] automation-status-precheck-1 (check_services, optional, timeout=');
    expect(output).toContain('[2/2] automation-windows-fetch-2 (fetch_windows, required, timeout=');
    expect(output).toContain('Active windows (1 shown):');
    expect(output).toContain('1. Editor [WinClass]');
  });

  it('continues when optional step fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse(
          {
            success: false,
            message: 'window api offline',
          },
          false,
          503,
        ),
      )
      .mockResolvedValueOnce(
        createResponse({
          success: true,
          response: 'fallback chat works',
        }),
      );

    const plan: ExecutionPlan = {
      intent: 'automation_windows',
      originalMessage: 'list windows',
      steps: [
        {
          id: 'optional-windows',
          action: 'fetch_windows',
          reason: 'optional probe',
          required: false,
        },
        {
          id: 'required-chat',
          action: 'call_chat',
          reason: 'fallback',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/2] optional-windows (fetch_windows, optional, timeout=');
    expect(output).toContain('failed: window api offline');
    expect(output).toContain('[2/2] required-chat (call_chat, required, timeout=');
    expect(output).toContain('fallback chat works');
    expect(output).not.toContain('execution aborted');
  });

  it('aborts when required step fails', async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {
          success: false,
          message: 'window service down',
        },
        false,
        503,
      ),
    );

    const plan: ExecutionPlan = {
      intent: 'automation_windows',
      originalMessage: 'list windows',
      steps: [
        {
          id: 'required-first',
          action: 'fetch_windows',
          reason: 'fetch',
          required: true,
        },
        {
          id: 'required-second',
          action: 'call_chat',
          reason: 'fallback',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/2] required-first (fetch_windows, required, timeout=');
    expect(output).toContain('failed: window service down');
    expect(output).toContain('execution aborted at required step: required-first');
    expect(output).not.toContain('required-second');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries and recovers on required step', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse(
          {
            success: false,
            message: 'temporary outage',
          },
          false,
          503,
        ),
      )
      .mockResolvedValueOnce(
        createResponse({
          success: true,
          windows: [{ title: 'Recovered', class_name: 'WinClass' }],
        }),
      );

    const plan: ExecutionPlan = {
      intent: 'automation_windows',
      originalMessage: 'list windows',
      steps: [
        {
          id: 'required-retry-step',
          action: 'fetch_windows',
          reason: 'retry fetch windows',
          required: true,
          retryCount: 1,
          retryDelayMs: 0,
          timeoutMs: 3000,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/1] required-retry-step (fetch_windows, required, timeout=3000ms, retry=1)');
    expect(output).toContain('[retry 2/2] recovered after retry');
    expect(output).toContain('Active windows (1 shown):');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts on timeout for required step', async () => {
    fetchMock.mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));

    const plan: ExecutionPlan = {
      intent: 'general_chat',
      originalMessage: 'hello',
      steps: [
        {
          id: 'required-timeout',
          action: 'call_chat',
          reason: 'timeout check',
          required: true,
          timeoutMs: 30,
          retryCount: 0,
          retryDelayMs: 0,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/1] required-timeout (call_chat, required, timeout=30ms, retry=0)');
    expect(output).toContain('failed: step timed out after 30ms');
    expect(output).toContain('execution aborted at required step: required-timeout');
  });

  it('executes service status step with partial failure handling', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          status: 'ok',
          service: 'node-backend',
          version: '0.1.0',
          uptimeSec: 10,
        }),
      )
      .mockRejectedValueOnce(new Error('connection refused'));

    const plan: ExecutionPlan = {
      intent: 'service_status',
      originalMessage: 'status',
      steps: [
        {
          id: 'service-status-1',
          action: 'check_services',
          reason: 'status',
          required: true,
        },
      ],
    };

    const output = await executePlan(plan);
    expect(output).toContain('[1/1] service-status-1 (check_services, required, timeout=');
    expect(output).toContain('Sidecar status snapshot:');
    expect(output).toContain('node: ok service=node-backend');
    expect(output).toContain('python: offline (connection refused)');
  });
});
