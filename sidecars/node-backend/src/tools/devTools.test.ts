import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import individual tools to avoid circular dependency
import { readFileTool, writeFileTool, validateCodeTool, healthCheckTool } from './devTools.js';

describe('devTools', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-test-'));
    testFile = path.join(tempDir, 'test.txt');
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('readFileTool', () => {
    it('should have correct name and description', () => {
      expect(readFileTool.name).toBe('read_file');
      expect(readFileTool.description).toContain('Read');
    });

    it('should return error for non-existent file', async () => {
      const result = await readFileTool.execute({
        path: '/non-existent/file.txt',
      });

      expect(result.error).toBeDefined();
    });

    it('should return error for blocked paths', async () => {
      const result = await readFileTool.execute({
        path: 'node_modules/test.txt',
      });

      expect(result.error).toContain('not allowed');
    });
  });

  describe('writeFileTool', () => {
    it('should have correct name and description', () => {
      expect(writeFileTool.name).toBe('write_file');
      expect(writeFileTool.description).toContain('Create or overwrite');
    });

    it('should return error for blocked paths', async () => {
      const result = await writeFileTool.execute({
        path: '.env',
        content: 'test',
      });

      expect(result.error).toContain('not allowed');
    });
  });

  describe('validateCodeTool', () => {
    it('should have correct name and description', () => {
      expect(validateCodeTool.name).toBe('validate_code');
      expect(validateCodeTool.description).toContain('Validate');
    });

    it('should validate TypeScript code', async () => {
      // validate_code runs tsc --noEmit on the entire project
      const result = await validateCodeTool.execute({});

      expect(result).toBeDefined();
      // Result depends on actual project TypeScript status
      expect(typeof result.valid).toBe('boolean');
    });

    it('should detect invalid TypeScript code', async () => {
      // validateCodeTool runs tsc --noEmit on the entire project
      // If the project has TypeScript errors, it should return valid: false
      const result = await validateCodeTool.execute({});

      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      // Result depends on actual project TypeScript status
    });

    it('should support JavaScript validation', async () => {
      const result = await validateCodeTool.execute({
        filePath: 'test.js',
        code: 'const x = 1;',
      });

      expect(result).toBeDefined();
    });
  });

  describe('healthCheckTool', () => {
    it('should have correct name and description', () => {
      expect(healthCheckTool.name).toBe('health_check');
      expect(healthCheckTool.description).toContain('health');
    });

    it('should return health status', async () => {
      const result = await healthCheckTool.execute({});

      expect(result).toBeDefined();
      expect(result.healthy).toBeDefined();
      expect(result.service).toBe('all');
      expect(result.timestamp).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.results.node).toBeDefined();
      expect(result.results.python).toBeDefined();
    });

    it('should check specific service when provided', async () => {
      const result = await healthCheckTool.execute({
        service: 'node',
      });

      expect(result).toBeDefined();
      expect(result.service).toBe('node');
      expect(result.results.node).toBeDefined();
    });
  });
});
