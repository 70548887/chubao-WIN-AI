/**
 * Subagent Registry — manage child AI agents for parallel task execution.
 *
 * Allows the main agent to spawn sub-agents that work independently
 * on delegated tasks, then report results back.
 */

import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { AgentRuntime } from './runtime.js';
import type { MemoryManager } from '../memory/manager.js';

export type SubagentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface SubagentConfig {
  /** Task description for the subagent */
  task: string;
  /** Optional label for identification */
  label?: string;
  /** Timeout in seconds (default: 300) */
  timeoutSeconds?: number;
  /** Maximum iterations for the subagent (default: 30) */
  maxIterations?: number;
  /** Tools allowed for this subagent (default: all) */
  allowedTools?: string[];
  /** Tools denied for this subagent */
  deniedTools?: string[];
  /** Parent session ID for context inheritance */
  parentSessionId?: string;
}

export interface SubagentRecord {
  id: string;
  runId: string;
  status: SubagentStatus;
  config: SubagentConfig;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: string;
  error?: string;
  sessionId: string;
  toolCalls: number;
  iterations: number;
}

interface PersistedSubagentPayload {
  schemaVersion: string;
  updatedAt: string;
  runs: SubagentRecord[];
}

export interface SubagentSpawnResult {
  runId: string;
  sessionId: string;
  status: 'accepted';
}

export interface SubagentListOptions {
  status?: SubagentStatus | 'all';
  limit?: number;
  offset?: number;
}

export interface SubagentListResult {
  count: number;
  runs: SubagentRecord[];
  page: {
    limit: number;
    offset: number;
    returned: number;
  };
}

const DEFAULT_STATE_PATH = path.join(process.cwd(), '../../memory', 'subagents', 'registry.json');
const SUBAGENT_SCHEMA_VERSION = 'subagent-registry.v1';
const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_MAX_ITERATIONS = 30;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_CONCURRENT_SUBAGENTS = 8;

export class SubagentRegistry {
  private readonly agentRuntime: AgentRuntime;
  private readonly memoryManager: MemoryManager;
  private readonly stateEnabled: boolean;
  private readonly statePath: string;
  private readonly runs = new Map<string, SubagentRecord>();
  private readonly activeRuns = new Set<string>();

  constructor(options: {
    agentRuntime: AgentRuntime;
    memoryManager: MemoryManager;
    stateEnabled?: boolean;
    statePath?: string;
  }) {
    this.agentRuntime = options.agentRuntime;
    this.memoryManager = options.memoryManager;
    this.stateEnabled = options.stateEnabled ?? true;
    this.statePath = options.statePath ?? process.env.CHUBAO_SUBAGENT_STATE_PATH ?? DEFAULT_STATE_PATH;

    this.loadState();
  }

  /**
   * Spawn a new subagent to execute a task independently.
   */
  async spawn(config: SubagentConfig): Promise<SubagentSpawnResult> {
    // Check concurrent limit
    if (this.activeRuns.size >= MAX_CONCURRENT_SUBAGENTS) {
      throw new Error(`Max concurrent subagents (${MAX_CONCURRENT_SUBAGENTS}) reached. Wait for some to complete.`);
    }

    const runId = randomUUID();
    const sessionId = `subagent:${runId}`;
    const now = new Date().toISOString();

    const record: SubagentRecord = {
      id: runId,
      runId,
      status: 'pending',
      config: {
        ...config,
        timeoutSeconds: config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
        maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      },
      createdAt: now,
      sessionId,
      toolCalls: 0,
      iterations: 0,
    };

    this.runs.set(runId, record);
    this.persistState();

    // Start execution asynchronously (non-blocking)
    this.executeSubagent(record).catch((error) => {
      console.error(`[SubagentRegistry] Execution error for ${runId}:`, error);
      record.status = 'failed';
      record.error = error.message || 'Execution failed';
      record.finishedAt = new Date().toISOString();
      this.activeRuns.delete(runId);
      this.persistState();
    });

    return {
      runId,
      sessionId,
      status: 'accepted',
    };
  }

  /**
   * Get a subagent run by ID.
   */
  getRun(runId: string): SubagentRecord | null {
    const run = this.runs.get(runId);
    return run ? this.deepClone(run) : null;
  }

  /**
   * List subagent runs with optional filtering.
   */
  listRuns(options: SubagentListOptions = {}): SubagentListResult {
    const status = options.status ?? 'all';
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const offset = options.offset ?? 0;

    const allRuns = Array.from(this.runs.values())
      .map((run) => this.deepClone(run))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const filtered = status === 'all' ? allRuns : allRuns.filter((run) => run.status === status);
    const pageItems = filtered.slice(offset, offset + limit);

    return {
      count: filtered.length,
      runs: pageItems,
      page: {
        limit,
        offset,
        returned: pageItems.length,
      },
    };
  }

  /**
   * Cancel a running subagent.
   */
  cancelRun(runId: string): SubagentRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Subagent run not found: ${runId}`);
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      return this.deepClone(run);
    }

    run.status = 'canceled';
    run.finishedAt = new Date().toISOString();
    run.error = run.error ?? 'Canceled by parent agent';

    this.activeRuns.delete(runId);
    this.persistState();

    return this.deepClone(run);
  }

  /**
   * Get the number of currently active (running) subagents.
   */
  getActiveCount(): number {
    return this.activeRuns.size;
  }

  /**
   * Execute the subagent task.
   */
  private async executeSubagent(record: SubagentRecord): Promise<void> {
    const { config, runId } = record;

    // Mark as running
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    this.activeRuns.add(runId);
    this.persistState();

    console.log(`[SubagentRegistry] Starting subagent ${runId}: ${config.label ?? config.task.substring(0, 50)}`);

    try {
      // Build system prompt for subagent
      const systemPrompt = this.buildSubagentPrompt(config);

      // Execute with timeout
      const timeoutMs = (config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
      const startTime = Date.now();

      // Run the task through agentRuntime
      const response = await this.runWithTimeout(
        () => this.agentRuntime.chat(systemPrompt, record.sessionId),
        timeoutMs
      );

      record.result = response;
      record.status = 'completed';
      record.finishedAt = new Date().toISOString();

      console.log(`[SubagentRegistry] Subagent ${runId} completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      record.status = 'failed';
      record.error = error.message || 'Unknown error';
      record.finishedAt = new Date().toISOString();
      console.error(`[SubagentRegistry] Subagent ${runId} failed:`, error.message);
    } finally {
      this.activeRuns.delete(runId);
      this.persistState();
    }
  }

  /**
   * Build the system prompt for a subagent.
   */
  private buildSubagentPrompt(config: SubagentConfig): string {
    const toolRestrictions = config.deniedTools?.length
      ? `\n\nRESTRICTIONS:\n- You MUST NOT use these tools: ${config.deniedTools.join(', ')}`
      : '';

    const allowedTools = config.allowedTools?.length
      ? `\n\nALLOWED TOOLS:\n- You may only use these tools: ${config.allowedTools.join(', ')}`
      : '';

    return `You are a specialized sub-agent working on a delegated task.

TASK: ${config.task}

INSTRUCTIONS:
1. Focus solely on the task above
2. Work independently and efficiently
3. Use tools as needed to complete the task
4. Report your final result clearly
5. Do not ask for clarification - make reasonable assumptions
6. If you cannot complete the task, explain why clearly${toolRestrictions}${allowedTools}

Begin working on the task now.`;
  }

  /**
   * Run a promise with timeout.
   */
  private async runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Subagent timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Persist registry state to disk.
   */
  private persistState(): void {
    if (!this.stateEnabled) return;

    try {
      const dir = path.dirname(this.statePath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }

      const payload: PersistedSubagentPayload = {
        schemaVersion: SUBAGENT_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        runs: Array.from(this.runs.values()),
      };

      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[SubagentRegistry] Failed to persist state:', error);
    }
  }

  /**
   * Load registry state from disk.
   */
  private loadState(): void {
    if (!this.stateEnabled) return;

    try {
      if (!fsSync.existsSync(this.statePath)) {
        return;
      }

      const content = fsSync.readFileSync(this.statePath, 'utf-8');
      const payload = JSON.parse(content) as PersistedSubagentPayload;

      if (payload.schemaVersion !== SUBAGENT_SCHEMA_VERSION) {
        console.warn('[SubagentRegistry] Schema version mismatch, starting fresh');
        return;
      }

      // Restore runs (but mark running ones as failed since we restarted)
      for (const run of payload.runs) {
        if (run.status === 'running' || run.status === 'pending') {
          run.status = 'failed';
          run.error = 'Process restarted while subagent was active';
          run.finishedAt = new Date().toISOString();
        }
        this.runs.set(run.runId, run);
      }

      console.log(`[SubagentRegistry] Loaded ${this.runs.size} runs from state`);
    } catch (error) {
      console.warn('[SubagentRegistry] Failed to load state:', error);
    }
  }

  /**
   * Deep clone an object.
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// Singleton instance
let globalRegistry: SubagentRegistry | null = null;

export function initializeSubagentRegistry(options: {
  agentRuntime: AgentRuntime;
  memoryManager: MemoryManager;
}): SubagentRegistry {
  if (!globalRegistry) {
    globalRegistry = new SubagentRegistry(options);
  }
  return globalRegistry;
}

export function getSubagentRegistry(): SubagentRegistry | null {
  return globalRegistry;
}

export function resetSubagentRegistry(): void {
  globalRegistry = null;
}
