import { describe, it, expect, beforeEach } from 'vitest';
import { ToolSecurityGuard, type SecurityMode, type ToolRiskLevel } from './security.js';

describe('ToolSecurityGuard', () => {
  describe('default configuration', () => {
    it('should create with default settings', () => {
      const guard = new ToolSecurityGuard({});
      const policy = guard.getPolicy();

      expect(policy.mode).toBe('enforce');
      expect(policy.allowHighRisk).toBe(false);
      expect(policy.maxStringLength).toBe(12000);
      expect(policy.maxArrayLength).toBe(50);
      expect(policy.maxDepth).toBe(8);
    });

    it('should allow readonly tools by default', () => {
      const guard = new ToolSecurityGuard({});
      const decision = guard.evaluate('screenshot', {});

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('readonly');
    });

    it('should allow standard tools by default', () => {
      const guard = new ToolSecurityGuard({});
      const decision = guard.evaluate('some_standard_tool', {});

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('standard');
    });

    it('should deny high-risk tools by default', () => {
      const guard = new ToolSecurityGuard({});
      const decision = guard.evaluate('opencode_run', {});

      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('high');
    });
  });

  describe('security modes', () => {
    it('should enforce mode deny high-risk tools', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_MODE: 'enforce',
      });
      const decision = guard.evaluate('drag', {});

      expect(decision.allowed).toBe(false);
      expect(decision.mode).toBe('enforce');
    });

    it('should off mode allow all tools', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_MODE: 'off',
        CHUBAO_SECURITY_ALLOW_HIGH_RISK: 'true',
      });
      const decision = guard.evaluate('drag', {});

      expect(decision.allowed).toBe(true);
    });
  });

  describe('tool blocking', () => {
    it('should block explicitly blocked tools', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_BLOCKED_TOOLS: 'screenshot,click',
      });
      const decision = guard.evaluate('screenshot', {});

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('blocked');
    });

    it('should allow only explicitly allowed tools', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_ALLOWED_TOOLS: 'screenshot,get_window_controls',
      });

      const allowedDecision = guard.evaluate('screenshot', {});
      expect(allowedDecision.allowed).toBe(true);

      const deniedDecision = guard.evaluate('click', {});
      expect(deniedDecision.allowed).toBe(false);
    });
  });

  describe('high risk tools', () => {
    it('should allow high-risk with CHUBAO_SECURITY_ALLOW_HIGH_RISK=true', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_ALLOW_HIGH_RISK: 'true',
      });
      const decision = guard.evaluate('opencode_run', {});

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('high');
    });

    it('should identify high-risk tools correctly', () => {
      const guard = new ToolSecurityGuard({});
      const highRiskTools = ['drag', 'menu_select', 'browser_launch', 'multi_agent_start'];

      for (const tool of highRiskTools) {
        const decision = guard.evaluate(tool, {});
        expect(decision.riskLevel).toBe('high');
      }
    });

    it('should identify readonly tools correctly', () => {
      const guard = new ToolSecurityGuard({});
      const readonlyTools = ['screenshot', 'ocr_recognize', 'list_windows', 'browser_get_text'];

      for (const tool of readonlyTools) {
        const decision = guard.evaluate(tool, {});
        expect(decision.riskLevel).toBe('readonly');
      }
    });
  });

  describe('argument validation', () => {
    it('should validate string length', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_MAX_STRING_LENGTH: '10',
      });
      const decision = guard.evaluate('click', { text: 'this is a very long string' });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('string');
    });

    it('should validate array length', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_MAX_ARRAY_LENGTH: '3',
      });
      const decision = guard.evaluate('click', { items: [1, 2, 3, 4, 5] });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('array');
    });

    it('should validate nesting depth', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_MAX_DEPTH: '2',
      });
      const deepArgs = { level1: { level2: { level3: { level4: 'value' } } } };
      const decision = guard.evaluate('click', deepArgs);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('depth');
    });

    it('should detect blocked patterns in command arguments', () => {
      const guard = new ToolSecurityGuard({});
      const decision = guard.evaluate('run_command', { command: 'hello && rm -rf /' });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('blocked');
    });
  });

  describe('getPolicy', () => {
    it('should return complete policy', () => {
      const guard = new ToolSecurityGuard({
        CHUBAO_SECURITY_ALLOWED_TOOLS: 'screenshot',
        CHUBAO_SECURITY_BLOCKED_TOOLS: 'dangerous_tool',
      });
      const policy = guard.getPolicy();

      expect(policy).toHaveProperty('mode');
      expect(policy).toHaveProperty('allowHighRisk');
      expect(policy).toHaveProperty('maxStringLength');
      expect(policy).toHaveProperty('maxArrayLength');
      expect(policy).toHaveProperty('maxDepth');
      expect(policy).toHaveProperty('configuredAllowedTools');
      expect(policy).toHaveProperty('configuredBlockedTools');
      expect(policy).toHaveProperty('blockedArgumentPatterns');
      expect(policy).toHaveProperty('readonlyTools');
      expect(policy).toHaveProperty('highRiskTools');
    });
  });
});
