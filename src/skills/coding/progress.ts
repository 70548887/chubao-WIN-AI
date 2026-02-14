import type { CodingProgressPayload, CodingProgressResponse } from './types';
import { analyzeCodingProgress } from './analysis';

const DEFAULT_CODING_PROGRESS_URL = 'http://localhost:3100/api/coding/progress?sinceDays=7&maxFiles=20&includeUntracked=true';

export async function fetchCodingProgress(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CodingProgressPayload> {
  const response = await fetcher(DEFAULT_CODING_PROGRESS_URL, signal ? { signal } : undefined);
  const payload = (await response.json()) as CodingProgressResponse;
  if (!response.ok || payload.success !== true || !payload.progress) {
    throw new Error(payload.message ?? `Coding progress request failed (${response.status})`);
  }
  return payload.progress;
}

export function formatCodingProgress(progress: CodingProgressPayload): string {
  const changedFiles = progress.changedFiles.slice(0, 8);
  const recentCommits = progress.recentCommits.slice(0, 3);
  const fileLine = changedFiles.length > 0 ? changedFiles.join(', ') : 'none';
  const commitLine = recentCommits.length > 0
    ? recentCommits.map((item) => `${item.hash.slice(0, 8)} ${item.subject}`).join(' | ')
    : 'none';
  const insights = analyzeCodingProgress(progress);
  const extensionLine = insights.topExtensions.length > 0
    ? insights.topExtensions.map((item) => `${item.ext}:${item.count}`).join(', ')
    : 'none';
  const authorLine = insights.activeAuthors.length > 0
    ? insights.activeAuthors.join(', ')
    : 'none';

  return [
    'Coding progress snapshot',
    `branch=${progress.branch} upstream=${progress.upstream ?? 'none'} ahead=${progress.ahead} behind=${progress.behind}`,
    `working_tree=${progress.clean ? 'clean' : 'dirty'} files=${progress.counts.totalFiles} staged=${progress.counts.staged} unstaged=${progress.counts.unstaged} untracked=${progress.counts.untracked}`,
    `commits_${progress.sinceDays}d=${progress.commitCountSince}`,
    `velocity=${insights.velocity} commits_per_day=${insights.commitsPerDay.toFixed(2)}`,
    `top_extensions=${extensionLine}`,
    `active_authors=${authorLine}`,
    `changed_files=${fileLine}`,
    `recent_commits=${commitLine}`,
    `generated_at=${new Date(progress.generatedAt).toLocaleString()}`,
  ].join('\n');
}
