/**
 * 三层记忆系统 (增强版)
 * 
 * Layer 1: 知识图谱 (/life/areas/) - 结构化知识
 * Layer 2: 每日笔记 (daily/) - 事件日志
 * Layer 3: 隐性知识 (MEMORY.md) - 模式和偏好
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface MemoryItem {
  id: number;
  type: string;
  content: string;
  embedding?: number[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphItem {
  id: string;
  name: string;
  category: 'people' | 'companies' | 'projects' | 'technologies' | 'concepts';
  summary: string;
  facts: Array<{ key: string; value: string; date: string }>;
  updatedAt: string;
}

export class MemoryManager {
  private db: Database.Database | null = null;
  private memoryPath: string;
  private lifePath: string;
  private hasVectorSearch: boolean = false;

  constructor(memoryPath?: string) {
    this.memoryPath = memoryPath || path.join(process.cwd(), '../../memory');
    this.lifePath = path.join(process.cwd(), '../../life');
  }

  async init(): Promise<void> {
    // Ensure directories exist
    [this.memoryPath, this.lifePath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Initialize SQLite database
    const dbPath = path.join(this.memoryPath, 'memory.db');
    this.db = new Database(dbPath);

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `);

    // Initialize vector search
    await this.initVectorSearch();

    // Ensure memory structure
    await this.ensureMemoryStructure();

    logger.info('Memory system initialized');
  }

  private async initVectorSearch(): Promise<void> {
    try {
      await import('sqlite-vec');
      this.hasVectorSearch = true;
      logger.info('Vector search enabled');
    } catch (error) {
      logger.info('Vector search not available, using text search');
      this.hasVectorSearch = false;
    }
  }

  private async ensureMemoryStructure(): Promise<void> {
    // Layer 3: Implicit knowledge
    const memoryMdPath = path.join(this.memoryPath, 'MEMORY.md');
    if (!fs.existsSync(memoryMdPath)) {
      fs.writeFileSync(memoryMdPath, this.getDefaultMemoryMd());
    }

    // Layer 3: User profile
    const userMdPath = path.join(this.memoryPath, 'USER.md');
    if (!fs.existsSync(userMdPath)) {
      fs.writeFileSync(userMdPath, this.getDefaultUserMd());
    }

    // Layer 2: Daily notes directory
    const dailyPath = path.join(this.memoryPath, 'daily');
    if (!fs.existsSync(dailyPath)) {
      fs.mkdirSync(dailyPath, { recursive: true });
    }

    // Layer 1: Knowledge graph directory
    const areasPath = path.join(this.lifePath, 'areas');
    const categories = ['people', 'companies', 'projects', 'technologies', 'concepts'];
    
    for (const category of categories) {
      const categoryPath = path.join(areasPath, category);
      if (!fs.existsSync(categoryPath)) {
        fs.mkdirSync(categoryPath, { recursive: true });
      }
    }
  }

  async search(query: string, limit: number = 10): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    const results: string[] = [];

    // Text search from database
    const dbResults = this.db.prepare(`
      SELECT content FROM memories 
      WHERE content LIKE ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(`%${query}%`, limit) as { content: string }[];
    
    results.push(...dbResults.map(r => r.content));

    // Search knowledge graph
    const kgResults = await this.searchKnowledgeGraph(query);
    results.push(...kgResults.map(item => `[Knowledge Graph] ${item.name}: ${item.summary}`));

    // Search implicit knowledge
    const implicitResults = await this.searchImplicitKnowledge(query);
    results.push(...implicitResults);

    // Remove duplicates and return
    return [...new Set(results)].slice(0, limit);
  }

  async add(type: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO memories (type, content, metadata) 
      VALUES (?, ?, ?)
    `);
    
    stmt.run(type, content, metadata ? JSON.stringify(metadata) : null);
  }

  async addDaily(content: string): Promise<void> {
    await this.add('daily', content);

    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(this.memoryPath, 'daily');
    const filePath = path.join(dailyPath, `${today}.md`);
    
    const time = new Date().toLocaleTimeString('zh-CN');
    const line = `- ${time}: ${content}\n`;

    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, line);
    } else {
      fs.writeFileSync(filePath, `# ${today}\n\n${line}`);
    }
  }

  async getRecent(type: string, limit: number = 20): Promise<MemoryItem[]> {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      WHERE type = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(type, limit) as MemoryItem[];
  }

  async updateKnowledgeGraph(
    entityName: string,
    category: string,
    fact: string,
    factKey: string = 'note'
  ): Promise<void> {
    const entityId = entityName.toLowerCase().replace(/\s+/g, '-');
    const entityPath = path.join(this.lifePath, 'areas', category, entityId);
    
    if (!fs.existsSync(entityPath)) {
      fs.mkdirSync(entityPath, { recursive: true });
    }

    const itemsPath = path.join(entityPath, 'items.json');
    let items: any[] = [];
    
    if (fs.existsSync(itemsPath)) {
      items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    }

    items.push({
      key: factKey,
      value: fact,
      date: new Date().toISOString(),
    });

    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));

    const summaryPath = path.join(entityPath, 'summary.md');
    const factsList = items.map(i => `- ${i.key}: ${i.value}`).join('\n');
    const summary = `# ${entityName}

Category: ${category}

## Facts

${factsList}

---
*Last updated: ${new Date().toISOString()}*`;
    
    fs.writeFileSync(summaryPath, summary);
  }

  async searchKnowledgeGraph(query: string): Promise<KnowledgeGraphItem[]> {
    const results: KnowledgeGraphItem[] = [];
    const categories = ['people', 'companies', 'projects', 'technologies', 'concepts'];
    
    for (const category of categories) {
      const categoryPath = path.join(this.lifePath, 'areas', category);
      
      if (!fs.existsSync(categoryPath)) {
        continue;
      }

      const entities = fs.readdirSync(categoryPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const entityId of entities) {
        if (entityId.includes(query.toLowerCase())) {
          const entityPath = path.join(categoryPath, entityId);
          const summaryPath = path.join(entityPath, 'summary.md');
          
          if (fs.existsSync(summaryPath)) {
            const content = fs.readFileSync(summaryPath, 'utf8');
            const summary = content.split('\n')[0].replace('# ', '');
            const itemsPath = path.join(entityPath, 'items.json');
            const facts = fs.existsSync(itemsPath) 
              ? JSON.parse(fs.readFileSync(itemsPath, 'utf8'))
              : [];

            results.push({
              id: entityId,
              name: summary,
              category: category as any,
              summary,
              facts,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return results;
  }

  async searchImplicitKnowledge(query: string): Promise<string[]> {
    const results: string[] = [];
    const memoryMdPath = path.join(this.memoryPath, 'MEMORY.md');
    
    if (!fs.existsSync(memoryMdPath)) {
      return results;
    }

    const content = fs.readFileSync(memoryMdPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('- ') && line.toLowerCase().includes(query.toLowerCase())) {
        results.push(line.replace('- ', ''));
      }
    }

    return results;
  }

  async getStats(): Promise<{
    totalMemories: number;
    dailyCount: number;
    knowledgeGraphEntities: number;
    implicitFacts: number;
  }> {
    if (!this.db) {
      return {
        totalMemories: 0,
        dailyCount: 0,
        knowledgeGraphEntities: 0,
        implicitFacts: 0,
      };
    }

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
    const dailyStmt = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'daily'");
    const implicitStmt = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'implicit'");

    let kgEntities = 0;
    const categories = ['people', 'companies', 'projects', 'technologies', 'concepts'];
    for (const category of categories) {
      const categoryPath = path.join(this.lifePath, 'areas', category);
      if (fs.existsSync(categoryPath)) {
        kgEntities += fs.readdirSync(categoryPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory()).length;
      }
    }

    return {
      totalMemories: (totalStmt.get() as any).count,
      dailyCount: (dailyStmt.get() as any).count,
      knowledgeGraphEntities: kgEntities,
      implicitFacts: (implicitStmt.get() as any).count,
    };
  }

  private getDefaultMemoryMd(): string {
    return `# MEMORY.md - Implicit Knowledge

## User Preferences

- Communication: Chinese

## Learned Patterns

## Important Facts

---
*This file records AI learned implicit knowledge about the user*
`;
  }

  private getDefaultUserMd(): string {
    return `# USER.md - User Profile

## Basic Information

## Work Domain

## Common Tools

## Communication Preferences

---
*This file records user basic information and preferences*
`;
  }
}
