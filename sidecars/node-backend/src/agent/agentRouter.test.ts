import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRouter, initializeAgentRouter, getAgentRouter, resetAgentRouter } from './agentRouter.js';
import type { MemoryManager } from '../memory/manager.js';

describe('AgentRouter', () => {
  let mockMemoryManager: MemoryManager;

  beforeEach(() => {
    resetAgentRouter();
    mockMemoryManager = {} as MemoryManager;
  });

  it('should initialize with default agents', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const configs = router.listAgentConfigs();
    expect(configs).toHaveLength(4);
    expect(configs.map((c) => c.id)).toContain('architect');
    expect(configs.map((c) => c.id)).toContain('frontend');
    expect(configs.map((c) => c.id)).toContain('backend');
    expect(configs.map((c) => c.id)).toContain('tester');
  });

  it('should register a custom agent', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.registerAgent({
      id: 'custom-agent',
      name: 'Custom Agent',
      role: 'custom',
      description: 'A custom agent',
      systemPrompt: 'You are a custom agent.',
    });

    const config = router.getAgentConfig('custom-agent');
    expect(config).not.toBeNull();
    expect(config?.name).toBe('Custom Agent');
  });

  it('should unregister an agent', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.registerAgent({
      id: 'temp-agent',
      name: 'Temp Agent',
      role: 'custom',
      description: 'Temporary',
      systemPrompt: 'Temp.',
    });

    const deleted = router.unregisterAgent('temp-agent');
    expect(deleted).toBe(true);
    expect(router.getAgentConfig('temp-agent')).toBeNull();
  });

  it('should return false when unregistering non-existent agent', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const deleted = router.unregisterAgent('non-existent');
    expect(deleted).toBe(false);
  });

  it('should start and stop an agent', async () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const instance = await router.startAgent('architect');
    expect(instance.config.id).toBe('architect');
    expect(instance.sessionId).toBeDefined();
    expect(instance.createdAt).toBeDefined();

    const stopped = router.stopAgent('architect');
    expect(stopped).toBe(true);
    expect(router.getAgentInstance('architect')).toBeNull();
  });

  it('should throw when starting non-existent agent', async () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    await expect(router.startAgent('non-existent')).rejects.toThrow('Agent config not found');
  });

  it('should return false when stopping non-existent agent', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const stopped = router.stopAgent('non-existent');
    expect(stopped).toBe(false);
  });

  it('should list active agents', async () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    expect(router.listActiveAgents()).toHaveLength(0);

    await router.startAgent('architect');
    expect(router.listActiveAgents()).toHaveLength(1);

    await router.startAgent('frontend');
    expect(router.listActiveAgents()).toHaveLength(2);
  });

  it('should route messages to appropriate agent', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    // Default routing (no rules)
    const defaultRoute = router.routeMessage('Hello');
    expect(defaultRoute).toBe('architect');
  });

  it('should add and use routing rules', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.addRoutingRule({
      agentId: 'frontend',
      keyword: 'UI',
    });

    const route = router.routeMessage('Fix the UI bug');
    expect(route).toBe('frontend');
  });

  it('should remove routing rules', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.addRoutingRule({ agentId: 'frontend', keyword: 'UI' });
    router.addRoutingRule({ agentId: 'backend', keyword: 'API' });

    expect(router.listRoutingRules()).toHaveLength(2);

    router.removeRoutingRules('frontend');
    expect(router.listRoutingRules()).toHaveLength(1);
    expect(router.listRoutingRules()[0].agentId).toBe('backend');
  });

  it('should route by channel', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.addRoutingRule({
      agentId: 'tester',
      channel: 'telegram',
    });

    const route = router.routeMessage('Hello', { channel: 'telegram' });
    expect(route).toBe('tester');
  });

  it('should route by senderId', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.addRoutingRule({
      agentId: 'architect',
      senderId: 'admin-123',
    });

    const route = router.routeMessage('Hello', { senderId: 'admin-123' });
    expect(route).toBe('architect');
  });

  it('should check if tool is allowed', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    // Architect has 'all' allowed
    expect(router.isToolAllowed('architect', 'any_tool')).toBe(true);

    // Frontend has specific tools allowed
    expect(router.isToolAllowed('frontend', 'read_file')).toBe(true);
    expect(router.isToolAllowed('frontend', 'restart_sidecar')).toBe(false); // denied

    // Non-existent agent
    expect(router.isToolAllowed('non-existent', 'read_file')).toBe(false);
  });

  it('should get statistics', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    const stats = router.getStats();
    expect(stats.totalConfigs).toBe(4); // Default agents
    expect(stats.activeAgents).toBe(0);
    expect(stats.routingRules).toBe(0);
  });

  it('should overwrite existing agent config', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    router.registerAgent({
      id: 'architect', // Overwrite default
      name: 'Super Architect',
      role: 'architect',
      description: 'Updated',
      systemPrompt: 'Updated prompt.',
    });

    const config = router.getAgentConfig('architect');
    expect(config?.name).toBe('Super Architect');
  });

  it('should support singleton pattern', () => {
    const router1 = initializeAgentRouter({ memoryManager: mockMemoryManager });
    const router2 = initializeAgentRouter({ memoryManager: mockMemoryManager });
    
    expect(router1).toBe(router2);
    expect(getAgentRouter()).toBe(router1);
  });

  it('should return null for getAgentRouter before initialization', () => {
    resetAgentRouter();
    expect(getAgentRouter()).toBeNull();
  });

  it('should handle complex routing rules', () => {
    const router = new AgentRouter({
      memoryManager: mockMemoryManager,
      stateEnabled: false,
    });

    // Multiple rules with different criteria
    router.addRoutingRule({ agentId: 'frontend', channel: 'telegram', keyword: 'UI' });
    router.addRoutingRule({ agentId: 'backend', channel: 'telegram', keyword: 'API' });
    router.addRoutingRule({ agentId: 'tester', senderId: 'qa-user' });

    // Should match first applicable rule
    expect(router.routeMessage('Fix UI', { channel: 'telegram' })).toBe('frontend');
    expect(router.routeMessage('Check API', { channel: 'telegram' })).toBe('backend');
    expect(router.routeMessage('Test this', { senderId: 'qa-user' })).toBe('tester');
  });
});
