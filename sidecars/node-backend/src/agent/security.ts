export type SecurityMode = 'off' | 'warn' | 'enforce';
export type ToolRiskLevel = 'readonly' | 'standard' | 'high';

export interface ToolSecurityPolicy {
  mode: SecurityMode;
  allowHighRisk: boolean;
  maxStringLength: number;
  maxArrayLength: number;
  maxDepth: number;
  configuredAllowedTools: string[];
  configuredBlockedTools: string[];
  blockedArgumentPatterns: string[];
  readonlyTools: string[];
  highRiskTools: string[];
}

export interface ToolSecurityDecision {
  allowed: boolean;
  mode: SecurityMode;
  toolName: string;
  riskLevel: ToolRiskLevel;
  reason?: string;
  warnings: string[];
}

const READONLY_TOOLS: ReadonlySet<string> = new Set([
  'list_windows',
  'get_window_controls',
  'screenshot',
  'ocr_recognize',
  'ocr_find_text',
  'get_coding_progress',
  'browser_read_page',
  'browser_get_text',
  'browser_screenshot',
  'multi_agent_group_status',
  'multi_agent_group_list',
  'opencode_check_status',
  'opencode_list_tasks',
  'opencode_check_concurrent_status',
  'ohmyopencode_list_agents',
  'ohmyopencode_check_concurrent_status',
]);

const HIGH_RISK_TOOLS: ReadonlySet<string> = new Set([
  'drag',
  'menu_select',
  'browser_form_input',
  'browser_launch',
  'browser_close',
  'opencode_run',
  'opencode_create_project',
  'opencode_cancel_task',
  'ohmyopencode_task',
  'ohmyopencode_delegate',
  'ohmyopencode_cancel_task',
  'multi_agent_start',
  'multi_agent_group_cancel',
]);

function parseCsv(raw: string | undefined): Set<string> {
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

function normalizeMode(raw: string | undefined): SecurityMode {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'off') {
    return 'off';
  }
  if (value === 'enforce' || value === 'strict') {
    return 'enforce';
  }
  return 'warn';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ToolSecurityGuard {
  private mode: SecurityMode;
  private allowHighRisk: boolean;
  private maxStringLength: number;
  private maxArrayLength: number;
  private maxDepth: number;
  private allowedTools: Set<string> | null;
  private blockedTools: Set<string>;
  private blockedArgumentPatterns: string[];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.mode = normalizeMode(env.CHUBAO_SECURITY_MODE);
    this.allowHighRisk = parseBoolean(env.CHUBAO_SECURITY_ALLOW_HIGH_RISK, false);
    this.maxStringLength = parsePositiveInt(env.CHUBAO_SECURITY_MAX_STRING_LENGTH, 12000);
    this.maxArrayLength = parsePositiveInt(env.CHUBAO_SECURITY_MAX_ARRAY_LENGTH, 50);
    this.maxDepth = parsePositiveInt(env.CHUBAO_SECURITY_MAX_DEPTH, 8);

    const configuredAllowedTools = parseCsv(env.CHUBAO_SECURITY_ALLOWED_TOOLS);
    this.allowedTools = configuredAllowedTools.size > 0 ? configuredAllowedTools : null;
    this.blockedTools = parseCsv(env.CHUBAO_SECURITY_BLOCKED_TOOLS);

    const rawBlockedPatterns = parseCsv(env.CHUBAO_SECURITY_BLOCKED_ARG_PATTERNS);
    this.blockedArgumentPatterns =
      rawBlockedPatterns.size > 0
        ? Array.from(rawBlockedPatterns.values()).map((entry) => entry.toLowerCase())
        : ['&&', '||', '`', '$(', ';rm ', ';del ', ' cmd.exe ', ' powershell '];
  }

  evaluate(toolName: string, args: unknown): ToolSecurityDecision {
    const riskLevel = this.resolveRiskLevel(toolName);
    const warnings: string[] = [];

    if (this.blockedTools.has(toolName)) {
      return this.deny(toolName, riskLevel, 'explicitly blocked by CHUBAO_SECURITY_BLOCKED_TOOLS');
    }

    if (this.allowedTools && !this.allowedTools.has(toolName)) {
      return this.deny(toolName, riskLevel, 'not included in CHUBAO_SECURITY_ALLOWED_TOOLS');
    }

    const argumentError = this.validateArguments(args);
    if (argumentError) {
      if (this.mode === 'enforce') {
        return this.deny(toolName, riskLevel, argumentError);
      }
      warnings.push(argumentError);
    }

    if (riskLevel === 'high' && !this.allowHighRisk) {
      const reason = 'high-risk tool requires CHUBAO_SECURITY_ALLOW_HIGH_RISK=true';
      if (this.mode === 'enforce') {
        return this.deny(toolName, riskLevel, reason);
      }
      warnings.push(reason);
    }

    return {
      allowed: true,
      mode: this.mode,
      toolName,
      riskLevel,
      warnings,
    };
  }

  getPolicy(): ToolSecurityPolicy {
    return {
      mode: this.mode,
      allowHighRisk: this.allowHighRisk,
      maxStringLength: this.maxStringLength,
      maxArrayLength: this.maxArrayLength,
      maxDepth: this.maxDepth,
      configuredAllowedTools: this.allowedTools
        ? Array.from(this.allowedTools.values()).sort()
        : [],
      configuredBlockedTools: Array.from(this.blockedTools.values()).sort(),
      blockedArgumentPatterns: [...this.blockedArgumentPatterns],
      readonlyTools: Array.from(READONLY_TOOLS.values()).sort(),
      highRiskTools: Array.from(HIGH_RISK_TOOLS.values()).sort(),
    };
  }

  private deny(toolName: string, riskLevel: ToolRiskLevel, reason: string): ToolSecurityDecision {
    return {
      allowed: false,
      mode: this.mode,
      toolName,
      riskLevel,
      reason,
      warnings: [],
    };
  }

  private resolveRiskLevel(toolName: string): ToolRiskLevel {
    if (READONLY_TOOLS.has(toolName)) {
      return 'readonly';
    }
    if (HIGH_RISK_TOOLS.has(toolName)) {
      return 'high';
    }
    return 'standard';
  }

  private validateArguments(args: unknown): string | null {
    return this.walk(args, '$', 0);
  }

  private walk(value: unknown, path: string, depth: number): string | null {
    if (depth > this.maxDepth) {
      return `argument nesting exceeds max depth ${this.maxDepth} at ${path}`;
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return null;
    }

    if (typeof value === 'string') {
      return this.validateString(value, path);
    }

    if (Array.isArray(value)) {
      if (value.length > this.maxArrayLength) {
        return `array at ${path} exceeds max length ${this.maxArrayLength}`;
      }

      if (path.toLowerCase().endsWith('.keys') && value.length > 8) {
        return 'hotkey keys exceeds max length 8';
      }

      for (let index = 0; index < value.length; index += 1) {
        const next = this.walk(value[index], `${path}[${index}]`, depth + 1);
        if (next) {
          return next;
        }
      }
      return null;
    }

    if (!isRecord(value)) {
      return `unsupported argument type at ${path}`;
    }

    for (const [key, nested] of Object.entries(value)) {
      const keyPath = `${path}.${key}`;
      const next = this.walk(nested, keyPath, depth + 1);
      if (next) {
        return next;
      }
    }

    return null;
  }

  private validateString(raw: string, path: string): string | null {
    if (raw.length > this.maxStringLength) {
      return `string at ${path} exceeds max length ${this.maxStringLength}`;
    }

    if (raw.includes('\0')) {
      return `null byte is not allowed at ${path}`;
    }

    const value = raw.trim();
    const normalizedPath = path.toLowerCase();

    if (normalizedPath.endsWith('.url')) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return `url protocol not allowed at ${path}`;
        }
      } catch {
        return `invalid url at ${path}`;
      }
    }

    if (
      /(?:path|dir|file|savepath|save_path|basedir|projectpath)$/i.test(normalizedPath)
    ) {
      if (value.includes('..')) {
        return `path traversal is not allowed at ${path}`;
      }
      if (value.includes('\r') || value.includes('\n')) {
        return `line break is not allowed at ${path}`;
      }
      if (value.length > 1024) {
        return `path is too long at ${path}`;
      }
    }

    if (normalizedPath.endsWith('.selector') && value.length > 500) {
      return `selector too long at ${path}`;
    }

    if (
      /(?:command|shell|script|exec|cmd)$/i.test(normalizedPath)
      && this.containsBlockedPattern(value)
    ) {
      return `blocked command pattern detected at ${path}`;
    }

    return null;
  }

  private containsBlockedPattern(raw: string): boolean {
    const value = ` ${raw.toLowerCase()} `;
    return this.blockedArgumentPatterns.some((pattern) => value.includes(pattern));
  }
}
