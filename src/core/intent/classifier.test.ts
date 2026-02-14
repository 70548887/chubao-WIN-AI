import { describe, expect, it } from 'vitest';
import { classifyIntent } from './classifier';

describe('classifyIntent', () => {
  it('returns general_chat for empty message', () => {
    expect(classifyIntent('   ')).toBe('general_chat');
  });

  it('matches coding progress intent in english', () => {
    expect(classifyIntent('show coding progress for this branch')).toBe('coding_progress');
  });

  it('matches coding progress intent in chinese', () => {
    expect(classifyIntent('查看编程进度')).toBe('coding_progress');
  });

  it('matches windows automation intent', () => {
    expect(classifyIntent('list current windows')).toBe('automation_windows');
  });

  it('matches service status intent', () => {
    expect(classifyIntent('检查后端状态')).toBe('service_status');
  });
});
