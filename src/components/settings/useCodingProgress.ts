import { useCallback, useEffect, useState } from 'react';

const CODING_PROGRESS_ENDPOINT = 'http://localhost:3100/api/coding/progress';

interface CodingCommitItem {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

interface CodingProgressCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  conflicted: number;
  totalFiles: number;
}

export interface CodingProgressPayload {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  counts: CodingProgressCounts;
  changedFiles: string[];
  lastCommit: CodingCommitItem | null;
  recentCommits: CodingCommitItem[];
  commitCountSince: number;
  sinceDays: number;
  generatedAt: string;
}

interface CodingProgressResponse {
  success: boolean;
  progress?: CodingProgressPayload;
  message?: string;
}

export function useCodingProgress() {
  const [codingProgress, setCodingProgress] = useState<CodingProgressPayload | null>(null);
  const [codingLoading, setCodingLoading] = useState(false);
  const [codingError, setCodingError] = useState<string | null>(null);
  const [codingSinceDays, setCodingSinceDays] = useState(7);
  const [codingMaxFiles, setCodingMaxFiles] = useState(30);
  const [codingIncludeUntracked, setCodingIncludeUntracked] = useState(true);

  const loadCodingProgress = useCallback(async () => {
    setCodingLoading(true);
    try {
      const params = new URLSearchParams({
        sinceDays: String(Math.min(365, Math.max(1, Math.trunc(codingSinceDays)))),
        maxFiles: String(Math.min(200, Math.max(1, Math.trunc(codingMaxFiles)))),
        includeUntracked: codingIncludeUntracked ? 'true' : 'false',
      });
      const response = await fetch(`${CODING_PROGRESS_ENDPOINT}?${params.toString()}`);
      const data = (await response.json()) as CodingProgressResponse;
      if (!response.ok || data.success !== true || !data.progress) {
        throw new Error(data.message ?? `request failed: ${response.status}`);
      }
      setCodingProgress(data.progress);
      setCodingError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCodingError(message);
    } finally {
      setCodingLoading(false);
    }
  }, [codingSinceDays, codingMaxFiles, codingIncludeUntracked]);

  useEffect(() => {
    void loadCodingProgress();
  }, [loadCodingProgress]);

  return {
    codingProgress,
    codingLoading,
    codingError,
    codingSinceDays,
    codingMaxFiles,
    codingIncludeUntracked,
    loadCodingProgress,
    setCodingSinceDays,
    setCodingMaxFiles,
    setCodingIncludeUntracked,
  };
}
