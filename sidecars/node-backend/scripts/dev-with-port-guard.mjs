import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SAFE_PROCESS_NAMES = new Set(['node', 'python']);

function parseBooleanEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function resolvePort() {
  const rawPort = process.env.NODE_PORT ?? process.env.PORT ?? '3100';
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid NODE_PORT/PORT value: ${rawPort}`);
  }
  return port;
}

async function listPortOccupantsWindows(port) {
  const netstatItems = await listPortOccupantsWindowsViaNetstat(port);
  if (netstatItems.length > 0) {
    return netstatItems;
  }

  try {
    return await listPortOccupantsWindowsViaPowerShell(port);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[port-guard] PowerShell occupant probe failed, fallback to netstat-only mode: ${message}`);
    return netstatItems;
  }
}

async function listPortOccupantsWindowsViaNetstat(port) {
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true });
  const lines = stdout.split(/\r?\n/);
  const pidSet = new Set();
  const portSuffix = `:${port}`;

  for (const line of lines) {
    if (!line.includes('LISTENING')) {
      continue;
    }
    if (!line.includes(portSuffix)) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) {
      pidSet.add(pid);
    }
  }

  if (pidSet.size === 0) {
    return [];
  }

  const { stdout: taskListText } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  const pidToName = new Map();
  const csvLines = taskListText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of csvLines) {
    const cleaned = line.replace(/^"|"$/g, '');
    const cols = cleaned.split('","');
    if (cols.length < 2) {
      continue;
    }

    const imageName = cols[0] || '';
    const pid = Number(cols[1]);
    if (!Number.isFinite(pid) || pid <= 0) {
      continue;
    }

    const normalized = imageName.toLowerCase().endsWith('.exe')
      ? imageName.slice(0, -4)
      : imageName;
    pidToName.set(pid, normalized);
  }

  return Array.from(pidSet.values()).map((pid) => ({
    pid,
    name: pidToName.get(pid) || '',
  }));
}

async function listPortOccupantsWindowsViaPowerShell(port) {
  // Keep this path for compatibility fallback and static contract checks.
  const script = [
    `$items = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |`,
    '  Select-Object -ExpandProperty OwningProcess -Unique |',
    '  ForEach-Object {',
    '    $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue',
    '    [PSCustomObject]@{',
    '      pid = $_',
    '      name = if ($proc) { $proc.ProcessName } else { "" }',
    '    }',
    '  })',
    '$items | ConvertTo-Json -Compress',
  ].join('\n');

  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true },
  );

  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items
    .map((item) => {
      const pid = Number(item?.pid);
      const name = typeof item?.name === 'string' ? item.name : '';
      return {
        pid,
        name,
      };
    })
    .filter((item) => Number.isFinite(item.pid) && item.pid > 0);
}

async function killProcessTreeWindows(pid) {
  await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
  });
}

async function preparePort(port) {
  const skipPortCleanup = parseBooleanEnv('SKIP_PORT_CLEANUP', false);
  if (skipPortCleanup) {
    console.log(`[port-guard] SKIP_PORT_CLEANUP=true, skipping cleanup for port ${port}.`);
    return;
  }

  if (process.platform !== 'win32') {
    console.log('[port-guard] Non-Windows platform detected, skipping port cleanup.');
    return;
  }

  const forceKill = parseBooleanEnv('FORCE_KILL_PORT_CONFLICTS', false);
  const occupants = await listPortOccupantsWindows(port);
  if (occupants.length === 0) {
    return;
  }

  console.warn(`[port-guard] Port ${port} is in use by:`);
  occupants.forEach((item) => {
    console.warn(`  PID ${item.pid} (${item.name || 'unknown'})`);
  });

  for (const item of occupants) {
    if (item.pid === process.pid) {
      continue;
    }

    const processName = item.name.toLowerCase();
    if (!forceKill && !SAFE_PROCESS_NAMES.has(processName)) {
      throw new Error(
        `Refusing to kill PID ${item.pid} (${item.name || 'unknown'}) on port ${port}. ` +
        'Set FORCE_KILL_PORT_CONFLICTS=true to allow force kill.',
      );
    }

    try {
      await killProcessTreeWindows(item.pid);
      console.warn(`[port-guard] Killed PID ${item.pid} (${item.name || 'unknown'}).`);
    } catch (error) {
      throw new Error(`Failed to kill PID ${item.pid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const remaining = await listPortOccupantsWindows(port);
    if (remaining.length === 0) {
      console.log(`[port-guard] Port ${port} released.`);
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  }

  throw new Error(`Port ${port} is still occupied after cleanup.`);
}

function runWatch() {
  const localTsxCli = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = existsSync(localTsxCli)
    ? spawn(process.execPath, [localTsxCli, 'watch', 'src/index.ts'], {
      stdio: 'inherit',
      env: process.env,
    })
    : spawn('tsx', ['watch', 'src/index.ts'], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[port-guard] failed to launch tsx watch: ${message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  const port = resolvePort();
  await preparePort(port);
  runWatch();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[port-guard] startup failed: ${message}`);
  process.exit(1);
});
