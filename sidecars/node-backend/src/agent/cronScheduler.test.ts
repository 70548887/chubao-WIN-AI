import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CronScheduler } from './cronScheduler.js';

describe('CronScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add a cron job', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    const job = scheduler.addJob({
      name: 'Test Job',
      cronExpr: '0 9 * * *',
      message: 'Morning report',
    });
    
    expect(job.id).toBeDefined();
    expect(job.name).toBe('Test Job');
    expect(job.cronExpr).toBe('0 9 * * *');
    expect(job.message).toBe('Morning report');
    expect(job.enabled).toBe(true);
  });

  it('should list all jobs', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'Job 1', cronExpr: '0 9 * * *', message: 'Message 1' });
    scheduler.addJob({ name: 'Job 2', cronExpr: '0 10 * * *', message: 'Message 2' });

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(2);
  });

  it('should remove a job', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    const job = scheduler.addJob({ name: 'Removable Job', cronExpr: '0 9 * * *', message: 'Test' });
    scheduler.removeJob(job.id);

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(0);
  });

  it('should support disabled jobs', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'Disabled Job', cronExpr: '* * * * *', message: 'Test', enabled: false });
    scheduler.start();

    vi.advanceTimersByTime(5000);

    expect(enqueueTask).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('should trigger job on cron match', () => {
    const enqueueTask = vi.fn().mockReturnValue({ id: 'task-1' });
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    // Create a job that runs every minute
    scheduler.addJob({ name: 'Every Minute', cronExpr: '* * * * *', message: 'Tick' });
    scheduler.start();

    // Fast forward past first tick
    vi.advanceTimersByTime(2000);

    // Should have triggered at least once
    expect(enqueueTask).toHaveBeenCalled();
    scheduler.stop();
  });

  it('should not trigger disabled jobs', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'Disabled Job', cronExpr: '* * * * *', message: 'Test', enabled: false });
    scheduler.start();

    vi.advanceTimersByTime(5000);

    expect(enqueueTask).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('should remove job and return record', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    const job = scheduler.addJob({ name: 'Removable', cronExpr: '0 9 * * *', message: 'Test' });
    const removed = scheduler.removeJob(job.id);

    expect(removed).not.toBeNull();
    expect(removed?.name).toBe('Removable');
  });

  it('should return null when removing non-existent job', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    const removed = scheduler.removeJob('non-existent-id');
    expect(removed).toBeNull();
  });

  it('should track last run time', () => {
    const enqueueTask = vi.fn().mockReturnValue({ id: 'task-1' });
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'Trackable', cronExpr: '* * * * *', message: 'Test' });
    scheduler.start();

    vi.advanceTimersByTime(2000);

    const jobs = scheduler.listJobs();
    expect(jobs[0].lastRunAt).toBeDefined();
    scheduler.stop();
  });

  it('should stop ticking when stopped', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'Stoppable', cronExpr: '* * * * *', message: 'Test' });
    scheduler.start();
    scheduler.stop();

    vi.advanceTimersByTime(5000);

    // Should only have been called during initial tick if at all
    const callCount = enqueueTask.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(enqueueTask.mock.calls.length).toBe(callCount);
  });

  it('should handle invalid cron expressions', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    expect(() => {
      scheduler.addJob({ name: 'Invalid', cronExpr: 'invalid cron', message: 'Test' });
    }).toThrow();
  });

  it('should handle missing name', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    expect(() => {
      scheduler.addJob({ name: '', cronExpr: '0 9 * * *', message: 'Test' });
    }).toThrow();
  });

  it('should handle missing message', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    expect(() => {
      scheduler.addJob({ name: 'Test', cronExpr: '0 9 * * *', message: '' });
    }).toThrow();
  });

  it('should sort jobs by createdAt descending', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    scheduler.addJob({ name: 'First', cronExpr: '0 9 * * *', message: 'Test 1' });
    vi.advanceTimersByTime(100);
    scheduler.addJob({ name: 'Second', cronExpr: '0 10 * * *', message: 'Test 2' });

    const jobs = scheduler.listJobs();
    expect(jobs[0].name).toBe('Second');
    expect(jobs[1].name).toBe('First');
  });

  it('should include sessionId in job', () => {
    const enqueueTask = vi.fn();
    const scheduler = new CronScheduler({
      enqueueTask,
      tickMs: 1000,
      stateEnabled: false,
    });

    const job = scheduler.addJob({
      name: 'With Session',
      cronExpr: '0 9 * * *',
      message: 'Test',
      sessionId: 'session-123',
    });

    expect(job.sessionId).toBe('session-123');
  });
});
