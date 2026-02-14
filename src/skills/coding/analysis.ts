import type { CodingProgressPayload } from './types';

export type CodingVelocity = 'low' | 'medium' | 'high';

export interface CodingProgressInsights {
  velocity: CodingVelocity;
  commitsPerDay: number;
  topExtensions: Array<{ ext: string; count: number }>;
  activeAuthors: string[];
}

function normalizeExtension(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return '(no-ext)';
  }
  return fileName.slice(dotIndex).toLowerCase();
}

function classifyVelocity(commitsPerDay: number): CodingVelocity {
  if (commitsPerDay < 0.5) {
    return 'low';
  }
  if (commitsPerDay < 2) {
    return 'medium';
  }
  return 'high';
}

export function analyzeCodingProgress(progress: CodingProgressPayload): CodingProgressInsights {
  const commitsPerDayRaw = progress.commitCountSince / Math.max(1, progress.sinceDays);
  const commitsPerDay = Math.round(commitsPerDayRaw * 100) / 100;

  const extensionMap = new Map<string, number>();
  for (const filePath of progress.changedFiles) {
    const ext = normalizeExtension(filePath);
    extensionMap.set(ext, (extensionMap.get(ext) ?? 0) + 1);
  }

  const topExtensions = Array.from(extensionMap.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return a.ext.localeCompare(b.ext);
    })
    .slice(0, 5);

  const activeAuthors = Array.from(
    new Set(
      progress.recentCommits
        .map((item) => item.author.trim())
        .filter((item) => item.length > 0),
    ),
  ).slice(0, 3);

  return {
    velocity: classifyVelocity(commitsPerDay),
    commitsPerDay,
    topExtensions,
    activeAuthors,
  };
}
