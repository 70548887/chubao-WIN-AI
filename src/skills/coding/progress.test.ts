import { describe, expect, it, vi } from 'vitest';
import { fetchCodingProgress, formatCodingProgress } from './progress';
import type { CodingProgressPayload } from './types';

function createResponse(body: Record<string, unknown>, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createProgress(overrides: Partial<CodingProgressPayload> = {}): CodingProgressPayload {
  return {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 1,
    behind: 0,
    clean: false,
    counts: {
      staged: 1,
      unstaged: 2,
      untracked: 0,
      modified: 0,
      added: 0,
      deleted: 0,
      renamed: 0,
      conflicted: 0,
      totalFiles: 3,
    },
    changedFiles: ['src/app.ts', 'README.md', 'scripts/start.ps1'],
    recentCommits: [
      {
        hash: '1234567890abcdef',
        author: 'alice',
        date: '2026-02-14T00:00:00.000Z',
        subject: 'improve planner',
      },
    ],
    commitCountSince: 4,
    sinceDays: 7,
    generatedAt: '2026-02-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('fetchCodingProgress', () => {
  it('returns progress payload when API succeeds', async () => {
    const progress = createProgress();
    const fetcher = vi.fn().mockResolvedValueOnce(
      createResponse({
        success: true,
        progress,
      }),
    );

    await expect(fetchCodingProgress(fetcher as unknown as typeof fetch)).resolves.toEqual(progress);
  });

  it('throws when API fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      createResponse(
        {
          success: false,
          message: 'backend unavailable',
        },
        false,
        503,
      ),
    );

    await expect(fetchCodingProgress(fetcher as unknown as typeof fetch)).rejects.toThrow('backend unavailable');
  });
});

describe('formatCodingProgress', () => {
  it('includes trend and summary lines', () => {
    const formatted = formatCodingProgress(createProgress());
    expect(formatted).toContain('Coding progress snapshot');
    expect(formatted).toContain('velocity=');
    expect(formatted).toContain('top_extensions=');
    expect(formatted).toContain('active_authors=');
    expect(formatted).toContain('changed_files=src/app.ts, README.md, scripts/start.ps1');
  });
});
