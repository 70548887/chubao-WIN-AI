/**
 * Tools Module Integration Tests
 * Tests interaction between ToolManager, Sandbox, and Skill system
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolManager } from './core/toolManager.js';
import type { Tool } from './core/types.js';
import { z } from 'zod';

describe('Tools Integration', () => {
  let toolManager: ToolManager;
  const mockBuiltInTools: Tool[] = [
    {
      name: 'test_tool',
      description: 'A test tool',
      parameters: z.object({ input: z.string() }),
      execute: vi.fn().mockResolvedValue({ result: 'success' }),
    },
  ];

  beforeEach(() => {
    toolManager = new ToolManager(mockBuiltInTools);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ToolManager with Sandbox', () => {
    it('should block tool execution when sandbox blocks it', async () => {
      const env = {
        CHUBAO_TOOL_SANDBOX_MODE: 'allowlist',
        CHUBAO_ALLOWED_TOOLS: 'other_tool', // test_tool not in list
      };
      const manager = new ToolManager(mockBuiltInTools, env as any);

      await expect(manager.executeTool('test_tool', { input: 'test' }))
        .rejects.toThrow('not allowed by sandbox policy');
    });

    it('should allow tool execution when sandbox permits it', async () => {
      const env = {
        CHUBAO_ALLOWED_TOOLS: 'test_tool',
      };
      const manager = new ToolManager(mockBuiltInTools, env as any);

      const result = await manager.executeTool('test_tool', { input: 'test' });
      expect(result).toEqual({ result: 'success' });
    });

    it('should return policy with all visible tools', async () => {
      const policy = toolManager.getSandboxPolicy();
      expect(policy.visibleTools).toContain('test_tool');
      expect(policy.mode).toBe('off');
    });
  });

  describe('Tool Definition Generation', () => {
    it('should generate correct tool definitions for all visible tools', () => {
      const definitions = toolManager.getToolDefinitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toMatchObject({
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
          required: ['input'],
        },
      });
    });

    it('should exclude blocked tools from definitions', () => {
      const env = {
        CHUBAO_BLOCKED_TOOLS: 'test_tool',
      };
      const manager = new ToolManager(mockBuiltInTools, env as any);
      const definitions = manager.getToolDefinitions();
      expect(definitions).toHaveLength(0);
    });
  });

  describe('Tool Execution Flow', () => {
    it('should validate parameters before execution', async () => {
      await expect(toolManager.executeTool('test_tool', { input: 123 }))
        .rejects.toThrow(); // Zod validation error
    });

    it('should return undefined for non-existent tool', () => {
      const tool = toolManager.getTool('non_existent');
      expect(tool).toBeUndefined();
    });

    it('should execute tool with correct parameters', async () => {
      const result = await toolManager.executeTool('test_tool', { input: 'hello' });
      expect(mockBuiltInTools[0].execute).toHaveBeenCalledWith({ input: 'hello' });
      expect(result).toEqual({ result: 'success' });
    });
  });

  describe('Multiple Tools Management', () => {
    const multiTools: Tool[] = [
      {
        name: 'tool_a',
        description: 'Tool A',
        parameters: z.object({}),
        execute: vi.fn().mockResolvedValue('A'),
      },
      {
        name: 'tool_b',
        description: 'Tool B',
        parameters: z.object({}),
        execute: vi.fn().mockResolvedValue('B'),
      },
      {
        name: 'tool_c',
        description: 'Tool C',
        parameters: z.object({}),
        execute: vi.fn().mockResolvedValue('C'),
      },
    ];

    it('should manage multiple tools', () => {
      const manager = new ToolManager(multiTools);
      const allTools = manager.getAllTools();
      expect(allTools).toHaveLength(3);
      expect(allTools.map(t => t.name)).toEqual(['tool_a', 'tool_b', 'tool_c']);
    });

    it('should filter tools based on sandbox policy', () => {
      const env = {
        CHUBAO_BLOCKED_TOOLS: 'tool_b',
      };
      const manager = new ToolManager(multiTools, env as any);
      const allTools = manager.getAllTools();
      expect(allTools).toHaveLength(2);
      expect(allTools.map(t => t.name)).toEqual(['tool_a', 'tool_c']);
    });

    it('should execute different tools independently', async () => {
      const manager = new ToolManager(multiTools);
      const resultA = await manager.executeTool('tool_a', {});
      const resultB = await manager.executeTool('tool_b', {});
      expect(resultA).toBe('A');
      expect(resultB).toBe('B');
    });
  });

  describe('Error Handling Integration', () => {
    const errorTool: Tool = {
      name: 'error_tool',
      description: 'Tool that throws errors',
      parameters: z.object({ shouldFail: z.boolean() }),
      execute: vi.fn().mockImplementation(async (args: { shouldFail: boolean }) => {
        if (args.shouldFail) {
          throw new Error('Tool execution failed');
        }
        return { success: true };
      }),
    };

    it('should propagate tool execution errors', async () => {
      const manager = new ToolManager([errorTool]);
      await expect(manager.executeTool('error_tool', { shouldFail: true }))
        .rejects.toThrow('Tool execution failed');
    });

    it('should return successful results', async () => {
      const manager = new ToolManager([errorTool]);
      const result = await manager.executeTool('error_tool', { shouldFail: false });
      expect(result).toEqual({ success: true });
    });
  });

  describe('CLI Health Integration', () => {
    it('should return CLI health status', async () => {
      const health = await toolManager.getCliHealth();
      expect(health).toHaveProperty('summary');
      expect(health).toHaveProperty('tools');
      expect(health.summary).toHaveProperty('total');
      expect(health.summary).toHaveProperty('available');
      expect(health.summary).toHaveProperty('unavailable');
    });
  });
});
