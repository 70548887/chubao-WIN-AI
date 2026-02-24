/**
 * Files API - 文件操作接口
 *
 * 提供文件浏览、读取、写入功能
 */

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const router = Router();

// 工作区根目录（从 node-backend 向上两级）
const ROOT_DIR = path.resolve(process.cwd(), '..', '..');

// 允许访问的目录白名单
const ALLOWED_DIRS = [
  'src',
  'sidecars',
  'skills',
  'docs',
  'scripts',
  'config',
];

/**
 * 安全检查：确保路径在工作区内
 */
function isPathAllowed(targetPath: string): boolean {
  const resolvedPath = path.resolve(ROOT_DIR, targetPath);
  const relativePath = path.relative(ROOT_DIR, resolvedPath);
  
  // 防止路径遍历攻击
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false;
  }

  // 检查是否在白名单目录内
  const firstDir = relativePath.split(path.sep)[0];
  return ALLOWED_DIRS.includes(firstDir);
}

/**
 * 递归读取目录结构
 */
function readDirectory(dirPath: string): any[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  return entries
    .filter(entry => {
      // 隐藏文件和 node_modules 等目录
      if (entry.name.startsWith('.')) return false;
      if (entry.name === 'node_modules') return false;
      if (entry.name === 'dist') return false;
      if (entry.name === '__pycache__') return false;
      return true;
    })
    .map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(ROOT_DIR, fullPath);
      
      const node = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: relativePath.replace(/\\/g, '/'),
      };

      if (entry.isDirectory()) {
        try {
          (node as any).children = readDirectory(fullPath);
        } catch (error) {
          logger.warn(`Failed to read directory: ${fullPath}`);
        }
      }

      return node;
    })
    .sort((a, b) => {
      // 目录排在前面，然后按名称排序
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * GET /api/files/tree - 获取文件树
 */
router.get('/tree', (_req, res) => {
  try {
    const tree: any[] = [];

    for (const dir of ALLOWED_DIRS) {
      const dirPath = path.join(ROOT_DIR, dir);
      if (fs.existsSync(dirPath)) {
        try {
          const children = readDirectory(dirPath);
          tree.push({
            name: dir,
            type: 'directory',
            path: dir,
            children,
          });
        } catch (error) {
          logger.warn(`Failed to read directory: ${dir}`);
        }
      }
    }

    res.json({
      success: true,
      tree,
    });

  } catch (error) {
    logger.error('Failed to get file tree', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to get file tree',
    });
  }
});

/**
 * GET /api/files/read - 读取文件
 */
router.get('/read', (req, res) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
      });
    }

    if (!isPathAllowed(filePath)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const fullPath = path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: 'Path is a directory',
      });
    }

    // 限制文件大小（最大 5MB）
    if (stats.size > 5 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: 'File too large (max 5MB)',
      });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');

    res.json({
      success: true,
      path: filePath,
      content,
      size: stats.size,
      modified: stats.mtime,
    });

  } catch (error) {
    logger.error('Failed to read file', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to read file',
    });
  }
});

/**
 * POST /api/files/write - 写入文件
 */
router.post('/write', (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Path and content are required',
      });
    }

    if (!isPathAllowed(filePath)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const fullPath = path.join(ROOT_DIR, filePath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(fullPath, content, 'utf-8');

    logger.info('File written', { path: filePath });

    res.json({
      success: true,
      path: filePath,
    });

  } catch (error) {
    logger.error('Failed to write file', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to write file',
    });
  }
});

/**
 * DELETE /api/files/delete - 删除文件
 */
router.delete('/delete', (req, res) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'Path is required',
      });
    }

    if (!isPathAllowed(filePath)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const fullPath = path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    fs.unlinkSync(fullPath);

    logger.info('File deleted', { path: filePath });

    res.json({
      success: true,
      path: filePath,
    });

  } catch (error) {
    logger.error('Failed to delete file', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
    });
  }
});

export default router;
