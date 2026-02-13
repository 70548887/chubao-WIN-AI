/**
 * 记忆管理器 - 三层记忆系统
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface MemoryItem {
  id: number;
  type: string;
  content: string;
  embedding?: number[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class MemoryManager {
  private db: Database.Database | null = null;
  private memoryPath: string;

  constructor(memoryPath?: string) {
    this.memoryPath = memoryPath || path.join(process.cwd(), '../../memory');
  }

  async init(): Promise<void> {
    // 确保记忆目录存在
    if (!fs.existsSync(this.memoryPath)) {
      fs.mkdirSync(this.memoryPath, { recursive: true });
    }

    // 初始化 SQLite 数据库
    const dbPath = path.join(this.memoryPath, 'memory.db');
    this.db = new Database(dbPath);

    // 创建表
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

    console.log('✅ 记忆系统初始化完成');
  }

  async search(query: string, limit: number = 10): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    // 简单文本搜索 (TODO: 向量搜索)
    const stmt = this.db.prepare(`
      SELECT content FROM memories 
      WHERE content LIKE ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    const results = stmt.all(`%${query}%`, limit) as { content: string }[];
    return results.map(r => r.content);
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
    // 添加到数据库
    await this.add('daily', content);

    // 同时写入 Markdown 文件
    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(this.memoryPath, 'daily');
    
    if (!fs.existsSync(dailyPath)) {
      fs.mkdirSync(dailyPath, { recursive: true });
    }

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
}
