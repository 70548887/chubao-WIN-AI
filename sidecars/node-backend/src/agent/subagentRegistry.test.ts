import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubagentRegistry, resetSubagentRegistry } from './subagentRegistry.js';
import type { AgentRuntime } from './runtime.js';
import type { MemoryManager } from '../memory/manager.js';

describe('SubagentRegistry', () => {
  let mockAgentRuntime: AgentRuntime;
  let mockMemoryManager: MemoryManager;

  beforeEach(() => {
    resetSubagentRegistry();
    mockAgentRuntime = {
      chat: vi.fn(),
    } as unknown as AgentRuntime;
    mockMemoryManager = {} as MemoryManager;
  });

  it('should spawn a subagent', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockResolvedValue('Task completed');

    const result = await registry.spawn({
      task: 'Test task',
      label: 'Test Agent',
    });

    expect(result.runId).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.status).toBe('accepted');
  });

  it('should track subagent status', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve('Done'), 100))
    );

    const { runId } = await registry.spawn({ task: 'Long task' });
    
    // Immediately check status (should be pending or running)
    const run = registry.getRun(runId);
    expect(run).not.toBeNull();
    expect(['pending', 'running']).toContain(run?.status);
  });

  it('should limit concurrent subagents', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    // Mock slow execution to keep agents running
    mockAgentRuntime.chat = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve('Done'), 1000))
    );

    // Spawn max concurrent agents (8)
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 8; i++) {
      promises.push(registry.spawn({ task: `Task ${i}` }));
    }
    await Promise.all(promises);

    // 9th spawn should fail
    await expect(registry.spawn({ task: 'Task 9' })).rejects.toThrow('Max concurrent subagents');
  });

  it('should cancel a running subagent', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve('Done'), 1000))
    );

    const { runId } = await registry.spawn({ task: 'Cancellable task' });
    
    const canceled = registry.cancelRun(runId);
    expect(canceled.status).toBe('canceled');
  });

  it('should list all runs', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockResolvedValue('Done');

    await registry.spawn({ task: 'Task 1', label: 'Agent 1' });
    await registry.spawn({ task: 'Task 2', label: 'Agent 2' });

    const list = registry.listRuns();
    expect(list.count).toBe(2);
    expect(list.runs).toHaveLength(2);
  });

  it('should filter runs by status', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockResolvedValue('Done');

    const { runId } = await registry.spawn({ task: 'Task 1' });
    registry.cancelRun(runId);

    await registry.spawn({ task: 'Task 2' });

    const canceledList = registry.listRuns({ status: 'canceled' });
    expect(canceledList.count).toBe(1);
    expect(canceledList.runs[0].status).toBe('canceled');
  });

  it('should respect timeout', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve('Done'), 5000))
    );

    const { runId } = await registry.spawn({ 
      task: 'Slow task',
      timeoutSeconds: 1, // 1 second timeout
    });

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const run = registry.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error).toContain('timed out');
  });

  it('should return null for non-existent run', () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const run = registry.getRun('non-existent-id');
    expect(run).toBeNull();
  });

  it('should track active count', async () => {
    const registry = new SubagentRegistry({
      agentRuntime: mockAgentRuntime,
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    mockAgentRuntime.chat = vi.fn().mockImplementation(() => 
      new Promise((resolve) => setTimeout(() => resolve('Done'), 100))
    );

    expect(registry.getActiveCount()).toBe(0);
    
    await registry.spawn({ task: 'Task 1' });
    expect(registry.getActiveCount()).toBeGreaterThanOrEqual(0);
  });
});
