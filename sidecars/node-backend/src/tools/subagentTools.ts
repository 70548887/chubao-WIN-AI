/**
 * Subagent Tools — spawn and manage child AI agents.
 */

import { z } from 'zod';
import type { Tool } from './index.js';
import { getSubagentRegistry, SubagentRegistry } from '../agent/subagentRegistry.js';

// ---------------------------------------------------------------------------
// 23. spawn_subagent — Spawn a child AI agent
// ---------------------------------------------------------------------------

export const spawnSubagentTool: Tool = {
  name: 'spawn_subagent',
  description: 'Spawn a child AI agent to execute a task independently in the background. The subagent runs in parallel and does not block the current conversation. Use this to delegate work that can be done concurrently.',
  parameters: z.object({
    task: z.string().describe('Detailed description of the task for the subagent to complete'),
    label: z.string().optional().describe('Optional label to identify this subagent (e.g., "Frontend Dev", "Test Writer")'),
    timeoutSeconds: z.number().int().min(30).max(1800).optional().describe('Timeout in seconds (default: 300, max: 30 minutes)'),
    maxIterations: z.number().int().min(1).max(100).optional().describe('Maximum tool iterations for the subagent (default: 30)'),
    deniedTools: z.array(z.string()).optional().describe('List of tool names the subagent is NOT allowed to use (e.g., ["restart_sidecar", "git_rollback"])'),
  }),
  execute: async (args: {
    task: string;
    label?: string;
    timeoutSeconds?: number;
    maxIterations?: number;
    deniedTools?: string[];
  }) => {
    const registry = getSubagentRegistry();
    
    if (!registry) {
      return {
        success: false,
        error: 'Subagent registry not initialized',
        hint: 'The subagent system is not available. Check server logs.',
      };
    }

    try {
      const result = await registry.spawn({
        task: args.task,
        label: args.label,
        timeoutSeconds: args.timeoutSeconds,
        maxIterations: args.maxIterations,
        deniedTools: args.deniedTools,
      });

      return {
        success: true,
        runId: result.runId,
        sessionId: result.sessionId,
        status: result.status,
        hint: `Subagent spawned successfully. Use get_subagent_status with runId "${result.runId}" to check progress.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to spawn subagent',
        hint: 'Check if max concurrent subagents limit is reached.',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 24. get_subagent_status — Get subagent run status
// ---------------------------------------------------------------------------

export const getSubagentStatusTool: Tool = {
  name: 'get_subagent_status',
  description: 'Get the status and result of a subagent run by its runId. Use this to check if a spawned subagent has completed and retrieve its output.',
  parameters: z.object({
    runId: z.string().describe('The runId returned by spawn_subagent'),
  }),
  execute: async (args: { runId: string }) => {
    const registry = getSubagentRegistry();
    
    if (!registry) {
      return {
        success: false,
        error: 'Subagent registry not initialized',
      };
    }

    const run = registry.getRun(args.runId);
    
    if (!run) {
      return {
        success: false,
        error: `Subagent run not found: ${args.runId}`,
        hint: 'Check the runId or use list_subagents to see available runs.',
      };
    }

    const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'canceled';

    return {
      success: true,
      runId: run.runId,
      status: run.status,
      label: run.config.label,
      task: run.config.task.substring(0, 200),
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      result: run.result,
      error: run.error,
      isTerminal,
      hint: isTerminal 
        ? 'Subagent has finished. Check result or error field.'
        : 'Subagent is still running. Check again later.',
    };
  },
};

// ---------------------------------------------------------------------------
// 25. list_subagents — List all subagent runs
// ---------------------------------------------------------------------------

export const listSubagentsTool: Tool = {
  name: 'list_subagents',
  description: 'List all subagent runs with optional filtering by status. Use this to see what subagents are running or have completed.',
  parameters: z.object({
    status: z.enum(['all', 'pending', 'running', 'completed', 'failed', 'canceled']).optional().describe('Filter by status (default: all)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results (default: 20)'),
  }),
  execute: async (args: {
    status?: 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
    limit?: number;
  }) => {
    const registry = getSubagentRegistry();
    
    if (!registry) {
      return {
        success: false,
        error: 'Subagent registry not initialized',
      };
    }

    const result = registry.listRuns({
      status: args.status,
      limit: args.limit ?? 20,
    });

    return {
      success: true,
      count: result.count,
      activeCount: registry.getActiveCount(),
      runs: result.runs.map((run) => ({
        runId: run.runId,
        status: run.status,
        label: run.config.label,
        task: run.config.task.substring(0, 100),
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
      })),
      hint: `Use get_subagent_status with a specific runId to see full details.`,
    };
  },
};

// ---------------------------------------------------------------------------
// 26. cancel_subagent — Cancel a running subagent
// ---------------------------------------------------------------------------

export const cancelSubagentTool: Tool = {
  name: 'cancel_subagent',
  description: 'Cancel a running or pending subagent by its runId. Use this if a subagent is taking too long or is no longer needed.',
  parameters: z.object({
    runId: z.string().describe('The runId of the subagent to cancel'),
  }),
  execute: async (args: { runId: string }) => {
    const registry = getSubagentRegistry();
    
    if (!registry) {
      return {
        success: false,
        error: 'Subagent registry not initialized',
      };
    }

    try {
      const run = registry.cancelRun(args.runId);
      
      return {
        success: true,
        runId: run.runId,
        status: run.status,
        hint: 'Subagent has been canceled.',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to cancel subagent',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Export all subagent tools
// ---------------------------------------------------------------------------

export const subagentTools: Tool[] = [
  spawnSubagentTool,
  getSubagentStatusTool,
  listSubagentsTool,
  cancelSubagentTool,
];
