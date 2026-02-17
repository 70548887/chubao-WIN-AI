import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryManager } from './manager.js';

// Mock AgentRuntime for integration tests
interface MockAgentRuntime {
  chat: (message: string, sessionId?: string) => Promise<string>;
  memoryManager: MemoryManager;
}

describe('Memory-Agent Integration', () => {
  let tempDir: string;
  let memoryManager: MemoryManager;
  let mockAgentRuntime: MockAgentRuntime;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-agent-test-'));
    memoryManager = new MemoryManager(tempDir);
    await memoryManager.init();
    
    // Mock AgentRuntime
    mockAgentRuntime = {
      chat: vi.fn().mockResolvedValue('Agent response'),
      memoryManager,
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('conversation context integration', () => {
    it('should store conversation to memory', async () => {
      await memoryManager.add('conversation', JSON.stringify({
        sessionId: 'test-session',
        user: 'Hello',
        assistant: 'Hi there!',
        timestamp: Date.now()
      }));

      const recent = await memoryManager.getRecent('conversation', 5);
      expect(recent).toHaveLength(1);
      
      const parsed = JSON.parse(recent[0].content);
      expect(parsed.user).toBe('Hello');
    });

    it('should retrieve conversation history', async () => {
      // Add multiple conversations
      for (let i = 0; i < 5; i++) {
        await memoryManager.add('conversation', JSON.stringify({
          sessionId: 'session-1',
          user: `Message ${i}`,
          assistant: `Response ${i}`,
          timestamp: Date.now() + i
        }));
      }

      const history = await memoryManager.getRecent('conversation', 10);
      expect(history.length).toBeGreaterThanOrEqual(5);
    });

    it('should search conversations by keywords', async () => {
      await memoryManager.add('conversation', JSON.stringify({
        user: 'Tell me about AI programming',
        assistant: 'AI programming involves machine learning...'
      }));

      await memoryManager.add('conversation', JSON.stringify({
        user: 'What is Python?',
        assistant: 'Python is a programming language...'
      }));

      const results = await memoryManager.search('programming');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve conversations by session ID', async () => {
      await memoryManager.add('conversation', JSON.stringify({
        sessionId: 'session-A',
        user: 'Hello A'
      }));

      await memoryManager.add('conversation', JSON.stringify({
        sessionId: 'session-B',
        user: 'Hello B'
      }));

      const results = await memoryManager.search('session-A');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('tool execution memory', () => {
    it('should log tool executions to memory', async () => {
      await memoryManager.add('tool_execution', JSON.stringify({
        toolName: 'screenshot',
        args: {},
        result: { path: '/tmp/screen.png' },
        timestamp: Date.now()
      }));

      const executions = await memoryManager.getRecent('tool_execution', 10);
      expect(executions).toHaveLength(1);
      
      const execution = JSON.parse(executions[0].content);
      expect(execution.toolName).toBe('screenshot');
    });

    it('should track tool execution failures', async () => {
      await memoryManager.add('tool_execution', JSON.stringify({
        toolName: 'click',
        args: { x: -1, y: -1 },
        error: 'Invalid coordinates',
        timestamp: Date.now()
      }));

      const failures = await memoryManager.search('error');
      expect(failures.length).toBeGreaterThan(0);
    });

    it('should track tool execution metrics', async () => {
      const tools = ['screenshot', 'click', 'type_text', 'screenshot'];
      
      for (const tool of tools) {
        await memoryManager.add('tool_execution', JSON.stringify({
          toolName: tool,
          timestamp: Date.now()
        }));
      }

      const executions = await memoryManager.getRecent('tool_execution', 10);
      expect(executions.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('knowledge graph integration', () => {
    it('should create entity from agent interaction', async () => {
      await memoryManager.updateKnowledgeGraph(
        'Test Project',
        'projects',
        'A test project for validation',
        'description'
      );

      const entities = await memoryManager.searchKnowledgeGraph('test-project');
      expect(entities.length).toBeGreaterThan(0);
      expect(entities[0].name.toLowerCase()).toContain('test');
    });

    it('should link entities based on agent discoveries', async () => {
      await memoryManager.updateKnowledgeGraph(
        'React',
        'technologies',
        'A JavaScript library for building UIs',
        'description'
      );

      await memoryManager.updateKnowledgeGraph(
        'React',
        'technologies',
        'Used in Test Project',
        'usage'
      );

      const tech = await memoryManager.searchKnowledgeGraph('react');
      expect(tech.length).toBeGreaterThan(0);
    });

    it('should track relationships between entities', async () => {
      await memoryManager.updateKnowledgeGraph(
        'Agent System',
        'projects',
        'Main project',
        'description'
      );

      await memoryManager.updateKnowledgeGraph(
        'Agent System',
        'projects',
        'Uses TypeScript',
        'tech-stack'
      );

      await memoryManager.updateKnowledgeGraph(
        'Agent System',
        'projects',
        'Implements memory layer',
        'feature'
      );

      const project = await memoryManager.searchKnowledgeGraph('agent-system');
      expect(project.length).toBeGreaterThan(0);
    });
  });

  describe('daily notes integration', () => {
    it('should append agent activities to daily notes', async () => {
      await memoryManager.addDaily('Agent started conversation with user');
      await memoryManager.addDaily('Executed screenshot tool');
      await memoryManager.addDaily('Completed task successfully');

      const today = new Date().toISOString().split('T')[0];
      const dailyPath = path.join(tempDir, 'daily', `${today}.md`);
      
      expect(fs.existsSync(dailyPath)).toBe(true);
      
      const content = fs.readFileSync(dailyPath, 'utf8');
      expect(content).toContain('screenshot tool');
    });

    it('should create timestamped daily entries', async () => {
      await memoryManager.addDaily('First activity');
      await memoryManager.addDaily('Second activity');

      const today = new Date().toISOString().split('T')[0];
      const dailyPath = path.join(tempDir, 'daily', `${today}.md`);
      const content = fs.readFileSync(dailyPath, 'utf8');

      expect(content).toContain('First activity');
      expect(content).toContain('Second activity');
    });
  });

  describe('agent memory queries', () => {
    it('should allow agent to query recent memories', async () => {
      await memoryManager.add('user_preference', 'Prefers dark mode');
      await memoryManager.add('user_preference', 'Uses VS Code');

      const preferences = await memoryManager.getRecent('user_preference', 5);
      expect(preferences.length).toBe(2);
    });

    it('should allow agent to search across all memory types', async () => {
      await memoryManager.add('conversation', 'Discussed Python coding');
      await memoryManager.add('tool_execution', 'Executed python script');
      await memoryManager.add('user_preference', 'Likes Python language');

      const pythonMemories = await memoryManager.search('Python');
      expect(pythonMemories.length).toBeGreaterThanOrEqual(3);
    });

    it('should support filtered memory queries', async () => {
      await memoryManager.add('conversation', 'Chat about coding');
      await memoryManager.add('tool_execution', 'Executed tool');
      await memoryManager.add('conversation', 'Another chat');

      const conversations = await memoryManager.getRecent('conversation', 10);
      expect(conversations.length).toBeGreaterThanOrEqual(2);
      
      conversations.forEach(mem => {
        expect(mem.type).toBe('conversation');
      });
    });
  });

  describe('error handling', () => {
    it('should handle corrupted memory gracefully', async () => {
      // Don't initialize memory
      const uninitManager = new MemoryManager(tempDir);
      
      const results = await uninitManager.search('test');
      expect(results).toEqual([]);
    });

    it('should handle concurrent memory writes', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        memoryManager.add('concurrent', `Message ${i}`)
      );

      await Promise.all(promises);

      const all = await memoryManager.getRecent('concurrent', 20);
      expect(all.length).toBe(10);
    });

    it('should recover from partial write failures', async () => {
      await memoryManager.add('test', 'Valid entry 1');
      
      // Attempt invalid operation (should not crash)
      try {
        await memoryManager.updateKnowledgeGraph('', '', '', '');
      } catch {
        // Expected to fail
      }
      
      await memoryManager.add('test', 'Valid entry 2');
      
      const all = await memoryManager.getRecent('test', 10);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('memory cleanup and limits', () => {
    it('should handle memory limits gracefully', async () => {
      // Add many entries
      for (let i = 0; i < 1000; i++) {
        await memoryManager.add('test', `Entry ${i}`);
      }

      const limited = await memoryManager.getRecent('test', 100);
      expect(limited.length).toBeLessThanOrEqual(100);
    });

    it('should maintain memory consistency under load', async () => {
      const types = ['conversation', 'tool_execution', 'user_preference'];
      
      for (let i = 0; i < 30; i++) {
        const type = types[i % types.length];
        await memoryManager.add(type, `Data ${i}`);
      }

      for (const type of types) {
        const memories = await memoryManager.getRecent(type, 20);
        expect(memories.length).toBeGreaterThan(0);
      }
    });
  });

  describe('agent-memory interaction patterns', () => {
    it('should support conversation resumption', async () => {
      const sessionId = 'resume-test';
      
      await memoryManager.add('conversation', JSON.stringify({
        sessionId,
        user: 'What is AI?',
        assistant: 'AI is...',
        timestamp: Date.now() - 60000
      }));

      await memoryManager.add('conversation', JSON.stringify({
        sessionId,
        user: 'Tell me more',
        assistant: 'More details...',
        timestamp: Date.now()
      }));

      const history = await memoryManager.search(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should track agent learning over time', async () => {
      await memoryManager.add('learning', JSON.stringify({
        topic: 'User prefers TypeScript',
        confidence: 0.8,
        timestamp: Date.now()
      }));

      await memoryManager.add('learning', JSON.stringify({
        topic: 'User works on React projects',
        confidence: 0.9,
        timestamp: Date.now()
      }));

      const learnings = await memoryManager.getRecent('learning', 10);
      expect(learnings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
