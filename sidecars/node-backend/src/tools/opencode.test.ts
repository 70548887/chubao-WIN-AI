import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFile, mockSpawn } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

import {
  __resetOpenCodeTasksForTests,
  cancelOpenCodeTask,
  getOpenCodeTaskStatus,
  listOpenCodeTasks,
  probeOpenCodeCli,
  runOpenCodeTask,
} from './opencode.js';

class MockReadable extends EventEmitter {
  emitData(chunk: string): void {
    this.emit('data', chunk);
  }
}

class MockChildProcess extends EventEmitter {
  stdout = new MockReadable();
  stderr = new MockReadable();
  kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.emit('exit', null, typeof signal === 'number' ? String(signal) : signal ?? 'SIGTERM');
    return true;
  });
}

function mockExecSuccess(stdout = '', stderr = ''): void {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1] as (error: unknown, result: { stdout: string; stderr: string }) => void;
    callback(null, { stdout, stderr });
  });
}

function mockExecError(error: NodeJS.ErrnoException): void {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1] as (error: unknown, result?: { stdout: string; stderr: string }) => void;
    callback(error);
  });
}

describe('opencode tools wrapper', () => {
  beforeEach(() => {
    __resetOpenCodeTasksForTests();
    mockExecFile.mockReset();
    mockSpawn.mockReset();
  });

  it('runs foreground task and extracts run hints', async () => {
    mockExecSuccess('taskId: task-123\nsessionId: sess-789\n', '');

    const result = await runOpenCodeTask({
      projectPath: path.join(os.tmpdir(), 'chubao-opencode-foreground'),
      prompt: 'Implement one small refactor',
      agentType: 'build',
    });

    const payload = result as {
      mode: string;
      status: string;
      command: string;
      args: string[];
      runHints: { taskId?: string; sessionId?: string };
    };

    expect(payload.mode).toBe('foreground');
    expect(payload.status).toBe('completed');
    expect(payload.command).toBe('npx');
    expect(payload.args).toEqual([
      '--yes',
      'opencode',
      'run',
      '--prompt',
      'Implement one small refactor',
      '--agent',
      'build',
    ]);
    expect(payload.runHints.taskId).toBe('task-123');
    expect(payload.runHints.sessionId).toBe('sess-789');
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid timeout before invoking command', async () => {
    await expect(
      runOpenCodeTask({
        projectPath: path.join(os.tmpdir(), 'chubao-opencode-invalid-timeout'),
        prompt: 'test',
        timeoutMs: 999,
      }),
    ).rejects.toThrow('timeoutMs must be >= 1000');

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('tracks background task lifecycle and supports list filter', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as unknown as import('node:child_process').ChildProcess);

    const started = await runOpenCodeTask({
      projectPath: path.join(os.tmpdir(), 'chubao-opencode-background'),
      prompt: 'run in background',
      background: true,
    });

    const startPayload = started as { taskId: string; status: string; mode: string };
    expect(startPayload.mode).toBe('background');
    expect(startPayload.status).toBe('running');
    expect(startPayload.taskId).toBeTypeOf('string');

    child.stdout.emitData('stdout-line');
    child.stderr.emitData('stderr-line');
    child.emit('exit', 0, null);

    const taskStatus = getOpenCodeTaskStatus(startPayload.taskId) as {
      status: string;
      stdoutTail: string;
      stderrTail: string;
    };
    expect(taskStatus.status).toBe('completed');
    expect(taskStatus.stdoutTail).toContain('stdout-line');
    expect(taskStatus.stderrTail).toContain('stderr-line');

    const completedOnly = listOpenCodeTasks({
      state: 'completed',
      limit: 10,
      offset: 0,
    }) as {
      count: number;
      tasks: Array<{ id: string; status: string }>;
    };

    expect(completedOnly.count).toBe(1);
    expect(completedOnly.tasks[0]?.status).toBe('completed');
  });

  it('cancels running background task', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as unknown as import('node:child_process').ChildProcess);

    const started = await runOpenCodeTask({
      projectPath: path.join(os.tmpdir(), 'chubao-opencode-cancel'),
      prompt: 'cancel me',
      background: true,
    });

    const taskId = (started as { taskId: string }).taskId;
    const cancelled = cancelOpenCodeTask(taskId) as {
      canceled: boolean;
      task: { status: string };
    };

    expect(cancelled.canceled).toBe(true);
    expect(cancelled.task.status).toBe('canceled');
    expect(child.kill).toHaveBeenCalledTimes(1);

    const secondCancel = cancelOpenCodeTask(taskId) as {
      canceled: boolean;
      reason: string;
    };
    expect(secondCancel.canceled).toBe(false);
    expect(secondCancel.reason).toContain('already');
  });

  it('probes OpenCode CLI version and uses cache', async () => {
    mockExecSuccess('1.2.3\n', '');

    const first = await probeOpenCodeCli();
    const second = await probeOpenCodeCli();

    expect(first.available).toBe(true);
    expect(first.version).toBe('1.2.3');
    expect(first.cached).toBe(false);
    expect(first.source).toBe('npx');
    expect(second.cached).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when OpenCode CLI probe fails', async () => {
    const err = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' as const });
    mockExecError(err);

    const result = await probeOpenCodeCli(true);
    expect(result.available).toBe(false);
    expect(String(result.error)).toContain('OpenCode CLI not found');
  });
});
