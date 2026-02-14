import { describe, expect, it } from 'vitest';
import { analyzeCodingProgress } from './analysis';
import type { CodingProgressPayload } from './types';

function createProgress(overrides: Partial<CodingProgressPayload> = {}): CodingProgressPayload {
  return {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    clean: false,
    counts: {
      staged: 0,
      unstaged: 0,
      untracked: 0,
      modified: 0,
      added: 0,
      deleted: 0,
      renamed: 0,
      conflicted: 0,
      totalFiles: 0,
    },
    changedFiles: [],
    recentCommits: [],
    commitCountSince: 0,
    sinceDays: 7,
    generatedAt: '2026-02-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('analyzeCodingProgress', () => {
  it('builds extension and author insights', () => {
    const insights = analyzeCodingProgress(
      createProgress({
        changedFiles: [
          'src/app.ts',
          'src/core/task.ts',
          'README.md',
          'script',
          'package.json',
          'src/index.ts',
        ],
        recentCommits: [
          { hash: '1', author: 'alice', date: '2026-01-01', subject: 'a' },
          { hash: '2', author: 'bob', date: '2026-01-02', subject: 'b' },
          { hash: '3', author: 'alice', date: '2026-01-03', subject: 'c' },
        ],
        commitCountSince: 6,
        sinceDays: 3,
      }),
    );

    expect(insights.velocity).toBe('high');
    expect(insights.commitsPerDay).toBe(2);
    expect(insights.topExtensions[0]).toEqual({ ext: '.ts', count: 3 });
    expect(insights.topExtensions.some((item) => item.ext === '(no-ext)')).toBe(true);
    expect(insights.activeAuthors).toEqual(['alice', 'bob']);
  });

  it('classifies low and medium velocity', () => {
    const low = analyzeCodingProgress(createProgress({ commitCountSince: 1, sinceDays: 7 }));
    const medium = analyzeCodingProgress(createProgress({ commitCountSince: 6, sinceDays: 7 }));
    expect(low.velocity).toBe('low');
    expect(medium.velocity).toBe('medium');
  });
});
