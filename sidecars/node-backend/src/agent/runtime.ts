/**
 * Agent runtime - core scheduler
 *
 * Supports Function Calling + multi-turn tool loop.
 */

import { MemoryManager } from '../memory/manager.js';
import { ToolManager, toolManager } from '../tools/index.js';
import { ToolSecurityGuard, type ToolSecurityPolicy } from './security.js';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ImageBlockParam,
  MessageParam,
  TextBlock,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';

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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseNonEmptyString(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private toolManager: ToolManager;
  private securityGuard: ToolSecurityGuard;
  private client: Anthropic | null = null;
  private maxIterations: number = 8;
  private modelViewportWidth: number = parsePositiveInt(
    process.env.CHUBAO_MODEL_COORD_WIDTH ?? process.env.CHUBAO_MODEL_VIEWPORT_WIDTH,
    1024,
  );
  private modelViewportHeight: number = parsePositiveInt(
    process.env.CHUBAO_MODEL_COORD_HEIGHT ?? process.env.CHUBAO_MODEL_VIEWPORT_HEIGHT,
    768,
  );
  private coordinateTransform: CoordinateTransform | null = null;
  private modelName: string =
    parseNonEmptyString(process.env.ANTHROPIC_MODEL) ??
    parseNonEmptyString(process.env.CHUBAO_MODEL) ??
    'claude-sonnet-4-20250514';

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.toolManager = toolManager;
    this.securityGuard = new ToolSecurityGuard();
    this.toolManager.initializeSkills().catch((error) => {
      console.warn('Skill tools preload failed:', (error as Error).message);
    });

    const apiKey = parseNonEmptyString(process.env.ANTHROPIC_API_KEY);
    if (apiKey) {
      const baseURL = parseNonEmptyString(process.env.ANTHROPIC_BASE_URL);
      this.client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });
    }
  }

  async chat(message: string, sessionId?: string): Promise<string> {
    if (!this.client) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);

      await this.toolManager.initializeSkills();
      const tools = this.toolManager.getToolDefinitions();
      const messages: MessageParam[] = [{ role: 'user', content: message }];
      let finalResponse = '';
      let lastToolSummary = '';

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        const response = await this.client.messages.create({
          model: this.modelName,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

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

      return finalResponse;
    } catch (error) {
      console.error('Chat error:', error);
      return `处理消息时出错: ${(error as Error).message}`;
    }
  }

  async chatSimple(message: string, sessionId?: string): Promise<string> {
    if (!this.client) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);

      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      const content = response.content[0];
      const assistantMessage = content.type === 'text' ? content.text : '';

      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${assistantMessage}`);

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

  private buildSystemPrompt(memories: string[]): string {
    const tools = this.toolManager.getAllTools();
    const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

    const memoryContext =
      memories.length > 0
        ? `

相关记忆:
${memories.join('\n')}`
        : '';

    return `你是 Chubao AI，一个 Windows 本地 AI 自动化助手。

你的能力:
1. 控制 Windows 桌面应用 (点击、输入、菜单操作)
2. 屏幕识别 (OCR 文字识别、截图)
3. 窗口管理 (获取窗口列表、控件信息)
4. 监控编程进度 (跟踪 Qoder 等工具)
5. 执行自动化测试
6. 管理文件和记忆

可用工具:
${toolDescriptions}

使用工具时:
- 坐标类工具统一使用模型坐标系 (${this.modelViewportWidth}x${this.modelViewportHeight})
- screenshot 会返回模型/实际屏幕缩放信息，系统会自动把模型坐标换算到实际坐标执行，并将结果坐标换回模型坐标
- 在首次点击/拖拽前优先调用 screenshot 刷新坐标映射
- 对于查看类操作 (截图、OCR、获取窗口列表)，直接执行并报告结果
- 对于控制类操作 (点击、输入)，先确认再执行
- 如果工具调用失败，向用户解释原因

请用简洁、友好的方式回答用户问题。${memoryContext}`;
  }
}
