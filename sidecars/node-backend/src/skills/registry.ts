/**
 * Skill Registry - 技能注册表
 *
 * 管理已加载的技能，提供查询和热重载功能
 */

import type { Skill } from './loader.js';
import { logger } from '../utils/logger.js';

export interface SkillRegistryEntry extends Skill {
  loadedAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export class SkillRegistry {
  private skills: Map<string, SkillRegistryEntry> = new Map();
  private listeners: Array<(skills: SkillRegistryEntry[]) => void> = [];

  /**
   * 注册技能
   */
  register(skill: Skill): void {
    const existing = this.skills.get(skill.name);
    
    const entry: SkillRegistryEntry = {
      ...skill,
      loadedAt: existing?.loadedAt || new Date(),
      lastUsedAt: existing?.lastUsedAt,
      useCount: existing?.useCount || 0,
    };

    this.skills.set(skill.name, entry);
    logger.debug(`Skill registered: ${skill.name} v${skill.version}`);
    this.notifyListeners();
  }

  /**
   * 批量注册技能
   */
  registerAll(skills: Skill[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
    logger.info(`Registered ${skills.length} skills`);
  }

  /**
   * 获取技能
   */
  get(name: string): SkillRegistryEntry | undefined {
    const skill = this.skills.get(name);
    if (skill) {
      skill.lastUsedAt = new Date();
      skill.useCount++;
    }
    return skill;
  }

  /**
   * 获取所有技能
   */
  getAll(): SkillRegistryEntry[] {
    return Array.from(this.skills.values());
  }

  /**
   * 按标签筛选技能
   */
  getByTag(tag: string): SkillRegistryEntry[] {
    return this.getAll().filter(skill => skill.tags.includes(tag));
  }

  /**
   * 搜索技能
   */
  search(query: string): SkillRegistryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(skill => 
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 取消注册技能
   */
  unregister(name: string): boolean {
    const deleted = this.skills.delete(name);
    if (deleted) {
      logger.debug(`Skill unregistered: ${name}`);
      this.notifyListeners();
    }
    return deleted;
  }

  /**
   * 清空所有技能
   */
  clear(): void {
    this.skills.clear();
    logger.info('Skill registry cleared');
    this.notifyListeners();
  }

  /**
   * 检查技能是否存在
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 获取技能数量
   */
  size(): number {
    return this.skills.size;
  }

  /**
   * 获取使用统计
   */
  getStats(): {
    total: number;
    mostUsed: SkillRegistryEntry | null;
    neverUsed: SkillRegistryEntry[];
  } {
    const all = this.getAll();
    const mostUsed = all.length > 0 
      ? all.reduce((max, skill) => skill.useCount > max.useCount ? skill : max)
      : null;
    const neverUsed = all.filter(skill => skill.useCount === 0);

    return {
      total: all.length,
      mostUsed,
      neverUsed,
    };
  }

  /**
   * 订阅技能变化
   */
  subscribe(listener: (skills: SkillRegistryEntry[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const skills = this.getAll();
    for (const listener of this.listeners) {
      try {
        listener(skills);
      } catch (error) {
        logger.error('Skill registry listener error', { error: (error as Error).message });
      }
    }
  }

  /**
   * 导出为 JSON
   */
  toJSON(): object {
    return {
      skills: this.getAll().map(skill => ({
        name: skill.name,
        version: skill.version,
        description: skill.description,
        tags: skill.tags,
        loadedAt: skill.loadedAt.toISOString(),
        lastUsedAt: skill.lastUsedAt?.toISOString(),
        useCount: skill.useCount,
      })),
      stats: this.getStats(),
    };
  }
}

// 导出单例
export const skillRegistry = new SkillRegistry();
