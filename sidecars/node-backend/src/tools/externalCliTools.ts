/**
 * External AI CLI Tools — call Claude Code, OpenCode, Cursor, etc.
 *
 * These tools allow Chubao AI to delegate complex coding tasks to
 * specialized AI coding terminals, enabling "AI drives AI" development.
 */

import { z } from 'zod';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import type { Tool } from './index.js';

// ---------------------------------------------------------------------------
// Workspace root
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = process.env.CHUBAO_WORKSPACE_ROOT?.trim()
  || path.resolve(process.cwd(), '..', '..');

// ---------------------------------------------------------------------------
// CLI Detection & Validation
// ---------------------------------------------------------------------------

interface CliInfo {
  name: string;
  available: boolean;
  path?: string;
  version?: string;
}

function detectCli(command: string): CliInfo {
  try {
    const result = execSync(`where ${command}`, { encoding: 'utf-8', windowsHide: true });
    const cliPath = result.trim().split('\n')[0];
    
    // Try to get version
    let version: string | undefined;
    try {
      const verResult = execSync(`${command} --version`, { 
        encoding: 'utf-8', 
        windowsHide: true,
        timeout: 5000 
      });
      version = verResult.trim().substring(0, 100);
    } catch {
      // Version check failed, but CLI is available
    }
    
    return {
      name: command,
      available: true,
      path: cliPath,
      version,
    };
  } catch {
    return {
      name: command,
      available: false,
    };
  }
}

// Cache CLI detection results
const cliCache: Map<string, CliInfo> = new Map();

function getCliInfo(command: string): CliInfo {
  if (!cliCache.has(command)) {
    cliCache.set(command, detectCli(command));
  }
  return cliCache.get(command)!;
}

// ---------------------------------------------------------------------------
// 19. call_claude_code — Call Claude Code CLI
// ---------------------------------------------------------------------------

export const callClaudeCodeTool: Tool = {
  name: 'call_claude_code',
  description: 'Call Claude Code CLI to perform complex coding tasks. Claude Code is an AI coding terminal that can read files, write code, run commands, and more. Use this to delegate complex development work to a specialized AI agent.',
  parameters: z.object({
    prompt: z.string().describe('The task description for Claude Code. Be specific about what files to modify and what the goal is.'),
    cwd: z.string().optional().describe('Working directory for Claude Code (default: workspace root)'),
    timeoutSeconds: z.number().int().min(30).max(1800).optional().describe('Timeout in seconds (default: 300, max: 30 minutes)'),
    allowEdits: z.boolean().optional().describe('Allow Claude Code to edit files (default: true)'),
  }),
  execute: async (args: {
    prompt: string;
    cwd?: string;
    timeoutSeconds?: number;
    allowEdits?: boolean;
  }) => {
    const cliInfo = getCliInfo('claude');
    
    if (!cliInfo.available) {
      return {
        success: false,
        error: 'Claude Code CLI not found. Please install it: npm install -g @anthropic-ai/claude-code',
        hint: 'Visit https://docs.anthropic.com/en/docs/claude-code/installation',
      };
    }

    const cwd = args.cwd ? path.resolve(WORKSPACE_ROOT, args.cwd) : WORKSPACE_ROOT;
    const timeout = (args.timeoutSeconds ?? 300) * 1000;
    const allowEdits = args.allowEdits !== false;

    // Build Claude Code command
    // -p: Print mode (non-interactive)
    // --dangerously-skip-permissions: Skip permission prompts (use with caution)
    const flags = ['-p'];
    if (allowEdits) {
      flags.push('--dangerously-skip-permissions');
    }

    const command = `claude ${flags.join(' ')} ${escapeShellArg(args.prompt)}`;

    console.log(`[call_claude_code] Executing: ${command.substring(0, 200)}...`);
    console.log(`[call_claude_code] Working directory: ${cwd}`);

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
      });

      return {
        success: true,
        cli: 'claude-code',
        version: cliInfo.version,
        prompt: args.prompt.substring(0, 200),
        output: output.substring(0, 50000), // Limit output size
        outputLength: output.length,
        cwd,
        hint: 'Claude Code completed successfully. Check the output for results.',
      };
    } catch (error: any) {
      const errorOutput = error.stdout?.toString() || '';
      const stderr = error.stderr?.toString() || '';
      
      return {
        success: false,
        cli: 'claude-code',
        error: error.message || 'Claude Code execution failed',
        exitCode: error.status,
        output: errorOutput.substring(0, 10000),
        stderr: stderr.substring(0, 10000),
        hint: error.status === 'ETIMEDOUT' 
          ? 'Execution timed out. Try increasing timeoutSeconds.' 
          : 'Check the error output for details.',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 20. call_opencode — Call OpenCode CLI
// ---------------------------------------------------------------------------

export const callOpencodeTool: Tool = {
  name: 'call_opencode',
  description: 'Call OpenCode CLI to perform coding tasks. OpenCode is an open-source AI coding assistant similar to Claude Code. Use this as an alternative AI coding terminal.',
  parameters: z.object({
    prompt: z.string().describe('The task description for OpenCode.'),
    cwd: z.string().optional().describe('Working directory (default: workspace root)'),
    timeoutSeconds: z.number().int().min(30).max(1800).optional().describe('Timeout in seconds (default: 300)'),
  }),
  execute: async (args: {
    prompt: string;
    cwd?: string;
    timeoutSeconds?: number;
  }) => {
    const cliInfo = getCliInfo('opencode');
    
    if (!cliInfo.available) {
      return {
        success: false,
        error: 'OpenCode CLI not found. Please install it: npm install -g opencode',
        hint: 'Visit https://github.com/opencode-ai/opencode for installation instructions',
      };
    }

    const cwd = args.cwd ? path.resolve(WORKSPACE_ROOT, args.cwd) : WORKSPACE_ROOT;
    const timeout = (args.timeoutSeconds ?? 300) * 1000;

    // OpenCode command structure may vary, using common pattern
    const command = `opencode ${escapeShellArg(args.prompt)}`;

    console.log(`[call_opencode] Executing: ${command.substring(0, 200)}...`);
    console.log(`[call_opencode] Working directory: ${cwd}`);

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        cli: 'opencode',
        version: cliInfo.version,
        prompt: args.prompt.substring(0, 200),
        output: output.substring(0, 50000),
        outputLength: output.length,
        cwd,
        hint: 'OpenCode completed successfully.',
      };
    } catch (error: any) {
      const errorOutput = error.stdout?.toString() || '';
      const stderr = error.stderr?.toString() || '';
      
      return {
        success: false,
        cli: 'opencode',
        error: error.message || 'OpenCode execution failed',
        exitCode: error.status,
        output: errorOutput.substring(0, 10000),
        stderr: stderr.substring(0, 10000),
        hint: 'Check the error output for details.',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 21. call_cursor — Call Cursor CLI (if available)
// ---------------------------------------------------------------------------

export const callCursorTool: Tool = {
  name: 'call_cursor',
  description: 'Call Cursor editor CLI to open files or perform actions. Cursor is an AI-powered code editor. Note: Cursor CLI is limited compared to Claude Code.',
  parameters: z.object({
    filePath: z.string().optional().describe('File or directory to open in Cursor'),
    wait: z.boolean().optional().describe('Wait for Cursor to close before returning (default: false)'),
  }),
  execute: async (args: {
    filePath?: string;
    wait?: boolean;
  }) => {
    const cliInfo = getCliInfo('cursor');
    
    if (!cliInfo.available) {
      return {
        success: false,
        error: 'Cursor CLI not found. Please install Cursor from https://cursor.sh',
        hint: 'Cursor CLI is optional. Use call_claude_code for full AI coding capabilities.',
      };
    }

    const targetPath = args.filePath 
      ? path.resolve(WORKSPACE_ROOT, args.filePath)
      : WORKSPACE_ROOT;

    const waitFlag = args.wait ? '--wait' : '';
    const command = `cursor ${waitFlag} "${targetPath}"`.trim();

    try {
      // Cursor opens GUI, so we spawn detached
      if (!args.wait) {
        spawn('cursor', [targetPath], {
          detached: true,
          stdio: 'ignore',
          cwd: WORKSPACE_ROOT,
        }).unref();

        return {
          success: true,
          cli: 'cursor',
          openedPath: targetPath,
          mode: 'detached',
          hint: 'Cursor opened in background. It may take a few seconds to launch.',
        };
      }

      // Wait mode
      execSync(command, {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf-8',
        windowsHide: true,
      });

      return {
        success: true,
        cli: 'cursor',
        openedPath: targetPath,
        mode: 'wait',
        hint: 'Cursor opened and user closed it.',
      };
    } catch (error: any) {
      return {
        success: false,
        cli: 'cursor',
        error: error.message || 'Cursor execution failed',
        hint: 'Make sure Cursor is properly installed.',
      };
    }
  },
};

// ---------------------------------------------------------------------------
// 22. list_available_clis — List available AI coding CLIs
// ---------------------------------------------------------------------------

export const listAvailableClisTool: Tool = {
  name: 'list_available_clis',
  description: 'List all available AI coding CLI tools (Claude Code, OpenCode, Cursor, etc.) with their installation status and versions.',
  parameters: z.object({}),
  execute: async () => {
    const clis = [
      detectCli('claude'),
      detectCli('opencode'),
      detectCli('cursor'),
      detectCli('aider'),
      detectCli('code'),
    ];

    const available = clis.filter(c => c.available);
    const unavailable = clis.filter(c => !c.available);

    return {
      success: true,
      available: available.map(c => ({
        name: c.name,
        path: c.path,
        version: c.version,
      })),
      unavailable: unavailable.map(c => ({ name: c.name })),
      summary: {
        total: clis.length,
        available: available.length,
        recommended: available.find(c => c.name === 'claude') 
          ? 'claude' 
          : available[0]?.name,
      },
      hint: available.length > 0 
        ? `Use call_${available[0].name} to delegate coding tasks.` 
        : 'Install Claude Code for best AI coding experience: npm install -g @anthropic-ai/claude-code',
    };
  },
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeShellArg(arg: string): string {
  // Windows PowerShell escaping
  if (process.platform === 'win32') {
    // Replace single quotes with escaped single quotes
    return `'${arg.replace(/'/g, "''")}'`;
  }
  // Unix shell escaping
  return `"${arg.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Export all external CLI tools
// ---------------------------------------------------------------------------

export const externalCliTools: Tool[] = [
  callClaudeCodeTool,
  callOpencodeTool,
  callCursorTool,
  listAvailableClisTool,
];
