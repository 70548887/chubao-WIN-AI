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
  __resetOhMyTasksForTests,
  cancelOhMyTask,
  getOhMyTaskStatus,
  listOhMyAgents,
  listOhMyTasks,
  probeOhMyCli,
  runOhMyDelegate,
  runOhMyTask,
} from './ohmyopencode.js';

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

describe('oh-my-opencode tools wrapper', () => {
  beforeEach(() => {
    __resetOhMyTasksForTests();
    mockExecFile.mockReset();
    mockSpawn.mockReset();
  });

  it('runs foreground task command with expected args', async () => {
    mockExecSuccess('task completed\n', '');

    const result = await runOhMyTask({
      taskCategory: 'backend',
      taskPrompt: 'Implement health endpoint',
      projectPath: path.join(os.tmpdir(), 'chubao-ohmy-foreground'),
    });

    const payload = result as {
      mode: string;
      status: string;
      command: string;
      args: string[];
    };

    expect(payload.mode).toBe('foreground');
    expect(payload.status).toBe('completed');
    expect(payload.command).toBe('npx');
    expect(payload.args).toEqual([
      '--yes',
      'oh-my-opencode',
      'task',
      '--category',
      'backend',
      '--prompt',
      'Implement health endpoint',
    ]);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('tracks background delegate status and task list', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as unknown as import('node:child_process').ChildProcess);

    const started = await runOhMyDelegate({
      agentType: 'frontend',
      taskDescription: 'Refine settings panel',
      runInBackground: true,
      projectPath: path.join(os.tmpdir(), 'chubao-ohmy-background'),
    });

    const startPayload = started as { taskId: string; status: string; mode: string };
    expect(startPayload.mode).toBe('background');
    expect(startPayload.status).toBe('running');

    child.stdout.emitData('delegate running');
    child.emit('exit', 0, null);

    const taskStatus = getOhMyTaskStatus(startPayload.taskId) as {
      status: string;
      stdoutTail: string;
      kind: string;
    };
    expect(taskStatus.status).toBe('completed');
    expect(taskStatus.kind).toBe('delegate');
    expect(taskStatus.stdoutTail).toContain('delegate running');

    const list = listOhMyTasks() as Array<{ id: string; status: string; kind: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('completed');
    expect(list[0]?.kind).toBe('delegate');
  });

  it('cancels running background task', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as unknown as import('node:child_process').ChildProcess);

    const started = await runOhMyTask({
      taskCategory: 'qa',
      taskPrompt: 'Run smoke checks',
      runInBackground: true,
      projectPath: path.join(os.tmpdir(), 'chubao-ohmy-cancel'),
    });

    const taskId = (started as { taskId: string }).taskId;
    const cancelled = cancelOhMyTask(taskId) as {
      canceled: boolean;
      task: { status: string };
    };

    expect(cancelled.canceled).toBe(true);
    expect(cancelled.task.status).toBe('canceled');

    const secondCancel = cancelOhMyTask(taskId) as {
      canceled: boolean;
      reason: string;
    };
    expect(secondCancel.canceled).toBe(false);
    expect(secondCancel.reason).toContain('already');
  });

  it('parses agent list json output', async () => {
    mockExecSuccess('[{"id":"frontend","name":"Frontend Agent"}]', '');

    const result = await listOhMyAgents({
      projectPath: path.join(os.tmpdir(), 'chubao-ohmy-list-agents'),
    });

    const payload = result as {
      command: string;
      args: string[];
      agents: Array<{ id: string; name: string }>;
    };

    expect(payload.command).toBe('npx');
    expect(payload.args).toEqual(['--yes', 'oh-my-opencode', 'list-agents', '--json']);
    expect(payload.agents[0]?.id).toBe('frontend');
    expect(payload.agents[0]?.name).toBe('Frontend Agent');
  });

  it('probes Oh-My-OpenCode CLI version and uses cache', async () => {
    mockExecSuccess('3.5.3\n', '');

    const first = await probeOhMyCli();
    const second = await probeOhMyCli();

    expect(first.available).toBe(true);
    expect(first.version).toBe('3.5.3');
    expect(first.cached).toBe(false);
    expect(first.source).toBe('npx');
    expect(second.cached).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when Oh-My-OpenCode CLI probe fails', async () => {
    const err = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' as const });
    mockExecError(err);

    const result = await probeOhMyCli(true);
    expect(result.available).toBe(false);
    expect(String(result.error)).toContain('Oh-My-OpenCode CLI not found');
  });
});
