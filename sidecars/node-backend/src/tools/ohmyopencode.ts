import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const OUTPUT_TAIL_CHARS = 20_000;
const DEFAULT_TASK_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TASKS = 200;
const DEFAULT_TASK_STATE_PATH = path.join(process.cwd(), 'runtime-data', 'ohmy-tasks.json');
const TASK_STATE_SCHEMA_VERSION = 'ohmy-tasks.v1';
const DEFAULT_CLI_PROBE_TIMEOUT_MS = 15_000;
const DEFAULT_CLI_PROBE_TTL_MS = 30_000;

type OhMyTaskStatus = 'running' | 'completed' | 'failed' | 'canceled';
type OhMyTaskKind = 'task' | 'delegate';

interface OhMyTaskRecord {
  id: string;
  kind: OhMyTaskKind;
  status: OhMyTaskStatus;
  projectPath: string;
  command: string;
  args: string[];
  category?: string;
  agentType?: string;
  prompt: string;
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
  tasks: Array<Omit<OhMyTaskRecord, 'child'>>;
}

export interface OhMyTaskOptions {
  taskCategory: string;
  taskPrompt: string;
  runInBackground?: boolean;
  projectPath?: string;
  timeoutMs?: number;
}

export interface OhMyDelegateOptions {
  agentType: string;
  taskDescription: string;
  runInBackground?: boolean;
  projectPath?: string;
  timeoutMs?: number;
}

export interface OhMyListAgentsOptions {
  projectPath?: string;
  timeoutMs?: number;
}

const ohmyTasks = new Map<string, OhMyTaskRecord>();
const OHMY_TASK_RETENTION_MS = readPositiveIntEnv(
  'CHUBAO_OHMY_TASK_RETENTION_MS',
  DEFAULT_TASK_RETENTION_MS,
  1_000,
);
const OHMY_MAX_TASKS = readPositiveIntEnv('CHUBAO_OHMY_MAX_TASKS', DEFAULT_MAX_TASKS, 10);
const OHMY_TASK_STATE_ENABLED = resolveTaskStateEnabled();
const OHMY_TASK_STATE_PATH = resolveTaskStatePath();
const OHMY_CLI_PROBE_TIMEOUT_MS = readPositiveIntEnv(
  'CHUBAO_OHMY_CLI_PROBE_TIMEOUT_MS',
  DEFAULT_CLI_PROBE_TIMEOUT_MS,
  1_000,
);
const OHMY_CLI_PROBE_TTL_MS = readPositiveIntEnv(
  'CHUBAO_OHMY_CLI_PROBE_TTL_MS',
  DEFAULT_CLI_PROBE_TTL_MS,
  1_000,
);
let hasLoadedPersistedTasks = false;
let ohmyCliProbeCache:
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
  const raw = process.env.CHUBAO_OHMY_TASK_STATE_ENABLED;
  if (raw && raw.trim().length > 0) {
    return raw.trim().toLowerCase() !== 'false';
  }

  if (process.env.VITEST) {
    return false;
  }

  return true;
}

function resolveTaskStatePath(): string {
  const raw = process.env.CHUBAO_OHMY_TASK_STATE_PATH;
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
  const dir = path.dirname(OHMY_TASK_STATE_PATH);
  fsSync.mkdirSync(dir, { recursive: true });
}

function parseTaskStatus(value: unknown): OhMyTaskStatus {
  if (value === 'running' || value === 'completed' || value === 'failed' || value === 'canceled') {
    return value;
  }
  return 'failed';
}

function parseTaskKind(value: unknown): OhMyTaskKind {
  if (value === 'delegate') {
    return 'delegate';
  }
  return 'task';
}

function normalizePersistedTask(candidate: unknown, nowIso: string): OhMyTaskRecord | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const projectPath = typeof raw.projectPath === 'string' ? raw.projectPath : process.cwd();
  const command = typeof raw.command === 'string' ? raw.command : 'npx';
  const args = Array.isArray(raw.args) ? raw.args.filter((arg): arg is string => typeof arg === 'string') : [];
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
  const startedAt = typeof raw.startedAt === 'string' ? raw.startedAt : nowIso;

  if (!id || !prompt || args.length === 0) {
    return null;
  }

  const loadedStatus = parseTaskStatus(raw.status);
  const recoveredStatus: OhMyTaskStatus = loadedStatus === 'running' ? 'failed' : loadedStatus;
  const recoveredError =
    loadedStatus === 'running'
      ? 'Recovered after process restart; running task state cannot be resumed.'
      : typeof raw.error === 'string'
        ? raw.error
        : undefined;

  return {
    id,
    kind: parseTaskKind(raw.kind),
    status: recoveredStatus,
    projectPath,
    command,
    args,
    category: typeof raw.category === 'string' ? raw.category : undefined,
    agentType: typeof raw.agentType === 'string' ? raw.agentType : undefined,
    prompt,
    startedAt,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : nowIso,
    exitCode: Number.isFinite(raw.exitCode) ? Math.trunc(Number(raw.exitCode)) : undefined,
    signal: typeof raw.signal === 'string' ? raw.signal : undefined,
    error: recoveredError,
    stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
  };
}

function loadPersistedTasksIfNeeded(): void {
  if (hasLoadedPersistedTasks) {
    return;
  }
  hasLoadedPersistedTasks = true;

  if (!OHMY_TASK_STATE_ENABLED) {
    return;
  }

  try {
    if (!fsSync.existsSync(OHMY_TASK_STATE_PATH)) {
      return;
    }

    const rawText = fsSync.readFileSync(OHMY_TASK_STATE_PATH, 'utf8');
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
      ohmyTasks.set(task.id, task);
    }
  } catch (error) {
    logger.warn('Failed to load persisted Oh-My-OpenCode tasks', { error: error instanceof Error ? error.message : String(error) });
  }
}

function persistOhMyTasks(): void {
  if (!OHMY_TASK_STATE_ENABLED) {
    return;
  }

  try {
    ensureTaskStateDirExists();
    const tasks = Array.from(ohmyTasks.values()).map((task) => ({
      id: task.id,
      kind: task.kind,
      status: task.status,
      projectPath: task.projectPath,
      command: task.command,
      args: task.args,
      category: task.category,
      agentType: task.agentType,
      prompt: task.prompt,
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

    fsSync.writeFileSync(OHMY_TASK_STATE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to persist Oh-My-OpenCode tasks', { error: error instanceof Error ? error.message : String(error) });
  }
}

function cleanupOhMyTasks(nowMs = Date.now()): boolean {
  let changed = false;

  for (const [taskId, task] of ohmyTasks.entries()) {
    if (task.status === 'running') {
      continue;
    }

    const finishedMs = toEpochMs(task.finishedAt) ?? toEpochMs(task.startedAt) ?? nowMs;
    if (nowMs - finishedMs > OHMY_TASK_RETENTION_MS) {
      ohmyTasks.delete(taskId);
      changed = true;
    }
  }

  if (ohmyTasks.size <= OHMY_MAX_TASKS) {
    return changed;
  }

  const removable = Array.from(ohmyTasks.values())
    .filter((task) => task.status !== 'running')
    .sort((a, b) => {
      const aTime = toEpochMs(a.finishedAt) ?? toEpochMs(a.startedAt) ?? nowMs;
      const bTime = toEpochMs(b.finishedAt) ?? toEpochMs(b.startedAt) ?? nowMs;
      return aTime - bTime;
    });

  for (const task of removable) {
    if (ohmyTasks.size <= OHMY_MAX_TASKS) {
      break;
    }
    ohmyTasks.delete(task.id);
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

function resolveProjectPath(projectPath?: string): string {
  if (!projectPath) {
    return process.cwd();
  }
  return path.resolve(ensureNonEmpty(projectPath, 'projectPath'));
}

function resolveOhMyCommand(subcommand: string, args: string[]): {
  command: string;
  args: string[];
} {
  const customBin = process.env.CHUBAO_OHMYOPENCODE_BIN?.trim();
  if (customBin) {
    return {
      command: customBin,
      args: [subcommand, ...args],
    };
  }

  return {
    command: 'npx',
    args: ['--yes', 'oh-my-opencode', subcommand, ...args],
  };
}

function resolveOhMyVersionCommand(): {
  command: string;
  args: string[];
  source: 'custom-bin' | 'npx';
} {
  const customBin = process.env.CHUBAO_OHMYOPENCODE_BIN?.trim();
  if (customBin) {
    return {
      command: customBin,
      args: ['--version'],
      source: 'custom-bin',
    };
  }

  return {
    command: 'npx',
    args: ['--yes', 'oh-my-opencode', '--version'],
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
      return new Error(
        'Oh-My-OpenCode CLI not found. Install oh-my-opencode or set CHUBAO_OHMYOPENCODE_BIN.',
      );
    }
    const stdout = typeof err.stdout === 'string' && err.stdout.trim() ? `\nstdout:\n${err.stdout.trim()}` : '';
    const stderr = typeof err.stderr === 'string' && err.stderr.trim() ? `\nstderr:\n${err.stderr.trim()}` : '';
    return new Error(`Oh-My-OpenCode command failed: ${err.message}${stdout}${stderr}`);
  }
  return new Error(String(error));
}

function toTaskSnapshot(task: OhMyTaskRecord) {
  return {
    id: task.id,
    kind: task.kind,
    status: task.status,
    projectPath: task.projectPath,
    category: task.category,
    agentType: task.agentType,
    prompt: task.prompt,
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

function runBackground(task: OhMyTaskRecord): Record<string, unknown> {
  loadPersistedTasksIfNeeded();
  if (cleanupOhMyTasks()) {
    persistOhMyTasks();
  }

  const child = spawn(task.command, task.args, {
    cwd: task.projectPath,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  task.child = child;
  ohmyTasks.set(task.id, task);
  persistOhMyTasks();

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
    persistOhMyTasks();
  });
  child.on('exit', (code, signal) => {
    if (task.status !== 'canceled') {
      task.status = code === 0 ? 'completed' : 'failed';
    }
    task.exitCode = code;
    task.signal = signal;
    task.finishedAt = new Date().toISOString();
    task.child = undefined;
    persistOhMyTasks();
  });

  return {
    mode: 'background',
    taskId: task.id,
    status: task.status,
    startedAt: task.startedAt,
    projectPath: task.projectPath,
    command: task.command,
    args: task.args,
  };
}

export async function runOhMyTask(options: OhMyTaskOptions): Promise<Record<string, unknown>> {
  const taskCategory = ensureNonEmpty(options.taskCategory, 'taskCategory');
  const taskPrompt = ensureNonEmpty(options.taskPrompt, 'taskPrompt');
  const projectPath = resolveProjectPath(options.projectPath);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  await fs.mkdir(projectPath, { recursive: true });

  const { command, args } = resolveOhMyCommand('task', [
    '--category',
    taskCategory,
    '--prompt',
    taskPrompt,
  ]);

  if (options.runInBackground) {
    const taskId = randomUUID();
    const task: OhMyTaskRecord = {
      id: taskId,
      kind: 'task',
      status: 'running',
      projectPath,
      command,
      args,
      category: taskCategory,
      prompt: taskPrompt,
      startedAt: new Date().toISOString(),
      stdout: '',
      stderr: '',
    };
    return runBackground(task);
  }

  const result = await runForeground(projectPath, command, args, timeoutMs);
  return {
    mode: 'foreground',
    status: 'completed',
    projectPath,
    category: taskCategory,
    command,
    args,
    timeoutMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function runOhMyDelegate(options: OhMyDelegateOptions): Promise<Record<string, unknown>> {
  const agentType = ensureNonEmpty(options.agentType, 'agentType');
  const taskDescription = ensureNonEmpty(options.taskDescription, 'taskDescription');
  const projectPath = resolveProjectPath(options.projectPath);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  await fs.mkdir(projectPath, { recursive: true });

  const { command, args } = resolveOhMyCommand('delegate', [
    '--agent',
    agentType,
    '--task',
    taskDescription,
  ]);

  if (options.runInBackground) {
    const taskId = randomUUID();
    const task: OhMyTaskRecord = {
      id: taskId,
      kind: 'delegate',
      status: 'running',
      projectPath,
      command,
      args,
      agentType,
      prompt: taskDescription,
      startedAt: new Date().toISOString(),
      stdout: '',
      stderr: '',
    };
    return runBackground(task);
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
  };
}

export async function probeOhMyCli(force = false): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (!force && ohmyCliProbeCache && ohmyCliProbeCache.expiresAt > now) {
    return {
      ...ohmyCliProbeCache.value,
      cached: true,
    };
  }

  const checkedAt = new Date().toISOString();
  const resolved = resolveOhMyVersionCommand();

  try {
    const { stdout, stderr } = await execFileAsync(resolved.command, resolved.args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: OHMY_CLI_PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
    });

    const out = (stdout ?? '').trim();
    const err = (stderr ?? '').trim();
    const payload: Record<string, unknown> = {
      name: 'oh-my-opencode',
      available: true,
      source: resolved.source,
      command: resolved.command,
      args: resolved.args,
      checkedAt,
      version: parseVersionFromOutput(out, err),
      stderr: err || undefined,
    };

    ohmyCliProbeCache = {
      expiresAt: now + OHMY_CLI_PROBE_TTL_MS,
      value: payload,
    };

    return {
      ...payload,
      cached: false,
    };
  } catch (error) {
    const err = mapExecError(error);
    const payload: Record<string, unknown> = {
      name: 'oh-my-opencode',
      available: false,
      source: resolved.source,
      command: resolved.command,
      args: resolved.args,
      checkedAt,
      error: err.message,
    };

    ohmyCliProbeCache = {
      expiresAt: now + OHMY_CLI_PROBE_TTL_MS,
      value: payload,
    };

    return {
      ...payload,
      cached: false,
    };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function listOhMyAgents(options: OhMyListAgentsOptions = {}): Promise<Record<string, unknown>> {
  const projectPath = resolveProjectPath(options.projectPath);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  await fs.mkdir(projectPath, { recursive: true });

  const { command, args } = resolveOhMyCommand('list-agents', ['--json']);
  const result = await runForeground(projectPath, command, args, timeoutMs);

  return {
    command,
    args,
    projectPath,
    timeoutMs,
    rawOutput: result.stdout,
    stderr: result.stderr,
    agents: tryParseJson(result.stdout),
  };
}

export async function getOhMyConcurrentStatus(): Promise<Record<string, unknown>> {
  loadPersistedTasksIfNeeded();
  if (cleanupOhMyTasks()) {
    persistOhMyTasks();
  }

  const internalTasks = Array.from(ohmyTasks.values()).map((task) => toTaskSnapshot(task));
  const activeCount = internalTasks.filter((task) => task.status === 'running').length;

  const result: Record<string, unknown> = {
    summary: {
      total: internalTasks.length,
      active: activeCount,
      completed: internalTasks.filter((task) => task.status === 'completed').length,
      failed: internalTasks.filter((task) => task.status === 'failed').length,
      canceled: internalTasks.filter((task) => task.status === 'canceled').length,
    },
    tasks: internalTasks,
  };

  try {
    const projectPath = process.cwd();
    const { command, args } = resolveOhMyCommand('status', ['--json']);
    const external = await runForeground(projectPath, command, args, 30_000);
    result.externalStatus = {
      command,
      args,
      rawOutput: external.stdout,
      stderr: external.stderr,
      parsed: tryParseJson(external.stdout),
    };
  } catch (error) {
    result.externalStatus = {
      warning: mapExecError(error).message,
    };
  }

  return result;
}

export function getOhMyTaskStatus(taskId: string): Record<string, unknown> {
  loadPersistedTasksIfNeeded();
  if (cleanupOhMyTasks()) {
    persistOhMyTasks();
  }

  const normalizedTaskId = ensureNonEmpty(taskId, 'taskId');
  const task = ohmyTasks.get(normalizedTaskId);
  if (!task) {
    throw new Error(`Oh-My-OpenCode task not found: ${normalizedTaskId}`);
  }
  return toTaskSnapshot(task);
}

export function listOhMyTasks(): Array<Record<string, unknown>> {
  loadPersistedTasksIfNeeded();
  if (cleanupOhMyTasks()) {
    persistOhMyTasks();
  }
  return Array.from(ohmyTasks.values()).map((task) => toTaskSnapshot(task));
}

export function cancelOhMyTask(taskId: string): Record<string, unknown> {
  loadPersistedTasksIfNeeded();
  if (cleanupOhMyTasks()) {
    persistOhMyTasks();
  }

  const normalizedTaskId = ensureNonEmpty(taskId, 'taskId');
  const task = ohmyTasks.get(normalizedTaskId);
  if (!task) {
    throw new Error(`Oh-My-OpenCode task not found: ${normalizedTaskId}`);
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
  persistOhMyTasks();

  return {
    canceled: killed,
    task: toTaskSnapshot(task),
  };
}

export function __resetOhMyTasksForTests(): void {
  ohmyTasks.clear();
  hasLoadedPersistedTasks = false;
  ohmyCliProbeCache = null;

  if (!OHMY_TASK_STATE_ENABLED) {
    return;
  }

  try {
    if (fsSync.existsSync(OHMY_TASK_STATE_PATH)) {
      fsSync.unlinkSync(OHMY_TASK_STATE_PATH);
    }
  } catch {
    // best effort cleanup for test isolation
  }
}
