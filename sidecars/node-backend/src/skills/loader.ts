/**
 * Skill Loader - 技能加载器
 *
 * 扫描 skills/ 目录，解析 SKILL.md，加载可用技能
 * 参考 OpenClaw 的 AgentSkills 规范
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';

export interface Skill {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  instructions: string;
  metadata: SkillMetadata;
  sourcePath: string;
}

export interface SkillMetadata {
  chubao?: {
    requires?: {
      os?: string[];
      bins?: string[];
      env?: string[];
    };
    priority?: 'high' | 'normal' | 'low';
    emoji?: string;
  };
}

export interface SkillLoaderOptions {
  skillsDir: string;
  workspaceDir?: string;
}

export class SkillLoader {
  private options: SkillLoaderOptions;
  private cachedSkills: Skill[] | null = null;

  constructor(options: SkillLoaderOptions) {
    this.options = {
      workspaceDir: options.skillsDir,
      ...options,
    };
  }

  /**
   * 加载所有可用技能
   */
  loadSkills(): Skill[] {
    if (this.cachedSkills) {
      return this.cachedSkills;
    }

    const skills: Skill[] = [];

    // 1. 加载内置技能 (bundled)
    const bundledSkills = this.loadSkillsFromDir(this.options.skillsDir);
    skills.push(...bundledSkills);

    // 2. 加载工作区技能 (workspace) - 优先级更高
    if (this.options.workspaceDir && this.options.workspaceDir !== this.options.skillsDir) {
      const workspaceSkills = this.loadSkillsFromDir(this.options.workspaceDir);
      // 工作区技能覆盖内置技能
      for (const wsSkill of workspaceSkills) {
        const existingIndex = skills.findIndex(s => s.name === wsSkill.name);
        if (existingIndex >= 0) {
          skills[existingIndex] = wsSkill;
          logger.info(`Workspace skill '${wsSkill.name}' overrides bundled skill`);
        } else {
          skills.push(wsSkill);
        }
      }
    }

    // 3. 按优先级排序
    skills.sort((a, b) => this.getPriorityScore(b) - this.getPriorityScore(a));

    this.cachedSkills = skills;
    logger.info(`Loaded ${skills.length} skills`, { skills: skills.map(s => s.name) });
    return skills;
  }

  /**
   * 从目录加载技能
   */
  private loadSkillsFromDir(dir: string): Skill[] {
    const skills: Skill[] = [];

    if (!fs.existsSync(dir)) {
      logger.warn(`Skills directory does not exist: ${dir}`);
      return skills;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(dir, entry.name);
      const skill = this.loadSkillFromPath(skillPath);

      if (skill && this.isSkillEligible(skill)) {
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * 从路径加载单个技能
   */
  private loadSkillFromPath(skillPath: string): Skill | null {
    const skillFile = path.join(skillPath, 'SKILL.md');

    if (!fs.existsSync(skillFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(skillFile, 'utf-8');
      return this.parseSkill(content, skillPath);
    } catch (error) {
      logger.error(`Failed to load skill from ${skillPath}`, error);
      return null;
    }
  }

  /**
   * 解析 SKILL.md 内容
   */
  private parseSkill(content: string, sourcePath: string): Skill {
    // 解析 frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md format: missing frontmatter');
    }

    const frontmatter = frontmatterMatch[1];
    const instructions = frontmatterMatch[2].trim();

    // 解析 YAML frontmatter
    const name = this.extractYamlValue(frontmatter, 'name') || path.basename(sourcePath);
    const description = this.extractYamlValue(frontmatter, 'description') || '';
    const version = this.extractYamlValue(frontmatter, 'version') || '1.0.0';
    const author = this.extractYamlValue(frontmatter, 'author') || 'unknown';
    const tags = this.extractYamlArray(frontmatter, 'tags') || [];

    // 解析 metadata JSON
    let metadata: SkillMetadata = {};
    const metadataMatch = frontmatter.match(/metadata:\s*[\r\n]+\s*(\{[\s\S]*\})/m);
    if (metadataMatch) {
      try {
        metadata = JSON.parse(metadataMatch[1]);
      } catch {
        logger.warn(`Failed to parse metadata for skill: ${name}`);
      }
    }

    return {
      name,
      description,
      version,
      author,
      tags,
      instructions,
      metadata,
      sourcePath,
    };
  }

  /**
   * 提取 YAML 值
   */
  private extractYamlValue(yaml: string, key: string): string | null {
    const match = yaml.match(new RegExp(`^${key}:\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  /**
   * 提取 YAML 数组
   */
  private extractYamlArray(yaml: string, key: string): string[] | null {
    const match = yaml.match(new RegExp(`^${key}:\s*\[(.*?)\]$`, 'm'));
    if (match) {
      return match[1].split(',').map(s => s.trim().replace(/["']/g, ''));
    }
    return null;
  }

  /**
   * 检查技能是否可用（条件过滤）
   */
  private isSkillEligible(skill: Skill): boolean {
    const requires = skill.metadata.chubao?.requires;
    if (!requires) return true;

    // 检查 OS
    if (requires.os && requires.os.length > 0) {
      const currentOs = process.platform;
      if (!requires.os.includes(currentOs)) {
        logger.debug(`Skill '${skill.name}' skipped: OS mismatch (${currentOs} not in ${requires.os.join(', ')})`);
        return false;
      }
    }

    // 检查环境变量
    if (requires.env) {
      for (const envVar of requires.env) {
        if (!process.env[envVar]) {
          logger.debug(`Skill '${skill.name}' skipped: missing env ${envVar}`);
          return false;
        }
      }
    }

    // 检查二进制文件（简化版，实际应该检查 PATH）
    if (requires.bins) {
      // TODO: 实现二进制文件检查
      logger.debug(`Skill '${skill.name}' bins check: ${requires.bins.join(', ')}`);
    }

    return true;
  }

  /**
   * 获取优先级分数（用于排序）
   */
  private getPriorityScore(skill: Skill): number {
    const priority = skill.metadata.chubao?.priority || 'normal';
    switch (priority) {
      case 'high': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * 清除缓存（用于热重载）
   */
  clearCache(): void {
    this.cachedSkills = null;
    logger.info('Skill cache cleared');
  }

  /**
   * 获取技能描述文本（用于系统提示）
   */
  formatSkillsForPrompt(skills: Skill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const lines = skills.map(skill => {
      const emoji = skill.metadata.chubao?.emoji || '🔧';
      return `- ${emoji} **${skill.name}**: ${skill.description}`;
    });

    const skillsList = lines.join('\n');
    const skillsDetail = skills.map(s => `\n### ${s.name}\n${s.instructions}`).join('\n');
    
    return `
## 可用技能
${skillsList}

## 技能详细说明
${skillsDetail}`;
  }
}

// 计算技能目录路径（从 node-backend 向上两级到根目录）
const rootDir = path.resolve(process.cwd(), '..', '..');

// 导出单例
export const skillLoader = new SkillLoader({
  skillsDir: path.join(rootDir, 'skills'),
  workspaceDir: path.join(rootDir, 'skills'),
});
