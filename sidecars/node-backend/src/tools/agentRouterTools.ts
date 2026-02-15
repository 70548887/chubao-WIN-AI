/**
 * Agent Router Tools — multi-agent management and routing.
 */

import { z } from 'zod';
import type { Tool } from './index.js';
import { getAgentRouter, AgentRole } from '../agent/agentRouter.js';

// ---------------------------------------------------------------------------
// 27. list_agents — List all agent configurations
// ---------------------------------------------------------------------------

export const listAgentsTool: Tool = {
  name: 'list_agents',
  description: 'List all available agent configurations (architect, frontend, backend, tester, etc.) with their roles and capabilities.',
  parameters: z.object({}),
  execute: async () => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    const configs = router.listAgentConfigs();
    const activeAgents = router.listActiveAgents();
    const stats = router.getStats();

    return {
      success: true,
      agents: configs.map((config) => ({
        id: config.id,
        name: config.name,
        role: config.role,
        description: config.description,
        isActive: activeAgents.some((a) => a.config.id === config.id),
        allowedTools: config.allowedTools,
        deniedTools: config.deniedTools,
      })),
      stats,
      hint: 'Use start_agent to activate an agent, or spawn_subagent to delegate a task.',
    };
  },
};

// ---------------------------------------------------------------------------
// 28. start_agent — Start an agent instance
// ---------------------------------------------------------------------------

export const startAgentTool: Tool = {
  name: 'start_agent',
  description: 'Start an agent instance with a specific role (architect, frontend, backend, tester). The agent will have its own isolated session and tool permissions.',
  parameters: z.object({
    agentId: z.enum(['architect', 'frontend', 'backend', 'tester']).describe('The agent ID to start'),
  }),
  execute: async (args: { agentId: string }) => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    try {
      const instance = await router.startAgent(args.agentId);
      
      return {
        success: true,
        agentId: args.agentId,
        sessionId: instance.sessionId,
        createdAt: instance.createdAt,
        hint: `Agent ${args.agentId} is now active. You can delegate tasks to it via spawn_subagent with parentSessionId.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to start agent',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 29. stop_agent — Stop an agent instance
// ---------------------------------------------------------------------------

export const stopAgentTool: Tool = {
  name: 'stop_agent',
  description: 'Stop an active agent instance and clean up its session.',
  parameters: z.object({
    agentId: z.string().describe('The agent ID to stop'),
  }),
  execute: async (args: { agentId: string }) => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    const stopped = router.stopAgent(args.agentId);
    
    if (!stopped) {
      return {
        success: false,
        error: `Agent ${args.agentId} is not active`,
      };
    }

    return {
      success: true,
      agentId: args.agentId,
      hint: 'Agent has been stopped.',
    };
  },
};

// ---------------------------------------------------------------------------
// 30. get_agent_status — Get agent status
// ---------------------------------------------------------------------------

export const getAgentStatusTool: Tool = {
  name: 'get_agent_status',
  description: 'Get the status of a specific agent, including whether it is active and its session information.',
  parameters: z.object({
    agentId: z.string().describe('The agent ID to check'),
  }),
  execute: async (args: { agentId: string }) => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    const config = router.getAgentConfig(args.agentId);
    if (!config) {
      return {
        success: false,
        error: `Agent ${args.agentId} not found`,
      };
    }

    const instance = router.getAgentInstance(args.agentId);

    return {
      success: true,
      agentId: args.agentId,
      name: config.name,
      role: config.role,
      description: config.description,
      isActive: !!instance,
      sessionId: instance?.sessionId,
      createdAt: instance?.createdAt,
      messageCount: instance?.messageCount,
      allowedTools: config.allowedTools,
      deniedTools: config.deniedTools,
    };
  },
};

// ---------------------------------------------------------------------------
// 31. register_custom_agent — Register a custom agent
// ---------------------------------------------------------------------------

export const registerCustomAgentTool: Tool = {
  name: 'register_custom_agent',
  description: 'Register a custom agent with a specific role, system prompt, and tool permissions. Use this to create specialized agents for specific tasks.',
  parameters: z.object({
    id: z.string().describe('Unique identifier for the agent (e.g., "security-auditor")'),
    name: z.string().describe('Display name for the agent'),
    role: z.enum(['architect', 'frontend', 'backend', 'tester', 'custom']).describe('Agent role'),
    description: z.string().describe('Short description of what this agent does'),
    systemPrompt: z.string().describe('System prompt that defines the agent\'s behavior and capabilities'),
    allowedTools: z.array(z.string()).optional().describe('List of allowed tool names (use ["all"] to allow all)'),
    deniedTools: z.array(z.string()).optional().describe('List of denied tool names'),
  }),
  execute: async (args: {
    id: string;
    name: string;
    role: AgentRole;
    description: string;
    systemPrompt: string;
    allowedTools?: string[];
    deniedTools?: string[];
  }) => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    router.registerAgent({
      id: args.id,
      name: args.name,
      role: args.role,
      description: args.description,
      systemPrompt: args.systemPrompt,
      allowedTools: args.allowedTools,
      deniedTools: args.deniedTools,
    });

    return {
      success: true,
      agentId: args.id,
      hint: `Custom agent "${args.name}" registered. Use start_agent to activate it.`,
    };
  },
};

// ---------------------------------------------------------------------------
// 32. delegate_to_agent — Delegate a task to a specific agent
// ---------------------------------------------------------------------------

export const delegateToAgentTool: Tool = {
  name: 'delegate_to_agent',
  description: 'Delegate a task to a specific agent by its ID. This is a convenience wrapper around spawn_subagent that targets a specific agent role.',
  parameters: z.object({
    agentId: z.string().describe('The target agent ID (e.g., "frontend", "backend")'),
    task: z.string().describe('The task description'),
    timeoutSeconds: z.number().int().min(30).max(1800).optional().describe('Timeout in seconds (default: 300)'),
  }),
  execute: async (args: {
    agentId: string;
    task: string;
    timeoutSeconds?: number;
  }) => {
    const router = getAgentRouter();
    
    if (!router) {
      return {
        success: false,
        error: 'Agent router not initialized',
      };
    }

    const config = router.getAgentConfig(args.agentId);
    if (!config) {
      return {
        success: false,
        error: `Agent ${args.agentId} not found. Use list_agents to see available agents.`,
      };
    }

    // Import spawn_subagent functionality
    const { getSubagentRegistry } = await import('../agent/subagentRegistry.js');
    const registry = getSubagentRegistry();
    
    if (!registry) {
      return {
        success: false,
        error: 'Subagent registry not initialized',
      };
    }

    try {
      const result = await registry.spawn({
        task: args.task,
        label: config.name,
        timeoutSeconds: args.timeoutSeconds,
        deniedTools: config.deniedTools,
      });

      return {
        success: true,
        runId: result.runId,
        sessionId: result.sessionId,
        delegatedTo: args.agentId,
        agentName: config.name,
        hint: `Task delegated to ${config.name}. Use get_subagent_status with runId "${result.runId}" to check progress.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delegate task',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Export all agent router tools
// ---------------------------------------------------------------------------

export const agentRouterTools: Tool[] = [
  listAgentsTool,
  startAgentTool,
  stopAgentTool,
  getAgentStatusTool,
  registerCustomAgentTool,
  delegateToAgentTool,
];
