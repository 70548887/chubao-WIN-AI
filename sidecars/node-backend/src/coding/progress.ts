import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export interface CodingProgressOptions {
  sinceDays?: number;
  maxFiles?: number;
  includeUntracked?: boolean;
  repoRoot?: string;
}

export interface CodingCommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface CodingProgressReport {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  counts: {
    staged: number;
    unstaged: number;
    untracked: number;
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    conflicted: number;
    totalFiles: number;
  };
  changedFiles: string[];
  lastCommit: CodingCommitInfo | null;
  recentCommits: CodingCommitInfo[];
  commitCountSince: number;
  sinceDays: number;
  generatedAt: string;
}

function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.trim();
}

function parseCommitLine(line: string): CodingCommitInfo | null {
  if (!line) {
    return null;
  }
  const parts = line.split('\x1f');
  if (parts.length < 4) {
    return null;
  }
  const [hash, author, date, ...subjectParts] = parts;
  return {
    hash,
    author,
    date,
    subject: subjectParts.join('\x1f'),
  };
}

function normalizeChangedPath(rawPath: string): string {
  const renamedSep = ' -> ';
  if (rawPath.includes(renamedSep)) {
    return rawPath.split(renamedSep).pop() ?? rawPath;
  }
  return rawPath;
}

function classifyStatus(
  status: string,
  target: { modified: number; added: number; deleted: number; renamed: number; conflicted: number }
): void {
  switch (status) {
    case 'A':
      target.added += 1;
      return;
    case 'D':
      target.deleted += 1;
      return;
    case 'R':
      target.renamed += 1;
      return;
    case 'U':
      target.conflicted += 1;
      return;
    case 'M':
    case 'C':
    case 'T':
    default:
      target.modified += 1;
  }
}

function parseStatus(
  porcelain: string,
  includeUntracked: boolean
): {
  clean: boolean;
  changedFiles: string[];
  counts: CodingProgressReport['counts'];
} {
  const lines = porcelain.split(/\r?\n/).filter((line) => line.length > 0);
  const files = new Set<string>();
  const counts: CodingProgressReport['counts'] = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    conflicted: 0,
    totalFiles: 0,
  };

  for (const line of lines) {
    if (line.startsWith('##')) {
      continue;
    }

    if (line.startsWith('??')) {
      if (!includeUntracked) {
        continue;
      }
      counts.untracked += 1;
      counts.added += 1;
      files.add(normalizeChangedPath(line.slice(3).trim()));
      continue;
    }

    if (line.length < 4) {
      continue;
    }

    const x = line[0];
    const y = line[1];
    const filePath = normalizeChangedPath(line.slice(3).trim());
    if (filePath) {
      files.add(filePath);
    }

    if (x !== ' ' && x !== '?') {
      counts.staged += 1;
      classifyStatus(x, counts);
    }
    if (y !== ' ' && y !== '?') {
      counts.unstaged += 1;
      classifyStatus(y, counts);
    }
  }

  counts.totalFiles = files.size;
  const clean = counts.totalFiles === 0;
  return {
    clean,
    changedFiles: Array.from(files).sort((a, b) => a.localeCompare(b)),
    counts,
  };
}

export async function analyzeCodingProgress(options: CodingProgressOptions = {}): Promise<CodingProgressReport> {
  const sinceDays = Math.min(365, Math.max(1, Math.trunc(options.sinceDays ?? 7)));
  const maxFiles = Math.min(200, Math.max(1, Math.trunc(options.maxFiles ?? 30)));
  const includeUntracked = options.includeUntracked ?? true;
  const repoRoot = options.repoRoot ?? findGitRoot(process.cwd());
  if (!repoRoot) {
    throw new Error('Git repository root not found');
  }

  const branch = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  let upstream: string | null = null;
  try {
    upstream = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    upstream = null;
  }

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    try {
      const counts = await runGit(repoRoot, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
      const [behindText, aheadText] = counts.split(/\s+/);
      behind = Number.parseInt(behindText ?? '0', 10) || 0;
      ahead = Number.parseInt(aheadText ?? '0', 10) || 0;
    } catch {
      ahead = 0;
      behind = 0;
    }
  }

  const porcelain = await runGit(repoRoot, ['status', '--porcelain=v1', '--branch']);
  const status = parseStatus(porcelain, includeUntracked);

  const commitFormat = '%H%x1f%an%x1f%ai%x1f%s';
  const lastCommitRaw = await runGit(repoRoot, ['log', '-1', `--pretty=format:${commitFormat}`]);
  const lastCommit = parseCommitLine(lastCommitRaw);

  const recentRaw = await runGit(repoRoot, ['log', '-5', `--pretty=format:${commitFormat}`]);
  const recentCommits = recentRaw
    .split(/\r?\n/)
    .map((line) => parseCommitLine(line))
    .filter((item): item is CodingCommitInfo => item !== null);

  const sinceRaw = await runGit(repoRoot, ['log', `--since=${sinceDays}.days`, '--pretty=format:%H']);
  const commitCountSince = sinceRaw ? sinceRaw.split(/\r?\n/).filter(Boolean).length : 0;

  return {
    repoRoot,
    branch,
    upstream,
    ahead,
    behind,
    clean: status.clean,
    counts: status.counts,
    changedFiles: status.changedFiles.slice(0, maxFiles),
    lastCommit,
    recentCommits,
    commitCountSince,
    sinceDays,
    generatedAt: new Date().toISOString(),
  };
}

