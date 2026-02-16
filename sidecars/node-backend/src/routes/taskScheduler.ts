import type { Express, Response } from 'express';
import type { CronScheduler } from '../agent/cronScheduler.js';
import type { QueueTaskListStatus, TaskQueue } from '../agent/taskQueue.js';

export type TaskSchedulerErrorCode =
  | 'INVALID_ARGUMENT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

export type TaskSchedulerSendError = (
  res: Response,
  statusCode: number,
  errorCode: TaskSchedulerErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => void;

interface TaskSchedulerRouteDeps {
  app: Express;
  taskQueue: TaskQueue;
  cronScheduler: CronScheduler;
  inferErrorCode: (error: unknown) => TaskSchedulerErrorCode;
  sendError: TaskSchedulerSendError;
}

const LIST_STATUS_VALUES: ReadonlySet<QueueTaskListStatus> = new Set([
  'all',
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
]);

function statusCodeForErrorCode(code: TaskSchedulerErrorCode): number {
  if (code === 'INVALID_ARGUMENT') {
    return 400;
  }
  if (code === 'FORBIDDEN') {
    return 403;
  }
  if (code === 'NOT_FOUND') {
    return 404;
  }
  if (code === 'TIMEOUT') {
    return 504;
  }
  if (code === 'SERVICE_UNAVAILABLE' || code === 'DEPENDENCY_UNAVAILABLE') {
    return 503;
  }
  return 500;
}

function readQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function parseQueryInt(raw: string | undefined, field: string, min: number): number | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${field} must be an integer >= ${min}`);
  }
  return parsed;
}

function normalizeOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function registerTaskSchedulerRoutes({
  app,
  taskQueue,
  cronScheduler,
  inferErrorCode,
  sendError,
}: TaskSchedulerRouteDeps): void {
  app.post('/api/tasks', (req, res) => {
    try {
      const kind = normalizeOptionalString(req.body?.kind, 'kind') ?? 'chat';
      if (kind !== 'chat') {
        throw new Error('kind must be "chat"');
      }

      const message = normalizeOptionalString(req.body?.message, 'message');
      if (!message) {
        throw new Error('message is required');
      }

      const sessionId = normalizeOptionalString(req.body?.sessionId, 'sessionId');
      const source = normalizeOptionalString(req.body?.source, 'source') ?? 'api';

      const task = taskQueue.enqueue({
        kind,
        message,
        sessionId,
        source,
      });

      res.status(202).json({
        success: true,
        task,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/tasks', (req, res) => {
    const statusRaw = readQueryString(req.query.status);
    const limitRaw = readQueryString(req.query.limit);
    const offsetRaw = readQueryString(req.query.offset);
    let status: QueueTaskListStatus | undefined;
    let limit: number | undefined;
    let offset: number | undefined;

    try {
      if (statusRaw !== undefined) {
        const normalized = statusRaw.trim().toLowerCase() as QueueTaskListStatus;
        if (!LIST_STATUS_VALUES.has(normalized)) {
          throw new Error('status must be one of all/pending/running/completed/failed/canceled');
        }
        status = normalized;
      }
      limit = parseQueryInt(limitRaw, 'limit', 1);
      offset = parseQueryInt(offsetRaw, 'offset', 0);
      const list = taskQueue.listTasks({
        status,
        limit,
        offset,
      });

      res.json({
        success: true,
        tasks: list,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/tasks/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    if (!taskId || taskId.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'taskId is required', { field: 'taskId' });
      return;
    }

    const task = taskQueue.getTask(taskId);
    if (!task) {
      sendError(res, 404, 'NOT_FOUND', `Task not found: ${taskId}`);
      return;
    }

    res.json({
      success: true,
      task,
    });
  });

  app.delete('/api/tasks/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    if (!taskId || taskId.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'taskId is required', { field: 'taskId' });
      return;
    }

    try {
      const task = taskQueue.cancelTask(taskId);
      res.json({
        success: true,
        task,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.post('/api/cron', (req, res) => {
    try {
      const name = normalizeOptionalString(req.body?.name, 'name');
      const cronExpr = normalizeOptionalString(req.body?.cronExpr, 'cronExpr');
      const message = normalizeOptionalString(req.body?.message, 'message');
      if (!name) {
        throw new Error('name is required');
      }
      if (!cronExpr) {
        throw new Error('cronExpr is required');
      }
      if (!message) {
        throw new Error('message is required');
      }
      if (req.body?.enabled !== undefined && typeof req.body.enabled !== 'boolean') {
        throw new Error('enabled must be a boolean');
      }

      const sessionId = normalizeOptionalString(req.body?.sessionId, 'sessionId');
      const job = cronScheduler.addJob({
        name,
        cronExpr,
        message,
        sessionId,
        enabled: req.body?.enabled,
      });

      res.status(201).json({
        success: true,
        job,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/cron', (_req, res) => {
    res.json({
      success: true,
      jobs: cronScheduler.listJobs(),
    });
  });

  app.delete('/api/cron/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    if (!jobId || jobId.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'jobId is required', { field: 'jobId' });
      return;
    }

    const removed = cronScheduler.removeJob(jobId);
    if (!removed) {
      sendError(res, 404, 'NOT_FOUND', `Cron job not found: ${jobId}`);
      return;
    }

    res.json({
      success: true,
      job: removed,
    });
  });
}
