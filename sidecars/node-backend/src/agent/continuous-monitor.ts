/**
 * Continuous Dev Monitor - 持续开发监控器
 *
 * 后台循环运行，定期截图观察 OpenCode 编辑器状态，
 * 通过 Claude Vision 判断当前阶段并自动推进下一步开发。
 */

import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { AgentRuntime } from './runtime.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonitorStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

export type DetectedEditorState =
  | 'idle'
  | 'coding'
  | 'error'
  | 'waiting'
  | 'completed'
  | 'unknown';

export interface MonitorConfig {
  /** 检测间隔秒数，默认 30 */
  intervalSeconds: number;
  /** 最大循环次数，0 = 无限 */
  maxCycles: number;
  /** 高层任务描述 */
  taskDescription: string;
  /** 项目路径（用于 opencode CLI） */
  projectPath?: string;
  /** 要监控的窗口标题关键字，默认 "OpenCode" */
  windowTitle?: string;
  /** 连续报错时是否暂停 */
  pauseOnError: boolean;
  /** 连续错误上限，默认 3 */
  maxConsecutiveErrors: number;
}

export interface MonitorHistoryEntry {
  cycle: number;
  timestamp: string;
  detectedState: DetectedEditorState;
  action: string;
  success: boolean;
  error?: string;
}

export interface MonitorState {
  status: MonitorStatus;
  currentCycle: number;
  totalCycles: number;
  lastScreenshotAt: string | null;
  lastAction: string | null;
  lastDetectedState: DetectedEditorState | null;
  consecutiveErrors: number;
  history: MonitorHistoryEntry[];
  startedAt: string | null;
  stoppedAt: string | null;
  taskDescription: string;
  config: MonitorConfig | null;
}

interface PersistedMonitorPayload {
  schemaVersion: string;
  updatedAt: string;
  state: Omit<MonitorState, 'status'> & { status: string };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_SCHEMA_VERSION = 'continuous-monitor.v1';
const DEFAULT_STATE_PATH = path.join(process.cwd(), 'runtime-data', 'continuous-monitor.json');
const MAX_HISTORY_ENTRIES = 50;

const DEFAULT_CONFIG: MonitorConfig = {
  intervalSeconds: 30,
  maxCycles: 0,
  taskDescription: '',
  windowTitle: 'OpenCode',
  pauseOnError: true,
  maxConsecutiveErrors: 3,
};

// ---------------------------------------------------------------------------
// Monitor system prompt
// ---------------------------------------------------------------------------

function buildMonitorSystemPrompt(config: MonitorConfig, cycle: number): string {
  return `你现在是 Chubao AI 的「持续开发监控器」模式。

## 你的任务
你正在持续监控 OpenCode 编辑器，自动推进以下开发任务：
「${config.taskDescription}」

## 当前状态
- 监控循环 #${cycle}
- 目标窗口: ${config.windowTitle ?? 'OpenCode'}
${config.projectPath ? `- 项目路径: ${config.projectPath}` : ''}

## 工作流程
1. 首先调用 screenshot 工具截取当前屏幕
2. 分析截图，判断 OpenCode 编辑器的当前状态
3. 根据状态采取行动

## 状态判断规则
- **idle（空闲）**: 编辑器等待输入，没有正在执行的任务 → 提交下一个开发任务
- **coding（编码中）**: 编辑器正在执行任务/生成代码 → 报告 "coding"，不干预
- **error（报错）**: 编辑器显示错误/编译失败/测试失败 → 分析错误并尝试修复
- **waiting（等待输入）**: 编辑器弹出对话框/需要确认 → 用 GUI 操作回应
- **completed（完成）**: 当前任务已完成 → 检查结果，准备下一个任务

## 行动策略
- 优先使用 opencode_run CLI 工具提交任务（高效、稳定）
- 必要时使用 GUI 工具（click / type_text / hotkey）操作编辑器界面
- 提交任务前先 screenshot 确认当前状态
- 遇到错误时先截图分析，再用 CLI 或 GUI 修复

## 输出格式
在分析完成后，你的文本回复必须以如下 JSON 行开头（单独一行）：
\`\`\`
{"detectedState":"idle|coding|error|waiting|completed","action":"你采取的行动描述"}
\`\`\`
后面可以跟任何额外说明文字。`;
}

// ---------------------------------------------------------------------------
// ContinuousDevMonitor
// ---------------------------------------------------------------------------

export class ContinuousDevMonitor {
  private agentRuntime: AgentRuntime;
  private state: MonitorState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private statePath: string;
  private sessionId: string;

  constructor(agentRuntime: AgentRuntime) {
    this.agentRuntime = agentRuntime;
    this.statePath = process.env.CHUBAO_CONTINUOUS_DEV_STATE_PATH?.trim() || DEFAULT_STATE_PATH;
    this.sessionId = `continuous-dev-${Date.now()}`;
    this.state = this.createInitialState();
    this.loadPersistedState();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async start(config: Partial<MonitorConfig> & { taskDescription: string }): Promise<void> {
    if (this.state.status === 'running') {
      throw new Error('Monitor is already running');
    }

    const mergedConfig: MonitorConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      intervalSeconds: Math.max(10, config.intervalSeconds ?? DEFAULT_CONFIG.intervalSeconds),
      maxConsecutiveErrors: Math.max(1, config.maxConsecutiveErrors ?? DEFAULT_CONFIG.maxConsecutiveErrors),
    };

    this.sessionId = `continuous-dev-${Date.now()}`;
    this.state = {
      ...this.createInitialState(),
      status: 'running',
      taskDescription: mergedConfig.taskDescription,
      totalCycles: mergedConfig.maxCycles,
      startedAt: new Date().toISOString(),
      config: mergedConfig,
    };

    this.running = true;
    this.persistState();

    console.log(`[ContinuousDevMonitor] Started - interval=${mergedConfig.intervalSeconds}s, task="${mergedConfig.taskDescription}"`);

    // Run first cycle immediately, then schedule
    void this.runLoop(mergedConfig);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.status = 'stopped';
    this.state.stoppedAt = new Date().toISOString();
    this.persistState();
    console.log('[ContinuousDevMonitor] Stopped');
  }

  async pause(): Promise<void> {
    if (this.state.status !== 'running') {
      throw new Error('Monitor is not running');
    }
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.status = 'paused';
    this.persistState();
    console.log('[ContinuousDevMonitor] Paused');
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused') {
      throw new Error('Monitor is not paused');
    }
    if (!this.state.config) {
      throw new Error('No config available to resume');
    }
    this.running = true;
    this.state.status = 'running';
    this.persistState();
    console.log('[ContinuousDevMonitor] Resumed');
    void this.runLoop(this.state.config);
  }

  getState(): MonitorState {
    return { ...this.state, history: [...this.state.history] };
  }

  // -------------------------------------------------------------------------
  // Core loop
  // -------------------------------------------------------------------------

  private async runLoop(config: MonitorConfig): Promise<void> {
    while (this.running) {
      try {
        await this.runCycle(config);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ContinuousDevMonitor] Cycle ${this.state.currentCycle} error:`, errorMessage);

        this.state.consecutiveErrors++;
        this.addHistory({
          cycle: this.state.currentCycle,
          timestamp: new Date().toISOString(),
          detectedState: 'unknown',
          action: `cycle error: ${errorMessage}`,
          success: false,
          error: errorMessage,
        });

        if (config.pauseOnError && this.state.consecutiveErrors >= config.maxConsecutiveErrors) {
          console.warn(`[ContinuousDevMonitor] Paused after ${this.state.consecutiveErrors} consecutive errors`);
          this.state.status = 'paused';
          this.running = false;
          this.persistState();
          return;
        }
      }

      // Check max cycles
      if (config.maxCycles > 0 && this.state.currentCycle >= config.maxCycles) {
        console.log(`[ContinuousDevMonitor] Completed ${config.maxCycles} cycles`);
        this.state.status = 'completed';
        this.state.stoppedAt = new Date().toISOString();
        this.running = false;
        this.persistState();
        return;
      }

      if (!this.running) {
        break;
      }

      // Wait for next interval
      await this.sleep(config.intervalSeconds * 1000);
    }
  }

  private async runCycle(config: MonitorConfig): Promise<void> {
    this.state.currentCycle++;
    console.log(`[ContinuousDevMonitor] Cycle #${this.state.currentCycle} starting...`);

    const systemPrompt = buildMonitorSystemPrompt(config, this.state.currentCycle);

    // Build the user message instructing Claude to take a screenshot and analyze
    const userMessage = `请执行第 ${this.state.currentCycle} 轮监控循环：
1. 调用 screenshot 截取当前屏幕
2. 分析 ${config.windowTitle ?? 'OpenCode'} 编辑器的状态
3. 根据状态采取适当行动
${config.projectPath ? `\n项目路径: ${config.projectPath}` : ''}
${this.state.lastDetectedState ? `\n上一轮检测状态: ${this.state.lastDetectedState}` : ''}
${this.state.lastAction ? `\n上一轮动作: ${this.state.lastAction}` : ''}`;

    // Use the agent runtime to process the message with tools
    const response = await this.agentRuntime.chat(
      `[MONITOR_SYSTEM_PROMPT]
${systemPrompt}

[USER]
${userMessage}`,
      this.sessionId,
    );

    this.state.lastScreenshotAt = new Date().toISOString();

    // Parse the response to extract detected state and action
    const { detectedState, action } = this.parseMonitorResponse(response);

    this.state.lastDetectedState = detectedState;
    this.state.lastAction = action;

    // Reset consecutive errors on success
    if (detectedState !== 'unknown') {
      this.state.consecutiveErrors = 0;
    }

    this.addHistory({
      cycle: this.state.currentCycle,
      timestamp: new Date().toISOString(),
      detectedState,
      action,
      success: true,
    });

    this.persistState();
    console.log(`[ContinuousDevMonitor] Cycle #${this.state.currentCycle} done - state=${detectedState}, action="${action}"`);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private parseMonitorResponse(response: string): {
    detectedState: DetectedEditorState;
    action: string;
  } {
    // Try to find JSON line in the response
    const lines = response.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.includes('detectedState')) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          const state = this.normalizeDetectedState(parsed.detectedState);
          const action = typeof parsed.action === 'string' ? parsed.action : 'unknown action';
          return { detectedState: state, action };
        } catch {
          // Not valid JSON, continue
        }
      }
    }

    // Fallback: try to infer from text
    const lower = response.toLowerCase();
    if (lower.includes('coding') || lower.includes('编码中') || lower.includes('正在执行')) {
      return { detectedState: 'coding', action: response.slice(0, 200) };
    }
    if (lower.includes('error') || lower.includes('报错') || lower.includes('失败')) {
      return { detectedState: 'error', action: response.slice(0, 200) };
    }
    if (lower.includes('completed') || lower.includes('完成')) {
      return { detectedState: 'completed', action: response.slice(0, 200) };
    }
    if (lower.includes('waiting') || lower.includes('等待')) {
      return { detectedState: 'waiting', action: response.slice(0, 200) };
    }
    if (lower.includes('idle') || lower.includes('空闲')) {
      return { detectedState: 'idle', action: response.slice(0, 200) };
    }

    return { detectedState: 'unknown', action: response.slice(0, 200) };
  }

  private normalizeDetectedState(value: unknown): DetectedEditorState {
    if (typeof value !== 'string') {
      return 'unknown';
    }
    const valid: DetectedEditorState[] = ['idle', 'coding', 'error', 'waiting', 'completed'];
    return valid.includes(value as DetectedEditorState)
      ? (value as DetectedEditorState)
      : 'unknown';
  }

  private addHistory(entry: MonitorHistoryEntry): void {
    this.state.history.push(entry);
    if (this.state.history.length > MAX_HISTORY_ENTRIES) {
      this.state.history = this.state.history.slice(-MAX_HISTORY_ENTRIES);
    }
  }

  private createInitialState(): MonitorState {
    return {
      status: 'idle',
      currentCycle: 0,
      totalCycles: 0,
      lastScreenshotAt: null,
      lastAction: null,
      lastDetectedState: null,
      consecutiveErrors: 0,
      history: [],
      startedAt: null,
      stoppedAt: null,
      taskDescription: '',
      config: null,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = setTimeout(resolve, ms);
    });
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private persistState(): void {
    try {
      const dir = path.dirname(this.statePath);
      fsSync.mkdirSync(dir, { recursive: true });

      const payload: PersistedMonitorPayload = {
        schemaVersion: STATE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        state: { ...this.state },
      };

      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.warn(
        '[ContinuousDevMonitor] Failed to persist state:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private loadPersistedState(): void {
    try {
      if (!fsSync.existsSync(this.statePath)) {
        return;
      }

      const raw = fsSync.readFileSync(this.statePath, 'utf8');
      const payload = JSON.parse(raw) as PersistedMonitorPayload;

      if (payload.schemaVersion !== STATE_SCHEMA_VERSION) {
        return;
      }

      const s = payload.state;
      if (!s || typeof s !== 'object') {
        return;
      }

      // Recover state but don't auto-resume running
      const recoveredStatus: MonitorStatus =
        s.status === 'running' ? 'paused' : (s.status as MonitorStatus) ?? 'idle';

      this.state = {
        status: recoveredStatus,
        currentCycle: typeof s.currentCycle === 'number' ? s.currentCycle : 0,
        totalCycles: typeof s.totalCycles === 'number' ? s.totalCycles : 0,
        lastScreenshotAt: typeof s.lastScreenshotAt === 'string' ? s.lastScreenshotAt : null,
        lastAction: typeof s.lastAction === 'string' ? s.lastAction : null,
        lastDetectedState: this.normalizeDetectedState(s.lastDetectedState) !== 'unknown'
          ? this.normalizeDetectedState(s.lastDetectedState)
          : null,
        consecutiveErrors: typeof s.consecutiveErrors === 'number' ? s.consecutiveErrors : 0,
        history: Array.isArray(s.history) ? s.history.slice(-MAX_HISTORY_ENTRIES) as MonitorHistoryEntry[] : [],
        startedAt: typeof s.startedAt === 'string' ? s.startedAt : null,
        stoppedAt: typeof s.stoppedAt === 'string' ? s.stoppedAt : null,
        taskDescription: typeof s.taskDescription === 'string' ? s.taskDescription : '',
        config: s.config && typeof s.config === 'object' ? s.config as MonitorConfig : null,
      };

      if (recoveredStatus === 'paused' && s.status === 'running') {
        console.log('[ContinuousDevMonitor] Recovered from running state → paused (restart required)');
      }
    } catch (error) {
      console.warn(
        '[ContinuousDevMonitor] Failed to load persisted state:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
