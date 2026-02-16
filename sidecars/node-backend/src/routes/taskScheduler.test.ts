import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Express, Request, Response } from 'express';
import { registerTaskSchedulerRoutes, type TaskSchedulerSendError } from './taskScheduler.js';
import type { CronScheduler } from '../agent/cronScheduler.js';
import type { TaskQueue } from '../agent/taskQueue.js';

describe('taskScheduler routes', () => {
  let app: Express;
  let taskQueue: TaskQueue;
  let cronScheduler: CronScheduler;
  let routes: Map<string, Function>;
  let sendError: TaskSchedulerSendError;

  beforeEach(() => {
    routes = new Map<string, Function>();
    app = {
      post: vi.fn((path: string, handler: Function) => routes.set(`POST ${path}`, handler)),
      get: vi.fn((path: string, handler: Function) => routes.set(`GET ${path}`, handler)),
      delete: vi.fn((path: string, handler: Function) => routes.set(`DELETE ${path}`, handler)),
    } as unknown as Express;

    taskQueue = {
      enqueue: vi.fn().mockReturnValue({ id: 'task-1', status: 'pending' }),
      listTasks: vi.fn().mockReturnValue([{ id: 'task-1' }, { id: 'task-2' }]),
      getTask: vi.fn().mockReturnValue({ id: 'task-1', status: 'running' }),
      cancelTask: vi.fn().mockReturnValue({ id: 'task-1', status: 'canceled' }),
    } as unknown as TaskQueue;

    cronScheduler = {
      addJob: vi.fn().mockReturnValue({ id: 'job-1', name: 'test-job' }),
      listJobs: vi.fn().mockReturnValue([{ id: 'job-1' }, { id: 'job-2' }]),
      removeJob: vi.fn().mockReturnValue({ id: 'job-1' }),
    } as unknown as CronScheduler;

    sendError = vi.fn((res, statusCode, errorCode, message, details) => {
      res.status(statusCode).json({ success: false, error: { code: errorCode, message, details } });
    });

    registerTaskSchedulerRoutes({
      app,
      taskQueue,
      cronScheduler,
      inferErrorCode: (error: unknown) => 'INVALID_ARGUMENT',
      sendError,
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', () => {
      const req = { body: { message: 'Hello AI' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/tasks')!;
      handler(req, res);

      expect(taskQueue.enqueue).toHaveBeenCalledWith({
        kind: 'chat',
        message: 'Hello AI',
        sessionId: undefined,
        source: 'api',
      });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ success: true, task: { id: 'task-1', status: 'pending' } });
    });

    it('should accept custom kind, sessionId and source', () => {
      const req = {
        body: { kind: 'chat', message: 'Test', sessionId: 'session-123', source: 'telegram' },
      } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/tasks')!;
      handler(req, res);

      expect(taskQueue.enqueue).toHaveBeenCalledWith({
        kind: 'chat',
        message: 'Test',
        sessionId: 'session-123',
        source: 'telegram',
      });
    });

    it('should reject invalid kind', () => {
      const req = { body: { kind: 'invalid', message: 'Test' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/tasks')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('should reject missing message', () => {
      const req = { body: {} } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/tasks')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('GET /api/tasks', () => {
    it('should list all tasks', () => {
      const req = { query: {} } as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks')!;
      handler(req, res);

      expect(taskQueue.listTasks).toHaveBeenCalledWith({ status: undefined, limit: undefined, offset: undefined });
      expect(res.json).toHaveBeenCalledWith({ success: true, tasks: [{ id: 'task-1' }, { id: 'task-2' }] });
    });

    it('should filter by status', () => {
      const req = { query: { status: 'pending' } } as unknown as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks')!;
      handler(req, res);

      expect(taskQueue.listTasks).toHaveBeenCalledWith({ status: 'pending', limit: undefined, offset: undefined });
    });

    it('should support pagination', () => {
      const req = { query: { limit: '10', offset: '20' } } as unknown as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks')!;
      handler(req, res);

      expect(taskQueue.listTasks).toHaveBeenCalledWith({ status: undefined, limit: 10, offset: 20 });
    });

    it('should reject invalid status', () => {
      const req = { query: { status: 'invalid' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('should get task by id', () => {
      const req = { params: { taskId: 'task-1' } } as unknown as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks/:taskId')!;
      handler(req, res);

      expect(taskQueue.getTask).toHaveBeenCalledWith('task-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, task: { id: 'task-1', status: 'running' } });
    });

    it('should return 404 for non-existent task', () => {
      taskQueue.getTask = vi.fn().mockReturnValue(undefined);
      const req = { params: { taskId: 'nonexistent' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks/:taskId')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalledWith(res, 404, 'NOT_FOUND', 'Task not found: nonexistent');
    });

    it('should reject empty taskId', () => {
      const req = { params: { taskId: '' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/tasks/:taskId')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalledWith(res, 400, 'INVALID_ARGUMENT', 'taskId is required', { field: 'taskId' });
    });
  });

  describe('DELETE /api/tasks/:taskId', () => {
    it('should cancel task by id', () => {
      const req = { params: { taskId: 'task-1' } } as unknown as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('DELETE /api/tasks/:taskId')!;
      handler(req, res);

      expect(taskQueue.cancelTask).toHaveBeenCalledWith('task-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, task: { id: 'task-1', status: 'canceled' } });
    });

    it('should reject empty taskId', () => {
      const req = { params: { taskId: '' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('DELETE /api/tasks/:taskId')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalledWith(res, 400, 'INVALID_ARGUMENT', 'taskId is required', { field: 'taskId' });
    });
  });

  describe('POST /api/cron', () => {
    it('should create a new cron job', () => {
      const req = { body: { name: 'daily-report', cronExpr: '0 9 * * *', message: 'Generate report' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(cronScheduler.addJob).toHaveBeenCalledWith({
        name: 'daily-report',
        cronExpr: '0 9 * * *',
        message: 'Generate report',
        sessionId: undefined,
        enabled: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, job: { id: 'job-1', name: 'test-job' } });
    });

    it('should accept enabled flag', () => {
      const req = { body: { name: 'test', cronExpr: '* * * * *', message: 'Test', enabled: false } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(cronScheduler.addJob).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('should reject missing name', () => {
      const req = { body: { cronExpr: '* * * * *', message: 'Test' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('should reject missing cronExpr', () => {
      const req = { body: { name: 'test', message: 'Test' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('should reject missing message', () => {
      const req = { body: { name: 'test', cronExpr: '* * * * *' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('should reject non-boolean enabled', () => {
      const req = { body: { name: 'test', cronExpr: '* * * * *', message: 'Test', enabled: 'yes' } } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('POST /api/cron')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('GET /api/cron', () => {
    it('should list all cron jobs', () => {
      const req = {} as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('GET /api/cron')!;
      handler(req, res);

      expect(cronScheduler.listJobs).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, jobs: [{ id: 'job-1' }, { id: 'job-2' }] });
    });
  });

  describe('DELETE /api/cron/:jobId', () => {
    it('should remove cron job by id', () => {
      const req = { params: { jobId: 'job-1' } } as unknown as Request;
      const res = { json: vi.fn() } as unknown as Response;

      const handler = routes.get('DELETE /api/cron/:jobId')!;
      handler(req, res);

      expect(cronScheduler.removeJob).toHaveBeenCalledWith('job-1');
      expect(res.json).toHaveBeenCalledWith({ success: true, job: { id: 'job-1' } });
    });

    it('should return 404 for non-existent job', () => {
      cronScheduler.removeJob = vi.fn().mockReturnValue(undefined);
      const req = { params: { jobId: 'nonexistent' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('DELETE /api/cron/:jobId')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalledWith(res, 404, 'NOT_FOUND', 'Cron job not found: nonexistent');
    });

    it('should reject empty jobId', () => {
      const req = { params: { jobId: '' } } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      const handler = routes.get('DELETE /api/cron/:jobId')!;
      handler(req, res);

      expect(sendError).toHaveBeenCalledWith(res, 400, 'INVALID_ARGUMENT', 'jobId is required', { field: 'jobId' });
    });
  });
});
