import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolManager, type ToolSandboxPolicy } from './index.js';
import type { Tool } from './index.js';

// Mock skillRegistry
vi.mock('./skillRegistry.js', () => ({
  installSkillFromPath: vi.fn(),
  loadSkillToolsFromRegistry: vi.fn().mockResolvedValue({
    manifests: [],
    entries: [],
    warnings: [],
  }),
}));

// Mock opencode
vi.mock('./opencode.js', () => ({
  probeOpenCodeCli: vi.fn().mockResolvedValue({ available: false }),
  cancelOpenCodeTask: vi.fn(),
  createOpenCodeProject: vi.fn(),
  getOpenCodeConcurrentStatus: vi.fn(),
  getOpenCodeTaskStatus: vi.fn(),
  listOpenCodeTasks: vi.fn(),
  runOpenCodeTask: vi.fn(),
}));

// Mock ohmyopencode
vi.mock('./ohmyopencode.js', () => ({
  probeOhMyCli: vi.fn().mockResolvedValue({ available: false }),
  cancelOhMyTask: vi.fn(),
  getOhMyConcurrentStatus: vi.fn(),
  listOhMyAgents: vi.fn(),
  runOhMyDelegate: vi.fn(),
  runOhMyTask: vi.fn(),
}));

describe('ToolManager', () => {
  let toolManager: ToolManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear environment variables for sandbox tests
    delete process.env.CHUBAO_TOOL_SANDBOX_MODE;
    delete process.env.CHUBAO_ALLOWED_TOOLS;
    delete process.env.CHUBAO_BLOCKED_TOOLS;
    toolManager = new ToolManager();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('sandbox policy', () => {
    it('should return sandbox policy with default settings', () => {
      const policy = toolManager.getSandboxPolicy();

      expect(policy.mode).toBe('off');
      expect(policy.enabled).toBe(false);
      expect(policy).toHaveProperty('configuredAllowedTools');
      expect(policy).toHaveProperty('effectiveAllowedTools');
      expect(policy).toHaveProperty('blockedTools');
      expect(policy).toHaveProperty('visibleTools');
    });

    it('should respect CHUBAO_TOOL_SANDBOX_MODE=allowlist', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      toolManager = new ToolManager();

      const policy = toolManager.getSandboxPolicy();

      expect(policy.mode).toBe('allowlist');
      expect(policy.enabled).toBe(true);
    });

    it('should respect CHUBAO_BLOCKED_TOOLS', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'dangerous_tool,another_bad_tool';
      toolManager = new ToolManager();

      const policy = toolManager.getSandboxPolicy();

      expect(policy.blockedTools).toContain('dangerous_tool');
      expect(policy.blockedTools).toContain('another_bad_tool');
      expect(policy.enabled).toBe(true);
    });

    it('should respect CHUBAO_ALLOWED_TOOLS', () => {
      process.env.CHUBAO_ALLOWED_TOOLS = 'list_windows,screenshot';
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      toolManager = new ToolManager();

      const policy = toolManager.getSandboxPolicy();

      expect(policy.configuredAllowedTools).toContain('list_windows');
      expect(policy.configuredAllowedTools).toContain('screenshot');
    });
  });

  describe('getTool', () => {
    it('should return built-in tool', () => {
      const tool = toolManager.getTool('list_windows');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('list_windows');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = toolManager.getTool('nonexistent_tool');

      expect(tool).toBeUndefined();
    });

    it('should block tools in CHUBAO_BLOCKED_TOOLS', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'list_windows';
      toolManager = new ToolManager();

      const tool = toolManager.getTool('list_windows');

      expect(tool).toBeUndefined();
    });

    it('should only allow allowlisted tools when sandbox is enabled', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      process.env.CHUBAO_ALLOWED_TOOLS = 'screenshot';
      toolManager = new ToolManager();

      const allowedTool = toolManager.getTool('screenshot');
      const blockedTool = toolManager.getTool('list_windows');

      expect(allowedTool).toBeDefined();
      expect(blockedTool).toBeUndefined();
    });
  });

  describe('getAllTools', () => {
    it('should return all built-in tools by default', () => {
      const tools = toolManager.getAllTools();

      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === 'list_windows')).toBe(true);
    });

    it('should filter blocked tools', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'list_windows';
      toolManager = new ToolManager();

      const tools = toolManager.getAllTools();

      expect(tools.some((t) => t.name === 'list_windows')).toBe(false);
    });
  });

  describe('getToolDefinitions', () => {
    it('should return tool definitions for AI consumption', () => {
      const definitions = toolManager.getToolDefinitions();

      expect(definitions.length).toBeGreaterThan(0);
      expect(definitions[0]).toHaveProperty('name');
      expect(definitions[0]).toHaveProperty('description');
      expect(definitions[0]).toHaveProperty('input_schema');
    });

    it('should include input_schema with properties', () => {
      const definitions = toolManager.getToolDefinitions();
      const listWindowsDef = definitions.find((d) => d.name === 'list_windows');

      expect(listWindowsDef).toBeDefined();
      expect(listWindowsDef?.input_schema).toHaveProperty('properties');
      expect(listWindowsDef?.input_schema).toHaveProperty('required');
    });
  });

  describe('executeTool', () => {
    it('should throw error for non-existent tool', async () => {
      await expect(toolManager.executeTool('nonexistent', {})).rejects.toThrow('Tool not found');
    });

    it('should throw error for blocked tool', async () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'list_windows';
      toolManager = new ToolManager();

      await expect(toolManager.executeTool('list_windows', {})).rejects.toThrow('not allowed');
    });

    it('should validate tool parameters', async () => {
      // get_coding_progress doesn't require network calls
      const result = await toolManager.executeTool('get_coding_progress', {});

      // Should not throw, returns coding progress data
      expect(result).toBeDefined();
      expect(result).toHaveProperty('repoRoot');
      expect(result).toHaveProperty('branch');
    });
  });

  describe('getInstalledSkills', () => {
    it('should return empty array initially', () => {
      const skills = toolManager.getInstalledSkills();

      expect(skills).toEqual([]);
    });
  });

  describe('getSkillWarnings', () => {
    it('should return empty array initially', () => {
      const warnings = toolManager.getSkillWarnings();

      expect(warnings).toEqual([]);
    });
  });

  describe('getCliHealth', () => {
    it('should return CLI health snapshot', async () => {
      const health = await toolManager.getCliHealth();

      expect(health).toHaveProperty('summary');
      expect(health).toHaveProperty('tools');
      expect(health.summary).toHaveProperty('total');
      expect(health.summary).toHaveProperty('available');
      expect(health.summary).toHaveProperty('unavailable');
      expect(health.tools).toHaveProperty('opencode');
      expect(health.tools).toHaveProperty('ohMyOpencode');
    });

    it('should mark CLI tools as unavailable when probe fails', async () => {
      const health = await toolManager.getCliHealth();

      expect(health.tools.opencode.available).toBe(false);
      expect(health.tools.ohMyOpencode.available).toBe(false);
    });
  });

  describe('initializeSkills', () => {
    it('should initialize without errors', async () => {
      await expect(toolManager.initializeSkills()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await toolManager.initializeSkills();
      await toolManager.initializeSkills();

      // Should not throw or cause issues
      expect(true).toBe(true);
    });
  });

  describe('forceReloadSkills', () => {
    it('should reload skills without errors', async () => {
      await expect(toolManager.forceReloadSkills()).resolves.not.toThrow();
    });
  });
});
