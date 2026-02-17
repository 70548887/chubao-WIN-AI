import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';

export type QueueTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type QueueTaskListStatus = QueueTaskStatus | 'all';

export interface QueueTaskPayload {
  kind: string;
  [key: string]: unknown;
}

export interface QueueTaskRecord {
  id: string;
  status: QueueTaskStatus;
  payload: QueueTaskPayload;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
  cancelRequested?: boolean;
}

interface PersistedTaskQueuePayload {
  schemaVersion: string;
  updatedAt: string;
  tasks: QueueTaskRecord[];
}

export interface QueueTaskListOptions {
  status?: QueueTaskListStatus;
  limit?: number;
  offset?: number;
}

export interface QueueTaskListResult {
  count: number;
  tasks: QueueTaskRecord[];
  page: {
    limit: number;
    offset: number;
    returned: number;
  };
  capacity: {
    pending: number;
    running: number;
    maxConcurrent: number;
  };
}

export interface TaskQueueOptions {
  executeTask: (payload: QueueTaskPayload, task: QueueTaskRecord) => Promise<unknown>;
  maxConcurrent?: number;
  stateEnabled?: boolean;
  statePath?: string;
  maxTasks?: number;
  retentionMs?: number;
}

const DEFAULT_STATE_PATH = path.join(process.cwd(), '../../memory', 'tasks', 'pending.json');
const TASK_QUEUE_SCHEMA_VERSION = 'task-queue.v1';
const DEFAULT_MAX_CONCURRENT = 4;
const MIN_MAX_CONCURRENT = 1;
const MAX_MAX_CONCURRENT = 32;
const DEFAULT_MAX_TASKS = 500;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Math.trunc(Number(raw));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function parseAtLeastInt(raw: string | undefined, fallback: number, min: number): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Math.trunc(Number(raw));
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function toEpochMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): QueueTaskStatus | null {
  if (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'canceled'
  ) {
    return value;
  }
  return null;
}

function normalizePayload(value: unknown): QueueTaskPayload {
  if (!isRecord(value) || typeof value.kind !== 'string' || value.kind.trim().length === 0) {
    throw new Error('payload.kind is required');
  }
  return deepClone(value as QueueTaskPayload);
}

function isTerminal(status: QueueTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

export class TaskQueue {
  private readonly executeTask: TaskQueueOptions['executeTask'];
  private readonly maxConcurrent: number;
  private readonly stateEnabled: boolean;
  private readonly statePath: string;
  private readonly maxTasks: number;
  private readonly retentionMs: number;
  private readonly tasks = new Map<string, QueueTaskRecord>();
  private readonly pendingTaskIds: string[] = [];
  private runningCount = 0;

  constructor(options: TaskQueueOptions) {
    this.executeTask = options.executeTask;
    this.maxConcurrent =
      options.maxConcurrent ??
      parseBoundedInt(
        process.env.CHUBAO_TASK_QUEUE_CONCURRENCY,
        DEFAULT_MAX_CONCURRENT,
        MIN_MAX_CONCURRENT,
        MAX_MAX_CONCURRENT,
      );
    this.stateEnabled =
      options.stateEnabled ??
      parseBoolean(
        process.env.CHUBAO_TASK_QUEUE_STATE_ENABLED,
        process.env.VITEST ? false : true,
      );
    this.statePath = options.statePath ?? process.env.CHUBAO_TASK_QUEUE_STATE_PATH ?? DEFAULT_STATE_PATH;
    this.maxTasks =
      options.maxTasks ??
      parseAtLeastInt(process.env.CHUBAO_TASK_QUEUE_MAX_TASKS, DEFAULT_MAX_TASKS, 50);
    this.retentionMs =
      options.retentionMs ??
      parseAtLeastInt(process.env.CHUBAO_TASK_QUEUE_RETENTION_MS, DEFAULT_RETENTION_MS, 60_000);

    this.loadState();
    queueMicrotask(() => this.drainQueue());
  }

  enqueue(payload: QueueTaskPayload): QueueTaskRecord {
    const normalizedPayload = normalizePayload(payload);
    const now = new Date().toISOString();
    const task: QueueTaskRecord = {
      id: randomUUID(),
      status: 'pending',
      payload: normalizedPayload,
      createdAt: now,
    };

    this.tasks.set(task.id, task);
    this.pendingTaskIds.push(task.id);
    this.cleanupTasks();
    this.persistState();
    this.drainQueue();
    return deepClone(task);
  }

  getTask(taskId: string): QueueTaskRecord | null {
    const task = this.tasks.get(taskId);
    return task ? deepClone(task) : null;
  }

  listTasks(options: QueueTaskListOptions = {}): QueueTaskListResult {
    const status = this.normalizeListStatus(options.status);
    const limit = this.normalizeListLimit(options.limit);
    const offset = this.normalizeListOffset(options.offset);

    const allTasks = Array.from(this.tasks.values())
      .map((task) => deepClone(task))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const filtered =
      status === 'all' ? allTasks : allTasks.filter((task) => task.status === status);
    const pageItems = filtered.slice(offset, offset + limit);

    return {
      count: filtered.length,
      tasks: pageItems,
      page: {
        limit,
        offset,
        returned: pageItems.length,
      },
      capacity: {
        pending: this.pendingTaskIds.length,
        running: this.runningCount,
        maxConcurrent: this.maxConcurrent,
      },
    };
  }

  cancelTask(taskId: string): QueueTaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (isTerminal(task.status)) {
      return deepClone(task);
    }

    const now = new Date().toISOString();
    task.cancelRequested = true;
    task.status = 'canceled';
    task.finishedAt = now;
    task.error = task.error ?? 'Canceled by user';

    if (task.startedAt === undefined) {
      const index = this.pendingTaskIds.indexOf(taskId);
      if (index >= 0) {
        this.pendingTaskIds.splice(index, 1);
      }
    }

    this.cleanupTasks();
    this.persistState();
    this.drainQueue();
    return deepClone(task);
  }

  private normalizeListStatus(raw: QueueTaskListStatus | undefined): QueueTaskListStatus {
    if (
      raw === 'all' ||
      raw === 'pending' ||
      raw === 'running' ||
      raw === 'completed' ||
      raw === 'failed' ||
      raw === 'canceled'
    ) {
      return raw;
    }
    return 'all';
  }

  private normalizeListLimit(raw: number | undefined): number {
    if (raw === undefined) {
      return DEFAULT_LIST_LIMIT;
    }
    const value = Math.trunc(raw);
    if (!Number.isFinite(value) || value < 1) {
      throw new Error('limit must be an integer >= 1');
    }
    return Math.min(value, MAX_LIST_LIMIT);
  }

  private normalizeListOffset(raw: number | undefined): number {
    if (raw === undefined) {
      return 0;
    }
    const value = Math.trunc(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('offset must be an integer >= 0');
    }
    return value;
  }

  private drainQueue(): void {
    while (this.runningCount < this.maxConcurrent && this.pendingTaskIds.length > 0) {
      const taskId = this.pendingTaskIds.shift();
      if (!taskId) {
        continue;
      }
      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'pending') {
        continue;
      }

      task.status = 'running';
      task.startedAt = new Date().toISOString();
      this.runningCount += 1;
      this.persistState();
      void this.runTask(task.id);
    }
  }

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.runningCount = Math.max(0, this.runningCount - 1);
      return;
    }

    try {
      const result = await this.executeTask(deepClone(task.payload), deepClone(task));
      const current = this.tasks.get(taskId);
      if (!current || current.status === 'canceled') {
        return;
      }
      current.status = 'completed';
      current.finishedAt = new Date().toISOString();
      current.result = result;
      current.error = undefined;
    } catch (error) {
      const current = this.tasks.get(taskId);
      if (!current || current.status === 'canceled') {
        return;
      }
      current.status = 'failed';
      current.finishedAt = new Date().toISOString();
      current.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.runningCount = Math.max(0, this.runningCount - 1);
      this.cleanupTasks();
      this.persistState();
      this.drainQueue();
    }
  }

  private cleanupTasks(nowMs = Date.now()): void {
    let changed = false;

    for (const [taskId, task] of this.tasks.entries()) {
      if (!isTerminal(task.status)) {
        continue;
      }
      const refMs = toEpochMs(task.finishedAt) ?? toEpochMs(task.startedAt) ?? toEpochMs(task.createdAt) ?? nowMs;
      if (nowMs - refMs > this.retentionMs) {
        this.tasks.delete(taskId);
        changed = true;
      }
    }

    while (this.tasks.size > this.maxTasks) {
      const removable = Array.from(this.tasks.values())
        .filter((task) => isTerminal(task.status))
        .sort((a, b) => {
          const aTime = toEpochMs(a.finishedAt) ?? toEpochMs(a.createdAt) ?? nowMs;
          const bTime = toEpochMs(b.finishedAt) ?? toEpochMs(b.createdAt) ?? nowMs;
          return aTime - bTime;
        });

      if (removable.length === 0) {
        break;
      }
      const next = removable[0];
      this.tasks.delete(next.id);
      changed = true;
    }

    if (changed) {
      this.rebuildPendingQueue();
    }
  }

  private rebuildPendingQueue(): void {
    this.pendingTaskIds.length = 0;
    const pending = Array.from(this.tasks.values())
      .filter((task) => task.status === 'pending')
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((task) => task.id);

    this.pendingTaskIds.push(...pending);
  }

  private loadState(): void {
    if (!this.stateEnabled) {
      return;
    }

    try {
      if (!fsSync.existsSync(this.statePath)) {
        return;
      }
      const rawText = fsSync.readFileSync(this.statePath, 'utf8');
      if (!rawText.trim()) {
        return;
      }

      const payload = JSON.parse(rawText) as Partial<PersistedTaskQueuePayload>;
      if (!Array.isArray(payload.tasks)) {
        return;
      }

      const nowIso = new Date().toISOString();
      for (const candidate of payload.tasks) {
        const normalized = this.normalizePersistedTask(candidate, nowIso);
        if (!normalized) {
          continue;
        }
        this.tasks.set(normalized.id, normalized);
      }

      this.rebuildPendingQueue();
      this.runningCount = 0;
      this.cleanupTasks();
      this.persistState();
    } catch (error) {
      logger.warn('Failed to load persisted task queue', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private normalizePersistedTask(candidate: unknown, nowIso: string): QueueTaskRecord | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id) {
      return null;
    }

    let payload: QueueTaskPayload;
    try {
      payload = normalizePayload(candidate.payload);
    } catch {
      return null;
    }

    const loadedStatus = normalizeStatus(candidate.status) ?? 'failed';
    const status: QueueTaskStatus = loadedStatus === 'running' ? 'failed' : loadedStatus;
    const recoveredError =
      loadedStatus === 'running'
        ? 'Recovered after process restart; running task cannot be resumed.'
        : typeof candidate.error === 'string'
          ? candidate.error
          : undefined;

    const createdAt =
      typeof candidate.createdAt === 'string' && candidate.createdAt.length > 0
        ? candidate.createdAt
        : nowIso;

    const startedAt = typeof candidate.startedAt === 'string' ? candidate.startedAt : undefined;
    const finishedAt =
      typeof candidate.finishedAt === 'string'
        ? candidate.finishedAt
        : status === 'pending'
          ? undefined
          : nowIso;

    const result = candidate.result === undefined ? undefined : deepClone(candidate.result);

    return {
      id,
      status,
      payload,
      createdAt,
      startedAt,
      finishedAt,
      result,
      error: recoveredError,
      cancelRequested: candidate.cancelRequested === true,
    };
  }

  private persistState(): void {
    if (!this.stateEnabled) {
      return;
    }

    try {
      fsSync.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const payload: PersistedTaskQueuePayload = {
        schemaVersion: TASK_QUEUE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        tasks: Array.from(this.tasks.values()).map((task) => deepClone(task)),
      };
      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      logger.warn('Failed to persist task queue state', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
