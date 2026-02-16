/**
 * CLI Health Check
 */
import { probeOpenCodeCli } from '../opencode.js';
import { probeOhMyCli } from '../ohmyopencode.js';
import type { CliHealthSnapshot, CliToolProbeSnapshot } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCliProbe(name: string, payload: unknown): CliToolProbeSnapshot {
  if (!isRecord(payload)) {
    return {
      name,
      available: false,
      error: 'invalid probe payload',
    };
  }

  return {
    name: typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : name,
    available: payload.available === true,
    version: typeof payload.version === 'string' ? payload.version : undefined,
    source: typeof payload.source === 'string' ? payload.source : undefined,
    command: typeof payload.command === 'string' ? payload.command : undefined,
    args: Array.isArray(payload.args)
      ? payload.args.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : undefined,
    cached: payload.cached === true,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

export async function getCliHealth(): Promise<CliHealthSnapshot> {
  const [opencodeResult, ohmyResult] = await Promise.allSettled([
    probeOpenCodeCli(),
    probeOhMyCli(),
  ]);

  const opencode = opencodeResult.status === 'fulfilled'
    ? parseCliProbe('opencode', opencodeResult.value)
    : {
        name: 'opencode',
        available: false,
        error: opencodeResult.reason instanceof Error
          ? opencodeResult.reason.message
          : String(opencodeResult.reason),
      };

  const ohMyOpencode = ohmyResult.status === 'fulfilled'
    ? parseCliProbe('oh-my-opencode', ohmyResult.value)
    : {
        name: 'oh-my-opencode',
        available: false,
        error: ohmyResult.reason instanceof Error
          ? ohmyResult.reason.message
          : String(ohmyResult.reason),
      };

  const availableCount = [opencode, ohMyOpencode].filter((item) => item.available).length;

  return {
    summary: {
      total: 2,
      available: availableCount,
      unavailable: 2 - availableCount,
    },
    tools: {
      opencode,
      ohMyOpencode,
    },
  };
}
