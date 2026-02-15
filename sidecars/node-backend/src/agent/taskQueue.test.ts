import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskQueue } from './taskQueue.js';

describe('TaskQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enqueue and execute tasks', async () => {
    const executeTask = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true };
    });
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    const task = queue.enqueue({ kind: 'chat', message: 'Hello' });
    
    expect(task.id).toBeDefined();
    expect(task.payload.kind).toBe('chat');

    // Wait for execution to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    expect(executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chat', message: 'Hello' }),
      expect.objectContaining({ id: task.id })
    );
  });

  it('should track task status through lifecycle', async () => {
    let resolveTask: () => void;
    const taskPromise = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    
    const executeTask = vi.fn().mockImplementation(async () => {
      await taskPromise;
      return { success: true };
    });
    
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    const task = queue.enqueue({ kind: 'test' });
    
    // Give time for task to start running
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const runningStatus = queue.getTask(task.id);
    expect(runningStatus?.status).toBe('running');

    // Complete the task
    resolveTask!();
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const completedStatus = queue.getTask(task.id);
    expect(completedStatus?.status).toBe('completed');
  });

  it('should handle task failure', async () => {
    const executeTask = vi.fn().mockRejectedValue(new Error('Task failed'));
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    const task = queue.enqueue({ kind: 'failing' });
    
    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const status = queue.getTask(task.id);
    expect(status?.status).toBe('failed');
    expect(status?.error).toContain('Task failed');
  });

  it('should cancel pending tasks', () => {
    const executeTask = vi.fn();
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    const task = queue.enqueue({ kind: 'cancelable' });
    const canceled = queue.cancelTask(task.id);
    
    expect(canceled.status).toBe('canceled');
    expect(canceled.finishedAt).toBeDefined();
  });

  it('should not cancel already completed tasks', async () => {
    const executeTask = vi.fn().mockResolvedValue({ success: true });
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    const task = queue.enqueue({ kind: 'quick' });
    
    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const canceled = queue.cancelTask(task.id);
    expect(canceled.status).toBe('completed'); // Should remain completed
  });

  it('should list tasks with filtering', async () => {
    const executeTask = vi.fn().mockResolvedValue({ success: true });
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 1,
      stateEnabled: false,
    });

    queue.enqueue({ kind: 'task1' });
    queue.enqueue({ kind: 'task2' });
    queue.enqueue({ kind: 'task3' });

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const allTasks = queue.listTasks({ status: 'all' });
    expect(allTasks.count).toBe(3);

    const completedTasks = queue.listTasks({ status: 'completed' });
    expect(completedTasks.count).toBe(3);
  });

  it('should respect maxConcurrent limit', async () => {
    let runningCount = 0;
    let maxRunning = 0;

    const executeTask = vi.fn().mockImplementation(async () => {
      runningCount++;
      maxRunning = Math.max(maxRunning, runningCount);
      await new Promise((resolve) => setTimeout(resolve, 100));
      runningCount--;
      return { success: true };
    });

    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 2, // Limit to 2 concurrent
      stateEnabled: false,
    });

    // Enqueue 5 tasks
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ kind: `task${i}` });
    }

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('should return null for non-existent task', () => {
    const queue = new TaskQueue({
      executeTask: vi.fn(),
      stateEnabled: false,
    });

    const task = queue.getTask('non-existent-id');
    expect(task).toBeNull();
  });

  it('should throw error when canceling non-existent task', () => {
    const queue = new TaskQueue({
      executeTask: vi.fn(),
      stateEnabled: false,
    });

    expect(() => queue.cancelTask('non-existent-id')).toThrow('Task not found');
  });

  it('should support pagination in listTasks', () => {
    const queue = new TaskQueue({
      executeTask: vi.fn(),
      stateEnabled: false,
    });

    // Create 10 tasks
    for (let i = 0; i < 10; i++) {
      queue.enqueue({ kind: `task${i}` });
    }

    const page1 = queue.listTasks({ limit: 3, offset: 0 });
    expect(page1.tasks).toHaveLength(3);
    expect(page1.page.returned).toBe(3);

    const page2 = queue.listTasks({ limit: 3, offset: 3 });
    expect(page2.tasks).toHaveLength(3);
    expect(page2.page.offset).toBe(3);
  });

  it('should report capacity correctly', async () => {
    const executeTask = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
    );
    
    const queue = new TaskQueue({
      executeTask,
      maxConcurrent: 4,
      stateEnabled: false,
    });

    queue.enqueue({ kind: 'task1' });
    queue.enqueue({ kind: 'task2' });

    const list = queue.listTasks();
    expect(list.capacity.maxConcurrent).toBe(4);
    expect(list.capacity.pending + list.capacity.running).toBeGreaterThanOrEqual(0);
  });
});
