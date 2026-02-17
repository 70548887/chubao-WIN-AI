import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const OUTPUT_TAIL_CHARS = 20_000;
const DEFAULT_TASK_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TASKS = 200;
const DEFAULT_TASK_STATE_PATH = path.join(process.cwd(), 'runtime-data', 'opencode-tasks.json');
const TASK_STATE_SCHEMA_VERSION = 'opencode-tasks.v1';
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_CLI_PROBE_TIMEOUT_MS = 15_000;
const DEFAULT_CLI_PROBE_TTL_MS = 30_000;

type OpenCodeTaskStatus = 'running' | 'completed' | 'failed' | 'canceled';
type OpenCodeTaskListState = 'all' | OpenCodeTaskStatus;

interface OpenCodeTaskRecord {
  id: string;
  status: OpenCodeTaskStatus;
  projectPath: string;
  prompt: string;
  agentType: string;
  model?: string;
  command: string;
  args: string[];
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  error?: string;
  stdout: string;
  stderr: string;
  child?: ChildProcess;
}

interface PersistedTaskPayload {
  schemaVersion: string;
  updatedAt: string;
  tasks: Array<Omit<OpenCodeTaskRecord, 'child'>>;
}

interface NormalizedListOptions {
  state: OpenCodeTaskListState;
  limit: number;
  offset: number;
}

export interface OpenCodeRunOptions {
  projectPath: string;
  prompt: string;
  agentType?: string;
  model?: string;
  background?: boolean;
  timeoutMs?: number;
}

export interface OpenCodeCreateProjectOptions {
  projectName: string;
  template?: string;
  baseDir?: string;
  agentType?: string;
  model?: string;
  background?: boolean;
  timeoutMs?: number;
}

export interface ListOpenCodeTasksOptions {
  state?: OpenCodeTaskListState;
  limit?: number;
  offset?: number;
}

const opencodeTasks = new Map<string, OpenCodeTaskRecord>();
const OPENCODE_TASK_RETENTION_MS = readPositiveIntEnv(
  'CHUBAO_OPENCODE_TASK_RETENTION_MS',
  DEFAULT_TASK_RETENTION_MS,
  1_000,
);
const OPENCODE_MAX_TASKS = readPositiveIntEnv('CHUBAO_OPENCODE_MAX_TASKS', DEFAULT_MAX_TASKS, 10);
const OPENCODE_TASK_STATE_ENABLED = resolveTaskStateEnabled();
const OPENCODE_TASK_STATE_PATH = resolveTaskStatePath();
const OPENCODE_CLI_PROBE_TIMEOUT_MS = readPositiveIntEnv(
  'CHUBAO_OPENCODE_CLI_PROBE_TIMEOUT_MS',
  DEFAULT_CLI_PROBE_TIMEOUT_MS,
  1_000,
);
const OPENCODE_CLI_PROBE_TTL_MS = readPositiveIntEnv(
  'CHUBAO_OPENCODE_CLI_PROBE_TTL_MS',
  DEFAULT_CLI_PROBE_TTL_MS,
  1_000,
);
let hasLoadedPersistedTasks = false;
let opencodeCliProbeCache:
  | {
      expiresAt: number;
      value: Record<string, unknown>;
    }
  | null = null;

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

function resolveTaskStateEnabled(): boolean {
  const raw = process.env.CHUBAO_OPENCODE_TASK_STATE_ENABLED;
  if (raw && raw.trim().length > 0) {
    return raw.trim().toLowerCase() !== 'false';
  }

  if (process.env.VITEST) {
    return false;
  }

  return true;
}

function resolveTaskStatePath(): string {
  const raw = process.env.CHUBAO_OPENCODE_TASK_STATE_PATH;
  if (raw && raw.trim().length > 0) {
    return path.resolve(raw.trim());
  }

  return DEFAULT_TASK_STATE_PATH;
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

function ensureTaskStateDirExists(): void {
  const dir = path.dirname(OPENCODE_TASK_STATE_PATH);
  fsSync.mkdirSync(dir, { recursive: true });
}

function parseTaskStatus(value: unknown): OpenCodeTaskStatus {
  if (value === 'running' || value === 'completed' || value === 'failed' || value === 'canceled') {
    return value;
  }
  return 'failed';
}

function normalizePersistedTask(candidate: unknown, nowIso: string): OpenCodeTaskRecord | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const projectPath = typeof raw.projectPath === 'string' ? raw.projectPath : process.cwd();
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
  const agentType = typeof raw.agentType === 'string' && raw.agentType.trim().length > 0
    ? raw.agentType
    : 'build';
  const model = typeof raw.model === 'string' && raw.model.trim().length > 0
    ? raw.model
    : undefined;
  const command = typeof raw.command === 'string' ? raw.command : 'npx';
  const args = Array.isArray(raw.args) ? raw.args.filter((arg): arg is string => typeof arg === 'string') : [];
  const startedAt = typeof raw.startedAt === 'string' ? raw.startedAt : nowIso;

  if (!id || !prompt || args.length === 0) {
    return null;
  }

  const loadedStatus = parseTaskStatus(raw.status);
  const recoveredStatus: OpenCodeTaskStatus = loadedStatus === 'running' ? 'failed' : loadedStatus;
  const recoveredError =
    loadedStatus === 'running'
      ? 'Recovered after process restart; running task state cannot be resumed.'
      : typeof raw.error === 'string'
        ? raw.error
        : undefined;

  return {
    id,
    status: recoveredStatus,
    projectPath,
    prompt,
    agentType,
    model,
    command,
    args,
    startedAt,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : nowIso,
    exitCode: Number.isFinite(raw.exitCode) ? Math.trunc(Number(raw.exitCode)) : undefined,
    signal: typeof raw.signal === 'string' ? raw.signal : undefined,
    error: recoveredError,
    stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
  };
}

function loadPersistedOpenCodeTasksIfNeeded(): void {
  if (hasLoadedPersistedTasks) {
    return;
  }
  hasLoadedPersistedTasks = true;

  if (!OPENCODE_TASK_STATE_ENABLED) {
    return;
  }

  try {
    if (!fsSync.existsSync(OPENCODE_TASK_STATE_PATH)) {
      return;
    }

    const rawText = fsSync.readFileSync(OPENCODE_TASK_STATE_PATH, 'utf8');
    if (!rawText.trim()) {
      return;
    }

    const payload = JSON.parse(rawText) as Partial<PersistedTaskPayload>;
    if (!Array.isArray(payload.tasks)) {
      return;
    }

    const nowIso = new Date().toISOString();
    for (const candidate of payload.tasks) {
      const task = normalizePersistedTask(candidate, nowIso);
      if (!task) {
        continue;
      }
      opencodeTasks.set(task.id, task);
    }
  } catch (error) {
    logger.warn('Failed to load persisted OpenCode tasks', { error: error instanceof Error ? error.message : String(error) });
  }
}

function persistOpenCodeTasks(): void {
  if (!OPENCODE_TASK_STATE_ENABLED) {
    return;
  }

  try {
    ensureTaskStateDirExists();
    const tasks = Array.from(opencodeTasks.values()).map((task) => ({
      id: task.id,
      status: task.status,
      projectPath: task.projectPath,
      prompt: task.prompt,
      agentType: task.agentType,
      command: task.command,
      args: task.args,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      exitCode: task.exitCode,
      signal: task.signal,
      error: task.error,
      stdout: task.stdout,
      stderr: task.stderr,
    }));

    const payload: PersistedTaskPayload = {
      schemaVersion: TASK_STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      tasks,
    };

    fsSync.writeFileSync(OPENCODE_TASK_STATE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to persist OpenCode tasks', { error: error instanceof Error ? error.message : String(error) });
  }
}

function cleanupOpenCodeTasks(nowMs = Date.now()): boolean {
  let changed = false;

  for (const [taskId, task] of opencodeTasks.entries()) {
    if (task.status === 'running') {
      continue;
    }

    const finishedMs = toEpochMs(task.finishedAt) ?? toEpochMs(task.startedAt) ?? nowMs;
    if (nowMs - finishedMs > OPENCODE_TASK_RETENTION_MS) {
      opencodeTasks.delete(taskId);
      changed = true;
    }
  }

  if (opencodeTasks.size <= OPENCODE_MAX_TASKS) {
    return changed;
  }

  const removable = Array.from(opencodeTasks.values())
    .filter((task) => task.status !== 'running')
    .sort((a, b) => {
      const aTime = toEpochMs(a.finishedAt) ?? toEpochMs(a.startedAt) ?? nowMs;
      const bTime = toEpochMs(b.finishedAt) ?? toEpochMs(b.startedAt) ?? nowMs;
      return aTime - bTime;
    });

  for (const task of removable) {
    if (opencodeTasks.size <= OPENCODE_MAX_TASKS) {
      break;
    }
    opencodeTasks.delete(task.id);
    changed = true;
  }

  return changed;
}

function appendTail(current: string, nextChunk: string): string {
  const merged = `${current}${nextChunk}`;
  if (merged.length <= OUTPUT_TAIL_CHARS) {
    return merged;
  }
  return merged.slice(-OUTPUT_TAIL_CHARS);
}

function ensureNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalNonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveOpenCodeModel(model: string | undefined): string | undefined {
  return (
    normalizeOptionalNonEmpty(model) ??
    normalizeOptionalNonEmpty(process.env.CHUBAO_OPENCODE_MODEL) ??
    normalizeOptionalNonEmpty(process.env.OPENCODE_MODEL)
  );
}

function resolveTimeoutMs(timeoutMs?: number): number {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  const normalized = Math.trunc(timeoutMs);
  if (!Number.isFinite(normalized) || normalized < 1000) {
    throw new Error('timeoutMs must be >= 1000');
  }
  return Math.min(normalized, MAX_TIMEOUT_MS);
}

function resolveProjectPath(projectPath: string): string {
  return path.resolve(ensureNonEmpty(projectPath, 'projectPath'));
}

function resolveOpenCodeCommand(subcommand: string, args: string[]): {
  command: string;
  args: string[];
} {
  const customBin = process.env.CHUBAO_OPENCODE_BIN?.trim();
  if (customBin) {
    return {
      command: customBin,
      args: [subcommand, ...args],
    };
  }

  return {
    command: 'npx',
    args: ['--yes', 'opencode', subcommand, ...args],
  };
}

function resolveOpenCodeVersionCommand(): {
  command: string;
  args: string[];
  source: 'custom-bin' | 'npx';
} {
  const customBin = process.env.CHUBAO_OPENCODE_BIN?.trim();
  if (customBin) {
    return {
      command: customBin,
      args: ['--version'],
      source: 'custom-bin',
    };
  }

  return {
    command: 'npx',
    args: ['--yes', 'opencode', '--version'],
    source: 'npx',
  };
}

function parseVersionFromOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout || ''}\n${stderr || ''}`.trim();
  if (!combined) {
    return undefined;
  }

  const semverMatch = combined.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  if (semverMatch?.[0]) {
    return semverMatch[0];
  }

  const firstLine = combined.split(/\r?\n/)[0]?.trim();
  return firstLine || undefined;
}

function mapExecError(error: unknown): Error {
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === 'ENOENT') {
      return new Error('OpenCode CLI not found. Install opencode or set CHUBAO_OPENCODE_BIN.');
    }
    const stdout = typeof err.stdout === 'string' && err.stdout.trim() ? `\nstdout:\n${err.stdout.trim()}` : '';
    const stderr = typeof err.stderr === 'string' && err.stderr.trim() ? `\nstderr:\n${err.stderr.trim()}` : '';
    return new Error(`OpenCode command failed: ${err.message}${stdout}${stderr}`);
  }
  return new Error(String(error));
}

function toTaskSnapshot(task: OpenCodeTaskRecord) {
  return {
    id: task.id,
    status: task.status,
    projectPath: task.projectPath,
    prompt: task.prompt,
    agentType: task.agentType,
    command: task.command,
    args: task.args,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    exitCode: task.exitCode,
    signal: task.signal,
    error: task.error,
    stdoutTail: task.stdout,
    stderrTail: task.stderr,
  };
}

function extractRunHints(stdout: string): {
  detectedIds: string[];
  taskId?: string;
  sessionId?: string;
} {
  const hints: {
    detectedIds: string[];
    taskId?: string;
    sessionId?: string;
  } = {
    detectedIds: [],
  };

  const text = stdout || '';
  const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  const detectedIds = Array.from(new Set(text.match(uuidRegex) ?? []));
  if (detectedIds.length > 0) {
    hints.detectedIds = detectedIds;
  }

  const taskIdMatch = text.match(/(?:task(?:_id| id)?|taskId)\s*[:=]\s*([A-Za-z0-9._:-]{3,})/i);
  if (taskIdMatch?.[1]) {
    hints.taskId = taskIdMatch[1];
  }

  const sessionIdMatch = text.match(/(?:session(?:_id| id)?|sessionId)\s*[:=]\s*([A-Za-z0-9._:-]{3,})/i);
  if (sessionIdMatch?.[1]) {
    hints.sessionId = sessionIdMatch[1];
  }

  return hints;
}

async function runForeground(
  projectPath: string,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: projectPath,
      windowsHide: true,
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    throw mapExecError(error);
  }
}

function normalizeListOptions(options?: ListOpenCodeTasksOptions): NormalizedListOptions {
  const rawState = options?.state;
  const state: OpenCodeTaskListState =
    rawState === 'all' ||
    rawState === 'running' ||
    rawState === 'completed' ||
    rawState === 'failed' ||
    rawState === 'canceled'
      ? rawState
      : 'all';

  const rawLimit = options?.limit;
  const limit =
    rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_LIST_LIMIT, Math.trunc(rawLimit))
      : DEFAULT_LIST_LIMIT;

  const rawOffset = options?.offset;
  const offset =
    rawOffset !== undefined && Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.trunc(rawOffset)
      : 0;

  return {
    state,
    limit,
    offset,
  };
}

function buildSummary(tasks: OpenCodeTaskRecord[]) {
  return {
    total: tasks.length,
    running: tasks.filter((task) => task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    canceled: tasks.filter((task) => task.status === 'canceled').length,
  };
}

export async function runOpenCodeTask(options: OpenCodeRunOptions): Promise<Record<string, unknown>> {
  const projectPath = resolveProjectPath(options.projectPath);
  const prompt = ensureNonEmpty(options.prompt, 'prompt');
  const agentType = options.agentType?.trim() || 'build';
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);

  await fs.mkdir(projectPath, { recursive: true });

  const commandArgs = ['--prompt', prompt, '--agent', agentType];
  const { command, args } = resolveOpenCodeCommand('run', commandArgs);

  if (options.background) {
    loadPersistedOpenCodeTasksIfNeeded();
    if (cleanupOpenCodeTasks()) {
      persistOpenCodeTasks();
    }

    const taskId = randomUUID();
    const task: OpenCodeTaskRecord = {
      id: taskId,
      status: 'running',
      projectPath,
      prompt,
      agentType,
      command,
      args,
      startedAt: new Date().toISOString(),
      stdout: '',
      stderr: '',
    };

    const child = spawn(command, args, {
      cwd: projectPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    task.child = child;
    opencodeTasks.set(taskId, task);
    persistOpenCodeTasks();

    child.stdout?.on('data', (chunk) => {
      task.stdout = appendTail(task.stdout, String(chunk));
    });
    child.stderr?.on('data', (chunk) => {
      task.stderr = appendTail(task.stderr, String(chunk));
    });
    child.on('error', (error) => {
      task.status = 'failed';
      task.error = mapExecError(error).message;
      task.finishedAt = new Date().toISOString();
      task.child = undefined;
      persistOpenCodeTasks();
    });
    child.on('exit', (code, signal) => {
      if (task.status !== 'canceled') {
        task.status = code === 0 ? 'completed' : 'failed';
      }
      task.exitCode = code;
      task.signal = signal;
      task.finishedAt = new Date().toISOString();
      task.child = undefined;
      persistOpenCodeTasks();
    });

    return {
      mode: 'background',
      taskId,
      status: task.status,
      projectPath,
      agentType,
      command,
      args,
      startedAt: task.startedAt,
    };
  }

  const result = await runForeground(projectPath, command, args, timeoutMs);
  return {
    mode: 'foreground',
    status: 'completed',
    projectPath,
    agentType,
    command,
    args,
    timeoutMs,
    stdout: result.stdout,
    stderr: result.stderr,
    runHints: extractRunHints(result.stdout),
  };
}

export async function probeOpenCodeCli(force = false): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (!force && opencodeCliProbeCache && opencodeCliProbeCache.expiresAt > now) {
    return {
      ...opencodeCliProbeCache.value,
      cached: true,
    };
  }

  const checkedAt = new Date().toISOString();
  const resolved = resolveOpenCodeVersionCommand();

  try {
    const { stdout, stderr } = await execFileAsync(resolved.command, resolved.args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: OPENCODE_CLI_PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
    });

    const out = (stdout ?? '').trim();
    const err = (stderr ?? '').trim();
    const payload: Record<string, unknown> = {
      name: 'opencode',
      available: true,
      source: resolved.source,
      command: resolved.command,
      args: resolved.args,
      checkedAt,
      version: parseVersionFromOutput(out, err),
      stderr: err || undefined,
    };

    opencodeCliProbeCache = {
      expiresAt: now + OPENCODE_CLI_PROBE_TTL_MS,
      value: payload,
    };

    return {
      ...payload,
      cached: false,
    };
  } catch (error) {
    const err = mapExecError(error);
    const payload: Record<string, unknown> = {
      name: 'opencode',
      available: false,
      source: resolved.source,
      command: resolved.command,
      args: resolved.args,
      checkedAt,
      error: err.message,
    };

    opencodeCliProbeCache = {
      expiresAt: now + OPENCODE_CLI_PROBE_TTL_MS,
      value: payload,
    };

    return {
      ...payload,
      cached: false,
    };
  }
}

export async function createOpenCodeProject(
  options: OpenCodeCreateProjectOptions,
): Promise<Record<string, unknown>> {
  const projectName = ensureNonEmpty(options.projectName, 'projectName');
  if (projectName.includes('/') || projectName.includes('\\')) {
    throw new Error('projectName must not contain path separators');
  }

  const template = options.template?.trim() || 'react-ts';
  const baseDir = path.resolve(options.baseDir?.trim() || process.cwd());
  const targetPath = path.join(baseDir, projectName);

  await fs.mkdir(targetPath, { recursive: true });

  const prompt = [
    `Create a new project in the current directory named "${projectName}".`,
    `Use template "${template}" and include a basic README and startup command.`,
    'Do not ask interactive questions; complete the setup directly.',
  ].join(' ');

  const result = await runOpenCodeTask({
    projectPath: targetPath,
    prompt,
    agentType: options.agentType ?? 'build',
    background: options.background,
    timeoutMs: options.timeoutMs,
  });

  return {
    action: 'opencode_create_project',
    projectName,
    template,
    baseDir,
    targetPath,
    result,
  };
}

export function getOpenCodeTaskStatus(taskId: string): Record<string, unknown> {
  loadPersistedOpenCodeTasksIfNeeded();
  if (cleanupOpenCodeTasks()) {
    persistOpenCodeTasks();
  }

  const normalizedTaskId = ensureNonEmpty(taskId, 'taskId');
  const task = opencodeTasks.get(normalizedTaskId);
  if (!task) {
    throw new Error(`OpenCode task not found: ${normalizedTaskId}`);
  }
  return toTaskSnapshot(task);
}

export function listOpenCodeTasks(options: ListOpenCodeTasksOptions = {}): Record<string, unknown> {
  loadPersistedOpenCodeTasksIfNeeded();
  if (cleanupOpenCodeTasks()) {
    persistOpenCodeTasks();
  }

  const normalized = normalizeListOptions(options);
  const allTasks = Array.from(opencodeTasks.values()).sort((a, b) => {
    const aTime = toEpochMs(a.startedAt) ?? 0;
    const bTime = toEpochMs(b.startedAt) ?? 0;
    return bTime - aTime;
  });

  const filtered = normalized.state === 'all'
    ? allTasks
    : allTasks.filter((task) => task.status === normalized.state);

  const paged = filtered.slice(normalized.offset, normalized.offset + normalized.limit);
  const tasks = paged.map((task) => toTaskSnapshot(task));

  return {
    count: filtered.length,
    tasks,
    page: {
      limit: normalized.limit,
      offset: normalized.offset,
      returned: tasks.length,
    },
    summary: buildSummary(allTasks),
  };
}

export function getOpenCodeConcurrentStatus(): Record<string, unknown> {
  loadPersistedOpenCodeTasksIfNeeded();
  if (cleanupOpenCodeTasks()) {
    persistOpenCodeTasks();
  }

  const tasks = Array.from(opencodeTasks.values()).map((task) => toTaskSnapshot(task));
  return {
    summary: buildSummary(Array.from(opencodeTasks.values())),
    tasks,
  };
}

export function cancelOpenCodeTask(taskId: string): Record<string, unknown> {
  loadPersistedOpenCodeTasksIfNeeded();
  if (cleanupOpenCodeTasks()) {
    persistOpenCodeTasks();
  }

  const normalizedTaskId = ensureNonEmpty(taskId, 'taskId');
  const task = opencodeTasks.get(normalizedTaskId);
  if (!task) {
    throw new Error(`OpenCode task not found: ${normalizedTaskId}`);
  }

  if (task.status !== 'running') {
    return {
      canceled: false,
      reason: `task is already ${task.status}`,
      task: toTaskSnapshot(task),
    };
  }

  const killed = !!task.child?.kill();
  task.status = 'canceled';
  task.finishedAt = new Date().toISOString();
  task.signal = task.signal ?? 'SIGTERM';
  task.child = undefined;
  persistOpenCodeTasks();

  return {
    canceled: killed,
    task: toTaskSnapshot(task),
  };
}

export function __resetOpenCodeTasksForTests(): void {
  opencodeTasks.clear();
  hasLoadedPersistedTasks = false;
  opencodeCliProbeCache = null;

  if (!OPENCODE_TASK_STATE_ENABLED) {
    return;
  }

  try {
    if (fsSync.existsSync(OPENCODE_TASK_STATE_PATH)) {
      fsSync.unlinkSync(OPENCODE_TASK_STATE_PATH);
    }
  } catch {
    // best effort cleanup for test isolation
  }
}
