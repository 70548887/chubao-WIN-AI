export interface CodingCommitItem {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface CodingProgressCounts {
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
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  counts: CodingProgressCounts;
  changedFiles: string[];
  recentCommits: CodingCommitItem[];
  commitCountSince: number;
  sinceDays: number;
  generatedAt: string;
}

export interface CodingProgressResponse {
  success: boolean;
  progress?: CodingProgressPayload;
  message?: string;
}
