import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTaskStatus = new Map<
  string,
  {
    taskId: string;
    status: 'running' | 'completed' | 'failed' | 'canceled';
  }
>();
let taskSeq = 0;

vi.mock('./ohmyopencode.js', () => ({
  runOhMyDelegate: vi.fn(async () => {
    const taskId = `delegate-${++taskSeq}`;
    mockTaskStatus.set(taskId, { taskId, status: 'running' });
    return {
      taskId,
      status: 'running',
    };
  }),
  runOhMyTask: vi.fn(async () => {
    const taskId = `task-${++taskSeq}`;
    mockTaskStatus.set(taskId, { taskId, status: 'running' });
    return {
      taskId,
      status: 'running',
    };
  }),
  getOhMyTaskStatus: vi.fn((taskId: string) => {
    const item = mockTaskStatus.get(taskId);
    if (!item) {
      throw new Error(`Oh-My-OpenCode task not found: ${taskId}`);
    }
    return {
      taskId: item.taskId,
      status: item.status,
    };
  }),
  cancelOhMyTask: vi.fn((taskId: string) => {
    const item = mockTaskStatus.get(taskId);
    if (!item) {
      throw new Error(`Oh-My-OpenCode task not found: ${taskId}`);
    }
    item.status = 'canceled';
    return {
      canceled: true,
      task: {
        id: taskId,
        status: 'canceled',
      },
    };
  }),
}));

import {
  __resetMultiAgentGroupsForTests,
  cancelMultiAgentGroup,
  getMultiAgentGroupStatus,
  listMultiAgentGroups,
  startMultiAgentGroup,
} from './multiAgentCoordinator.js';
import { cancelOhMyTask, runOhMyDelegate, runOhMyTask } from './ohmyopencode.js';

describe('multiAgentCoordinator', () => {
  beforeEach(() => {
    __resetMultiAgentGroupsForTests();
    mockTaskStatus.clear();
    taskSeq = 0;
    vi.clearAllMocks();
  });

  it('starts a mixed group and lists it', async () => {
    const group = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'delegate',
          agentType: 'architect',
          taskDescription: 'design API shape',
        },
        {
          kind: 'task',
          taskCategory: 'backend',
          taskPrompt: 'implement route',
        },
      ],
      projectPath: process.cwd(),
      timeoutMs: 30_000,
    });

    const summary = group.summary as Record<string, number>;
    expect(summary.total).toBe(2);
    expect(summary.started).toBe(2);
    expect(summary.failedToStart).toBe(0);
    expect(vi.mocked(runOhMyDelegate)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runOhMyTask)).toHaveBeenCalledTimes(1);

    const listed = listMultiAgentGroups();
    const listPayload = listed as { count: number; groups: Array<{ groupId: string }> };
    expect(listPayload.count).toBe(1);
    expect(listPayload.groups[0]?.groupId).toBe(group.groupId);
  });

  it('summarizes group as completed when all tasks complete', async () => {
    const group = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'delegate',
          agentType: 'frontend',
          taskDescription: 'refine UI panel',
        },
        {
          kind: 'task',
          taskCategory: 'test',
          taskPrompt: 'add test coverage',
        },
      ],
    });

    const tasks = group.tasks as Array<{ taskId?: string }>;
    for (const entry of tasks) {
      if (entry.taskId) {
        const status = mockTaskStatus.get(entry.taskId);
        if (status) {
          status.status = 'completed';
        }
      }
    }

    const status = getMultiAgentGroupStatus(String(group.groupId));
    const summary = status.summary as Record<string, number>;
    expect(status.state).toBe('completed');
    expect(summary.completed).toBe(2);
    expect(status.finishedAt).toBeTypeOf('string');
  });

  it('keeps partial state when some tasks fail to start', async () => {
    vi.mocked(runOhMyDelegate).mockRejectedValueOnce(
      new Error('delegate task requires agentType and taskDescription'),
    );

    const group = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'delegate',
          taskDescription: 'missing agent type',
        },
        {
          kind: 'task',
          taskCategory: 'backend',
          taskPrompt: 'ship endpoint',
        },
      ],
    });

    const summary = group.summary as Record<string, number>;
    expect(group.state).toBe('running');
    expect(summary.started).toBe(1);
    expect(summary.failedToStart).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('supports state filtering and pagination in group list', async () => {
    const first = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'task',
          taskCategory: 'backend',
          taskPrompt: 'first-running',
        },
      ],
    });
    const second = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'task',
          taskCategory: 'backend',
          taskPrompt: 'second-will-complete',
        },
      ],
    });
    await startMultiAgentGroup({
      tasks: [
        {
          kind: 'task',
          taskCategory: 'backend',
          taskPrompt: 'third-running',
        },
      ],
    });

    const secondTasks = second.tasks as Array<{ taskId?: string }>;
    for (const entry of secondTasks) {
      if (!entry.taskId) {
        continue;
      }
      const status = mockTaskStatus.get(entry.taskId);
      if (status) {
        status.status = 'completed';
      }
    }
    getMultiAgentGroupStatus(String(second.groupId));

    const runningOnly = listMultiAgentGroups({
      state: 'running',
      limit: 1,
      offset: 1,
    }) as {
      count: number;
      groups: Array<{ groupId: string; state: string }>;
      page: { limit: number; offset: number; returned: number };
      capacity: {
        runningGroups: number;
        runningTasks: number;
        maxRunningGroups: number;
        maxRunningTasks: number;
      };
    };

    expect(runningOnly.count).toBe(2);
    expect(runningOnly.groups).toHaveLength(1);
    expect(runningOnly.page.limit).toBe(1);
    expect(runningOnly.page.offset).toBe(1);
    expect(runningOnly.page.returned).toBe(1);
    expect(runningOnly.groups[0]?.groupId).not.toBe(second.groupId);
    expect(runningOnly.groups[0]?.state).toBe('running');
    expect(runningOnly.capacity.runningGroups).toBe(2);
    expect(runningOnly.capacity.runningTasks).toBe(2);
    expect(runningOnly.capacity.maxRunningGroups).toBeGreaterThanOrEqual(2);
    expect(runningOnly.capacity.maxRunningTasks).toBeGreaterThanOrEqual(2);

    const completedOnly = listMultiAgentGroups({
      state: 'completed',
    }) as { count: number; groups: Array<{ groupId: string }> };
    expect(completedOnly.count).toBe(1);
    expect(completedOnly.groups[0]?.groupId).toBe(second.groupId);

    const allGroups = listMultiAgentGroups({
      state: 'all',
      limit: 10,
      offset: 0,
    }) as { count: number };
    expect(allGroups.count).toBe(3);

    // keep reference alive so first group is not optimized away by lints
    expect(first.groupId).toBeTypeOf('string');
  });

  it('cancels all started tasks in a group', async () => {
    const group = await startMultiAgentGroup({
      tasks: [
        {
          kind: 'task',
          taskCategory: 'infra',
          taskPrompt: 'update pipeline',
        },
        {
          kind: 'task',
          taskCategory: 'qa',
          taskPrompt: 'run regression',
        },
      ],
    });

    const result = cancelMultiAgentGroup(String(group.groupId));
    expect(result.state).toBe('canceled');
    expect(vi.mocked(cancelOhMyTask)).toHaveBeenCalledTimes(2);
  });

  it('throws for unknown group status query', () => {
    expect(() => getMultiAgentGroupStatus('missing-group')).toThrow(
      'multi-agent group not found: missing-group',
    );
  });

  it('rejects start when running capacity is exceeded', async () => {
    const parseLimit = (raw: string | undefined, fallback: number) => {
      if (!raw) {
        return fallback;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        return fallback;
      }
      return Math.trunc(n);
    };

    const runningGroupLimit = parseLimit(process.env.CHUBAO_MULTI_AGENT_MAX_RUNNING_GROUPS, 5);
    const runningTaskLimit = parseLimit(process.env.CHUBAO_MULTI_AGENT_MAX_RUNNING_TASKS, 20);
    const warmup = Math.min(runningGroupLimit, runningTaskLimit);

    for (let i = 0; i < warmup; i += 1) {
      await startMultiAgentGroup({
        tasks: [
          {
            kind: 'task',
            taskCategory: 'backend',
            taskPrompt: `task-${i + 1}`,
          },
        ],
      });
    }

    await expect(
      startMultiAgentGroup({
        tasks: [
          {
            kind: 'task',
            taskCategory: 'backend',
            taskPrompt: 'overflow-task',
          },
        ],
      }),
    ).rejects.toThrow('multi-agent service unavailable');
  });
});
