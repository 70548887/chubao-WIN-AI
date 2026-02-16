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
});
