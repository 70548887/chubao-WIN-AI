import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryManager } from './manager.js';

describe('MemoryManager', () => {
  let tempDir: string;
  let manager: MemoryManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
    manager = new MemoryManager(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should initialize memory system', async () => {
      await manager.init();

      // Check database file exists
      const dbPath = path.join(tempDir, 'memory.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Check MEMORY.md exists
      const memoryMdPath = path.join(tempDir, 'MEMORY.md');
      expect(fs.existsSync(memoryMdPath)).toBe(true);

      // Check USER.md exists
      const userMdPath = path.join(tempDir, 'USER.md');
      expect(fs.existsSync(userMdPath)).toBe(true);

      // Check daily directory exists
      const dailyPath = path.join(tempDir, 'daily');
      expect(fs.existsSync(dailyPath)).toBe(true);
    });

    it('should create knowledge graph structure', async () => {
      await manager.init();

      const lifePath = path.join(process.cwd(), '../../life');
      const categories = ['people', 'companies', 'projects', 'technologies', 'concepts'];

      for (const category of categories) {
        const categoryPath = path.join(lifePath, 'areas', category);
        expect(fs.existsSync(categoryPath)).toBe(true);
      }
    });
  });

  describe('add', () => {
    it('should add memory item', async () => {
      await manager.init();

      await manager.add('test', 'Test content', { key: 'value' });

      const recent = await manager.getRecent('test', 1);
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('Test content');
    });

    it('should add multiple items', async () => {
      await manager.init();

      await manager.add('test', 'Content 1');
      await manager.add('test', 'Content 2');
      await manager.add('test', 'Content 3');

      const recent = await manager.getRecent('test', 10);
      expect(recent).toHaveLength(3);
    });
  });

  describe('addDaily', () => {
    it('should add daily note', async () => {
      await manager.init();

      await manager.addDaily('Test daily note');

      const today = new Date().toISOString().split('T')[0];
      const dailyPath = path.join(tempDir, 'daily', `${today}.md`);

      expect(fs.existsSync(dailyPath)).toBe(true);

      const content = fs.readFileSync(dailyPath, 'utf8');
      expect(content).toContain('Test daily note');
    });

    it('should append to existing daily file', async () => {
      await manager.init();

      await manager.addDaily('First note');
      await manager.addDaily('Second note');

      const today = new Date().toISOString().split('T')[0];
      const dailyPath = path.join(tempDir, 'daily', `${today}.md`);
      const content = fs.readFileSync(dailyPath, 'utf8');

      expect(content).toContain('First note');
      expect(content).toContain('Second note');
    });
  });

  describe('getRecent', () => {
    it('should return recent items by type', async () => {
      await manager.init();

      await manager.add('type-a', 'Content A1');
      await manager.add('type-a', 'Content A2');
      await manager.add('type-b', 'Content B1');

      const typeAItems = await manager.getRecent('type-a', 10);
      expect(typeAItems).toHaveLength(2);

      const typeBItems = await manager.getRecent('type-b', 10);
      expect(typeBItems).toHaveLength(1);
    });

    it('should respect limit', async () => {
      await manager.init();

      for (let i = 0; i < 10; i++) {
        await manager.add('test', `Content ${i}`);
      }

      const items = await manager.getRecent('test', 5);
      expect(items).toHaveLength(5);
    });

    it('should return empty array when not initialized', async () => {
      const items = await manager.getRecent('test', 10);
      expect(items).toEqual([]);
    });
  });

  describe('search', () => {
    it('should search memories', async () => {
      await manager.init();

      await manager.add('test', 'Hello world content');
      await manager.add('test', 'Another hello message');
      await manager.add('test', 'Something different');

      const results = await manager.search('hello');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit', async () => {
      await manager.init();

      for (let i = 0; i < 10; i++) {
        await manager.add('test', `Test content ${i}`);
      }

      const results = await manager.search('Test', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array when not initialized', async () => {
      const results = await manager.search('test');
      expect(results).toEqual([]);
    });
  });

  describe('updateKnowledgeGraph', () => {
    it('should create entity in knowledge graph', async () => {
      await manager.init();

      await manager.updateKnowledgeGraph('Test Project', 'projects', 'This is a test project', 'description');

      const entityPath = path.join(process.cwd(), '../../life/areas/projects/test-project');
      expect(fs.existsSync(entityPath)).toBe(true);

      const itemsPath = path.join(entityPath, 'items.json');
      expect(fs.existsSync(itemsPath)).toBe(true);

      const summaryPath = path.join(entityPath, 'summary.md');
      expect(fs.existsSync(summaryPath)).toBe(true);
    });

    it('should append facts to existing entity', async () => {
      await manager.init();

      // Use unique entity name to avoid conflicts
      const uniqueEntity = `TestEntity-${Date.now()}`;
      await manager.updateKnowledgeGraph(uniqueEntity, 'concepts', 'First fact', 'fact1');
      await manager.updateKnowledgeGraph(uniqueEntity, 'concepts', 'Second fact', 'fact2');

      const entityPath = path.join(process.cwd(), `../../life/areas/concepts/${uniqueEntity.toLowerCase().replace(/\s+/g, '-')}`);
      const itemsPath = path.join(entityPath, 'items.json');
      const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));

      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('searchKnowledgeGraph', () => {
    it('should find entities by name', async () => {
      await manager.init();

      await manager.updateKnowledgeGraph('My Project', 'projects', 'A project description', 'desc');

      const results = await manager.searchKnowledgeGraph('my-project');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name.toLowerCase()).toContain('my');
    });

    it('should return empty array for no matches', async () => {
      await manager.init();

      const results = await manager.searchKnowledgeGraph('non-existent-xyz');
      expect(results).toEqual([]);
    });
  });
});
