/**
 * Tool Sandbox Policy Management
 */
import type { ToolSandboxMode, ToolSandboxPolicy } from './types.js';

const DEFAULT_SANDBOX_ALLOWLIST: ReadonlySet<string> = new Set([
  'list_windows',
  'get_window_controls',
  'screenshot',
  'ocr_recognize',
  'ocr_find_text',
  'get_coding_progress',
  'browser_launch',
  'browser_navigate',
  'browser_read_page',
  'browser_get_text',
  'browser_screenshot',
  'browser_close',
  'opencode_check_status',
  'opencode_list_tasks',
  'opencode_check_concurrent_status',
  'ohmyopencode_check_concurrent_status',
  'ohmyopencode_list_agents',
]);

function parseToolList(raw: string | undefined): Set<string> {
  if (!raw || raw.trim().length === 0) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function normalizeSandboxMode(raw: string | undefined): ToolSandboxMode {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'allowlist' || value === 'allow' || value === 'whitelist' || value === 'restricted') {
    return 'allowlist';
  }
  return 'off';
}

export class SandboxManager {
  private mode: ToolSandboxMode;
  private configuredAllowedTools: Set<string>;
  private blockedTools: Set<string>;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.mode = normalizeSandboxMode(env.CHUBAO_TOOL_SANDBOX_MODE ?? env.CHUBAO_TOOL_SANDBOX);
    this.configuredAllowedTools = parseToolList(env.CHUBAO_ALLOWED_TOOLS);
    this.blockedTools = parseToolList(env.CHUBAO_BLOCKED_TOOLS);
  }

  getPolicy(allVisibleTools: string[]): ToolSandboxPolicy {
    return {
      mode: this.mode,
      enabled: this.mode !== 'off' || this.blockedTools.size > 0,
      configuredAllowedTools: Array.from(this.configuredAllowedTools.values()).sort(),
      effectiveAllowedTools:
        this.mode === 'allowlist'
          ? Array.from(this.getEffectiveAllowedTools().values()).sort()
          : [],
      blockedTools: Array.from(this.blockedTools.values()).sort(),
      visibleTools: allVisibleTools.sort(),
    };
  }

  isToolAllowed(name: string): { allowed: boolean; reason?: string } {
    if (this.blockedTools.has(name)) {
      return { allowed: false, reason: 'blocked' };
    }
    if (this.mode === 'allowlist') {
      const allowlist = this.getEffectiveAllowedTools();
      if (!allowlist.has(name)) {
        return { allowed: false, reason: 'not_allowlisted' };
      }
    }
    return { allowed: true };
  }

  private getEffectiveAllowedTools(): Set<string> {
    if (this.configuredAllowedTools.size > 0) {
      return this.configuredAllowedTools;
    }
    return new Set(DEFAULT_SANDBOX_ALLOWLIST);
  }
}
