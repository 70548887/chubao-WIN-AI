/**
 * Agent 运行时 - 核心调度器 (增强版)
 * 
 * 支持 Function Calling 和 ReAct 模式
 * 集成 Python 自动化工具
 */

import { MemoryManager } from '../memory/manager.js';
import { ToolManager, toolManager } from '../tools/index.js';
import Anthropic from '@anthropic-ai/sdk';

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private toolManager: ToolManager;
  private client: Anthropic | null = null;
  private maxIterations: number = 5;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.toolManager = toolManager;
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * 主对话入口 - 支持 Function Calling
   */
  async chat(message: string, sessionId?: string): Promise<string> {
    if (!this.client) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      // 搜索相关记忆
      const memories = await this.memoryManager.search(message, 5);
      
      // 构建系统提示词
      const systemPrompt = this.buildSystemPrompt(memories);
      
      // 获取工具定义
      const tools = this.toolManager.getToolDefinitions();
      
      // 执行 ReAct 循环
      let iteration = 0;
      let finalResponse = '';
      const toolResults: any[] = [];

      while (iteration < this.maxIterations) {
        iteration++;
        
        // 构建消息历史
        const messages: any[] = [
          { role: 'user', content: message }
        ];

        // 如果有工具执行结果，添加观察
        if (toolResults.length > 0) {
          const lastResult = toolResults[toolResults.length - 1];
          const observation = `I used the tool "${lastResult.tool}" and got: ${JSON.stringify(lastResult.result)}`;
          messages.push({
            role: 'assistant',
            content: observation
          });
        }

        // 调用 Claude API (带工具)
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        const content = response.content[0];

        // 处理文本响应
        if (content.type === 'text') {
          finalResponse = content.text;
          break;
        }

        // 处理工具调用
        if (content.type === 'tool_use') {
          const toolName = content.name;
          const toolInput = content.input;

          console.log(`🛠️ Agent 调用工具: ${toolName}`, toolInput);

          try {
            // 执行工具
            const result = await this.toolManager.executeTool(toolName, toolInput);
            
            toolResults.push({
              tool: toolName,
              input: toolInput,
              result,
            });

            // 如果工具执行成功且不需要更多步骤，返回结果
            if (this.shouldStopAfterTool(toolName, result)) {
              finalResponse = this.formatToolResult(toolName, result);
              break;
            }
          } catch (error) {
            console.error(`工具执行失败 ${toolName}:`, error);
            toolResults.push({
              tool: toolName,
              input: toolInput,
              error: (error as Error).message,
            });
            
            // 如果工具失败，返回错误信息
            finalResponse = `执行工具 "${toolName}" 时出错: ${(error as Error).message}`;
            break;
          }
        }
      }

      // 如果达到最大迭代次数还没有结果
      if (!finalResponse && iteration >= this.maxIterations) {
        finalResponse = '抱歉，处理您的请求需要太多步骤，请尝试简化问题。';
      }

      // 保存对话到记忆
      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${finalResponse}`);

      return finalResponse;
    } catch (error) {
      console.error('Chat error:', error);
      return `处理消息时出错: ${(error as Error).message}`;
    }
  }

  /**
   * 简单对话 - 不使用工具
   */
  async chatSimple(message: string, sessionId?: string): Promise<string> {
    if (!this.client) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      const memories = await this.memoryManager.search(message, 5);
      const systemPrompt = this.buildSystemPrompt(memories);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
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

  /**
   * 执行特定工具
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    return await this.toolManager.executeTool(toolName, args);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): { name: string; description: string }[] {
    return this.toolManager.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * 判断是否应该在工具调用后停止
   */
  private shouldStopAfterTool(toolName: string, result: any): boolean {
    // 截图、OCR 等查看类工具可以直接返回结果
    const viewTools = ['screenshot', 'ocr_recognize', 'ocr_find_text', 'list_windows', 'get_coding_progress'];
    if (viewTools.includes(toolName)) {
      return true;
    }
    
    return false;
  }

  /**
   * 格式化工具结果为可读文本
   */
  private formatToolResult(toolName: string, result: any): string {
    switch (toolName) {
      case 'screenshot':
        return `已截取屏幕，保存路径: ${result.path}`;
      
      case 'ocr_recognize':
        if (result.count === 0) {
          return '未识别到任何文字。';
        }
        return `识别到 ${result.count} 处文字:\n${result.texts.map((t: any) => `- ${t.text}`).join('\n')}`;
      
      case 'ocr_find_text':
        if (!result.found) {
          return `未找到文字 "${result.text}"。`;
        }
        return `找到文字 "${result.text}" 在位置 (${result.position[0]}, ${result.position[1]})`;
      
      case 'list_windows':
        if (result.count === 0) {
          return '当前没有可见窗口。';
        }
        return `当前有 ${result.count} 个窗口:\n${result.windows.slice(0, 10).map((w: any) => `- ${w.title}`).join('\n')}`;
      
      case 'get_coding_progress': {
        const repo = result.repoRoot ?? 'unknown';
        const branch = result.branch ?? 'unknown';
        const status = result.clean ? 'clean' : 'dirty';
        const changedFiles = result.counts?.totalFiles ?? 0;
        const commits = result.commitCountSince ?? 0;
        const sinceDays = result.sinceDays ?? 7;
        return [
          `Coding progress (${sinceDays}d)`,
          `- repo: ${repo}`,
          `- branch: ${branch}`,
          `- status: ${status}`,
          `- files changed: ${changedFiles}`,
          `- commits: ${commits}`,
          `- ahead/behind: ${result.ahead ?? 0}/${result.behind ?? 0}`,
        ].join('\n');
      }

      case 'click':
        return `已执行点击操作。`;
      
      case 'type_text':
        return `已输入文字。`;
      
      default:
        return `工具执行完成: ${JSON.stringify(result, null, 2)}`;
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(memories: string[]): string {
    const tools = this.toolManager.getAllTools();
    const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
    
    const memoryContext = memories.length > 0
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
- 对于查看类操作 (截图、OCR、获取窗口列表)，直接执行并报告结果
- 对于控制类操作 (点击、输入)，先确认再执行
- 如果工具调用失败，向用户解释原因

请用简洁、友好的方式回答用户问题。${memoryContext}`;
  }
}
