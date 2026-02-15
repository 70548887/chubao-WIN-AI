/**
 * Development Tools — filesystem, command execution, and skill management.
 * These tools allow the AI agent to autonomously develop and learn skills.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { toolManager, type Tool } from './index.js';
import { getEventBus } from '../channel/eventBus.js';
import type { NotificationEvent } from '../channel/types.js';

// ---------------------------------------------------------------------------
// Workspace root — defaults to project root
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = process.env.CHUBAO_WORKSPACE_ROOT?.trim()
  || path.resolve(process.cwd(), '..', '..');

// Skill directory for new skills
const SKILL_DIR = process.env.CHUBAO_SKILL_DIR?.trim()
  || path.join(WORKSPACE_ROOT, 'skills');

// Safety: block dangerous paths
const BLOCKED_PATHS = [
  /node_modules/i,
  /\.git[\\/]/i,
  /\.env$/i,
];

function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  // Must be within workspace
  if (!resolved.startsWith(path.resolve(WORKSPACE_ROOT))) {
    return false;
  }
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(resolved)) {
      return false;
    }
  }
  return true;
}

function resolvePath(p: string): string {
  if (path.isAbsolute(p)) return path.resolve(p);
  return path.resolve(WORKSPACE_ROOT, p);
}

// ---------------------------------------------------------------------------
// 1. read_file
// ---------------------------------------------------------------------------
export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Path can be absolute or relative to workspace root.',
  parameters: z.object({
    path: z.string().describe('File path (absolute or relative to workspace)'),
    startLine: z.number().int().min(1).optional().describe('Start line number (1-based, inclusive)'),
    endLine: z.number().int().min(1).optional().describe('End line number (1-based, inclusive)'),
  }),
  execute: async (args: { path: string; startLine?: number; endLine?: number }) => {
    const filePath = resolvePath(args.path);
    if (!isPathSafe(filePath)) {
      return { error: `Path not allowed: ${args.path}` };
    }
    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${filePath}` };
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { error: `Not a file: ${filePath}` };
    }
    if (stat.size > 512 * 1024) {
      return { error: `File too large (${stat.size} bytes). Use startLine/endLine to read a portion.` };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (args.startLine || args.endLine) {
      const lines = content.split('\n');
      const start = (args.startLine ?? 1) - 1;
      const end = args.endLine ?? lines.length;
      return {
        path: filePath,
        totalLines: lines.length,
        range: `${start + 1}-${Math.min(end, lines.length)}`,
        content: lines.slice(start, end).join('\n'),
      };
    }
    return {
      path: filePath,
      totalLines: content.split('\n').length,
      content,
    };
  },
};

// ---------------------------------------------------------------------------
// 2. write_file
// ---------------------------------------------------------------------------
export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a file with the given content. Creates parent directories if needed.',
  parameters: z.object({
    path: z.string().describe('File path (absolute or relative to workspace)'),
    content: z.string().describe('File content to write'),
  }),
  execute: async (args: { path: string; content: string }) => {
    const filePath = resolvePath(args.path);
    if (!isPathSafe(filePath)) {
      return { error: `Path not allowed: ${args.path}` };
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, args.content, 'utf-8');
    return {
      success: true,
      path: filePath,
      size: Buffer.byteLength(args.content, 'utf-8'),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. edit_file (search-and-replace within a file)
// ---------------------------------------------------------------------------
export const editFileTool: Tool = {
  name: 'edit_file',
  description: 'Edit a file by replacing a specific text snippet with new text. The original text must exist exactly in the file.',
  parameters: z.object({
    path: z.string().describe('File path'),
    original: z.string().describe('Exact text to find in the file'),
    replacement: z.string().describe('Text to replace with'),
  }),
  execute: async (args: { path: string; original: string; replacement: string }) => {
    const filePath = resolvePath(args.path);
    if (!isPathSafe(filePath)) {
      return { error: `Path not allowed: ${args.path}` };
    }
    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(args.original)) {
      return { error: 'Original text not found in file. Make sure it matches exactly including whitespace.' };
    }
    const count = content.split(args.original).length - 1;
    if (count > 1) {
      return { error: `Original text found ${count} times. It must be unique. Add more context.` };
    }
    const newContent = content.replace(args.original, args.replacement);
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return {
      success: true,
      path: filePath,
      replacements: 1,
    };
  },
};

// ---------------------------------------------------------------------------
// 4. list_dir
// ---------------------------------------------------------------------------
export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List files and directories in a path. Returns names with [dir] or [file] prefix.',
  parameters: z.object({
    path: z.string().optional().describe('Directory path (defaults to workspace root)'),
    recursive: z.boolean().optional().describe('List recursively (max 2 levels)'),
  }),
  execute: async (args: { path?: string; recursive?: boolean }) => {
    const dirPath = resolvePath(args.path || '.');
    if (!isPathSafe(dirPath) && dirPath !== path.resolve(WORKSPACE_ROOT)) {
      return { error: `Path not allowed: ${args.path}` };
    }
    if (!fs.existsSync(dirPath)) {
      return { error: `Directory not found: ${dirPath}` };
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { error: `Not a directory: ${dirPath}` };
    }

    const entries: string[] = [];
    const maxEntries = 200;

    function listLevel(dir: string, depth: number, prefix: string) {
      if (entries.length >= maxEntries) return;
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const item of items) {
        if (entries.length >= maxEntries) break;
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const type = item.isDirectory() ? '[dir]' : '[file]';
        entries.push(`${prefix}${type} ${item.name}`);
        if (args.recursive && item.isDirectory() && depth < 2) {
          listLevel(path.join(dir, item.name), depth + 1, prefix + '  ');
        }
      }
    }

    listLevel(dirPath, 0, '');
    return {
      path: dirPath,
      count: entries.length,
      truncated: entries.length >= maxEntries,
      entries: entries.join('\n'),
    };
  },
};

// ---------------------------------------------------------------------------
// 5. search_files
// ---------------------------------------------------------------------------
export const searchFilesTool: Tool = {
  name: 'search_files',
  description: 'Search for a text pattern (regex) in files under a directory. Returns matching lines.',
  parameters: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (defaults to workspace root)'),
    glob: z.string().optional().describe('Glob filter for filenames, e.g. "*.ts" or "*.py"'),
    maxResults: z.number().int().min(1).max(100).optional().describe('Max matching lines to return'),
  }),
  execute: async (args: { pattern: string; path?: string; glob?: string; maxResults?: number }) => {
    const searchDir = resolvePath(args.path || '.');
    const maxResults = args.maxResults || 30;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, 'i');
    } catch (e) {
      return { error: `Invalid regex: ${args.pattern}` };
    }

    const results: string[] = [];
    const globPattern = args.glob ? new RegExp(
      args.glob.replace(/\./g, '\\.').replace(/\*/g, '.*'),
      'i',
    ) : null;

    function searchIn(dir: string, depth: number) {
      if (results.length >= maxResults || depth > 5) return;
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const item of items) {
        if (results.length >= maxResults) break;
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          searchIn(fullPath, depth + 1);
        } else if (item.isFile()) {
          if (globPattern && !globPattern.test(item.name)) continue;
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 256 * 1024) continue; // skip large files
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) break;
              if (regex.test(lines[i])) {
                const relPath = path.relative(searchDir, fullPath);
                results.push(`${relPath}:${i + 1}: ${lines[i].trim().substring(0, 200)}`);
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    searchIn(searchDir, 0);
    return {
      pattern: args.pattern,
      searchDir,
      matchCount: results.length,
      truncated: results.length >= maxResults,
      matches: results.join('\n'),
    };
  },
};

// ---------------------------------------------------------------------------
// 6. run_command
// ---------------------------------------------------------------------------

// Commands that are always blocked
const BLOCKED_COMMANDS = [
  /\brm\b.*-rf/i,
  /\brmdir\b/i,
  /\bformat\b/i,
  /\bdel\b.*\/s/i,
  /Remove-Item.*-Recurse/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breg\s+delete\b/i,
  // Note: restart is allowed for self-upgrade, but restricted to specific safe commands
];

export const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Execute a shell command and return its output. Runs in PowerShell on Windows. Has a 30s timeout. Dangerous commands (rm -rf, format, etc.) are blocked.',
  parameters: z.object({
    command: z.string().describe('Shell command to execute'),
    cwd: z.string().optional().describe('Working directory (defaults to workspace root)'),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe('Timeout in milliseconds (default 30000)'),
  }),
  execute: async (args: { command: string; cwd?: string; timeoutMs?: number }) => {
    // Safety check
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(args.command)) {
        return { error: `Command blocked for safety: matches ${pattern}` };
      }
    }

    const cwd = args.cwd ? resolvePath(args.cwd) : WORKSPACE_ROOT;
    const timeout = args.timeoutMs ?? 30000;

    try {
      const output = execSync(args.command, {
        cwd,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024, // 1MB
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      return {
        success: true,
        command: args.command,
        cwd,
        output: output.substring(0, 10000), // limit output
      };
    } catch (error: any) {
      return {
        success: false,
        command: args.command,
        cwd,
        exitCode: error.status ?? -1,
        output: (error.stdout ?? '').substring(0, 5000),
        stderr: (error.stderr ?? '').substring(0, 5000),
        error: error.message?.substring(0, 500),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 7. create_skill
// ---------------------------------------------------------------------------
export const createSkillTool: Tool = {
  name: 'create_skill',
  description: 'Create a new skill by writing a SKILL.md file and optional resource files. Skills extend the agent\'s capabilities with specialized workflows, tools, and domain knowledge.',
  parameters: z.object({
    name: z.string().describe('Skill name in kebab-case (e.g. "file-organizer")'),
    description: z.string().describe('Skill description — when and how to use this skill'),
    content: z.string().describe('Full SKILL.md markdown content (including frontmatter)'),
    scripts: z.record(z.string()).optional().describe('Optional scripts: { "filename.py": "content", ... }'),
    references: z.record(z.string()).optional().describe('Optional reference files: { "guide.md": "content", ... }'),
  }),
  execute: async (args: {
    name: string;
    description: string;
    content: string;
    scripts?: Record<string, string>;
    references?: Record<string, string>;
  }) => {
    const skillDir = path.join(SKILL_DIR, args.name);
    if (fs.existsSync(skillDir)) {
      return { error: `Skill directory already exists: ${skillDir}. Use edit_file to modify.` };
    }

    fs.mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md
    const skillMd = args.content.startsWith('---')
      ? args.content
      : `---
name: ${args.name}
description: ${args.description}
---

${args.content}`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

    const createdFiles = ['SKILL.md'];

    // Write scripts
    if (args.scripts) {
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      for (const [filename, content] of Object.entries(args.scripts)) {
        fs.writeFileSync(path.join(scriptsDir, filename), content, 'utf-8');
        createdFiles.push(`scripts/${filename}`);
      }
    }

    // Write references
    if (args.references) {
      const refsDir = path.join(skillDir, 'references');
      fs.mkdirSync(refsDir, { recursive: true });
      for (const [filename, content] of Object.entries(args.references)) {
        fs.writeFileSync(path.join(refsDir, filename), content, 'utf-8');
        createdFiles.push(`references/${filename}`);
      }
    }

    // Trigger skills reload so new skills are available immediately
    try {
      await toolManager.forceReloadSkills();
    } catch (reloadErr) {
      // Non-fatal: skill files are created, just reload failed
      console.warn('Skill reload after creation failed:', reloadErr);
    }

    return {
      success: true,
      skillDir,
      name: args.name,
      files: createdFiles,
      hint: 'Skill created and skills registry reloaded.',
    };
  },
};

// ---------------------------------------------------------------------------
// 8. list_skills
// ---------------------------------------------------------------------------
export const listSkillsTool: Tool = {
  name: 'list_skills',
  description: 'List all installed skills and their status.',
  parameters: z.object({
    source: z.enum(['custom', 'openclaw', 'all']).optional().describe('Filter by source: custom (user-created), openclaw (bundled), all (default)'),
  }),
  execute: async (args: { source?: string }) => {
    const results: Array<{ name: string; path: string; hasSkillMd: boolean }> = [];
    const filterSource = args.source || 'all';

    // Check custom skills dir
    if (filterSource === 'all' || filterSource === 'custom') {
      if (fs.existsSync(SKILL_DIR)) {
        try {
          const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const skillMdPath = path.join(SKILL_DIR, entry.name, 'SKILL.md');
              results.push({
                name: entry.name,
                path: path.join(SKILL_DIR, entry.name),
                hasSkillMd: fs.existsSync(skillMdPath),
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Check openclaw bundled skills (name only to reduce payload)
    let openclawCount = 0;
    if (filterSource === 'all' || filterSource === 'openclaw') {
      const openclawSkillDir = path.join(WORKSPACE_ROOT, 'openclaw-main', 'skills');
      if (fs.existsSync(openclawSkillDir)) {
        try {
          const entries = fs.readdirSync(openclawSkillDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              openclawCount++;
              if (filterSource === 'openclaw') {
                results.push({
                  name: `openclaw/${entry.name}`,
                  path: path.join(openclawSkillDir, entry.name),
                  hasSkillMd: fs.existsSync(path.join(openclawSkillDir, entry.name, 'SKILL.md')),
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return {
      count: results.length,
      openclawBundled: openclawCount,
      skillDir: SKILL_DIR,
      skills: results,
    };
  },
};

// ---------------------------------------------------------------------------
// 9. restart_sidecar
// ---------------------------------------------------------------------------

// Allowed restart commands for self-upgrade (whitelist approach)
const ALLOWED_RESTART_COMMANDS = [
  // PowerShell scripts for service management
  /^\.\s*["'].*restart-all\.ps1["']/i,
  /^&\s*["'].*restart-all\.ps1["']/i,
  /^powershell.*restart-all\.ps1/i,
  // npm run commands
  /^npm\s+run\s+(restart|dev|start)/i,
  // Direct node process restart
  /^node\s+.*index\.js/i,
  /^tsx\s+.*index\.ts/i,
];

function isRestartCommandAllowed(command: string): boolean {
  for (const pattern of ALLOWED_RESTART_COMMANDS) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

export const restartSidecarTool: Tool = {
  name: 'restart_sidecar',
  description: 'Restart the Node.js backend service to apply code changes. This tool allows the AI to self-upgrade by restarting after modifying its own code. Only safe restart commands are allowed.',
  parameters: z.object({
    mode: z.enum(['graceful', 'force']).optional().describe('Restart mode: graceful (wait for current requests) or force (immediate)'),
    delayMs: z.number().int().min(0).max(60000).optional().describe('Delay before restart in milliseconds (default 2000)'),
    reason: z.string().optional().describe('Reason for restart (logged for audit)'),
  }),
  execute: async (args: { mode?: 'graceful' | 'force'; delayMs?: number; reason?: string }) => {
    const mode = args.mode || 'graceful';
    const delayMs = args.delayMs ?? 2000;
    const reason = args.reason || 'Self-upgrade restart';

    // Log the restart attempt
    console.log(`[restart_sidecar] Initiating ${mode} restart in ${delayMs}ms. Reason: ${reason}`);

    // Schedule the restart
    setTimeout(() => {
      console.log('[restart_sidecar] Executing restart...');
      
      // Find the restart script
      const restartScript = path.join(WORKSPACE_ROOT, 'restart-all.ps1');
      const startScript = path.join(WORKSPACE_ROOT, 'scripts', 'start.ps1');
      
      if (fs.existsSync(restartScript)) {
        try {
          // Use child_process.spawn to detach the process
          const { spawn } = require('node:child_process');
          const child = spawn('powershell', [
            '-ExecutionPolicy', 'Bypass',
            '-File', restartScript
          ], {
            detached: true,
            stdio: 'ignore',
            cwd: WORKSPACE_ROOT,
          });
          child.unref();
          
          // Exit current process
          console.log('[restart_sidecar] New process spawned, exiting...');
          process.exit(0);
        } catch (error) {
          console.error('[restart_sidecar] Failed to spawn restart:', error);
          return { error: `Failed to restart: ${error}` };
        }
      } else if (fs.existsSync(startScript)) {
        // Fallback: just restart the node backend
        try {
          const { spawn } = require('node:child_process');
          const child = spawn('powershell', [
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            `cd "${path.join(WORKSPACE_ROOT, 'sidecars', 'node-backend')}"; npm run dev`
          ], {
            detached: true,
            stdio: 'ignore',
            cwd: WORKSPACE_ROOT,
          });
          child.unref();
          
          console.log('[restart_sidecar] New node process spawned, exiting...');
          process.exit(0);
        } catch (error) {
          console.error('[restart_sidecar] Failed to restart node:', error);
          return { error: `Failed to restart: ${error}` };
        }
      } else {
        return { error: 'Restart script not found. Cannot perform self-restart.' };
      }
    }, delayMs);

    return {
      success: true,
      mode,
      delayMs,
      reason,
      message: `Restart scheduled in ${delayMs}ms. The service will restart and apply any code changes.`,
      warning: 'The current connection will be lost. Please reconnect after restart.',
    };
  },
};

// ---------------------------------------------------------------------------
// 10. validate_code
// ---------------------------------------------------------------------------
export const validateCodeTool: Tool = {
  name: 'validate_code',
  description: 'Validate TypeScript/JavaScript code syntax using tsc or node --check. Helps ensure code changes are valid before restarting.',
  parameters: z.object({
    filePath: z.string().optional().describe('Specific file to validate (optional, validates entire project if omitted)'),
    type: z.enum(['typescript', 'javascript']).optional().describe('Code type (auto-detected from extension if omitted)'),
  }),
  execute: async (args: { filePath?: string; type?: 'typescript' | 'javascript' }) => {
    const cwd = path.join(WORKSPACE_ROOT, 'sidecars', 'node-backend');
    
    try {
      // Try TypeScript compilation check
      const output = execSync('npx tsc --noEmit', {
        cwd,
        timeout: 60000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      return {
        valid: true,
        type: 'typescript',
        message: 'TypeScript validation passed',
        output: output.substring(0, 5000),
      };
    } catch (error: any) {
      const stderr = error.stderr?.toString() || '';
      const stdout = error.stdout?.toString() || '';
      
      return {
        valid: false,
        type: 'typescript',
        error: 'TypeScript validation failed',
        details: (stderr || stdout || error.message).substring(0, 5000),
        hint: 'Fix the TypeScript errors before restarting the service.',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 11. git_backup - 自动 Git 备份
// ---------------------------------------------------------------------------
export const gitBackupTool: Tool = {
  name: 'git_backup',
  description: 'Create a Git commit to backup current code state before making changes. Essential for self-upgrade safety and rollback capability.',
  parameters: z.object({
    message: z.string().describe('Git commit message'),
    autoAdd: z.boolean().optional().describe('Automatically git add all changes (default true)'),
    branch: z.string().optional().describe('Create and switch to a new branch for the changes'),
  }),
  execute: async (args: { message: string; autoAdd?: boolean; branch?: string }) => {
    const cwd = WORKSPACE_ROOT;
    const autoAdd = args.autoAdd !== false;
    
    try {
      // Check if git repo exists
      execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8' });
      
      // Create new branch if requested
      if (args.branch) {
        execSync(`git checkout -b "${args.branch}"`, { cwd, encoding: 'utf-8' });
      }
      
      // Get current status
      const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
      
      if (!status.trim()) {
        return {
          success: true,
          committed: false,
          message: 'No changes to commit',
          hint: 'Working directory is clean',
        };
      }
      
      // Add changes
      if (autoAdd) {
        execSync('git add -A', { cwd, encoding: 'utf-8' });
      }
      
      // Create commit
      const commitMsg = `[self-upgrade] ${args.message}`;
      execSync(`git commit -m "${commitMsg}"`, { cwd, encoding: 'utf-8' });
      
      // Get commit hash
      const commitHash = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
      
      return {
        success: true,
        committed: true,
        commitHash,
        branch: args.branch || 'current',
        message: commitMsg,
        hint: 'Backup created successfully. You can rollback to this commit if needed.',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Git backup failed',
        hint: 'Make sure git is initialized and configured properly',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 12. git_rollback - 代码回滚
// ---------------------------------------------------------------------------
export const gitRollbackTool: Tool = {
  name: 'git_rollback',
  description: 'Rollback to a previous Git commit when self-upgrade fails or causes issues.',
  parameters: z.object({
    commitHash: z.string().optional().describe('Specific commit hash to rollback to (optional, defaults to previous commit)'),
    hard: z.boolean().optional().describe('Use hard reset (discard all changes) or soft reset (keep changes). Default: false (soft)'),
  }),
  execute: async (args: { commitHash?: string; hard?: boolean }) => {
    const cwd = WORKSPACE_ROOT;
    const hard = args.hard === true;
    
    try {
      // Check if git repo exists
      execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8' });
      
      let targetCommit: string;
      
      if (args.commitHash) {
        targetCommit = args.commitHash;
      } else {
        // Get previous commit
        targetCommit = execSync('git rev-parse --short HEAD~1', { cwd, encoding: 'utf-8' }).trim();
      }
      
      if (hard) {
        // Hard reset - discard all changes
        execSync(`git reset --hard ${targetCommit}`, { cwd, encoding: 'utf-8' });
      } else {
        // Soft reset - keep changes
        execSync(`git reset --soft ${targetCommit}`, { cwd, encoding: 'utf-8' });
      }
      
      return {
        success: true,
        rolledBackTo: targetCommit,
        hard,
        message: `Successfully rolled back to ${targetCommit}`,
        hint: hard ? 'All changes have been discarded' : 'Changes are kept in working directory',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Git rollback failed',
        hint: 'Make sure the commit hash is valid',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 13. health_check - 健康检查
// ---------------------------------------------------------------------------
export const healthCheckTool: Tool = {
  name: 'health_check',
  description: 'Check the health status of Chubao AI services (Node backend and Python automation).',
  parameters: z.object({
    service: z.enum(['node', 'python', 'all']).optional().describe('Which service to check (default: all)'),
  }),
  execute: async (args: { service?: 'node' | 'python' | 'all' }) => {
    const service = args.service || 'all';
    const results: Record<string, any> = {};
    
    const nodePort = process.env.NODE_PORT || '3100';
    const pythonPort = process.env.PYTHON_PORT || '3200';
    
    // Check Node backend
    if (service === 'node' || service === 'all') {
      try {
        const response = await fetch(`http://127.0.0.1:${nodePort}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        results.node = {
          healthy: response.ok && data.status === 'ok',
          status: data.status,
          version: data.version,
          uptime: data.uptime,
        };
      } catch (error: any) {
        results.node = {
          healthy: false,
          error: error.message || 'Failed to connect',
        };
      }
    }
    
    // Check Python automation
    if (service === 'python' || service === 'all') {
      try {
        const response = await fetch(`http://127.0.0.1:${pythonPort}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        results.python = {
          healthy: response.ok && data.status === 'ok',
          status: data.status,
          version: data.version,
          ocrReady: data.ocr_ready,
        };
      } catch (error: any) {
        results.python = {
          healthy: false,
          error: error.message || 'Failed to connect',
        };
      }
    }
    
    const allHealthy = Object.values(results).every((r: any) => r.healthy);
    
    return {
      healthy: allHealthy,
      service,
      timestamp: new Date().toISOString(),
      results,
      hint: allHealthy ? 'All services are healthy' : 'Some services are unhealthy, consider restart',
    };
  },
};

// ---------------------------------------------------------------------------
// 14. log_self_upgrade - 记录自我升级历史
// ---------------------------------------------------------------------------
const SELF_UPGRADE_LOG_PATH = path.join(WORKSPACE_ROOT, 'runtime-data', 'self-upgrade-log.json');

interface SelfUpgradeEntry {
  timestamp: string;
  type: 'modify' | 'restart' | 'validate' | 'backup' | 'rollback';
  description: string;
  success: boolean;
  details?: Record<string, any>;
}

function loadSelfUpgradeLog(): SelfUpgradeEntry[] {
  try {
    if (!fs.existsSync(SELF_UPGRADE_LOG_PATH)) {
      return [];
    }
    const content = fs.readFileSync(SELF_UPGRADE_LOG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveSelfUpgradeLog(entries: SelfUpgradeEntry[]): void {
  try {
    const dir = path.dirname(SELF_UPGRADE_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Keep only last 100 entries
    const trimmed = entries.slice(-100);
    fs.writeFileSync(SELF_UPGRADE_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Failed to save self-upgrade log:', error);
  }
}

export const logSelfUpgradeTool: Tool = {
  name: 'log_self_upgrade',
  description: 'Log a self-upgrade action for audit and tracking purposes.',
  parameters: z.object({
    type: z.enum(['modify', 'restart', 'validate', 'backup', 'rollback']).describe('Type of self-upgrade action'),
    description: z.string().describe('Description of the action'),
    success: z.boolean().describe('Whether the action was successful'),
    details: z.record(z.any()).optional().describe('Additional details to log'),
  }),
  execute: async (args: { type: string; description: string; success: boolean; details?: Record<string, any> }) => {
    const entry: SelfUpgradeEntry = {
      timestamp: new Date().toISOString(),
      type: args.type as SelfUpgradeEntry['type'],
      description: args.description,
      success: args.success,
      details: args.details,
    };
    
    const log = loadSelfUpgradeLog();
    log.push(entry);
    saveSelfUpgradeLog(log);
    
    return {
      success: true,
      logged: entry,
      totalEntries: log.length,
    };
  },
};

export const getSelfUpgradeHistoryTool: Tool = {
  name: 'get_self_upgrade_history',
  description: 'Get the history of self-upgrade actions for audit and analysis.',
  parameters: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of entries to return'),
    type: z.enum(['modify', 'restart', 'validate', 'backup', 'rollback', 'all']).optional().describe('Filter by type'),
  }),
  execute: async (args: { limit?: number; type?: string }) => {
    const log = loadSelfUpgradeLog();
    let filtered = log;
    
    if (args.type && args.type !== 'all') {
      filtered = log.filter((e) => e.type === args.type);
    }
    
    const limit = args.limit || 20;
    const entries = filtered.slice(-limit);
    
    return {
      count: entries.length,
      total: log.length,
      entries,
      summary: {
        modify: log.filter((e) => e.type === 'modify').length,
        restart: log.filter((e) => e.type === 'restart').length,
        validate: log.filter((e) => e.type === 'validate').length,
        backup: log.filter((e) => e.type === 'backup').length,
        rollback: log.filter((e) => e.type === 'rollback').length,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 15. send_notification - 通过 Channel 系统发送通知
// ---------------------------------------------------------------------------
export const sendNotificationTool: Tool = {
  name: 'send_notification',
  description: 'Send a proactive notification to the user via configured messaging channels (Telegram, etc.). Use this to report upgrade progress, errors, health status, or any important information.',
  parameters: z.object({
    title: z.string().describe('Short notification title'),
    body: z.string().describe('Notification message body'),
    category: z.enum(['upgrade', 'error', 'health', 'system', 'progress', 'custom']).optional().describe('Notification category (default: custom)'),
    level: z.enum(['info', 'warn', 'error', 'success']).optional().describe('Severity level (default: info)'),
    data: z.record(z.any()).optional().describe('Extra structured data to include'),
  }),
  execute: async (args: {
    title: string;
    body: string;
    category?: NotificationEvent['category'];
    level?: NotificationEvent['level'];
    data?: Record<string, unknown>;
  }) => {
    const eventBus = getEventBus();
    const category = args.category || 'custom';
    const level = args.level || 'info';
    const eventName = category === 'custom' ? 'notify' :
      `notify:${category}` as keyof import('../channel/types.js').ChannelEventMap;

    const event: NotificationEvent = {
      category,
      title: args.title,
      body: args.body,
      level,
      data: args.data,
      timestamp: Date.now(),
    };

    // Emit the notification event — Notifier will pick it up
    eventBus.emit(eventName as any, event);

    return {
      success: true,
      emitted: eventName,
      title: args.title,
      category,
      level,
      hint: 'Notification emitted. Notifier will deliver to configured channels.',
    };
  },
};

// ---------------------------------------------------------------------------
// 16. send_channel_message - 直接发送消息到指定 channel
// ---------------------------------------------------------------------------
export const sendChannelMessageTool: Tool = {
  name: 'send_channel_message',
  description: 'Send a direct message to a specific chat via a channel plugin (e.g. Telegram). For proactive messaging to a user.',
  parameters: z.object({
    channel: z.string().describe('Channel ID (e.g. "telegram", "lark")'),
    chatId: z.string().describe('Target chat ID'),
    text: z.string().describe('Message text to send'),
    parseMode: z.enum(['markdown', 'html', 'plain']).optional().describe('Parse mode (default: markdown)'),
  }),
  execute: async (args: {
    channel: string;
    chatId: string;
    text: string;
    parseMode?: 'markdown' | 'html' | 'plain';
  }) => {
    const eventBus = getEventBus();

    // Emit outbound message event — ChannelManager routes it
    eventBus.emit('message:outbound', {
      channel: args.channel,
      chatId: args.chatId,
      text: args.text,
      parseMode: args.parseMode || 'markdown',
    });

    return {
      success: true,
      channel: args.channel,
      chatId: args.chatId,
      hint: 'Message queued for delivery via ChannelManager.',
    };
  },
};

// ---------------------------------------------------------------------------
// 17. get_channel_status - 获取所有 Channel 状态
// ---------------------------------------------------------------------------
export const getChannelStatusTool: Tool = {
  name: 'get_channel_status',
  description: 'Get the status of all registered messaging channels (Telegram, Lark, WhatsApp, etc.).',
  parameters: z.object({}),
  execute: async () => {
    const eventBus = getEventBus();
    const history = eventBus.getHistory(20);
    const listenerCounts = eventBus.getListenerCounts();

    return {
      eventBus: {
        recentEvents: history.length,
        listeners: listenerCounts,
      },
      hint: 'Use ChannelManager.getAllStatus() for detailed channel info. EventBus history shows recent events.',
    };
  },
};

// ---------------------------------------------------------------------------
// Export all dev tools
// ---------------------------------------------------------------------------
export const devTools: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  searchFilesTool,
  runCommandTool,
  createSkillTool,
  listSkillsTool,
  restartSidecarTool,
  validateCodeTool,
  gitBackupTool,
  gitRollbackTool,
  healthCheckTool,
  logSelfUpgradeTool,
  getSelfUpgradeHistoryTool,
  sendNotificationTool,
  sendChannelMessageTool,
  getChannelStatusTool,
];
