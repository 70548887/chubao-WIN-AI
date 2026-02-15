/**
 * Agent runtime - core scheduler
 *
 * Supports Function Calling + multi-turn tool loop.
 * Dual provider: Anthropic (Claude) + OpenAI-compatible APIs.
 */

import { MemoryManager } from '../memory/manager.js';
import { ToolManager, toolManager } from '../tools/index.js';
import { ToolSecurityGuard, type ToolSecurityPolicy } from './security.js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type {
  ImageBlockParam,
  MessageParam,
  TextBlock,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';

type AIProvider = 'openai' | 'anthropic' | 'ohmygpt' | 'krio';

type ToolResultContent = string | Array<TextBlockParam | ImageBlockParam>;

type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface VisionScreenshotResult {
  base64: string;
  path?: unknown;
  url?: unknown;
  size?: unknown;
  actualSize?: unknown;
  actual_size?: unknown;
  modelSize?: unknown;
  model_size?: unknown;
  scaleX?: unknown;
  scale_x?: unknown;
  scaleY?: unknown;
  scale_y?: unknown;
  mediaType?: unknown;
  media_type?: unknown;
}

interface CoordinateTransform {
  modelWidth: number;
  modelHeight: number;
  actualWidth: number;
  actualHeight: number;
  scaleX: number;
  scaleY: number;
  updatedAt: string;
}

const DEFAULT_AGENT_MAX_ITERATIONS = 50;
const MIN_AGENT_MAX_ITERATIONS = 1;
const MAX_AGENT_MAX_ITERATIONS = 200;
const DEFAULT_SESSION_STATE_PATH = path.join(process.cwd(), 'runtime-data', 'agent-sessions.json');
const SESSION_STATE_SCHEMA_VERSION = 'agent-sessions.v1';
const DEFAULT_SESSION_MAX_MESSAGES = 80;
const DEFAULT_SESSION_MAX_COUNT = 200;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBoundedPositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = parsePositiveInt(raw, fallback);
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
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

function parseNonEmptyString(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

/**
 * Create a clean fetch that strips OpenAI SDK headers (x-stainless-*)
 * which trigger Cloudflare WAF 403 blocks on third-party proxies.
 */
function createCleanFetch(): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.headers) {
      const raw = init.headers;
      const entries: [string, string][] =
        raw instanceof Headers
          ? [...raw.entries()]
          : Array.isArray(raw)
            ? (raw as [string, string][])
            : Object.entries(raw as Record<string, string>);
      const cleaned: Record<string, string> = {};
      for (const [k, v] of entries) {
        if (k.toLowerCase().startsWith('x-stainless')) continue;
        if (k.toLowerCase() === 'user-agent' && typeof v === 'string' && v.includes('OpenAI')) {
          cleaned[k] = 'chubao-ai/0.1.0';
          continue;
        }
        cleaned[k] = v;
      }
      return globalThis.fetch(input, { ...init, headers: cleaned });
    }
    return globalThis.fetch(input, init);
  };
}

/**
 * Call OpenAI Responses API via raw fetch (bypasses SDK HTTP pipeline
 * which causes 502 through third-party proxies like Sub2API).
 */
async function callResponsesAPI(
  baseURL: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 120000,
  streamCallback?: (chunk: string) => void,
): Promise<Record<string, unknown>> {
  const url = `${baseURL}/responses`;
  const bodyStr = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': streamCallback ? 'text/event-stream' : 'application/json',
        'X-Stainless-Lang': 'typescript',
        'X-Stainless-Package-Version': '4.52.0',
        'X-Stainless-OS': 'Windows',
        'X-Stainless-Arch': 'x64',
        'X-Stainless-Runtime': 'node-js',
        'X-Stainless-Runtime-Version': '20.16.0',
        'User-Agent': 'OpenCode/1.0',
        'X-Inference-Intensity': 'high',
      },
      body: bodyStr,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      // Try to parse JSON error
      try {
        const errJson = JSON.parse(text);
        throw Object.assign(new Error(`${res.status} ${errJson?.error?.message ?? text.slice(0, 200)}`), { status: res.status });
      } catch (parseErr) {
        if ((parseErr as any).status) throw parseErr;
        throw Object.assign(new Error(`${res.status} ${text.slice(0, 200)}`), { status: res.status });
      }
    }
    
    if (streamCallback) {
      // Handle streaming response
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process buffered chunks
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep last incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                // Handle different event types from the responses API
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  streamCallback(parsed.delta.text);
                } else if (parsed.type === 'text' && parsed.text) {
                  streamCallback(parsed.text);
                } else if (parsed.type === 'message_stop' || parsed.type === 'done') {
                  break;
                }
              } catch (e) {
                // Skip malformed JSON lines
              }
            }
          }
        }
        // Process any remaining buffer
        if (buffer.trim()) {
          const line = buffer.trim();
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                streamCallback(parsed.delta.text);
              } else if (parsed.type === 'text' && parsed.text) {
                streamCallback(parsed.text);
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      // For streaming, we'll return a placeholder since actual response is streamed
      return { id: 'stream-placeholder', object: 'response', status: 'streaming' };
    } else {
      // Original non-streaming behavior
      return await res.json() as Record<string, unknown>;
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Anthropic Messages API via raw fetch (bypasses SDK HTTP pipeline
 * which triggers Cloudflare WAF 403 on third-party proxies).
 */
async function callAnthropicMessagesAPI(
  baseURL: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 120000,
): Promise<Record<string, unknown>> {
  const url = `${baseURL}/v1/messages`;
  const bodyStr = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: bodyStr,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const errJson = JSON.parse(text);
        throw Object.assign(new Error(`${res.status} ${errJson?.error?.message ?? text.slice(0, 200)}`), { status: res.status });
      } catch (parseErr) {
        if ((parseErr as any).status) throw parseErr;
        throw Object.assign(new Error(`${res.status} ${text.slice(0, 200)}`), { status: res.status });
      }
    }
    return await res.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

interface PersistedSessionRecord {
  id: string;
  updatedAt: string;
  messages: MessageParam[];
}

interface PersistedSessionPayload {
  schemaVersion: string;
  updatedAt: string;
  sessions: PersistedSessionRecord[];
}

type PersistModelConfigKey =
  | 'CHUBAO_AI_PROVIDER'
  | 'OPENAI_MODEL'
  | 'OPENAI_BASE_URL'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_MODEL'
  | 'ANTHROPIC_BASE_URL'
  | 'ANTHROPIC_API_KEY';

type PersistModelConfigAction = 'set' | 'unchanged' | 'skipped';

interface PersistModelConfigChange {
  key: PersistModelConfigKey;
  action: PersistModelConfigAction;
  masked: boolean;
}

interface PersistModelConfigOptions {
  dryRun?: boolean;
  includeSecrets?: boolean;
}

interface PersistModelConfigResult {
  dryRun: boolean;
  wrote: boolean;
  envPath: string;
  changes: PersistModelConfigChange[];
}

class AgentSessionStore {
  private sessions = new Map<string, PersistedSessionRecord>();
  private stateEnabled = parseBoolean(process.env.CHUBAO_SESSION_STATE_ENABLED, true);
  private statePath = process.env.CHUBAO_SESSION_STATE_PATH?.trim() || DEFAULT_SESSION_STATE_PATH;
  private maxMessages = parseBoundedPositiveInt(
    process.env.CHUBAO_SESSION_MAX_MESSAGES,
    DEFAULT_SESSION_MAX_MESSAGES,
    10,
    300,
  );
  private maxSessions = parseBoundedPositiveInt(
    process.env.CHUBAO_SESSION_MAX_COUNT,
    DEFAULT_SESSION_MAX_COUNT,
    10,
    1000,
  );

  constructor() {
    this.loadPersistedSessions();
  }

  getMessages(sessionId: string): MessageParam[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  setMessages(sessionId: string, messages: MessageParam[]): void {
    const trimmed = this.trimMessages(messages);
    const record: PersistedSessionRecord = {
      id: sessionId,
      updatedAt: new Date().toISOString(),
      messages: trimmed,
    };

    this.sessions.set(sessionId, record);
    this.cleanupSessions();
    this.persistSessions();
  }

  private trimMessages(messages: MessageParam[]): MessageParam[] {
    const normalized = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    if (normalized.length <= this.maxMessages) {
      return normalized;
    }

    return normalized.slice(-this.maxMessages);
  }

  private cleanupSessions(): void {
    if (this.sessions.size <= this.maxSessions) {
      return;
    }

    const removable = Array.from(this.sessions.values()).sort((a, b) =>
      Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    );

    for (const session of removable) {
      if (this.sessions.size <= this.maxSessions) {
        break;
      }
      this.sessions.delete(session.id);
    }
  }

  private loadPersistedSessions(): void {
    if (!this.stateEnabled) {
      return;
    }

    try {
      if (!fsSync.existsSync(this.statePath)) {
        return;
      }

      const rawText = fsSync.readFileSync(this.statePath, 'utf8');
      if (!rawText.trim()) {
        return;
      }

      const payload = JSON.parse(rawText) as Partial<PersistedSessionPayload>;
      if (!Array.isArray(payload.sessions)) {
        return;
      }

      for (const candidate of payload.sessions) {
        const normalized = this.normalizePersistedSession(candidate);
        if (!normalized) {
          continue;
        }
        this.sessions.set(normalized.id, normalized);
      }

      this.cleanupSessions();
    } catch (error) {
      console.warn(
        'Failed to load persisted agent sessions:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private normalizePersistedSession(candidate: unknown): PersistedSessionRecord | null {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const raw = candidate as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      return null;
    }

    const messages = Array.isArray(raw.messages)
      ? raw.messages
          .map((message) => this.normalizePersistedMessage(message))
          .filter((message): message is MessageParam => message !== null)
      : [];

    if (messages.length === 0) {
      return null;
    }

    return {
      id,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      messages: this.trimMessages(messages),
    };
  }

  private normalizePersistedMessage(candidate: unknown): MessageParam | null {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const raw = candidate as Record<string, unknown>;
    const role = raw.role;
    if (role !== 'user' && role !== 'assistant') {
      return null;
    }

    const content = raw.content;
    if (typeof content !== 'string' && !Array.isArray(content)) {
      return null;
    }

    return {
      role,
      content: content as MessageParam['content'],
    };
  }

  private persistSessions(): void {
    if (!this.stateEnabled) {
      return;
    }

    try {
      const dir = path.dirname(this.statePath);
      fsSync.mkdirSync(dir, { recursive: true });

      const payload: PersistedSessionPayload = {
        schemaVersion: SESSION_STATE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        sessions: Array.from(this.sessions.values()).map((session) => ({
          id: session.id,
          updatedAt: session.updatedAt,
          messages: session.messages,
        })),
      };

      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.warn(
        'Failed to persist agent sessions:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private toolManager: ToolManager;
  private securityGuard: ToolSecurityGuard;
  private sessionStore: AgentSessionStore;
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private ohmygptClient: OpenAI | null = null;
  private krioClient: Anthropic | null = null;
  private provider: AIProvider;
  private maxIterations: number = parseBoundedPositiveInt(
    process.env.CHUBAO_AGENT_MAX_ITERATIONS,
    DEFAULT_AGENT_MAX_ITERATIONS,
    MIN_AGENT_MAX_ITERATIONS,
    MAX_AGENT_MAX_ITERATIONS,
  );
  private modelViewportWidth: number = parsePositiveInt(
    process.env.CHUBAO_MODEL_COORD_WIDTH ?? process.env.CHUBAO_MODEL_VIEWPORT_WIDTH,
    1024,
  );
  private modelViewportHeight: number = parsePositiveInt(
    process.env.CHUBAO_MODEL_COORD_HEIGHT ?? process.env.CHUBAO_MODEL_VIEWPORT_HEIGHT,
    768,
  );
  private coordinateTransform: CoordinateTransform | null = null;
  private modelName: string;
  private openaiModelName: string;
  private anthropicModelName: string;
  private ohmygptModelName: string;
  private krioModelName: string;
  private openaiBaseURL: string = '';
  private openaiApiKey: string = '';
  private ohmygptBaseURL: string = '';
  private ohmygptApiKey: string = '';
  private krioBaseURL: string = '';
  private krioApiKey: string = '';
  private maxTokens: number = parseBoundedPositiveInt(
    process.env.ANTHROPIC_MAX_TOKENS ?? process.env.CHUBAO_MAX_TOKENS,
    512,
    128,
    8192,
  );

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.toolManager = toolManager;
    this.securityGuard = new ToolSecurityGuard();
    this.sessionStore = new AgentSessionStore();
    this.toolManager.initializeSkills().catch((error) => {
      console.warn('Skill tools preload failed:', (error as Error).message);
    });

    // Determine provider
    const providerRaw = parseNonEmptyString(process.env.CHUBAO_AI_PROVIDER);
    this.provider = providerRaw === 'anthropic' ? 'anthropic' : providerRaw === 'ohmygpt' ? 'ohmygpt' : providerRaw === 'krio' ? 'krio' : 'openai';

    // Init Anthropic client
    const anthropicKey = parseNonEmptyString(process.env.ANTHROPIC_API_KEY);
    if (anthropicKey) {
      const baseURL = parseNonEmptyString(process.env.ANTHROPIC_BASE_URL);
      this.anthropicClient = new Anthropic(baseURL ? { apiKey: anthropicKey, baseURL } : { apiKey: anthropicKey });
    }

    // Init OpenAI client (with clean fetch to bypass Cloudflare WAF on proxies)
    const openaiKey = parseNonEmptyString(process.env.OPENAI_API_KEY);
    if (openaiKey) {
      const baseURL = parseNonEmptyString(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1';
      this.openaiBaseURL = baseURL;
      this.openaiApiKey = openaiKey;
      this.openaiClient = new OpenAI({
        apiKey: openaiKey,
        baseURL,
        maxRetries: 3,
        timeout: 120000,
        fetch: createCleanFetch(),
      });
    }

    // Init OhMyGPT client (OpenAI-compatible, also with clean fetch)
    const ohmygptKey = parseNonEmptyString(process.env.OHMYGPT_API_KEY);
    if (ohmygptKey) {
      const baseURL = parseNonEmptyString(process.env.OHMYGPT_BASE_URL) ?? 'https://api.ohmygpt.com/v1';
      this.ohmygptBaseURL = baseURL;
      this.ohmygptApiKey = ohmygptKey;
      this.ohmygptClient = new OpenAI({
        apiKey: ohmygptKey,
        baseURL,
        maxRetries: 3,
        timeout: 120000,
        fetch: createCleanFetch(),
      });
    }

    // Init Krio client (Anthropic-compatible proxy at situokj.com)
    const krioKey = parseNonEmptyString(process.env.KRIO_API_KEY);
    if (krioKey) {
      const baseURL = parseNonEmptyString(process.env.KRIO_BASE_URL) ?? 'http://situokj.com';
      this.krioBaseURL = baseURL;
      this.krioApiKey = krioKey;
      this.krioClient = new Anthropic({ apiKey: krioKey, baseURL });
    }

    // Resolve model names per provider
    this.openaiModelName =
      parseNonEmptyString(process.env.OPENAI_MODEL) ??
      parseNonEmptyString(process.env.CHUBAO_MODEL) ??
      'gpt-4o';
    this.anthropicModelName =
      parseNonEmptyString(process.env.ANTHROPIC_MODEL) ??
      parseNonEmptyString(process.env.CHUBAO_MODEL) ??
      'claude-sonnet-4-20250514';
    this.ohmygptModelName =
      parseNonEmptyString(process.env.OHMYGPT_MODEL) ??
      parseNonEmptyString(process.env.OPENAI_MODEL) ??
      'gpt-5.3-codex';
    this.krioModelName =
      parseNonEmptyString(process.env.KRIO_MODEL) ??
      'claude-opus-4-6';

    // Active model is the primary provider's model
    this.modelName = this.provider === 'anthropic'
      ? this.anthropicModelName
      : this.provider === 'ohmygpt'
        ? this.ohmygptModelName
        : this.provider === 'krio'
          ? this.krioModelName
          : this.openaiModelName;

    console.log(`\u{1F916} AI Provider: ${this.provider}, Model: ${this.modelName}`);
    console.log(`   OpenAI: ${this.openaiModelName}, Anthropic: ${this.anthropicModelName}, OhMyGPT: ${this.ohmygptModelName}, Krio: ${this.krioModelName}`);
  }

  async chat(message: string, sessionId?: string): Promise<string> {
    const primary = this.provider;
    // Build fallback order: try all other providers
    const allProviders: AIProvider[] = ['openai', 'anthropic', 'ohmygpt', 'krio'];
    const fallbacks = allProviders.filter((p) => p !== primary);

    try {
      return await this.chatByProvider(primary, message, sessionId);
    } catch (primaryError) {
      for (const fallback of fallbacks) {
        console.warn(`Primary provider (${primary}) failed: ${(primaryError as Error).message}, trying ${fallback} (simple mode)...`);
        try {
          return await this.chatSimpleByProvider(fallback, message, sessionId);
        } catch (fallbackError) {
          console.warn(`Fallback provider (${fallback}) also failed:`, (fallbackError as Error).message);
        }
      }
      return `处理消息时出错: ${(primaryError as Error).message}`;
    }
  }

  private async chatByProvider(provider: AIProvider, message: string, sessionId?: string): Promise<string> {
    if (provider === 'openai') {
      return this.chatOpenAI(message, sessionId);
    }
    if (provider === 'ohmygpt') {
      return this.chatOpenAICompatible(this.ohmygptBaseURL, this.ohmygptApiKey, this.ohmygptModelName, 'OhMyGPT', message, sessionId);
    }
    if (provider === 'krio') {
      return this.chatAnthropicCompatible(this.krioBaseURL, this.krioApiKey, this.krioModelName, 'Krio', message, sessionId);
    }
    return this.chatAnthropic(message, sessionId);
  }

  private async chatSimpleByProvider(provider: AIProvider, message: string, sessionId?: string): Promise<string> {
    // Use minimal prompt (no tools, no history) for fallback to save tokens
    if (provider === 'openai') {
      if (!this.openaiApiKey) throw new Error('No OPENAI_API_KEY for fallback');
      
      const fallbackMaxTokens = 256;
      console.warn(`⚠️ Using OpenAI fallback with max_tokens=${fallbackMaxTokens}`);
      
      const response = await callResponsesAPI(this.openaiBaseURL, this.openaiApiKey, {
        model: this.openaiModelName,
        input: [{ role: 'user', content: message }],
        max_output_tokens: fallbackMaxTokens,
        store: false,
      });
      
      const output = Array.isArray(response.output) ? response.output : [];
      for (const item of output) {
        if ((item as any)?.type === 'message' && Array.isArray((item as any).content)) {
          for (const block of (item as any).content) {
            if (block?.type === 'output_text' && typeof block.text === 'string') {
              return block.text;
            }
          }
        }
      }
      return '抱歉，无法生成回复。';
    }
    // OhMyGPT simple fallback (OpenAI-compatible)
    if (provider === 'ohmygpt') {
      if (!this.ohmygptApiKey) throw new Error('No OHMYGPT_API_KEY for fallback');
      
      const fallbackMaxTokens = 256;
      console.warn(`⚠️ Using OhMyGPT fallback with max_tokens=${fallbackMaxTokens}`);
      
      const response = await callResponsesAPI(this.ohmygptBaseURL, this.ohmygptApiKey, {
        model: this.ohmygptModelName,
        input: [{ role: 'user', content: message }],
        max_output_tokens: fallbackMaxTokens,
        store: false,
      });
      
      const output = Array.isArray(response.output) ? response.output : [];
      for (const item of output) {
        if ((item as any)?.type === 'message' && Array.isArray((item as any).content)) {
          for (const block of (item as any).content) {
            if (block?.type === 'output_text' && typeof block.text === 'string') {
              return block.text;
            }
          }
        }
      }
      return '抱歉，无法生成回复。';
    }
    // Krio simple fallback (Anthropic-compatible via raw fetch)
    if (provider === 'krio') {
      if (!this.krioApiKey) throw new Error('No KRIO_API_KEY for fallback');
      
      const fallbackMaxTokens = 256;
      console.warn(`\u26a0\ufe0f Using Krio fallback with max_tokens=${fallbackMaxTokens}`);
      
      const response = await callAnthropicMessagesAPI(this.krioBaseURL, this.krioApiKey, {
        model: this.krioModelName,
        max_tokens: fallbackMaxTokens,
        system: [{ type: 'text', text: `你是 Chubao AI，一个 Windows 本地 AI 助手。当前底层模型: ${this.krioModelName}（回退模式）。请简洁回答用户问题。` }],
        messages: [{ role: 'user', content: message }],
      });
      const content = response.content as any[];
      const textBlock = content?.find((b: any) => b.type === 'text');
      return textBlock?.text ?? '';
    }
    // Anthropic simple fallback - minimal system prompt, no tools
    if (!this.anthropicClient) throw new Error('No ANTHROPIC_API_KEY for fallback');
    
    // Use very small token limit for fallback to avoid 402 errors
    const fallbackMaxTokens = 128;
    console.warn(`⚠️ Using Anthropic fallback with max_tokens=${fallbackMaxTokens}`);
    
    const response = await this.anthropicClient.messages.create({
      model: this.anthropicModelName,
      max_tokens: fallbackMaxTokens,
      system: [{ type: 'text', text: `你是 Chubao AI，一个 Windows 本地 AI 助手。当前底层模型: ${this.anthropicModelName}（回退模式）。请简洁回答用户问题。` }],
      messages: [{ role: 'user', content: message }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  private async chatOpenAI(message: string, sessionId?: string): Promise<string> {
    if (!this.openaiApiKey) {
      return '错误: 未配置 OPENAI_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);
      const normalizedSessionId = this.normalizeSessionId(sessionId);

      await this.toolManager.initializeSkills();
      const toolDefs = this.toolManager.getToolDefinitions();
      // Prioritize dev tools first so they survive 8KB body trim
      const DEV_PRIORITY = new Set([
        'read_file', 'write_file', 'edit_file', 'list_dir', 'search_files',
        'run_command', 'create_skill', 'list_skills', 'get_coding_progress',
        'screenshot', 'click', 'type_text', 'hotkey',
        'restart_sidecar', 'validate_code',  // Self-upgrade tools
        'git_backup', 'git_rollback', 'health_check', 'log_self_upgrade', 'get_self_upgrade_history',  // Long-running support
        'send_notification', 'send_channel_message', 'get_channel_status',  // Channel notification tools
        'call_claude_code', 'call_opencode', 'call_cursor', 'list_available_clis',  // External AI CLI tools
        'spawn_subagent', 'get_subagent_status', 'list_subagents', 'cancel_subagent',  // Subagent tools
        'list_agents', 'start_agent', 'stop_agent', 'get_agent_status', 'register_custom_agent', 'delegate_to_agent',  // Multi-agent routing
      ]);
      const sortedDefs = [
        ...toolDefs.filter((t) => DEV_PRIORITY.has(t.name)),
        ...toolDefs.filter((t) => !DEV_PRIORITY.has(t.name)),
      ];
      const tools = sortedDefs.map((t) => ({
        type: 'function' as const,
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? {},
        strict: false,
      }));

      // Build input messages (MUST be messages array format for codex models)
      const history = this.loadSessionMessages(normalizedSessionId);
      const inputMessages: Array<Record<string, unknown>> = [];
      for (const msg of history) {
        if (typeof msg.content === 'string') {
          inputMessages.push({ role: msg.role, content: msg.content });
        }
      }
      inputMessages.push({ role: 'user', content: message });

      let finalResponse = '';
      let lastToolSummary = '';
      let currentInput: any = inputMessages;

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        const params: any = {
          model: this.openaiModelName,
          instructions: systemPrompt,
          input: currentInput,
          store: false,
        };

        // Dynamically trim tools to stay within proxy body size limit (~8KB)
        // IMPORTANT: use Buffer.byteLength for UTF-8 byte count (Chinese chars = 3 bytes each)
        if (tools.length > 0) {
          const baseJson = JSON.stringify(params);
          const baseSize = Buffer.byteLength(baseJson, 'utf-8');
          const maxBodySize = 7600; // safety margin under 8KB (accounting for headers overhead)
          if (baseSize < maxBodySize) {
            const budget = maxBodySize - baseSize;
            const fittingTools: typeof tools = [];
            let toolsSize = 0;
            for (const tool of tools) {
              const toolSize = Buffer.byteLength(JSON.stringify(tool), 'utf-8') + 1;
              if (toolsSize + toolSize > budget) break;
              fittingTools.push(tool);
              toolsSize += toolSize;
            }
            if (fittingTools.length > 0) {
              params.tools = fittingTools;
              if (fittingTools.length < tools.length) {
                console.log(`✂️ Trimmed tools: ${fittingTools.length}/${tools.length} (body ${baseSize}+${toolsSize}/${maxBodySize} bytes)`);
              }
            }
          }
        }

        const response = await callResponsesAPI(this.openaiBaseURL, this.openaiApiKey, params);
        const output = Array.isArray(response.output) ? response.output : [];

        // Extract text output
        for (const item of output) {
          if (item && (item as any).type === 'message' && Array.isArray((item as any).content)) {
            for (const block of (item as any).content) {
              if (block && block.type === 'output_text' && typeof block.text === 'string') {
                finalResponse = block.text;
              }
            }
          }
        }

        // Check for function calls
        const funcCalls = output.filter((item: any) => item?.type === 'function_call');
        if (funcCalls.length === 0) {
          break;
        }

        const toolSummaryLines: string[] = [];
        const nextInput: any[] = [...(Array.isArray(currentInput) ? currentInput : []), ...output];

        for (const fc of funcCalls) {
          const toolName = (fc as any).name as string;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(((fc as any).arguments as string) || '{}');
          } catch {
            toolArgs = {};
          }

          const executionInput = this.adaptToolArgsForExecution(toolName, toolArgs);
          console.log(`Tool call: ${toolName}`, executionInput);

          try {
            const result = await this.executeTool(toolName, executionInput);
            const modelResult = this.adaptToolResultForModel(toolName, result);
            const content = this.serializeToolContent(modelResult);
            nextInput.push({ type: 'function_call_output', call_id: (fc as any).call_id, output: content });
            toolSummaryLines.push(`- ${toolName}: ${content.slice(0, 600)}`);
          } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`Tool execution failed ${toolName}:`, errorMessage);
            nextInput.push({ type: 'function_call_output', call_id: (fc as any).call_id, output: `tool_error: ${errorMessage}` });
            toolSummaryLines.push(`- ${toolName}: tool_error: ${errorMessage}`);
          }
        }

        lastToolSummary = toolSummaryLines.join('\n');
        currentInput = nextInput;
      }

      if (!finalResponse && lastToolSummary) {
        finalResponse = `已完成工具调用，但模型未返回最终文本。最近一次工具结果:\n${lastToolSummary}`;
      }
      if (!finalResponse) {
        finalResponse = '抱歉，处理您的请求需要太多步骤，请尝试简化问题。';
      }

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${finalResponse}`);

      const persistMessages: MessageParam[] = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: finalResponse },
      ];
      this.persistSessionMessages(normalizedSessionId, persistMessages);

      return finalResponse;
    } catch (error) {
      console.error('Chat (OpenAI) error:', error);
      throw error;
    }
  }

  /**
   * Stream OpenAI-compatible chat method for real-time responses without tool calling.
   */
  async streamOpenAICompatible(
    baseURL: string, apiKey: string, modelName: string,
    message: string,
    onChunk: (chunk: string) => void,
    sessionId?: string,
  ): Promise<void> {
    const memories = await this.memoryManager.search(message, 5);
    const systemPrompt = this.buildSystemPrompt(memories);
    const inputMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];
    
    const params: any = {
      model: modelName,
      instructions: systemPrompt,
      input: inputMessages,
      stream: true,
      store: false,
    };
    
    await callResponsesAPI(baseURL, apiKey, params, 120000, onChunk);
  }

  /**
   * Generic OpenAI-compatible chat method for third-party providers (e.g. OhMyGPT).
   * Full multi-turn tool loop via Responses API, same logic as chatOpenAI.
   */
  private async chatOpenAICompatible(
    baseURL: string,
    apiKey: string,
    modelName: string,
    providerLabel: string,
    message: string,
    sessionId?: string,
  ): Promise<string> {
    if (!apiKey) {
      return `错误: 未配置 ${providerLabel} API Key`;
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);
      const normalizedSessionId = this.normalizeSessionId(sessionId);

      await this.toolManager.initializeSkills();
      const toolDefs = this.toolManager.getToolDefinitions();
      // Prioritize dev tools first so they survive 8KB body trim
      const DEV_PRIORITY = new Set([
        'read_file', 'write_file', 'edit_file', 'list_dir', 'search_files',
        'run_command', 'create_skill', 'list_skills', 'get_coding_progress',
        'screenshot', 'click', 'type_text', 'hotkey',
        'restart_sidecar', 'validate_code',  // Self-upgrade tools
        'git_backup', 'git_rollback', 'health_check', 'log_self_upgrade', 'get_self_upgrade_history',  // Long-running support
        'send_notification', 'send_channel_message', 'get_channel_status',  // Channel notification tools
        'call_claude_code', 'call_opencode', 'call_cursor', 'list_available_clis',  // External AI CLI tools
        'spawn_subagent', 'get_subagent_status', 'list_subagents', 'cancel_subagent',  // Subagent tools
        'list_agents', 'start_agent', 'stop_agent', 'get_agent_status', 'register_custom_agent', 'delegate_to_agent',  // Multi-agent routing
      ]);
      const sortedDefs = [
        ...toolDefs.filter((t) => DEV_PRIORITY.has(t.name)),
        ...toolDefs.filter((t) => !DEV_PRIORITY.has(t.name)),
      ];
      const tools = sortedDefs.map((t) => ({
        type: 'function' as const,
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? {},
        strict: false,
      }));

      const history = this.loadSessionMessages(normalizedSessionId);
      const inputMessages: Array<Record<string, unknown>> = [];
      for (const msg of history) {
        if (typeof msg.content === 'string') {
          inputMessages.push({ role: msg.role, content: msg.content });
        }
      }
      inputMessages.push({ role: 'user', content: message });

      let finalResponse = '';
      let lastToolSummary = '';
      let currentInput: any = inputMessages;

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        const params: any = {
          model: modelName,
          instructions: systemPrompt,
          input: currentInput,
          store: false,
        };

        // Dynamically trim tools to stay within proxy body size limit (~8KB)
        // IMPORTANT: use Buffer.byteLength for UTF-8 byte count (Chinese chars = 3 bytes each)
        if (tools.length > 0) {
          const baseJson = JSON.stringify(params);
          const baseSize = Buffer.byteLength(baseJson, 'utf-8');
          const maxBodySize = 7600;
          if (baseSize < maxBodySize) {
            const budget = maxBodySize - baseSize;
            const fittingTools: typeof tools = [];
            let toolsSize = 0;
            for (const tool of tools) {
              const toolSize = Buffer.byteLength(JSON.stringify(tool), 'utf-8') + 1;
              if (toolsSize + toolSize > budget) break;
              fittingTools.push(tool);
              toolsSize += toolSize;
            }
            if (fittingTools.length > 0) {
              params.tools = fittingTools;
              if (fittingTools.length < tools.length) {
                console.log(`[${providerLabel}] ✂️ Trimmed tools: ${fittingTools.length}/${tools.length} (body ${baseSize}+${toolsSize}/${maxBodySize} bytes)`);
              }
            }
          }
        }

        let response: Record<string, unknown>;
        try {
          response = await callResponsesAPI(baseURL, apiKey, params);
        } catch (apiErr: any) {
          if ((apiErr?.status === 400 || apiErr?.status === 413) && iteration > 0) {
            console.warn(`[${providerLabel}] API error on iteration ${iteration}, returning last response`);
            break;
          }
          throw apiErr;
        }

        const output = Array.isArray(response.output) ? response.output : [];

        // Extract text output
        for (const item of output) {
          if (item && (item as any).type === 'message' && Array.isArray((item as any).content)) {
            for (const block of (item as any).content) {
              if (block && block.type === 'output_text' && typeof block.text === 'string') {
                finalResponse = block.text;
              }
            }
          }
        }

        // Check for function calls
        const funcCalls = output.filter((item: any) => item?.type === 'function_call');
        if (funcCalls.length === 0) {
          break;
        }

        const toolSummaryLines: string[] = [];
        const nextInput: any[] = [...(Array.isArray(currentInput) ? currentInput : []), ...output];

        for (const fc of funcCalls) {
          const toolName = (fc as any).name as string;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(((fc as any).arguments as string) || '{}');
          } catch {
            toolArgs = {};
          }

          const executionInput = this.adaptToolArgsForExecution(toolName, toolArgs);
          console.log(`[${providerLabel}] Tool call: ${toolName}`, executionInput);

          try {
            const result = await this.executeTool(toolName, executionInput);
            const modelResult = this.adaptToolResultForModel(toolName, result);
            const content = this.serializeToolContent(modelResult);
            nextInput.push({ type: 'function_call_output', call_id: (fc as any).call_id, output: content });
            toolSummaryLines.push(`- ${toolName}: ${content.slice(0, 600)}`);
          } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`[${providerLabel}] Tool execution failed ${toolName}:`, errorMessage);
            nextInput.push({ type: 'function_call_output', call_id: (fc as any).call_id, output: `tool_error: ${errorMessage}` });
            toolSummaryLines.push(`- ${toolName}: tool_error: ${errorMessage}`);
          }
        }

        lastToolSummary = toolSummaryLines.join('\n');
        currentInput = nextInput;
      }

      if (!finalResponse && lastToolSummary) {
        finalResponse = `已完成工具调用，但模型未返回最终文本。最近一次工具结果:\n${lastToolSummary}`;
      }
      if (!finalResponse) {
        finalResponse = '抱歉，处理您的请求需要太多步骤，请尝试简化问题。';
      }

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${finalResponse}`);

      const persistMessages: MessageParam[] = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: finalResponse },
      ];
      this.persistSessionMessages(normalizedSessionId, persistMessages);

      return finalResponse;
    } catch (error) {
      console.error(`Chat (${providerLabel}) error:`, error);
      throw error;
    }
  }

  /**
   * Generic Anthropic-compatible chat method for third-party providers (e.g. Krio).
   * Uses raw fetch to bypass SDK Cloudflare WAF blocks.
   * Full multi-turn tool loop support.
   */
  private async chatAnthropicCompatible(
    baseURL: string,
    apiKey: string,
    modelName: string,
    providerLabel: string,
    message: string,
    sessionId?: string,
  ): Promise<string> {
    if (!apiKey) {
      return `错误: 未配置 ${providerLabel} API Key`;
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);
      const normalizedSessionId = this.normalizeSessionId(sessionId);

      await this.toolManager.initializeSkills();
      const allToolDefs = this.toolManager.getToolDefinitions();
      // Prioritize dev tools (read_file, write_file, etc.) for third-party proxies
      // to avoid context limits from too many tool definitions
      const DEV_TOOL_NAMES = new Set([
        'read_file', 'write_file', 'edit_file', 'list_dir', 'search_files',
        'run_command', 'create_skill', 'list_skills', 'get_coding_progress',
        'screenshot', 'ocr', 'click', 'type_text', 'hotkey',
      ]);
      const toolDefs = allToolDefs.filter((t: any) => DEV_TOOL_NAMES.has(t.name));
      console.log(`[${providerLabel}] Sending ${toolDefs.length}/${allToolDefs.length} tools`);

      const history = this.loadSessionMessages(normalizedSessionId);
      // Build messages array for Anthropic Messages API
      const apiMessages: Array<Record<string, unknown>> = [];
      for (const msg of history) {
        if (typeof msg.content === 'string') {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }
      apiMessages.push({ role: 'user', content: message });

      let finalResponse = '';
      let lastToolSummary = '';

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        const body: Record<string, unknown> = {
          model: modelName,
          max_tokens: this.maxTokens,
          system: [{ type: 'text', text: systemPrompt }],
          messages: apiMessages,
        };
        if (toolDefs.length > 0) {
          body.tools = toolDefs;
        }

        let response: Record<string, unknown>;
        try {
          response = await callAnthropicMessagesAPI(baseURL, apiKey, body);
        } catch (apiErr: any) {
          // On 400 context limit, retry without tools if this is a follow-up iteration
          if (apiErr?.status === 400 && iteration > 0) {
            console.warn(`[${providerLabel}] Context limit hit on iteration ${iteration}, returning last response`);
            break;
          }
          throw apiErr;
        }

        const content = response.content as any[];
        const stopReason = response.stop_reason as string | undefined;

        // Add assistant response to message history
        apiMessages.push({ role: 'assistant', content });

        // Extract text blocks
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
              finalResponse = block.text;
            }
          }
        }

        // Check for tool_use blocks
        const toolUses = Array.isArray(content)
          ? content.filter((b: any) => b?.type === 'tool_use')
          : [];

        if (stopReason !== 'tool_use' || toolUses.length === 0) {
          break; // No more tool calls, done
        }

        // Execute each tool call and build tool_result blocks
        const toolResultBlocks: any[] = [];
        const toolSummaryLines: string[] = [];

        for (const toolUse of toolUses) {
          const toolName = toolUse.name as string;
          const rawInput = toolUse.input ?? {};
          const safeInput = typeof rawInput === 'object' ? rawInput as Record<string, unknown> : {};
          const executionInput = this.adaptToolArgsForExecution(toolName, safeInput);

          console.log(`[${providerLabel}] Tool call: ${toolName}`, executionInput);

          try {
            const result = await this.executeTool(toolName, executionInput);
            const modelResult = this.adaptToolResultForModel(toolName, result);
            const content = this.buildToolResultContent(toolName, modelResult);

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content,
            });
            toolSummaryLines.push(this.buildToolSummaryLine(toolName, modelResult));
          } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`[${providerLabel}] Tool execution failed ${toolName}:`, errorMessage);

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `tool_error: ${errorMessage}`,
              is_error: true,
            });
            toolSummaryLines.push(`- ${toolName}: tool_error: ${errorMessage}`);
          }
        }

        lastToolSummary = toolSummaryLines.join('\n');
        // Add tool results as a user message (Anthropic format)
        apiMessages.push({ role: 'user', content: toolResultBlocks });
      }

      if (!finalResponse && lastToolSummary) {
        finalResponse = `已完成工具调用，但模型未返回最终文本。最近一次工具结果:\n${lastToolSummary}`;
      }
      if (!finalResponse) {
        finalResponse = '抱歉，处理您的请求需要太多步骤，请尝试简化问题。';
      }

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${finalResponse}`);

      // Persist simplified messages (text only for session history)
      const persistMessages: MessageParam[] = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: finalResponse },
      ];
      this.persistSessionMessages(normalizedSessionId, persistMessages);

      return finalResponse;
    } catch (error) {
      console.error(`Chat (${providerLabel}) error:`, error);
      throw error;
    }
  }

  private async chatAnthropic(message: string, sessionId?: string): Promise<string> {
    if (!this.anthropicClient) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);
      const normalizedSessionId = this.normalizeSessionId(sessionId);

      await this.toolManager.initializeSkills();
      const tools = this.toolManager.getToolDefinitions();
      const messages = this.loadSessionMessages(normalizedSessionId);
      messages.push({ role: 'user', content: message });
      let finalResponse = '';
      let lastToolSummary = '';

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        let currentMaxTokens = this.maxTokens;
        let useTools = tools.length > 0;
        let response: Awaited<ReturnType<typeof this.anthropicClient.messages.create>>;
        try {
          response = await this.anthropicClient.messages.create({
            model: this.anthropicModelName,
            max_tokens: currentMaxTokens,
            system: [{ type: 'text', text: systemPrompt }],
            messages,
            tools: useTools ? tools : undefined,
          });
        } catch (apiError: any) {
          // Auto-retry on 402 (insufficient credits) - drop tools to reduce tokens
          if (apiError?.status === 402 || apiError?.error?.type === '402' || String(apiError?.message ?? '').includes('402')) {
            console.warn(`⚠️ 402 token/credit limit hit, retrying without tools`);
            useTools = false;
            try {
              response = await this.anthropicClient.messages.create({
                model: this.anthropicModelName,
                max_tokens: Math.min(currentMaxTokens, 512),
                system: [{ type: 'text', text: systemPrompt }],
                messages,
              });
            } catch (retryError: any) {
              // If still failing, use minimal fallback
              console.warn(`⚠️ Retry also failed, switching to simple fallback`);
              return await this.chatSimpleByProvider('anthropic', message, sessionId);
            }
          } else {
            throw apiError;
          }
        }

        messages.push({
          role: 'assistant',
          content: response.content,
        });

        const textResponse = this.extractTextFromBlocks(response.content);
        if (textResponse) {
          finalResponse = textResponse;
        }

        const toolUses = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use',
        );

        if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
          break;
        }

        const toolResultBlocks: ToolResultBlockParam[] = [];
        const toolSummaryLines: string[] = [];

        for (const toolUse of toolUses) {
          const rawInput = toolUse.input;
          const safeInput =
            rawInput && typeof rawInput === 'object'
              ? (rawInput as Record<string, unknown>)
              : {};
          const executionInput = this.adaptToolArgsForExecution(toolUse.name, safeInput);

          console.log(`Tool call: ${toolUse.name}`, executionInput);

          try {
            const result = await this.executeTool(toolUse.name, executionInput);
            const modelResult = this.adaptToolResultForModel(toolUse.name, result);
            const toolResultContent = this.buildToolResultContent(toolUse.name, modelResult);

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: toolResultContent,
            });
            toolSummaryLines.push(this.buildToolSummaryLine(toolUse.name, modelResult));
          } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error(`Tool execution failed ${toolUse.name}:`, errorMessage);

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `tool_error: ${errorMessage}`,
              is_error: true,
            });
            toolSummaryLines.push(`- ${toolUse.name}: tool_error: ${errorMessage}`);
          }
        }

        lastToolSummary = toolSummaryLines.join('\n');
        messages.push({
          role: 'user',
          content: toolResultBlocks,
        });
      }

      if (!finalResponse && lastToolSummary) {
        finalResponse = `已完成工具调用，但模型未返回最终文本。最近一次工具结果:\n${lastToolSummary}`;
      }

      if (!finalResponse) {
        finalResponse = '抱歉，处理您的请求需要太多步骤，请尝试简化问题。';
      }

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${finalResponse}`);
      this.persistSessionMessages(normalizedSessionId, messages);

      return finalResponse;
    } catch (error) {
      console.error('Chat (Anthropic) error:', error);
      throw error;
    }
  }

  async chatSimple(message: string, sessionId?: string): Promise<string> {
    if (this.provider === 'openai') {
      if (!this.openaiApiKey) return '错误: 未配置 OPENAI_API_KEY';
      try {
        const memories = await this.memoryManager.search(message, 5);
        const systemPrompt = this.buildSystemPrompt(memories);
        const response = await callResponsesAPI(this.openaiBaseURL, this.openaiApiKey, {
          model: this.openaiModelName,
          instructions: systemPrompt,
          input: [{ role: 'user', content: message }],
          store: false,
        });
        let assistantMessage = '';
        const output = Array.isArray(response.output) ? response.output : [];
        for (const item of output) {
          if ((item as any)?.type === 'message' && Array.isArray((item as any).content)) {
            for (const block of (item as any).content) {
              if (block?.type === 'output_text') assistantMessage = block.text;
            }
          }
        }
        await this.memoryManager.addDaily(`用户: ${message}`);
        await this.memoryManager.addDaily(`助手: ${assistantMessage}`);
        return assistantMessage;
      } catch (error) {
        console.error('ChatSimple (OpenAI) error:', error);
        return `处理消息时出错: ${(error as Error).message}`;
      }
    }

    if (!this.anthropicClient) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);
      const normalizedSessionId = this.normalizeSessionId(sessionId);
      const messages = this.loadSessionMessages(normalizedSessionId);
      messages.push({ role: 'user', content: message });

      const response = await this.anthropicClient.messages.create({
        model: this.anthropicModelName,
        max_tokens: this.maxTokens,
        system: [{ type: 'text', text: systemPrompt }],
        messages,
      });

      const content = response.content[0];
      const assistantMessage = content.type === 'text' ? content.text : '';
      messages.push({ role: 'assistant', content: response.content });

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${assistantMessage}`);
      this.persistSessionMessages(normalizedSessionId, messages);

      return assistantMessage;
    } catch (error) {
      console.error('Chat simple error:', error);
      return `处理消息时出错: ${(error as Error).message}`;
    }
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const decision = this.securityGuard.evaluate(toolName, args);
    if (!decision.allowed) {
      throw new Error(
        `Tool "${toolName}" blocked by security policy: ${decision.reason ?? 'denied'}`,
      );
    }
    if (decision.warnings.length > 0) {
      console.warn(
        `[Security][${decision.mode}] ${toolName}: ${decision.warnings.join('; ')}`,
      );
    }

    return await this.toolManager.executeTool(toolName, args);
  }

  getAvailableTools(): { name: string; description: string }[] {
    return this.toolManager.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  getSecurityPolicy(): ToolSecurityPolicy {
    return this.securityGuard.getPolicy();
  }

  getModelConfig(): {
    provider: AIProvider;
    openai: { model: string; baseUrl: string; hasKey: boolean };
    anthropic: { model: string; baseUrl: string; hasKey: boolean };
  } {
    return {
      provider: this.provider,
      openai: {
        model: this.openaiModelName,
        baseUrl: parseNonEmptyString(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1',
        hasKey: !!parseNonEmptyString(process.env.OPENAI_API_KEY),
      },
      anthropic: {
        model: this.anthropicModelName,
        baseUrl: parseNonEmptyString(process.env.ANTHROPIC_BASE_URL) ?? 'https://api.anthropic.com',
        hasKey: !!parseNonEmptyString(process.env.ANTHROPIC_API_KEY),
      },
    };
  }

  updateModelConfig(patch: {
    provider?: string;
    openaiModel?: string;
    openaiBaseUrl?: string;
    openaiApiKey?: string;
    anthropicModel?: string;
    anthropicBaseUrl?: string;
    anthropicApiKey?: string;
  }): void {
    if (patch.provider === 'openai' || patch.provider === 'anthropic' || patch.provider === 'ohmygpt' || patch.provider === 'krio') {
      this.provider = patch.provider as AIProvider;
      process.env.CHUBAO_AI_PROVIDER = patch.provider;
    }
    if (patch.openaiModel) {
      this.openaiModelName = patch.openaiModel;
      process.env.OPENAI_MODEL = patch.openaiModel;
    }
    if (patch.openaiBaseUrl) {
      process.env.OPENAI_BASE_URL = patch.openaiBaseUrl;
      this.openaiBaseURL = patch.openaiBaseUrl;
      const key = parseNonEmptyString(process.env.OPENAI_API_KEY);
      if (key) {
        this.openaiClient = new OpenAI({
          apiKey: key,
          baseURL: patch.openaiBaseUrl,
          defaultHeaders: { 'User-Agent': 'chubao-ai/0.1.0' },
          fetch: createCleanFetch(),
        });
      }
    }
    if (patch.openaiApiKey) {
      process.env.OPENAI_API_KEY = patch.openaiApiKey;
      this.openaiApiKey = patch.openaiApiKey;
      const baseURL = parseNonEmptyString(process.env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1';
      this.openaiBaseURL = baseURL;
      this.openaiClient = new OpenAI({
        apiKey: patch.openaiApiKey,
        baseURL,
        defaultHeaders: { 'User-Agent': 'chubao-ai/0.1.0' },
        fetch: createCleanFetch(),
      });
    }
    if (patch.anthropicModel) {
      this.anthropicModelName = patch.anthropicModel;
      process.env.ANTHROPIC_MODEL = patch.anthropicModel;
    }
    if (patch.anthropicBaseUrl) {
      process.env.ANTHROPIC_BASE_URL = patch.anthropicBaseUrl;
      const key = parseNonEmptyString(process.env.ANTHROPIC_API_KEY);
      if (key) {
        this.anthropicClient = new Anthropic({ apiKey: key, baseURL: patch.anthropicBaseUrl });
      }
    }
    if (patch.anthropicApiKey) {
      process.env.ANTHROPIC_API_KEY = patch.anthropicApiKey;
      const baseURL = parseNonEmptyString(process.env.ANTHROPIC_BASE_URL);
      this.anthropicClient = new Anthropic(baseURL ? { apiKey: patch.anthropicApiKey, baseURL } : { apiKey: patch.anthropicApiKey });
    }
    this.modelName = this.provider === 'anthropic'
      ? this.anthropicModelName
      : this.provider === 'ohmygpt'
        ? this.ohmygptModelName
        : this.provider === 'krio'
          ? this.krioModelName
          : this.openaiModelName;
    console.log(`\u{1F504} Model config updated: provider=${this.provider}, model=${this.modelName}`);

    const autoPersist = parseBoolean(process.env.CHUBAO_ENV_AUTO_PERSIST, false);
    if (autoPersist) {
      try {
        const result = this.persistModelConfig({
          dryRun: false,
          includeSecrets: true,
        });
        if (result.wrote) {
          console.log(`\u{1F4BE} Model config auto-persisted: ${result.envPath}`);
        }
      } catch (error) {
        console.warn(
          'Failed to auto-persist model config:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  persistModelConfig(
    options: PersistModelConfigOptions = {},
  ): PersistModelConfigResult {
    const dryRun = options.dryRun !== false;
    const includeSecrets = options.includeSecrets === true;
    const envPath = this.resolveEnvFilePath();
    const entries = this.getPersistableModelConfigEntries();

    let existingContent = '';
    if (fsSync.existsSync(envPath)) {
      existingContent = fsSync.readFileSync(envPath, 'utf8');
    }

    const lineBreak = existingContent.includes('\r\n') ? '\r\n' : '\n';
    const lines = existingContent.length > 0
      ? existingContent.split(/\r?\n/)
      : [];

    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const keyToLine = new Map<string, number>();
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index]?.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (match && !keyToLine.has(match[1])) {
        keyToLine.set(match[1], index);
      }
    }

    const changes: PersistModelConfigChange[] = [];

    for (const entry of entries) {
      if (entry.secret && !includeSecrets) {
        changes.push({
          key: entry.key,
          action: 'skipped',
          masked: true,
        });
        continue;
      }

      const normalizedValue = this.normalizeEnvValue(entry.value);
      const nextLine = `${entry.key}=${normalizedValue}`;
      const currentLineIndex = keyToLine.get(entry.key);

      if (currentLineIndex === undefined) {
        lines.push(nextLine);
        keyToLine.set(entry.key, lines.length - 1);
        changes.push({
          key: entry.key,
          action: 'set',
          masked: entry.secret,
        });
        continue;
      }

      if (lines[currentLineIndex] === nextLine) {
        changes.push({
          key: entry.key,
          action: 'unchanged',
          masked: entry.secret,
        });
        continue;
      }

      lines[currentLineIndex] = nextLine;
      changes.push({
        key: entry.key,
        action: 'set',
        masked: entry.secret,
      });
    }

    const nextContent = `${lines.join(lineBreak)}${lineBreak}`;
    const contentChanged = existingContent !== nextContent;
    const wrote = !dryRun && contentChanged;

    if (wrote) {
      const envDir = path.dirname(envPath);
      fsSync.mkdirSync(envDir, { recursive: true });
      fsSync.writeFileSync(envPath, nextContent, 'utf8');
    }

    return {
      dryRun,
      wrote,
      envPath,
      changes,
    };
  }

  /**
   * Read Claude Code's config from ~/.claude/settings.json
   * Returns detected API key, base URL, and model info.
   */
  static readClaudeCodeConfig(): {
    found: boolean;
    configPath: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    maxOutputTokens?: string;
    error?: string;
  } {
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const configPath = path.join(home, '.claude', 'settings.json');
    try {
      if (!fsSync.existsSync(configPath)) {
        return { found: false, configPath, error: 'Claude Code settings.json not found' };
      }
      const raw = fsSync.readFileSync(configPath, 'utf8');
      const settings = JSON.parse(raw) as {
        env?: Record<string, string>;
        model?: string;
      };
      const env = settings.env ?? {};
      // Claude Code uses ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
      const apiKey = env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? undefined;
      const baseUrl = env.ANTHROPIC_BASE_URL ?? undefined;
      const model = env.ANTHROPIC_MODEL ?? settings.model ?? undefined;
      const maxOutputTokens = env.CLAUDE_CODE_MAX_OUTPUT_TOKENS ?? undefined;
      return { found: true, configPath, apiKey, baseUrl, model, maxOutputTokens };
    } catch (error) {
      return { found: false, configPath, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Import Claude Code config into Chubao AI's Anthropic provider.
   */
  syncFromClaudeCode(): {
    success: boolean;
    synced: { apiKey: boolean; baseUrl: boolean; model: boolean };
    error?: string;
  } {
    const cc = AgentRuntime.readClaudeCodeConfig();
    if (!cc.found || !cc.apiKey) {
      return {
        success: false,
        synced: { apiKey: false, baseUrl: false, model: false },
        error: cc.error ?? 'No API key found in Claude Code config',
      };
    }
    const patch: Parameters<typeof this.updateModelConfig>[0] = {};
    const synced = { apiKey: false, baseUrl: false, model: false };
    if (cc.apiKey) {
      patch.anthropicApiKey = cc.apiKey;
      synced.apiKey = true;
    }
    if (cc.baseUrl) {
      patch.anthropicBaseUrl = cc.baseUrl;
      synced.baseUrl = true;
    }
    if (cc.model) {
      patch.anthropicModel = cc.model;
      synced.model = true;
    }
    // Switch to anthropic provider
    patch.provider = 'anthropic';
    this.updateModelConfig(patch);
    console.log(`\u{1F504} Synced from Claude Code: key=${synced.apiKey}, url=${synced.baseUrl}, model=${synced.model}`);
    return { success: true, synced };
  }

  private getPersistableModelConfigEntries(): Array<{
    key: PersistModelConfigKey;
    value: string;
    secret: boolean;
  }> {
    return [
      {
        key: 'CHUBAO_AI_PROVIDER',
        value: this.provider,
        secret: false,
      },
      {
        key: 'OPENAI_MODEL',
        value: this.openaiModelName,
        secret: false,
      },
      {
        key: 'OPENAI_BASE_URL',
        value: parseNonEmptyString(process.env.OPENAI_BASE_URL) ?? '',
        secret: false,
      },
      {
        key: 'OPENAI_API_KEY',
        value: parseNonEmptyString(process.env.OPENAI_API_KEY) ?? '',
        secret: true,
      },
      {
        key: 'ANTHROPIC_MODEL',
        value: this.anthropicModelName,
        secret: false,
      },
      {
        key: 'ANTHROPIC_BASE_URL',
        value: parseNonEmptyString(process.env.ANTHROPIC_BASE_URL) ?? '',
        secret: false,
      },
      {
        key: 'ANTHROPIC_API_KEY',
        value: parseNonEmptyString(process.env.ANTHROPIC_API_KEY) ?? '',
        secret: true,
      },
    ];
  }

  private resolveEnvFilePath(): string {
    const explicitEnvPath = parseNonEmptyString(process.env.CHUBAO_ENV_FILE);
    if (explicitEnvPath) {
      return path.isAbsolute(explicitEnvPath)
        ? explicitEnvPath
        : path.resolve(process.cwd(), explicitEnvPath);
    }

    const explicitProjectRoot = parseNonEmptyString(process.env.CHUBAO_PROJECT_ROOT);
    if (explicitProjectRoot) {
      return path.join(explicitProjectRoot, '.env');
    }

    const cwdEnv = path.join(process.cwd(), '.env');
    const parentEnv = path.resolve(process.cwd(), '..', '.env');
    const grandParentEnv = path.resolve(process.cwd(), '..', '..', '.env');

    if (fsSync.existsSync(cwdEnv)) {
      return cwdEnv;
    }
    if (fsSync.existsSync(parentEnv)) {
      return parentEnv;
    }
    if (fsSync.existsSync(grandParentEnv)) {
      return grandParentEnv;
    }

    return grandParentEnv;
  }

  private normalizeEnvValue(value: string): string {
    return value.replace(/\r?\n/g, ' ').trim();
  }

  private extractTextFromBlocks(blocks: Array<TextBlock | ToolUseBlock>): string {
    return blocks
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .filter((text) => text.length > 0)
      .join('\n')
      .trim();
  }

  private buildToolResultContent(toolName: string, result: unknown): ToolResultContent {
    if (toolName === 'browser_screenshot') {
      const screenshot = this.asVisionScreenshotResult(result);
      if (!screenshot) {
        return this.serializeToolContent(result);
      }

      const mediaType = this.normalizeImageMediaType(screenshot.mediaType ?? screenshot.media_type);
      const path = typeof screenshot.path === 'string' && screenshot.path ? screenshot.path : 'unknown';
      const url = typeof screenshot.url === 'string' && screenshot.url ? screenshot.url : 'unknown';
      const sizeText = this.formatScreenshotSize(screenshot.size);

      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: screenshot.base64,
          },
        },
        {
          type: 'text',
          text: `Browser screenshot saved: ${path}, url: ${url}, size: ${sizeText}`,
        },
      ];
    }

    if (toolName !== 'screenshot') {
      return this.serializeToolContent(result);
    }

    const screenshot = this.asVisionScreenshotResult(result);
    if (!screenshot) {
      return this.serializeToolContent(result);
    }

    const mediaType = this.normalizeImageMediaType(screenshot.mediaType ?? screenshot.media_type);
    const path = typeof screenshot.path === 'string' && screenshot.path ? screenshot.path : 'unknown';
    const modelSizeText = this.formatScreenshotSize(screenshot.modelSize ?? screenshot.model_size ?? screenshot.size);
    const transform = this.extractCoordinateTransform(screenshot) ?? this.coordinateTransform;
    const transformText = transform
      ? `model=${transform.modelWidth}x${transform.modelHeight}, actual=${transform.actualWidth}x${transform.actualHeight}, scale=(${transform.scaleX.toFixed(4)}, ${transform.scaleY.toFixed(4)})`
      : 'coordinate transform unavailable';

    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: screenshot.base64,
        },
      },
      {
        type: 'text',
        text: `Screenshot saved: ${path}, model_size: ${modelSizeText}, ${transformText}`,
      },
    ];
  }

  private buildToolSummaryLine(toolName: string, result: unknown): string {
    if (toolName === 'browser_screenshot') {
      const screenshot = this.asVisionScreenshotResult(result);
      if (screenshot) {
        const path = typeof screenshot.path === 'string' && screenshot.path ? screenshot.path : 'unknown';
        const url = typeof screenshot.url === 'string' && screenshot.url ? screenshot.url : 'unknown';
        const sizeText = this.formatScreenshotSize(screenshot.size);
        return `- ${toolName}: path=${path}, url=${url}, size=${sizeText}`;
      }
    }

    if (toolName === 'screenshot') {
      const screenshot = this.asVisionScreenshotResult(result);
      if (screenshot) {
        const path = typeof screenshot.path === 'string' && screenshot.path ? screenshot.path : 'unknown';
        const modelSizeText = this.formatScreenshotSize(screenshot.modelSize ?? screenshot.model_size ?? screenshot.size);
        const transform = this.extractCoordinateTransform(screenshot) ?? this.coordinateTransform;
        const transformText = transform
          ? `, model=${transform.modelWidth}x${transform.modelHeight}, actual=${transform.actualWidth}x${transform.actualHeight}`
          : '';
        return `- ${toolName}: path=${path}, size=${modelSizeText}${transformText}`;
      }
    }

    const serialized = this.serializeToolContent(result);
    const maxLen = 600;
    const compact = serialized.length > maxLen ? `${serialized.slice(0, maxLen)}...(truncated)` : serialized;
    return `- ${toolName}: ${compact}`;
  }

  private asVisionScreenshotResult(result: unknown): VisionScreenshotResult | null {
    if (!this.isRecord(result)) {
      return null;
    }

    const base64 = result.base64;
    if (typeof base64 !== 'string' || base64.length === 0) {
      return null;
    }

    return {
      base64,
      path: result.path,
      url: result.url,
      size: result.size,
      actualSize: result.actualSize,
      actual_size: result.actual_size,
      modelSize: result.modelSize,
      model_size: result.model_size,
      scaleX: result.scaleX,
      scale_x: result.scale_x,
      scaleY: result.scaleY,
      scale_y: result.scale_y,
      mediaType: result.mediaType,
      media_type: result.media_type,
    };
  }

  private formatScreenshotSize(size: unknown): string {
    if (Array.isArray(size) && size.length >= 2 && Number.isFinite(Number(size[0])) && Number.isFinite(Number(size[1]))) {
      return `${size[0]}x${size[1]}`;
    }

    if (this.isRecord(size)) {
      const width = size.width;
      const height = size.height;
      if (Number.isFinite(Number(width)) && Number.isFinite(Number(height))) {
        return `${width}x${height}`;
      }
    }

    return 'unknown';
  }

  private normalizeImageMediaType(mediaType: unknown): VisionMediaType {
    if (mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/gif' || mediaType === 'image/webp') {
      return mediaType;
    }
    return 'image/png';
  }

  private adaptToolArgsForExecution(
    toolName: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...args };

    if (toolName === 'screenshot') {
      if (next.modelWidth === undefined) {
        next.modelWidth = this.modelViewportWidth;
      }
      if (next.modelHeight === undefined) {
        next.modelHeight = this.modelViewportHeight;
      }
      return next;
    }

    if (!this.coordinateTransform) {
      return next;
    }

    switch (toolName) {
      case 'click':
      case 'right_click':
      case 'double_click':
      case 'hover':
        next.x = this.convertScalarToActual(next.x, 'x');
        next.y = this.convertScalarToActual(next.y, 'y');
        return next;
      case 'drag':
        next.startX = this.convertScalarToActual(next.startX, 'x');
        next.startY = this.convertScalarToActual(next.startY, 'y');
        next.endX = this.convertScalarToActual(next.endX, 'x');
        next.endY = this.convertScalarToActual(next.endY, 'y');
        return next;
      default:
        return next;
    }
  }

  private adaptToolResultForModel(toolName: string, result: unknown): unknown {
    if (toolName === 'screenshot') {
      const screenshot = this.asVisionScreenshotResult(result);
      if (!screenshot) {
        return result;
      }

      const transform = this.extractCoordinateTransform(screenshot);
      if (transform) {
        this.coordinateTransform = transform;
      }

      if (this.isRecord(result) && this.coordinateTransform) {
        return {
          ...result,
          coordinateTransform: {
            modelSize: [
              this.coordinateTransform.modelWidth,
              this.coordinateTransform.modelHeight,
            ],
            actualSize: [
              this.coordinateTransform.actualWidth,
              this.coordinateTransform.actualHeight,
            ],
            scaleX: this.coordinateTransform.scaleX,
            scaleY: this.coordinateTransform.scaleY,
            updatedAt: this.coordinateTransform.updatedAt,
          },
        };
      }

      return result;
    }

    if (!this.coordinateTransform || !this.isRecord(result)) {
      return result;
    }

    switch (toolName) {
      case 'list_windows': {
        const windows = Array.isArray(result.windows) ? result.windows : [];
        return {
          ...result,
          windows: windows.map((windowItem) => {
            if (!this.isRecord(windowItem)) {
              return windowItem;
            }
            return {
              ...windowItem,
              position: this.convertRectangleToModel(windowItem.position),
            };
          }),
        };
      }
      case 'get_window_controls': {
        const controls = Array.isArray(result.controls) ? result.controls : [];
        return {
          ...result,
          controls: controls.map((controlItem) => {
            if (!this.isRecord(controlItem)) {
              return controlItem;
            }
            return {
              ...controlItem,
              position: this.convertRectangleToModel(controlItem.position),
            };
          }),
        };
      }
      case 'click':
      case 'right_click':
      case 'double_click':
      case 'hover':
      case 'ocr_find_text':
      case 'ocr_click_text':
        return {
          ...result,
          position: this.convertPointArrayToModel(result.position),
        };
      case 'drag':
        return {
          ...result,
          from: this.convertPointArrayToModel(result.from),
          to: this.convertPointArrayToModel(result.to),
        };
      default:
        return result;
    }
  }

  private extractCoordinateTransform(
    screenshot: VisionScreenshotResult,
  ): CoordinateTransform | null {
    const actualSize = this.parseSizePair(
      screenshot.actualSize ?? screenshot.actual_size ?? screenshot.size,
    );
    const modelSize =
      this.parseSizePair(screenshot.modelSize ?? screenshot.model_size) ??
      [this.modelViewportWidth, this.modelViewportHeight];

    if (!actualSize || !modelSize) {
      return null;
    }

    const providedScaleX = this.toFiniteNumber(screenshot.scaleX ?? screenshot.scale_x);
    const providedScaleY = this.toFiniteNumber(screenshot.scaleY ?? screenshot.scale_y);
    const scaleX =
      providedScaleX && providedScaleX > 0
        ? providedScaleX
        : actualSize[0] / modelSize[0];
    const scaleY =
      providedScaleY && providedScaleY > 0
        ? providedScaleY
        : actualSize[1] / modelSize[1];

    if (!(scaleX > 0) || !(scaleY > 0)) {
      return null;
    }

    return {
      modelWidth: modelSize[0],
      modelHeight: modelSize[1],
      actualWidth: actualSize[0],
      actualHeight: actualSize[1],
      scaleX,
      scaleY,
      updatedAt: new Date().toISOString(),
    };
  }

  private parseSizePair(value: unknown): [number, number] | null {
    if (Array.isArray(value) && value.length >= 2) {
      const width = this.toFiniteNumber(value[0]);
      const height = this.toFiniteNumber(value[1]);
      if (width && width > 0 && height && height > 0) {
        return [width, height];
      }
      return null;
    }

    if (this.isRecord(value)) {
      const width = this.toFiniteNumber(value.width);
      const height = this.toFiniteNumber(value.height);
      if (width && width > 0 && height && height > 0) {
        return [width, height];
      }
    }

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private convertScalarToActual(
    value: unknown,
    axis: 'x' | 'y',
  ): unknown {
    const numeric = this.toFiniteNumber(value);
    if (numeric === null) {
      return value;
    }
    return axis === 'x'
      ? this.modelToActualX(numeric)
      : this.modelToActualY(numeric);
  }

  private convertScalarToModel(
    value: unknown,
    axis: 'x' | 'y',
  ): unknown {
    const numeric = this.toFiniteNumber(value);
    if (numeric === null) {
      return value;
    }
    return axis === 'x'
      ? this.actualToModelX(numeric)
      : this.actualToModelY(numeric);
  }

  private modelToActualX(value: number): number {
    if (!this.coordinateTransform) {
      return Math.round(value);
    }
    return Math.round(value * this.coordinateTransform.scaleX);
  }

  private modelToActualY(value: number): number {
    if (!this.coordinateTransform) {
      return Math.round(value);
    }
    return Math.round(value * this.coordinateTransform.scaleY);
  }

  private actualToModelX(value: number): number {
    if (!this.coordinateTransform || this.coordinateTransform.scaleX <= 0) {
      return Math.round(value);
    }
    return Math.round(value / this.coordinateTransform.scaleX);
  }

  private actualToModelY(value: number): number {
    if (!this.coordinateTransform || this.coordinateTransform.scaleY <= 0) {
      return Math.round(value);
    }
    return Math.round(value / this.coordinateTransform.scaleY);
  }

  private convertPointArrayToModel(value: unknown): unknown {
    if (!Array.isArray(value) || value.length < 2) {
      return value;
    }

    const x = this.toFiniteNumber(value[0]);
    const y = this.toFiniteNumber(value[1]);
    if (x === null || y === null) {
      return value;
    }

    return [this.actualToModelX(x), this.actualToModelY(y)];
  }

  private convertRectangleToModel(value: unknown): unknown {
    if (!this.isRecord(value)) {
      return value;
    }

    const rect: Record<string, unknown> = { ...value };
    rect.left = this.convertScalarToModel(rect.left, 'x');
    rect.right = this.convertScalarToModel(rect.right, 'x');
    rect.x = this.convertScalarToModel(rect.x, 'x');
    rect.width = this.convertScalarToModel(rect.width, 'x');
    rect.top = this.convertScalarToModel(rect.top, 'y');
    rect.bottom = this.convertScalarToModel(rect.bottom, 'y');
    rect.y = this.convertScalarToModel(rect.y, 'y');
    rect.height = this.convertScalarToModel(rect.height, 'y');
    if (rect.center !== undefined) {
      rect.center = this.convertPointArrayToModel(rect.center);
    }

    return rect;
  }

  private serializeToolContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeSessionId(raw: string | undefined): string | null {
    const value = parseNonEmptyString(raw);
    if (!value) {
      return null;
    }
    return value.slice(0, 128);
  }

  private loadSessionMessages(sessionId: string | null): MessageParam[] {
    if (!sessionId) {
      return [];
    }
    return this.sessionStore.getMessages(sessionId);
  }

  private persistSessionMessages(sessionId: string | null, messages: MessageParam[]): void {
    if (!sessionId) {
      return;
    }
    this.sessionStore.setMessages(sessionId, messages);
  }

  private buildSystemPrompt(memories: string[]): string {
    const memoryContext =
      memories.length > 0
        ? `\n相关记忆: ${memories.join('; ')}`
        : '';

    const modelId = this.provider === 'openai'
      ? this.openaiModelName
      : this.provider === 'krio'
        ? this.krioModelName
        : this.provider === 'ohmygpt'
          ? this.ohmygptModelName
          : this.anthropicModelName;

    return `你是 Chubao AI，一个 Windows 本地 AI 自动化助手（底层模型: ${modelId}，服务商: ${this.provider}）。

## 核心能力
- 桌面自动化: screenshot, click, type_text, hotkey, ocr_recognize 等 GUI 工具
- 文件操作: read_file, write_file, edit_file, list_dir, search_files
- 命令执行: run_command (PowerShell, 30s超时, 危险命令已屏蔽)
- 技能管理: create_skill, list_skills (创建可复用的自动化技能)
- 编码进度: get_coding_progress (git变更分析)

## 工具使用规则
1. 当用户要求操作文件时，优先使用 read_file/write_file/edit_file
2. 修改代码前先用 read_file 查看文件内容
3. 用 edit_file 做精确替换，而不是重写整个文件
4. 创建新功能时可用 create_skill 将其封装为可复用技能
5. 路径可以是绝对路径或相对于工作区根目录的路径

## 坐标系
模型视口: ${this.modelViewportWidth}x${this.modelViewportHeight}，系统自动映射实际屏幕坐标。

请简洁友好地回答用户问题，遇到需要操作时主动使用工具完成。${memoryContext}`;
  }
}
