import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ContinuousDevMonitor, type MonitorConfig } from './continuous-monitor.js';
import type { AgentRuntime } from './runtime.js';

describe('ContinuousDevMonitor', () => {
  let mockAgentRuntime: AgentRuntime;
  let monitor: ContinuousDevMonitor;
  let tempStateDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test to avoid state pollution
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-test-'));
    process.env.CHUBAO_CONTINUOUS_DEV_STATE_PATH = path.join(tempStateDir, 'monitor.json');

    mockAgentRuntime = {
      chat: vi.fn().mockResolvedValue('Test response'),
    } as unknown as AgentRuntime;

    monitor = new ContinuousDevMonitor(mockAgentRuntime);
  });

  afterEach(async () => {
    // Clean up - stop monitor if running
    try {
      const state = monitor.getState();
      if (state.status === 'running' || state.status === 'paused') {
        await monitor.stop();
      }
    } catch {
      // Ignore errors
    }

    // Clean up temp directory
    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }

    // Reset env var
    delete process.env.CHUBAO_CONTINUOUS_DEV_STATE_PATH;
  });

  describe('initialization', () => {
    it('should create monitor with initial state', () => {
      // Create fresh monitor for this test
      const freshMonitor = new ContinuousDevMonitor(mockAgentRuntime);
      const state = freshMonitor.getState();

      expect(state).toBeDefined();
      expect(state.status).toBe('idle');
      expect(state.currentCycle).toBe(0);
      expect(state.consecutiveErrors).toBe(0);
      expect(state.history).toEqual([]);
    });
  });

  describe('start', () => {
    it('should start monitor with config', async () => {
      const config: Partial<MonitorConfig> & { taskDescription: string } = {
        taskDescription: 'Test task',
        intervalSeconds: 10,
        maxCycles: 1,
      };

      await monitor.start(config);

      const state = monitor.getState();
      expect(state.status).toBe('running');
      expect(state.taskDescription).toBe('Test task');
      expect(state.config).toBeDefined();
      expect(state.config?.intervalSeconds).toBe(10);
      expect(state.startedAt).toBeDefined();
    });

    it('should throw error if already running', async () => {
      const config = { taskDescription: 'Test task', maxCycles: 1 };
      await monitor.start(config);

      await expect(monitor.start(config)).rejects.toThrow('already running');
    });

    it('should enforce minimum interval of 10 seconds', async () => {
      const config = {
        taskDescription: 'Test task',
        intervalSeconds: 5, // Less than minimum
        maxCycles: 1,
      };

      await monitor.start(config);

      const state = monitor.getState();
      expect(state.config?.intervalSeconds).toBe(10);
    });
  });

  describe('stop', () => {
    it('should stop running monitor', async () => {
      await monitor.start({ taskDescription: 'Test', maxCycles: 0 }); // 0 = infinite
      await monitor.stop();

      const state = monitor.getState();
      expect(state.status).toBe('stopped');
      expect(state.stoppedAt).toBeDefined();
    });
  });

  describe('pause', () => {
    it('should pause running monitor', async () => {
      await monitor.start({ taskDescription: 'Test', maxCycles: 0 }); // 0 = infinite
      await monitor.pause();

      const state = monitor.getState();
      expect(state.status).toBe('paused');
    });

    it('should throw error if not running', async () => {
      await expect(monitor.pause()).rejects.toThrow('not running');
    });
  });

  describe('resume', () => {
    it('should resume paused monitor', async () => {
      await monitor.start({ taskDescription: 'Test', maxCycles: 0 }); // 0 = infinite
      await monitor.pause();
      await monitor.resume();

      const state = monitor.getState();
      expect(state.status).toBe('running');
    });

    it('should throw error if not paused', async () => {
      await expect(monitor.resume()).rejects.toThrow('not paused');
    });
  });

  describe('getState', () => {
    it('should return copy of state', () => {
      const state1 = monitor.getState();
      const state2 = monitor.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different references
    });

    it('should return copy of history array', () => {
      const state = monitor.getState();
      const history1 = state.history;
      const history2 = monitor.getState().history;

      expect(history1).not.toBe(history2); // Different references
    });
  });
});
