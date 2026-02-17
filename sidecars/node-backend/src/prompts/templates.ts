/**
 * Prompt Templates System
 * Pre-defined prompts for common AI tasks
 */

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
}

export const defaultTemplates: PromptTemplate[] = [
  // Coding templates
  {
    id: 'code-review',
    name: '代码审查',
    description: '审查代码并提供改进建议',
    category: 'coding',
    template: `请审查以下代码，关注：
1. 代码质量和可读性
2. 潜在的错误或漏洞
3. 性能优化建议
4. 最佳实践遵循情况

代码：
\`\`\`
{{code}}
\`\`\``,
    variables: ['code'],
  },
  {
    id: 'explain-code',
    name: '解释代码',
    description: '详细解释代码的工作原理',
    category: 'coding',
    template: `请详细解释以下代码的工作原理：

代码：
\`\`\`
{{code}}
\`\`\`

请包括：
1. 整体功能概述
2. 关键逻辑步骤
3. 使用的算法或设计模式
4. 输入输出说明`,
    variables: ['code'],
  },
  {
    id: 'refactor-code',
    name: '重构代码',
    description: '重构代码以提高质量',
    category: 'coding',
    template: `请重构以下代码，目标：
1. 提高可读性和可维护性
2. 遵循最佳实践
3. 优化性能（如适用）
4. 添加适当的错误处理

原始代码：
\`\`\`
{{code}}
\`\`\`

请提供重构后的代码，并解释主要改进点。`,
    variables: ['code'],
  },
  {
    id: 'write-tests',
    name: '生成测试',
    description: '为代码生成单元测试',
    category: 'coding',
    template: `请为以下代码生成全面的单元测试：

代码：
\`\`\`
{{code}}
\`\`\`

要求：
1. 覆盖正常路径和边界情况
2. 使用适当的测试框架（如 Jest/Vitest）
3. 包括错误处理测试
4. 测试命名清晰`,
    variables: ['code'],
  },

  // Windows automation templates
  {
    id: 'automate-task',
    name: '自动化任务',
    description: '创建 Windows 自动化任务',
    category: 'automation',
    template: `请帮我创建一个 Windows 自动化任务来完成以下操作：

任务描述：
{{description}}

请提供：
1. 详细的操作步骤
2. 所需的工具调用序列
3. 错误处理建议
4. 验证方法`,
    variables: ['description'],
  },
  {
    id: 'debug-ui',
    name: '调试 UI',
    description: '帮助调试 Windows UI 问题',
    category: 'automation',
    template: `我遇到以下 Windows UI 问题，请帮助调试：

问题描述：
{{issue}}

当前状态：
{{context}}

请提供：
1. 可能的原因分析
2. 诊断步骤
3. 解决方案建议
4. 预防措施`,
    variables: ['issue', 'context'],
  },

  // Analysis templates
  {
    id: 'analyze-error',
    name: '分析错误',
    description: '分析错误日志并提供解决方案',
    category: 'analysis',
    template: `请分析以下错误并提供解决方案：

错误信息：
\`\`\`
{{error}}
\`\`\`

上下文：
{{context}}

请提供：
1. 错误原因分析
2. 解决方案（多种选择）
3. 预防措施
4. 相关资源链接`,
    variables: ['error', 'context'],
  },
  {
    id: 'summarize-text',
    name: '总结文本',
    description: '总结长文本内容',
    category: 'analysis',
    template: `请总结以下文本的关键要点：

文本内容：
{{text}}

要求：
1. 提供简洁的摘要（2-3句话）
2. 列出关键要点（3-5点）
3. 提取重要数据或结论
4. 保持客观准确`,
    variables: ['text'],
  },

  // General templates
  {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '针对主题进行头脑风暴',
    category: 'general',
    template: `请针对以下主题进行头脑风暴：

主题：{{topic}}

请提供：
1. 核心概念和定义
2. 相关想法和关联
3. 潜在的应用场景
4. 可能的挑战和解决方案
5. 创新角度`,
    variables: ['topic'],
  },
  {
    id: 'step-by-step',
    name: '分步指导',
    description: '提供详细的分步指导',
    category: 'general',
    template: `请提供完成以下任务的详细步骤：

任务：{{task}}

要求：
1. 清晰的分步说明
2. 每个步骤的预期结果
3. 常见问题和解决方法
4. 所需工具或资源`,
    variables: ['task'],
  },
];

export class PromptTemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    // Load default templates
    defaultTemplates.forEach((template) => {
      this.templates.set(template.id, template);
    });
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplateById(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  getTemplatesByCategory(category: string): PromptTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  getCategories(): string[] {
    const categories = new Set(this.getAllTemplates().map((t) => t.category));
    return Array.from(categories);
  }

  applyTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let result = template.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return result;
  }

  validateVariables(templateId: string, variables: Record<string, string>): string[] {
    const template = this.templates.get(templateId);
    if (!template) {
      return [`Template not found: ${templateId}`];
    }

    const missing: string[] = [];
    for (const variable of template.variables) {
      if (!variables[variable]) {
        missing.push(variable);
      }
    }

    return missing;
  }
}

// Singleton instance
export const promptTemplateManager = new PromptTemplateManager();
