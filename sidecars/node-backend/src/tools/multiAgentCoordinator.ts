import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cancelOhMyTask,
  getOhMyTaskStatus,
  runOhMyDelegate,
  runOhMyTask,
} from './ohmyopencode.js';

type DispatchKind = 'delegate' | 'task';
type GroupState = 'running' | 'completed' | 'failed' | 'canceled' | 'partial';
const DEFAULT_GROUP_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_GROUPS = 100;
const DEFAULT_MAX_RUNNING_GROUPS = 5;
const DEFAULT_MAX_RUNNING_TASKS = 20;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_GROUP_STATE_PATH = path.join(process.cwd(), 'runtime-data', 'multi-agent-groups.json');
const GROUP_STATE_SCHEMA_VERSION = 'multi-agent-groups.v1';

export interface MultiAgentTaskSpec {
  kind?: DispatchKind;
  name?: string;
  agentType?: string;
  taskDescription?: string;
  taskCategory?: string;
  taskPrompt?: string;
}

export interface StartMultiAgentGroupOptions {
  tasks: MultiAgentTaskSpec[];
  projectPath?: string;
  timeoutMs?: number;
}

export interface ListMultiAgentGroupsOptions {
  state?: GroupState | 'all';
  limit?: number;
  offset?: number;
}

interface GroupTaskEntry {
  index: number;
  name: string;
  kind: DispatchKind;
  taskId?: string;
  startError?: string;
}

interface MultiAgentGroupRecord {
  id: string;
  createdAt: string;
  finishedAt?: string;
  projectPath?: string;
  timeoutMs?: number;
  entries: GroupTaskEntry[];
  state: GroupState;
}

interface PersistedGroupsPayload {
  schemaVersion: string;
  updatedAt: string;
  groups: MultiAgentGroupRecord[];
}

interface ListOptionsNormalized {
  state: GroupState | 'all';
  limit: number;
  offset: number;
}

interface CapacitySnapshot {
  runningGroups: number;
  runningTasks: number;
  maxRunningGroups: number;
  maxRunningTasks: number;
}

const multiAgentGroups = new Map<string, MultiAgentGroupRecord>();
const MULTI_AGENT_GROUP_RETENTION_MS = readPositiveIntEnv(
  'CHUBAO_MULTI_AGENT_GROUP_RETENTION_MS',
  DEFAULT_GROUP_RETENTION_MS,
  1_000,
);
const MULTI_AGENT_GROUP_MAX_ITEMS = readPositiveIntEnv(
  'CHUBAO_MULTI_AGENT_GROUP_MAX_ITEMS',
  DEFAULT_MAX_GROUPS,
  10,
);
const MULTI_AGENT_MAX_RUNNING_GROUPS = readPositiveIntEnv(
  'CHUBAO_MULTI_AGENT_MAX_RUNNING_GROUPS',
  DEFAULT_MAX_RUNNING_GROUPS,
  1,
);
const MULTI_AGENT_MAX_RUNNING_TASKS = readPositiveIntEnv(
  'CHUBAO_MULTI_AGENT_MAX_RUNNING_TASKS',
  DEFAULT_MAX_RUNNING_TASKS,
  1,
);
const MULTI_AGENT_GROUP_STATE_ENABLED = resolveStateEnabled();
const MULTI_AGENT_GROUP_STATE_PATH = resolveStatePath();
let hasLoadedPersistedGroups = false;

function readPositiveIntEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return fallback;
  }

  return normalized;
}

function resolveStateEnabled(): boolean {
  const raw = process.env.CHUBAO_MULTI_AGENT_GROUP_STATE_ENABLED;
  if (raw && raw.trim().length > 0) {
    return raw.trim().toLowerCase() !== 'false';
  }

  if (process.env.VITEST) {
    return false;
  }

  return true;
}

function resolveStatePath(): string {
  const raw = process.env.CHUBAO_MULTI_AGENT_GROUP_STATE_PATH;
  if (raw && raw.trim().length > 0) {
    return path.resolve(raw.trim());
  }
  return DEFAULT_GROUP_STATE_PATH;
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

function isTerminalState(state: GroupState): boolean {
  return state !== 'running';
}

function ensureStateDirExists(): void {
  const dir = path.dirname(MULTI_AGENT_GROUP_STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

function parseGroupState(value: unknown): GroupState {
  if (
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'canceled' ||
    value === 'partial'
  ) {
    return value;
  }
  return 'failed';
}

function parseDispatchKind(value: unknown): DispatchKind {
  if (value === 'task') {
    return 'task';
  }
  return 'delegate';
}

function normalizePersistedGroupRecord(
  candidate: unknown,
  nowIso: string,
): MultiAgentGroupRecord | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso;

  if (!id) {
    return null;
  }

  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: GroupTaskEntry[] = [];
  rawEntries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const rawEntry = entry as Record<string, unknown>;
    const indexValue = Number(rawEntry.index);
    const taskId = typeof rawEntry.taskId === 'string' && rawEntry.taskId.trim().length > 0
      ? rawEntry.taskId.trim()
      : undefined;
    const startError = typeof rawEntry.startError === 'string' && rawEntry.startError.trim().length > 0
      ? rawEntry.startError.trim()
      : undefined;

    entries.push({
      index: Number.isFinite(indexValue) ? Math.trunc(indexValue) : index,
      name: typeof rawEntry.name === 'string' && rawEntry.name.trim().length > 0
        ? rawEntry.name.trim()
        : `task-${index + 1}`,
      kind: parseDispatchKind(rawEntry.kind),
      taskId,
      startError,
    });
  });

  if (entries.length === 0) {
    return null;
  }

  const loadedState = parseGroupState(raw.state);
  const recoveredState: GroupState = loadedState === 'running' ? 'failed' : loadedState;
  const finishedAt = typeof raw.finishedAt === 'string' ? raw.finishedAt : nowIso;

  return {
    id,
    createdAt,
    finishedAt,
    projectPath: typeof raw.projectPath === 'string' ? raw.projectPath : undefined,
    timeoutMs: Number.isFinite(raw.timeoutMs) ? Math.trunc(Number(raw.timeoutMs)) : undefined,
    entries,
    state: recoveredState,
  };
}

function loadPersistedGroupsIfNeeded(): void {
  if (hasLoadedPersistedGroups) {
    return;
  }
  hasLoadedPersistedGroups = true;

  if (!MULTI_AGENT_GROUP_STATE_ENABLED) {
    return;
  }

  try {
    if (!fs.existsSync(MULTI_AGENT_GROUP_STATE_PATH)) {
      return;
    }

    const rawText = fs.readFileSync(MULTI_AGENT_GROUP_STATE_PATH, 'utf8');
    if (!rawText.trim()) {
      return;
    }

    const payload = JSON.parse(rawText) as Partial<PersistedGroupsPayload>;
    if (!Array.isArray(payload.groups)) {
      return;
    }

    const nowIso = new Date().toISOString();
    for (const candidate of payload.groups) {
      const group = normalizePersistedGroupRecord(candidate, nowIso);
      if (!group) {
        continue;
      }
      multiAgentGroups.set(group.id, group);
    }
  } catch (error) {
    console.warn(
      'Failed to load persisted multi-agent groups:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function persistMultiAgentGroups(): void {
  if (!MULTI_AGENT_GROUP_STATE_ENABLED) {
    return;
  }

  try {
    ensureStateDirExists();
    const groups = Array.from(multiAgentGroups.values()).map((group) => ({
      id: group.id,
      createdAt: group.createdAt,
      finishedAt: group.finishedAt,
      projectPath: group.projectPath,
      timeoutMs: group.timeoutMs,
      entries: group.entries.map((entry) => ({
        index: entry.index,
        name: entry.name,
        kind: entry.kind,
        taskId: entry.taskId,
        startError: entry.startError,
      })),
      state: group.state,
    }));

    const payload: PersistedGroupsPayload = {
      schemaVersion: GROUP_STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      groups,
    };

    fs.writeFileSync(MULTI_AGENT_GROUP_STATE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn(
      'Failed to persist multi-agent groups:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function cleanupMultiAgentGroups(nowMs = Date.now()): boolean {
  let changed = false;

  for (const [groupId, group] of multiAgentGroups.entries()) {
    if (!isTerminalState(group.state)) {
      continue;
    }

    const finishedMs = toEpochMs(group.finishedAt) ?? toEpochMs(group.createdAt) ?? nowMs;
    if (nowMs - finishedMs > MULTI_AGENT_GROUP_RETENTION_MS) {
      multiAgentGroups.delete(groupId);
      changed = true;
    }
  }

  if (multiAgentGroups.size <= MULTI_AGENT_GROUP_MAX_ITEMS) {
    return changed;
  }

  const removable = Array.from(multiAgentGroups.values())
    .filter((group) => isTerminalState(group.state))
    .sort((a, b) => {
      const aTime = toEpochMs(a.finishedAt) ?? toEpochMs(a.createdAt) ?? nowMs;
      const bTime = toEpochMs(b.finishedAt) ?? toEpochMs(b.createdAt) ?? nowMs;
      return aTime - bTime;
    });

  for (const group of removable) {
    if (multiAgentGroups.size <= MULTI_AGENT_GROUP_MAX_ITEMS) {
      break;
    }
    multiAgentGroups.delete(group.id);
    changed = true;
  }

  return changed;
}

function ensureTasks(tasks: MultiAgentTaskSpec[]): MultiAgentTaskSpec[] {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('tasks (non-empty array) is required');
  }
  if (tasks.length > 20) {
    throw new Error('too many tasks: maximum is 20');
  }
  return tasks;
}

function getRunningGroupCount(): number {
  let count = 0;
  for (const group of multiAgentGroups.values()) {
    if (group.state === 'running') {
      count += 1;
    }
  }
  return count;
}

function getRunningTaskCount(): number {
  let count = 0;
  for (const group of multiAgentGroups.values()) {
    if (group.state !== 'running') {
      continue;
    }
    count += group.entries.filter((entry) => !!entry.taskId).length;
  }
  return count;
}

function ensureCapacityForStart(newTaskCount: number): void {
  const runningGroups = getRunningGroupCount();
  if (runningGroups >= MULTI_AGENT_MAX_RUNNING_GROUPS) {
    throw new Error(
      `multi-agent service unavailable: running group limit reached (${runningGroups}/${MULTI_AGENT_MAX_RUNNING_GROUPS})`,
    );
  }

  const runningTasks = getRunningTaskCount();
  if (runningTasks + newTaskCount > MULTI_AGENT_MAX_RUNNING_TASKS) {
    throw new Error(
      `multi-agent service unavailable: running task limit reached (${runningTasks + newTaskCount}/${MULTI_AGENT_MAX_RUNNING_TASKS})`,
    );
  }
}

function normalizeListOptions(options?: ListMultiAgentGroupsOptions): ListOptionsNormalized {
  const stateRaw = (options?.state ?? 'all').toString().trim().toLowerCase();
  const state: GroupState | 'all' =
    stateRaw === 'all' ||
    stateRaw === 'running' ||
    stateRaw === 'completed' ||
    stateRaw === 'failed' ||
    stateRaw === 'canceled' ||
    stateRaw === 'partial'
      ? stateRaw
      : 'all';

  if (
    stateRaw !== 'all' &&
    stateRaw !== 'running' &&
    stateRaw !== 'completed' &&
    stateRaw !== 'failed' &&
    stateRaw !== 'canceled' &&
    stateRaw !== 'partial'
  ) {
    throw new Error(`INVALID_ARGUMENT: state must be one of all/running/completed/failed/canceled/partial`);
  }

  const limitRaw = options?.limit ?? DEFAULT_LIST_LIMIT;
  const limit = Math.trunc(Number(limitRaw));
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('INVALID_ARGUMENT: limit must be a positive integer');
  }

  const offsetRaw = options?.offset ?? 0;
  const offset = Math.trunc(Number(offsetRaw));
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error('INVALID_ARGUMENT: offset must be a non-negative integer');
  }

  return {
    state,
    limit: Math.min(limit, MAX_LIST_LIMIT),
    offset,
  };
}

function buildCapacitySnapshot(): CapacitySnapshot {
  return {
    runningGroups: getRunningGroupCount(),
    runningTasks: getRunningTaskCount(),
    maxRunningGroups: MULTI_AGENT_MAX_RUNNING_GROUPS,
    maxRunningTasks: MULTI_AGENT_MAX_RUNNING_TASKS,
  };
}

function getSpecKind(spec: MultiAgentTaskSpec): DispatchKind {
  const kind = (spec.kind || 'delegate').toLowerCase();
  if (kind === 'task' || kind === 'delegate') {
    return kind;
  }
  throw new Error(`Unsupported task kind: ${spec.kind}`);
}

function summarizeGroupState(statuses: Array<{ state: GroupState }>): GroupState {
  if (statuses.length === 0) {
    return 'failed';
  }
  const states = statuses.map((item) => item.state);
  if (states.every((state) => state === 'canceled')) {
    return 'canceled';
  }
  if (states.every((state) => state === 'completed')) {
    return 'completed';
  }
  if (states.some((state) => state === 'running')) {
    return 'running';
  }
  if (states.some((state) => state === 'failed') && states.some((state) => state === 'completed')) {
    return 'partial';
  }
  if (states.some((state) => state === 'failed')) {
    return 'failed';
  }
  return 'partial';
}

function mapTaskStatusToGroupState(status: unknown): GroupState {
  if (typeof status !== 'string') {
    return 'failed';
  }
  if (status === 'running' || status === 'completed' || status === 'failed' || status === 'canceled') {
    return status;
  }
  return 'failed';
}

function normalizeTaskName(spec: MultiAgentTaskSpec, index: number, kind: DispatchKind): string {
  if (spec.name && spec.name.trim()) {
    return spec.name.trim();
  }
  if (kind === 'delegate') {
    const agent = spec.agentType?.trim() || 'delegate';
    return `delegate-${agent}-${index + 1}`;
  }
  const category = spec.taskCategory?.trim() || 'task';
  return `task-${category}-${index + 1}`;
}

function toGroupSnapshot(group: MultiAgentGroupRecord, taskStatuses?: unknown[]) {
  const entries = group.entries.map((entry, index) => ({
    ...entry,
    status: taskStatuses?.[index] ?? null,
  }));
  const summary = {
    total: group.entries.length,
    started: group.entries.filter((entry) => !!entry.taskId).length,
    failedToStart: group.entries.filter((entry) => !!entry.startError).length,
    running: entries.filter((entry) => {
      const status = entry.status as Record<string, unknown> | null;
      return status?.status === 'running';
    }).length,
    completed: entries.filter((entry) => {
      const status = entry.status as Record<string, unknown> | null;
      return status?.status === 'completed';
    }).length,
    failed: entries.filter((entry) => {
      const status = entry.status as Record<string, unknown> | null;
      return status?.status === 'failed';
    }).length + group.entries.filter((entry) => !!entry.startError).length,
    canceled: entries.filter((entry) => {
      const status = entry.status as Record<string, unknown> | null;
      return status?.status === 'canceled';
    }).length,
  };

  return {
    groupId: group.id,
    state: group.state,
    createdAt: group.createdAt,
    finishedAt: group.finishedAt,
    projectPath: group.projectPath,
    timeoutMs: group.timeoutMs,
    summary,
    tasks: entries,
  };
}

export async function startMultiAgentGroup(
  options: StartMultiAgentGroupOptions,
): Promise<Record<string, unknown>> {
  loadPersistedGroupsIfNeeded();
  if (cleanupMultiAgentGroups()) {
    persistMultiAgentGroups();
  }

  const tasks = ensureTasks(options.tasks);
  ensureCapacityForStart(tasks.length);
  const groupId = randomUUID();
  const createdAt = new Date().toISOString();

  const settled = await Promise.allSettled(
    tasks.map(async (spec, index) => {
      const kind = getSpecKind(spec);
      const name = normalizeTaskName(spec, index, kind);

      if (kind === 'delegate') {
        const agentType = spec.agentType?.trim();
        const taskDescription = spec.taskDescription?.trim();
        if (!agentType || !taskDescription) {
          throw new Error('delegate task requires agentType and taskDescription');
        }
        const result = await runOhMyDelegate({
          agentType,
          taskDescription,
          runInBackground: true,
          projectPath: options.projectPath,
          timeoutMs: options.timeoutMs,
        });
        return {
          index,
          name,
          kind,
          taskId: typeof result.taskId === 'string' ? result.taskId : undefined,
          raw: result,
        };
      }

      const taskCategory = spec.taskCategory?.trim();
      const taskPrompt = spec.taskPrompt?.trim();
      if (!taskCategory || !taskPrompt) {
        throw new Error('task kind requires taskCategory and taskPrompt');
      }
      const result = await runOhMyTask({
        taskCategory,
        taskPrompt,
        runInBackground: true,
        projectPath: options.projectPath,
        timeoutMs: options.timeoutMs,
      });
      return {
        index,
        name,
        kind,
        taskId: typeof result.taskId === 'string' ? result.taskId : undefined,
        raw: result,
      };
    }),
  );

  const entries: GroupTaskEntry[] = settled.map((item, index) => {
    const spec = tasks[index];
    const kind = getSpecKind(spec);
    const base: GroupTaskEntry = {
      index,
      name: normalizeTaskName(spec, index, kind),
      kind,
    };

    if (item.status === 'fulfilled') {
      return {
        ...base,
        taskId: item.value.taskId,
      };
    }

    return {
      ...base,
      startError: item.reason instanceof Error ? item.reason.message : String(item.reason),
    };
  });

  const group: MultiAgentGroupRecord = {
    id: groupId,
    createdAt,
    projectPath: options.projectPath,
    timeoutMs: options.timeoutMs,
    entries,
    state: entries.some((entry) => entry.taskId) ? 'running' : 'failed',
  };
  multiAgentGroups.set(groupId, group);
  persistMultiAgentGroups();

  return toGroupSnapshot(group);
}

export function getMultiAgentGroupStatus(groupId: string): Record<string, unknown> {
  loadPersistedGroupsIfNeeded();
  const cleanupChanged = cleanupMultiAgentGroups();
  if (cleanupChanged) {
    persistMultiAgentGroups();
  }

  const normalizedId = groupId.trim();
  if (!normalizedId) {
    throw new Error('groupId is required');
  }
  const group = multiAgentGroups.get(normalizedId);
  if (!group) {
    throw new Error(`multi-agent group not found: ${normalizedId}`);
  }

  const taskStatuses = group.entries.map((entry) => {
    if (!entry.taskId) {
      return {
        taskId: null,
        status: 'failed',
        error: entry.startError || 'task was not started',
      };
    }
    try {
      return getOhMyTaskStatus(entry.taskId);
    } catch (error) {
      return {
        taskId: entry.taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const states = taskStatuses.map((status, index) => {
    const entry = group.entries[index];
    if (entry.startError) {
      return { state: 'failed' as GroupState };
    }
    const s = (status as Record<string, unknown>).status;
    return { state: mapTaskStatusToGroupState(s) };
  });

  const prevState = group.state;
  const prevFinishedAt = group.finishedAt;
  group.state = summarizeGroupState(states);
  if (group.state !== 'running' && !group.finishedAt) {
    group.finishedAt = new Date().toISOString();
  }
  if (group.state !== prevState || group.finishedAt !== prevFinishedAt) {
    persistMultiAgentGroups();
  }

  return toGroupSnapshot(group, taskStatuses);
}

export function listMultiAgentGroups(options: ListMultiAgentGroupsOptions = {}): Record<string, unknown> {
  loadPersistedGroupsIfNeeded();
  if (cleanupMultiAgentGroups()) {
    persistMultiAgentGroups();
  }

  const normalizedOptions = normalizeListOptions(options);

  const filtered = Array.from(multiAgentGroups.values())
    .filter((group) => normalizedOptions.state === 'all' || group.state === normalizedOptions.state)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const paged = filtered
    .slice(normalizedOptions.offset, normalizedOptions.offset + normalizedOptions.limit)
    .map((group) => ({
      groupId: group.id,
      state: group.state,
      createdAt: group.createdAt,
      finishedAt: group.finishedAt,
      totalTasks: group.entries.length,
      startedTasks: group.entries.filter((entry) => !!entry.taskId).length,
    }));

  return {
    count: filtered.length,
    groups: paged,
    page: {
      limit: normalizedOptions.limit,
      offset: normalizedOptions.offset,
      returned: paged.length,
    },
    capacity: buildCapacitySnapshot(),
  };
}

export function cancelMultiAgentGroup(groupId: string): Record<string, unknown> {
  loadPersistedGroupsIfNeeded();
  if (cleanupMultiAgentGroups()) {
    persistMultiAgentGroups();
  }

  const normalizedId = groupId.trim();
  if (!normalizedId) {
    throw new Error('groupId is required');
  }
  const group = multiAgentGroups.get(normalizedId);
  if (!group) {
    throw new Error(`multi-agent group not found: ${normalizedId}`);
  }

  const cancelResults = group.entries.map((entry) => {
    if (!entry.taskId) {
      return {
        index: entry.index,
        name: entry.name,
        canceled: false,
        reason: entry.startError || 'task was not started',
      };
    }
    try {
      const result = cancelOhMyTask(entry.taskId);
      return {
        index: entry.index,
        name: entry.name,
        taskId: entry.taskId,
        result,
      };
    } catch (error) {
      return {
        index: entry.index,
        name: entry.name,
        taskId: entry.taskId,
        canceled: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  group.state = 'canceled';
  group.finishedAt = group.finishedAt || new Date().toISOString();
  persistMultiAgentGroups();

  return {
    groupId: group.id,
    state: group.state,
    cancelResults,
  };
}

export function __resetMultiAgentGroupsForTests(): void {
  multiAgentGroups.clear();
  hasLoadedPersistedGroups = false;

  if (!MULTI_AGENT_GROUP_STATE_ENABLED) {
    return;
  }

  try {
    if (fs.existsSync(MULTI_AGENT_GROUP_STATE_PATH)) {
      fs.unlinkSync(MULTI_AGENT_GROUP_STATE_PATH);
    }
  } catch {
    // best effort cleanup for test isolation
  }
}
