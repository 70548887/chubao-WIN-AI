/**
 * Tool Manager Types
 */
import type { z } from 'zod';

export type ToolSandboxMode = 'off' | 'allowlist';

export interface ToolSandboxPolicy {
  mode: ToolSandboxMode;
  enabled: boolean;
  configuredAllowedTools: string[];
  effectiveAllowedTools: string[];
  blockedTools: string[];
  visibleTools: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any) => Promise<any>;
}

export interface CliToolProbeSnapshot {
  name: string;
  available: boolean;
  version?: string;
  source?: string;
  command?: string;
  args?: string[];
  checkedAt?: string;
  cached?: boolean;
  error?: string;
}

export interface CliHealthSnapshot {
  summary: {
    total: number;
    available: number;
    unavailable: number;
  };
  tools: {
    opencode: CliToolProbeSnapshot;
    ohMyOpencode: CliToolProbeSnapshot;
  };
}
