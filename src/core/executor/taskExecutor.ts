import type { ExecutionPlan, PlanStep } from '../planner/types';
import { fetchCodingProgress, formatCodingProgress } from '../../skills/coding';

interface ChatApiResponse {
  success: boolean;
  response?: string;
  message?: string;
  sessionId?: string;
}

interface WindowInfo {
  title: string;
  class_name: string;
}

interface WindowsResponse {
  success: boolean;
  windows?: WindowInfo[];
  message?: string;
}

interface HealthPayload {
  status?: string;
  service?: string;
  version?: string;
  uptimeSec?: number;
}

const CHAT_SESSION_STORAGE_KEY = 'chubao.chat.sessionId';
let chatSessionIdCache: string | null = null;
let chatSessionCacheLoaded = false;

function normalizeChatSessionId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, 128);
}

function readSessionIdFromStorage(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return normalizeChatSessionId(window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeSessionIdToStorage(sessionId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage failures; in-memory fallback remains active for this runtime.
  }
}

function getChatSessionId(): string | null {
  if (chatSessionCacheLoaded) {
    return chatSessionIdCache;
  }
  chatSessionCacheLoaded = true;
  chatSessionIdCache = readSessionIdFromStorage();
  return chatSessionIdCache;
}

function rememberChatSessionId(sessionId: unknown): void {
  const normalized = normalizeChatSessionId(sessionId);
  if (!normalized) {
    return;
  }
  chatSessionIdCache = normalized;
  chatSessionCacheLoaded = true;
  writeSessionIdToStorage(normalized);
}

export function __resetChatSessionCacheForTests(): void {
  chatSessionIdCache = null;
  chatSessionCacheLoaded = false;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return fallback;
}

function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function readStepConfig(step: PlanStep): { timeoutMs: number; retryCount: number; retryDelayMs: number } {
  return {
    timeoutMs: Math.max(1, Math.trunc(step.timeoutMs ?? 10000)),
    retryCount: Math.max(0, Math.trunc(step.retryCount ?? 0)),
    retryDelayMs: Math.max(0, Math.trunc(step.retryDelayMs ?? 0)),
  };
}

async function executeCodingProgress(signal: AbortSignal): Promise<string> {
  const progress = await fetchCodingProgress(fetch, signal);
  return formatCodingProgress(progress);
}

async function executeWindowsSnapshot(signal: AbortSignal): Promise<string> {
  const response = await fetch('http://localhost:3200/api/windows', { signal });
  const payload = (await response.json()) as WindowsResponse;
  if (!response.ok || payload.success !== true || !Array.isArray(payload.windows)) {
    throw new Error(payload.message ?? `Window snapshot request failed (${response.status})`);
  }

  const topWindows = payload.windows
    .filter((item) => item.title.trim().length > 0)
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.title} [${item.class_name}]`);

  if (topWindows.length === 0) {
    return 'No visible windows were returned by python sidecar.';
  }

  return [`Active windows (${topWindows.length} shown):`, ...topWindows].join('\n');
}

async function fetchHealthLine(label: string, url: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return `${label}: offline (http ${response.status})`;
    }
    const payload = (await response.json()) as HealthPayload;
    return `${label}: ${payload.status ?? 'unknown'} service=${payload.service ?? 'unknown'} version=${payload.version ?? 'unknown'} uptimeSec=${payload.uptimeSec ?? 0}`;
  } catch (error) {
    return `${label}: offline (${toErrorMessage(error, 'request failed')})`;
  }
}

async function executeServiceStatus(signal: AbortSignal): Promise<string> {
  const lines = await Promise.all([
    fetchHealthLine('node', 'http://localhost:3100/health', signal),
    fetchHealthLine('python', 'http://localhost:3200/health', signal),
  ]);
  return ['Sidecar status snapshot:', ...lines].join('\n');
}

async function executeGeneralChat(message: string, signal: AbortSignal): Promise<string> {
  const sessionId = getChatSessionId();
  const requestBody: { message: string; sessionId?: string } = { message };
  if (sessionId) {
    requestBody.sessionId = sessionId;
  }

  const response = await fetch('http://localhost:3100/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });
  const payload = (await response.json()) as ChatApiResponse;
  if (!response.ok || payload.success !== true || typeof payload.response !== 'string') {
    throw new Error(payload.message ?? `Chat request failed (${response.status})`);
  }
  rememberChatSessionId(payload.sessionId);
  return payload.response;
}

async function executeStep(step: PlanStep, originalMessage: string, signal: AbortSignal): Promise<string> {
  switch (step.action) {
    case 'fetch_coding_progress':
      return executeCodingProgress(signal);
    case 'fetch_windows':
      return executeWindowsSnapshot(signal);
    case 'check_services':
      return executeServiceStatus(signal);
    case 'call_chat':
    default:
      return executeGeneralChat(originalMessage, signal);
  }
}

async function executeStepWithPolicy(step: PlanStep, originalMessage: string): Promise<string> {
  const config = readStepConfig(step);
  const attempts = config.retryCount + 1;
  let lastError: unknown = new Error('step failed without error');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);

    try {
      const result = await executeStep(step, originalMessage, controller.signal);
      globalThis.clearTimeout(timeoutHandle);
      if (attempt === 1) {
        return result;
      }
      return `[retry ${attempt}/${attempts}] recovered after retry\n${result}`;
    } catch (error) {
      globalThis.clearTimeout(timeoutHandle);
      lastError = timedOut
        ? new Error(`step timed out after ${config.timeoutMs}ms`)
        : error;

      if (attempt < attempts) {
        await wait(config.retryDelayMs);
        continue;
      }
    }
  }

  throw lastError;
}

export async function executePlan(plan: ExecutionPlan): Promise<string> {
  if (plan.steps.length === 0) {
    return 'No executable plan steps.';
  }

  const outputs: string[] = [];
  const total = plan.steps.length;
  for (let index = 0; index < total; index += 1) {
    const step = plan.steps[index];
    try {
      const content = await executeStepWithPolicy(step, plan.originalMessage);
      outputs.push(content);
    } catch (error) {
      const errorMessage = toErrorMessage(error, 'step failed');
      if (step.required) {
        outputs.push(errorMessage);
        break;
      }
      // Silently skip optional step failures
    }
  }

  return outputs.join('\n\n');
}
