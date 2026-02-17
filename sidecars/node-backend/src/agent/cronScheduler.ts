import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { QueueTaskPayload } from './taskQueue.js';
import { logger } from '../utils/logger.js';

interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

interface ParsedCronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

interface CronJobInternal {
  id: string;
  name: string;
  cronExpr: string;
  message: string;
  sessionId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastTaskId?: string;
  parsed: ParsedCronExpression;
  lastTickKey?: string;
}

interface PersistedCronPayload {
  schemaVersion: string;
  updatedAt: string;
  jobs: Array<Omit<CronJobInternal, 'parsed' | 'lastTickKey'>>;
}

export interface CronJobRecord {
  id: string;
  name: string;
  cronExpr: string;
  message: string;
  sessionId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastTaskId?: string;
}

export interface CronSchedulerOptions {
  enqueueTask: (payload: QueueTaskPayload) => { id: string } | null | undefined;
  tickMs?: number;
  stateEnabled?: boolean;
  statePath?: string;
}

const CRON_STATE_SCHEMA_VERSION = 'cron-scheduler.v1';
const DEFAULT_CRON_STATE_PATH = path.join(process.cwd(), '../../memory', 'tasks', 'cron-jobs.json');
const DEFAULT_TICK_MS = 15_000;
const MIN_TICK_MS = 1_000;
const MAX_TICK_MS = 60_000;

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

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
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

function ensureRange(value: number, min: number, max: number, fieldName: string): number {
  if (value < min || value > max) {
    throw new Error(`${fieldName} value ${value} is out of range [${min}, ${max}]`);
  }
  return value;
}

function parseCronToken(
  tokenRaw: string,
  min: number,
  max: number,
  fieldName: string,
  target: Set<number>,
): void {
  const token = tokenRaw.trim();
  if (!token) {
    throw new Error(`${fieldName} contains an empty token`);
  }

  const parts = token.split('/');
  if (parts.length > 2) {
    throw new Error(`${fieldName} token "${token}" is invalid`);
  }

  const base = parts[0];
  const step =
    parts.length === 2
      ? parseBoundedInt(parts[1], Number.NaN, 1, max - min + 1)
      : 1;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`${fieldName} step in "${token}" must be >= 1`);
  }

  if (base === '*') {
    for (let value = min; value <= max; value += step) {
      target.add(value);
    }
    return;
  }

  if (base.includes('-')) {
    const [startRaw, endRaw] = base.split('-');
    const start = ensureRange(Number.parseInt(startRaw, 10), min, max, fieldName);
    const end = ensureRange(Number.parseInt(endRaw, 10), min, max, fieldName);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new Error(`${fieldName} range "${base}" is invalid`);
    }
    for (let value = start; value <= end; value += step) {
      target.add(value);
    }
    return;
  }

  const single = ensureRange(Number.parseInt(base, 10), min, max, fieldName);
  if (!Number.isFinite(single)) {
    throw new Error(`${fieldName} token "${token}" is invalid`);
  }
  target.add(single);
}

function parseCronField(expr: string, min: number, max: number, fieldName: string): CronField {
  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} field is required`);
  }

  if (trimmed === '*') {
    const values = new Set<number>();
    for (let value = min; value <= max; value += 1) {
      values.add(value);
    }
    return {
      values,
      wildcard: true,
    };
  }

  const values = new Set<number>();
  const tokens = trimmed.split(',');
  for (const token of tokens) {
    parseCronToken(token, min, max, fieldName, values);
  }
  if (values.size === 0) {
    throw new Error(`${fieldName} field is empty`);
  }

  return {
    values,
    wildcard: false,
  };
}

function parseCronExpression(expr: string): ParsedCronExpression {
  const normalized = expr.trim().replace(/\s+/g, ' ');
  const fields = normalized.split(' ');
  if (fields.length !== 5) {
    throw new Error('cronExpr must have 5 fields: minute hour day month weekday');
  }

  return {
    minute: parseCronField(fields[0], 0, 59, 'minute'),
    hour: parseCronField(fields[1], 0, 23, 'hour'),
    dayOfMonth: parseCronField(fields[2], 1, 31, 'day-of-month'),
    month: parseCronField(fields[3], 1, 12, 'month'),
    dayOfWeek: parseCronField(fields[4], 0, 6, 'day-of-week'),
  };
}

function matchesCron(parsed: ParsedCronExpression, now: Date): boolean {
  if (!parsed.minute.values.has(now.getMinutes())) {
    return false;
  }
  if (!parsed.hour.values.has(now.getHours())) {
    return false;
  }
  if (!parsed.month.values.has(now.getMonth() + 1)) {
    return false;
  }

  const dayOfMonthMatch = parsed.dayOfMonth.values.has(now.getDate());
  const dayOfWeekMatch = parsed.dayOfWeek.values.has(now.getDay());

  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) {
    return true;
  }
  if (parsed.dayOfMonth.wildcard) {
    return dayOfWeekMatch;
  }
  if (parsed.dayOfWeek.wildcard) {
    return dayOfMonthMatch;
  }
  return dayOfMonthMatch || dayOfWeekMatch;
}

function normalizeOptionalSessionId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 128) : undefined;
}

function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('name is required');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('name is required');
  }
  return trimmed.slice(0, 120);
}

function normalizeMessage(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('message is required');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('message is required');
  }
  return trimmed;
}

function normalizeCronExpr(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('cronExpr is required');
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new Error('cronExpr is required');
  }
  parseCronExpression(trimmed);
  return trimmed;
}

function cronTickKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day} ${hour}:${minute}`;
}

export class CronScheduler {
  private readonly enqueueTask: CronSchedulerOptions['enqueueTask'];
  private readonly tickMs: number;
  private readonly stateEnabled: boolean;
  private readonly statePath: string;
  private readonly jobs = new Map<string, CronJobInternal>();
  private timer: NodeJS.Timeout | null = null;

  constructor(options: CronSchedulerOptions) {
    this.enqueueTask = options.enqueueTask;
    this.tickMs =
      options.tickMs ??
      parseBoundedInt(process.env.CHUBAO_CRON_TICK_MS, DEFAULT_TICK_MS, MIN_TICK_MS, MAX_TICK_MS);
    this.stateEnabled =
      options.stateEnabled ??
      parseBoolean(process.env.CHUBAO_CRON_STATE_ENABLED, process.env.VITEST ? false : true);
    this.statePath = options.statePath ?? process.env.CHUBAO_CRON_STATE_PATH ?? DEFAULT_CRON_STATE_PATH;

    this.loadState();
  }

  start(): void {
    if (this.timer) {
      return;
    }

    const tick = () => this.tick(new Date());
    this.timer = setInterval(tick, this.tickMs);
    this.timer.unref?.();
    tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  addJob(input: {
    name: string;
    cronExpr: string;
    message: string;
    sessionId?: string;
    enabled?: boolean;
  }): CronJobRecord {
    const now = new Date().toISOString();
    const cronExpr = normalizeCronExpr(input.cronExpr);
    const job: CronJobInternal = {
      id: randomUUID(),
      name: normalizeName(input.name),
      cronExpr,
      message: normalizeMessage(input.message),
      sessionId: normalizeOptionalSessionId(input.sessionId),
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now,
      parsed: parseCronExpression(cronExpr),
    };

    this.jobs.set(job.id, job);
    this.persistState();
    return this.toRecord(job);
  }

  removeJob(jobId: string): CronJobRecord | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    this.jobs.delete(jobId);
    this.persistState();
    return this.toRecord(job);
  }

  listJobs(): CronJobRecord[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((job) => this.toRecord(job));
  }

  private tick(now: Date): void {
    const key = cronTickKey(now);
    const nowIso = now.toISOString();
    let changed = false;

    for (const job of this.jobs.values()) {
      if (!job.enabled) {
        continue;
      }
      if (job.lastTickKey === key) {
        continue;
      }
      job.lastTickKey = key;

      if (!matchesCron(job.parsed, now)) {
        continue;
      }

      try {
        const task = this.enqueueTask({
          kind: 'chat',
          source: 'cron',
          cronJobId: job.id,
          cronJobName: job.name,
          message: job.message,
          sessionId: job.sessionId,
        });
        job.lastTaskId = task?.id;
        job.lastRunAt = nowIso;
        job.updatedAt = nowIso;
        changed = true;
      } catch (error) {
        logger.warn(`Cron job enqueue failed (${job.id})`, { error: error instanceof Error ? error.message : String(error), jobId: job.id });
      }
    }

    if (changed) {
      this.persistState();
    }
  }

  private toRecord(job: CronJobInternal): CronJobRecord {
    return {
      id: job.id,
      name: job.name,
      cronExpr: job.cronExpr,
      message: job.message,
      sessionId: job.sessionId,
      enabled: job.enabled,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastRunAt: job.lastRunAt,
      lastTaskId: job.lastTaskId,
    };
  }

  private persistState(): void {
    if (!this.stateEnabled) {
      return;
    }

    try {
      fsSync.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const payload: PersistedCronPayload = {
        schemaVersion: CRON_STATE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        jobs: Array.from(this.jobs.values()).map((job) => ({
          id: job.id,
          name: job.name,
          cronExpr: job.cronExpr,
          message: job.message,
          sessionId: job.sessionId,
          enabled: job.enabled,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          lastRunAt: job.lastRunAt,
          lastTaskId: job.lastTaskId,
        })),
      };
      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      logger.warn('Failed to persist cron scheduler state', { error: error instanceof Error ? error.message : String(error) });
    }
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

      const payload = JSON.parse(rawText) as Partial<PersistedCronPayload>;
      if (!Array.isArray(payload.jobs)) {
        return;
      }

      for (const candidate of payload.jobs) {
        if (!candidate || typeof candidate !== 'object') {
          continue;
        }

        try {
          const name = normalizeName((candidate as { name?: unknown }).name);
          const cronExpr = normalizeCronExpr((candidate as { cronExpr?: unknown }).cronExpr);
          const message = normalizeMessage((candidate as { message?: unknown }).message);
          const idRaw = (candidate as { id?: unknown }).id;
          const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw : randomUUID();
          const createdAtRaw = (candidate as { createdAt?: unknown }).createdAt;
          const updatedAtRaw = (candidate as { updatedAt?: unknown }).updatedAt;

          const job: CronJobInternal = {
            id,
            name,
            cronExpr,
            message,
            sessionId: normalizeOptionalSessionId((candidate as { sessionId?: unknown }).sessionId),
            enabled: (candidate as { enabled?: unknown }).enabled !== false,
            createdAt: typeof createdAtRaw === 'string' ? createdAtRaw : new Date().toISOString(),
            updatedAt: typeof updatedAtRaw === 'string' ? updatedAtRaw : new Date().toISOString(),
            lastRunAt:
              typeof (candidate as { lastRunAt?: unknown }).lastRunAt === 'string'
                ? ((candidate as { lastRunAt?: string }).lastRunAt ?? undefined)
                : undefined,
            lastTaskId:
              typeof (candidate as { lastTaskId?: unknown }).lastTaskId === 'string'
                ? ((candidate as { lastTaskId?: string }).lastTaskId ?? undefined)
                : undefined,
            parsed: parseCronExpression(cronExpr),
          };

          this.jobs.set(job.id, job);
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.warn('Failed to load persisted cron scheduler state', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
