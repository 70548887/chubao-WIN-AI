import { describe, expect, it } from 'vitest';
import { buildExecutionPlan } from './taskPlanner';

describe('buildExecutionPlan', () => {
  it('builds coding progress plan', () => {
    const plan = buildExecutionPlan('coding_progress', 'show coding progress');
    expect(plan.intent).toBe('coding_progress');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.action).toBe('check_services');
    expect(plan.steps[0]?.required).toBe(false);
    expect(plan.steps[0]?.timeoutMs).toBe(4000);
    expect(plan.steps[0]?.retryCount).toBe(0);
    expect(plan.steps[1]?.action).toBe('fetch_coding_progress');
    expect(plan.steps[1]?.required).toBe(true);
    expect(plan.steps[1]?.timeoutMs).toBe(12000);
    expect(plan.steps[1]?.retryCount).toBe(1);
  });

  it('builds windows automation plan', () => {
    const plan = buildExecutionPlan('automation_windows', 'list windows');
    expect(plan.intent).toBe('automation_windows');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.action).toBe('check_services');
    expect(plan.steps[0]?.required).toBe(false);
    expect(plan.steps[0]?.timeoutMs).toBe(4000);
    expect(plan.steps[1]?.action).toBe('fetch_windows');
    expect(plan.steps[1]?.required).toBe(true);
    expect(plan.steps[1]?.timeoutMs).toBe(9000);
    expect(plan.steps[1]?.retryCount).toBe(1);
  });

  it('builds service status plan', () => {
    const plan = buildExecutionPlan('service_status', 'status');
    expect(plan.intent).toBe('service_status');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toBe('check_services');
    expect(plan.steps[0]?.required).toBe(true);
    expect(plan.steps[0]?.timeoutMs).toBe(5000);
    expect(plan.steps[0]?.retryCount).toBe(0);
  });

  it('falls back to general chat plan', () => {
    const plan = buildExecutionPlan('general_chat', 'hello');
    expect(plan.intent).toBe('general_chat');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toBe('call_chat');
    expect(plan.steps[0]?.required).toBe(true);
    expect(plan.steps[0]?.timeoutMs).toBe(30000);
    expect(plan.steps[0]?.retryCount).toBe(1);
  });
});
