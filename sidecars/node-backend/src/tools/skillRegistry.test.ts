import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ensureSkillDirectories,
  CHUBAO_SKILLS_DIR,
} from './skillRegistry.js';

describe('skillRegistry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'));
  });

  afterEach(() => {
    try {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ensureSkillDirectories', () => {
    it('should create skill directories', () => {
      const dirs = ensureSkillDirectories(tempDir);

      expect(fsSync.existsSync(dirs.baseDir)).toBe(true);
      expect(fsSync.existsSync(dirs.registryDir)).toBe(true);
      expect(fsSync.existsSync(dirs.installedDir)).toBe(true);
    });

    it('should return correct directory structure', () => {
      const dirs = ensureSkillDirectories(tempDir);

      expect(dirs.baseDir).toBe(path.resolve(tempDir));
      expect(dirs.registryDir).toBe(path.join(tempDir, 'registry'));
      expect(dirs.installedDir).toBe(path.join(tempDir, 'installed'));
    });

    it('should not fail if directories already exist', () => {
      // Create directories first
      fsSync.mkdirSync(path.join(tempDir, 'registry'), { recursive: true });
      fsSync.mkdirSync(path.join(tempDir, 'installed'), { recursive: true });

      // Should not throw
      expect(() => ensureSkillDirectories(tempDir)).not.toThrow();
    });
  });

  describe('CHUBAO_SKILLS_DIR', () => {
    it('should be defined', () => {
      expect(CHUBAO_SKILLS_DIR).toBeDefined();
      expect(typeof CHUBAO_SKILLS_DIR).toBe('string');
    });
  });
});
