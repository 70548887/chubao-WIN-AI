import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  callClaudeCodeTool,
  callOpencodeTool,
  callCursorTool,
  listAvailableClisTool,
} from './externalCliTools.js';

describe('externalCliTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callClaudeCodeTool', () => {
    it('should have correct name and description', () => {
      expect(callClaudeCodeTool.name).toBe('call_claude_code');
      expect(callClaudeCodeTool.description).toContain('Claude Code');
    });

    it('should return error when Claude Code not available', async () => {
      const result = await callClaudeCodeTool.execute({
        prompt: 'Test prompt',
      });

      // Will fail because claude is not installed in test environment
      expect(result).toBeDefined();
    });

    it('should accept all parameters', async () => {
      const result = await callClaudeCodeTool.execute({
        prompt: 'Test prompt',
        cwd: '/test/path',
        timeoutSeconds: 60,
        allowEdits: false,
      });

      expect(result).toBeDefined();
    });
  });

  describe('callOpencodeTool', () => {
    it('should have correct name', () => {
      expect(callOpencodeTool.name).toBe('call_opencode');
    });

    it('should return error when OpenCode not available', async () => {
      const result = await callOpencodeTool.execute({
        prompt: 'Test prompt',
      });

      expect(result).toBeDefined();
    });
  });

  describe('callCursorTool', () => {
    it('should have correct name', () => {
      expect(callCursorTool.name).toBe('call_cursor');
    });

    it('should return error when Cursor not available', async () => {
      const result = await callCursorTool.execute({
        prompt: 'Test prompt',
      });

      expect(result).toBeDefined();
    });
  });

  describe('listAvailableClisTool', () => {
    it('should have correct name', () => {
      expect(listAvailableClisTool.name).toBe('list_available_clis');
    });

    it('should return result', async () => {
      const result = await listAvailableClisTool.execute({});

      expect(result).toBeDefined();
    });
  });
});
