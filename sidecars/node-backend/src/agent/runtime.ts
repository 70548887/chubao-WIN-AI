/**
 * Agent 运行时 - 核心调度器
 */

import { MemoryManager } from '../memory/manager.js';
import Anthropic from '@anthropic-ai/sdk';

export class AgentRuntime {
  private memoryManager: MemoryManager;
  private client: Anthropic | null = null;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async chat(message: string, sessionId?: string): Promise<string> {
    if (!this.client) {
      return '错误: 未配置 ANTHROPIC_API_KEY';
    }

    try {
      // 搜索相关记忆
      const memories = await this.memoryManager.search(message, 5);
      
      // 构建系统提示词
      const systemPrompt = this.buildSystemPrompt(memories);
      
      // 调用 Claude API
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ]
      });

      const content = response.content[0];
      const assistantMessage = content.type === 'text' ? content.text : '';

      // 保存对话到记忆
      await this.memoryManager.addDaily(`用户: ${message}`);
      await this.memoryManager.addDaily(`助手: ${assistantMessage}`);

      return assistantMessage;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  private buildSystemPrompt(memories: string[]): string {
    const memoryContext = memories.length > 0
      ? `

相关记忆:
${memories.join('\n')}`
      : '';

    return `你是 Chubao AI，一个 Windows 本地 AI 自动化助手。

你的能力:
- 控制 Windows 桌面应用 (点击、输入、菜单操作)
- 监控编程进度 (跟踪 Qoder 等工具)
- 执行自动化测试
- 管理文件和记忆

请用简洁、友好的方式回答用户问题。${memoryContext}`;
  }
}
