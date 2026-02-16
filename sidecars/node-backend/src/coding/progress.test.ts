import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeCodingProgress, type CodingProgressOptions } from './progress.js';

describe('coding/progress', () => {
  describe('analyzeCodingProgress', () => {
    it('should generate progress report', async () => {
      const result = await analyzeCodingProgress({
        sinceDays: 7,
        maxFiles: 10,
      });

      expect(result).toBeDefined();
      expect(result.repoRoot).toBeDefined();
      expect(result.branch).toBeDefined();
      expect(result.counts).toBeDefined();
      expect(result.changedFiles).toBeDefined();
    });

    it('should use default options', async () => {
      const result = await analyzeCodingProgress();

      expect(result).toBeDefined();
      expect(result.sinceDays).toBe(7); // Default value
    });

    it('should include commit info', async () => {
      const result = await analyzeCodingProgress({
        sinceDays: 1,
      });

      expect(result).toBeDefined();
      expect(result.lastCommit).toBeDefined();
      expect(result.recentCommits).toBeDefined();
    });

    it('should handle git status counts', async () => {
      const result = await analyzeCodingProgress();

      expect(result.counts).toBeDefined();
      expect(typeof result.counts.staged).toBe('number');
      expect(typeof result.counts.unstaged).toBe('number');
      expect(typeof result.counts.untracked).toBe('number');
      expect(typeof result.counts.totalFiles).toBe('number');
    });
  });
});
