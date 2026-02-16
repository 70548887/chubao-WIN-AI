import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxManager } from './sandbox.js';

describe('SandboxManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CHUBAO_TOOL_SANDBOX_MODE;
    delete process.env.CHUBAO_ALLOWED_TOOLS;
    delete process.env.CHUBAO_BLOCKED_TOOLS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('default behavior', () => {
    it('should have mode off by default', () => {
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy(['list_windows', 'screenshot']);
      expect(policy.mode).toBe('off');
      expect(policy.enabled).toBe(false);
    });

    it('should allow all tools when mode is off', () => {
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('any_tool')).toEqual({ allowed: true });
    });
  });

  describe('allowlist mode', () => {
    it('should enable allowlist mode from env', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy([]);
      expect(policy.mode).toBe('allowlist');
      expect(policy.enabled).toBe(true);
    });

    it('should allow tools in default allowlist', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('list_windows')).toEqual({ allowed: true });
      expect(sandbox.isToolAllowed('screenshot')).toEqual({ allowed: true });
    });

    it('should block tools not in allowlist', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('dangerous_tool')).toEqual({
        allowed: false,
        reason: 'not_allowlisted',
      });
    });

    it('should respect custom allowed tools', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      process.env.CHUBAO_ALLOWED_TOOLS = 'custom_tool,another_tool';
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('custom_tool')).toEqual({ allowed: true });
      expect(sandbox.isToolAllowed('list_windows')).toEqual({
        allowed: false,
        reason: 'not_allowlisted',
      });
    });
  });

  describe('blocked tools', () => {
    it('should block tools in CHUBAO_BLOCKED_TOOLS', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'blocked_tool,another_blocked';
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('blocked_tool')).toEqual({
        allowed: false,
        reason: 'blocked',
      });
    });

    it('should enable sandbox when blocked tools exist', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'blocked_tool';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy([]);
      expect(policy.enabled).toBe(true);
    });

    it('should block takes precedence over allowlist', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      process.env.CHUBAO_ALLOWED_TOOLS = 'blocked_tool';
      process.env.CHUBAO_BLOCKED_TOOLS = 'blocked_tool';
      const sandbox = new SandboxManager();
      expect(sandbox.isToolAllowed('blocked_tool')).toEqual({
        allowed: false,
        reason: 'blocked',
      });
    });
  });

  describe('getPolicy', () => {
    it('should return complete policy', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      process.env.CHUBAO_ALLOWED_TOOLS = 'tool1,tool2';
      process.env.CHUBAO_BLOCKED_TOOLS = 'blocked1';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy(['tool1', 'tool2', 'blocked1']);

      expect(policy).toHaveProperty('mode');
      expect(policy).toHaveProperty('enabled');
      expect(policy).toHaveProperty('configuredAllowedTools');
      expect(policy).toHaveProperty('effectiveAllowedTools');
      expect(policy).toHaveProperty('blockedTools');
      expect(policy).toHaveProperty('visibleTools');
      expect(policy.configuredAllowedTools).toContain('tool1');
      expect(policy.blockedTools).toContain('blocked1');
    });
  });

  describe('edge cases', () => {
    it('should handle empty environment variables', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = '';
      process.env.CHUBAO_ALLOWED_TOOLS = '';
      process.env.CHUBAO_BLOCKED_TOOLS = '';
      const sandbox = new SandboxManager();
      
      expect(sandbox.isToolAllowed('any_tool')).toEqual({ allowed: true });
      const policy = sandbox.getPolicy([]);
      expect(policy.mode).toBe('off');
      expect(policy.configuredAllowedTools).toEqual([]);
      expect(policy.blockedTools).toEqual([]);
    });

    it('should handle whitespace in tool lists', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = ' tool1 , tool2 , tool3 ';
      const sandbox = new SandboxManager();
      
      expect(sandbox.isToolAllowed('tool1')).toEqual({ allowed: false, reason: 'blocked' });
      expect(sandbox.isToolAllowed('tool2')).toEqual({ allowed: false, reason: 'blocked' });
      expect(sandbox.isToolAllowed('tool3')).toEqual({ allowed: false, reason: 'blocked' });
    });

    it('should handle mixed case sandbox mode', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'AllowList';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy([]);
      expect(policy.mode).toBe('allowlist');
    });

    it('should handle empty visible tools list', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy([]);
      expect(policy.visibleTools).toEqual([]);
    });

    it('should handle special characters in tool names', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'tool-with-dash,tool_with_underscore,tool.with.dot';
      const sandbox = new SandboxManager();
      
      expect(sandbox.isToolAllowed('tool-with-dash')).toEqual({ allowed: false, reason: 'blocked' });
      expect(sandbox.isToolAllowed('tool_with_underscore')).toEqual({ allowed: false, reason: 'blocked' });
      expect(sandbox.isToolAllowed('tool.with.dot')).toEqual({ allowed: false, reason: 'blocked' });
    });

    it('should handle duplicate tools in lists', () => {
      process.env.CHUBAO_BLOCKED_TOOLS = 'tool1,tool1,tool2';
      const sandbox = new SandboxManager();
      const policy = sandbox.getPolicy([]);
      // Should deduplicate
      expect(policy.blockedTools).toEqual(['tool1', 'tool2']);
    });

    it('should handle very long tool names', () => {
      const longToolName = 'a'.repeat(1000);
      process.env.CHUBAO_BLOCKED_TOOLS = longToolName;
      const sandbox = new SandboxManager();
      
      expect(sandbox.isToolAllowed(longToolName)).toEqual({ allowed: false, reason: 'blocked' });
    });

    it('should handle all default allowlist tools', () => {
      process.env.CHUBAO_TOOL_SANDBOX_MODE = 'allowlist';
      const sandbox = new SandboxManager();
      
      // All default allowed tools should be accessible
      expect(sandbox.isToolAllowed('list_windows')).toEqual({ allowed: true });
      expect(sandbox.isToolAllowed('screenshot')).toEqual({ allowed: true });
      expect(sandbox.isToolAllowed('browser_launch')).toEqual({ allowed: true });
      expect(sandbox.isToolAllowed('get_coding_progress')).toEqual({ allowed: true });
    });
  });
});
