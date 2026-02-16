import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listAgentsTool,
  startAgentTool,
  stopAgentTool,
  getAgentStatusTool,
  registerCustomAgentTool,
  delegateToAgentTool,
} from './agentRouterTools.js';

// Mock agentRouter
vi.mock('../agent/agentRouter.js', () => ({
  getAgentRouter: vi.fn(),
  AgentRole: {
    ARCHITECT: 'architect',
    FRONTEND: 'frontend',
    BACKEND: 'backend',
    TESTER: 'tester',
    CUSTOM: 'custom',
  },
}));

// Mock subagentRegistry
vi.mock('../agent/subagentRegistry.js', () => ({
  getSubagentRegistry: vi.fn(),
}));

import { getAgentRouter } from '../agent/agentRouter.js';
import { getSubagentRegistry } from '../agent/subagentRegistry.js';

describe('agentRouterTools', () => {
  let mockRouter: any;
  let mockRegistry: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRouter = {
      listAgentConfigs: vi.fn().mockReturnValue([
        { id: 'architect', name: 'Architect', role: 'architect', description: 'Designs system', allowedTools: ['all'], deniedTools: [] },
        { id: 'frontend', name: 'Frontend Dev', role: 'frontend', description: 'Builds UI', allowedTools: ['all'], deniedTools: [] },
      ]),
      listActiveAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({ totalAgents: 2, activeAgents: 0 }),
      startAgent: vi.fn().mockResolvedValue({ sessionId: 'session-123', createdAt: new Date().toISOString() }),
      stopAgent: vi.fn().mockReturnValue(true),
      getAgentConfig: vi.fn().mockReturnValue({
        id: 'architect',
        name: 'Architect',
        role: 'architect',
        description: 'Designs system',
        allowedTools: ['all'],
        deniedTools: [],
      }),
      getAgentInstance: vi.fn().mockReturnValue(null),
      registerAgent: vi.fn(),
    };

    mockRegistry = {
      spawn: vi.fn().mockResolvedValue({ runId: 'run-123', sessionId: 'session-456' }),
    };

    (getAgentRouter as any).mockReturnValue(mockRouter);
    (getSubagentRegistry as any).mockReturnValue(mockRegistry);
  });

  describe('listAgentsTool', () => {
    it('should return all agent configurations', async () => {
      const result = await listAgentsTool.execute({});

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(result.agents[0]).toHaveProperty('id', 'architect');
      expect(result.agents[0]).toHaveProperty('name', 'Architect');
      expect(result.agents[0]).toHaveProperty('isActive', false);
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('hint');
    });

    it('should mark active agents correctly', async () => {
      mockRouter.listActiveAgents.mockReturnValue([{ config: { id: 'architect' } }]);

      const result = await listAgentsTool.execute({});

      expect(result.agents[0].isActive).toBe(true);
      expect(result.agents[1].isActive).toBe(false);
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await listAgentsTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('startAgentTool', () => {
    it('should start an agent successfully', async () => {
      const result = await startAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('architect');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('createdAt');
      expect(mockRouter.startAgent).toHaveBeenCalledWith('architect');
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await startAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should handle start agent errors', async () => {
      mockRouter.startAgent.mockRejectedValue(new Error('Agent already active'));

      const result = await startAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent already active');
    });
  });

  describe('stopAgentTool', () => {
    it('should stop an active agent', async () => {
      const result = await stopAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('architect');
      expect(mockRouter.stopAgent).toHaveBeenCalledWith('architect');
    });

    it('should return error when agent not active', async () => {
      mockRouter.stopAgent.mockReturnValue(false);

      const result = await stopAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await stopAgentTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('getAgentStatusTool', () => {
    it('should return agent status when not active', async () => {
      const result = await getAgentStatusTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('architect');
      expect(result.name).toBe('Architect');
      expect(result.role).toBe('architect');
      expect(result.isActive).toBe(false);
      expect(result.sessionId).toBeUndefined();
    });

    it('should return agent status when active', async () => {
      mockRouter.getAgentInstance.mockReturnValue({
        sessionId: 'session-123',
        createdAt: new Date().toISOString(),
        messageCount: 5,
      });

      const result = await getAgentStatusTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(true);
      expect(result.isActive).toBe(true);
      expect(result.sessionId).toBe('session-123');
      expect(result.messageCount).toBe(5);
    });

    it('should return error when agent not found', async () => {
      mockRouter.getAgentConfig.mockReturnValue(null);

      const result = await getAgentStatusTool.execute({ agentId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await getAgentStatusTool.execute({ agentId: 'architect' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('registerCustomAgentTool', () => {
    it('should register a custom agent', async () => {
      const args = {
        id: 'security-auditor',
        name: 'Security Auditor',
        role: 'custom' as const,
        description: 'Audits code for security issues',
        systemPrompt: 'You are a security expert...',
        allowedTools: ['read_file', 'analyze_code'],
        deniedTools: ['write_file'],
      };

      const result = await registerCustomAgentTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('security-auditor');
      expect(mockRouter.registerAgent).toHaveBeenCalledWith({
        id: 'security-auditor',
        name: 'Security Auditor',
        role: 'custom',
        description: 'Audits code for security issues',
        systemPrompt: 'You are a security expert...',
        allowedTools: ['read_file', 'analyze_code'],
        deniedTools: ['write_file'],
      });
    });

    it('should register agent without optional tool permissions', async () => {
      const args = {
        id: 'simple-agent',
        name: 'Simple Agent',
        role: 'custom' as const,
        description: 'A simple agent',
        systemPrompt: 'You are simple...',
      };

      const result = await registerCustomAgentTool.execute(args);

      expect(result.success).toBe(true);
      expect(mockRouter.registerAgent).toHaveBeenCalledWith(expect.objectContaining({
        id: 'simple-agent',
        allowedTools: undefined,
        deniedTools: undefined,
      }));
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await registerCustomAgentTool.execute({
        id: 'test',
        name: 'Test',
        role: 'custom',
        description: 'Test',
        systemPrompt: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('delegateToAgentTool', () => {
    it('should delegate task to agent', async () => {
      mockRouter.getAgentConfig.mockReturnValue({
        id: 'frontend',
        name: 'Frontend Dev',
        role: 'frontend',
        description: 'Builds UI',
        allowedTools: ['all'],
        deniedTools: [],
      });

      const result = await delegateToAgentTool.execute({
        agentId: 'frontend',
        task: 'Build a login form',
      });

      expect(result.success).toBe(true);
      expect(result.runId).toBe('run-123');
      expect(result.sessionId).toBe('session-456');
      expect(result.delegatedTo).toBe('frontend');
      expect(mockRegistry.spawn).toHaveBeenCalledWith(expect.objectContaining({
        task: 'Build a login form',
        label: 'Frontend Dev',
      }));
    });

    it('should delegate with custom timeout', async () => {
      await delegateToAgentTool.execute({
        agentId: 'backend',
        task: 'Build API',
        timeoutSeconds: 600,
      });

      expect(mockRegistry.spawn).toHaveBeenCalledWith(expect.objectContaining({
        timeoutSeconds: 600,
      }));
    });

    it('should return error when agent not found', async () => {
      mockRouter.getAgentConfig.mockReturnValue(null);

      const result = await delegateToAgentTool.execute({
        agentId: 'nonexistent',
        task: 'Do something',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when router not initialized', async () => {
      (getAgentRouter as any).mockReturnValue(null);

      const result = await delegateToAgentTool.execute({
        agentId: 'frontend',
        task: 'Build something',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should return error when registry not initialized', async () => {
      (getSubagentRegistry as any).mockReturnValue(null);

      const result = await delegateToAgentTool.execute({
        agentId: 'frontend',
        task: 'Build something',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should handle spawn errors', async () => {
      mockRegistry.spawn.mockRejectedValue(new Error('Spawn failed'));

      const result = await delegateToAgentTool.execute({
        agentId: 'frontend',
        task: 'Build something',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Spawn failed');
    });
  });
});
