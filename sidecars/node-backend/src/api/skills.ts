/**
 * Skills API - 技能管理接口
 *
 * 提供技能列表、安装、更新、删除等功能
 */

import { Router } from 'express';
import { skillLoader } from '../skills/loader.js';
import { skillRegistry } from '../skills/registry.js';
import { logger } from '../utils/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const router = Router();

/**
 * GET /api/skills - 获取所有技能列表
 */
router.get('/', (req, res) => {
  try {
    const skills = skillLoader.loadSkills();
    
    // 注册到 registry（用于统计）
    for (const skill of skills) {
      if (!skillRegistry.has(skill.name)) {
        skillRegistry.register(skill);
      }
    }
    
    res.json({
      success: true,
      data: {
        skills: skills.map(skill => ({
          name: skill.name,
          description: skill.description,
          version: skill.version,
          author: skill.author,
          tags: skill.tags,
          emoji: skill.metadata.chubao?.emoji || '🔧',
          priority: skill.metadata.chubao?.priority || 'normal',
        })),
        total: skills.length,
        stats: skillRegistry.getStats(),
      },
    });
  } catch (error) {
    logger.error('Failed to list skills', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to list skills',
    });
  }
});

/**
 * GET /api/skills/:name - 获取单个技能详情
 */
router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const skills = skillLoader.loadSkills();
    const skill = skills.find(s => s.name === name);
    
    if (!skill) {
      return res.status(404).json({
        success: false,
        error: `Skill '${name}' not found`,
      });
    }
    
    res.json({
      success: true,
      data: {
        name: skill.name,
        description: skill.description,
        version: skill.version,
        author: skill.author,
        tags: skill.tags,
        instructions: skill.instructions,
        metadata: skill.metadata,
        sourcePath: skill.sourcePath,
      },
    });
  } catch (error) {
    logger.error('Failed to get skill', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to get skill',
    });
  }
});

/**
 * POST /api/skills/install - 安装技能
 */
router.post('/install', async (req, res) => {
  try {
    const { name, source } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Skill name is required',
      });
    }
    
    // TODO: 从远程仓库下载技能
    // 目前仅支持本地安装
    logger.info(`Installing skill: ${name}`, { source });
    
    res.json({
      success: true,
      message: `Skill '${name}' installation queued`,
      data: { name, status: 'pending' },
    });
  } catch (error) {
    logger.error('Failed to install skill', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to install skill',
    });
  }
});

/**
 * POST /api/skills/reload - 重新加载所有技能
 */
router.post('/reload', (req, res) => {
  try {
    skillLoader.clearCache();
    const skills = skillLoader.loadSkills();
    
    res.json({
      success: true,
      message: `Reloaded ${skills.length} skills`,
      data: { total: skills.length },
    });
  } catch (error) {
    logger.error('Failed to reload skills', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to reload skills',
    });
  }
});

/**
 * DELETE /api/skills/:name - 删除技能
 */
router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const skillDir = path.join(process.cwd(), 'skills', name);
    
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({
        success: false,
        error: `Skill '${name}' not found`,
      });
    }
    
    // 删除技能目录
    fs.rmSync(skillDir, { recursive: true, force: true });
    skillRegistry.unregister(name);
    skillLoader.clearCache();
    
    logger.info(`Skill deleted: ${name}`);
    res.json({
      success: true,
      message: `Skill '${name}' deleted`,
    });
  } catch (error) {
    logger.error('Failed to delete skill', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete skill',
    });
  }
});

/**
 * GET /api/skills/tags/:tag - 按标签筛选技能
 */
router.get('/tags/:tag', (req, res) => {
  try {
    const { tag } = req.params;
    const skills = skillLoader.loadSkills();
    const filtered = skills.filter(s => s.tags.includes(tag));
    
    res.json({
      success: true,
      data: {
        tag,
        skills: filtered.map(skill => ({
          name: skill.name,
          description: skill.description,
          version: skill.version,
          tags: skill.tags,
        })),
        total: filtered.length,
      },
    });
  } catch (error) {
    logger.error('Failed to filter skills by tag', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to filter skills',
    });
  }
});

export default router;
