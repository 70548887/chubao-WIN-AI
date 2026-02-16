import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  spawnSubagentTool,
  getSubagentStatusTool,
  listSubagentsTool,
  cancelSubagentTool,
} from './subagentTools.js';
import { resetSubagentRegistry } from '../agent/subagentRegistry.js';

describe('subagentTools', () => {
  beforeEach(() => {
    resetSubagentRegistry();
    vi.clearAllMocks();
  });

  describe('spawnSubagentTool', () => {
    it('should have correct name and description', () => {
      expect(spawnSubagentTool.name).toBe('spawn_subagent');
      expect(spawnSubagentTool.description).toContain('child AI agent');
    });

    it('should return error when registry not initialized', async () => {
      const result = await spawnSubagentTool.execute({
        task: 'Test task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('getSubagentStatusTool', () => {
    it('should have correct name', () => {
      expect(getSubagentStatusTool.name).toBe('get_subagent_status');
    });

    it('should return error when registry not initialized', async () => {
      const result = await getSubagentStatusTool.execute({
        runId: 'test-run-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('listSubagentsTool', () => {
    it('should have correct name', () => {
      expect(listSubagentsTool.name).toBe('list_subagents');
    });

    it('should return error when registry not initialized', async () => {
      const result = await listSubagentsTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('cancelSubagentTool', () => {
    it('should have correct name', () => {
      expect(cancelSubagentTool.name).toBe('cancel_subagent');
    });

    it('should return error when registry not initialized', async () => {
      const result = await cancelSubagentTool.execute({
        runId: 'test-run-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });
});
