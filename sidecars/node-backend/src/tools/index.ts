/**
 * Agent Tools - 工具注册和调度中心
 * 
 * 集成 Python 自动化能力，支持：
 * - GUI 控制 (点击、输入、菜单操作)
 * - OCR 文字识别
 * - 截图
 * - 窗口管理
 */

import { z } from 'zod';
import { analyzeCodingProgress } from '../coding/progress.js';

// 工具定义接口
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any) => Promise<any>;
}

// Python 服务配置
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:3200';

/**
 * 带重试的 fetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      return response;
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

/**
 * 获取窗口列表工具
 */
export const listWindowsTool: Tool = {
  name: 'list_windows',
  description: '获取当前所有可见的 Windows 窗口列表',
  parameters: z.object({}),
  execute: async () => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/windows`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get windows');
    }
    
    return {
      windows: data.windows.map((w: any) => ({
        title: w.title,
        className: w.class_name,
        position: w.rectangle,
      })),
      count: data.windows.length,
    };
  },
};

/**
 * 获取窗口控件工具
 */
export const getWindowControlsTool: Tool = {
  name: 'get_window_controls',
  description: '获取指定窗口的所有控件信息',
  parameters: z.object({
    windowTitle: z.string().describe('窗口标题（支持模糊匹配）'),
  }),
  execute: async (args: { windowTitle: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/window/controls`, {
      method: 'POST',
      body: JSON.stringify({ title: args.windowTitle }),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get controls');
    }
    
    return {
      controls: data.controls.map((c: any) => ({
        name: c.name,
        type: c.control_type,
        className: c.class_name,
        position: c.rectangle,
      })),
      count: data.controls.length,
    };
  },
};

/**
 * 点击工具
 */
export const clickTool: Tool = {
  name: 'click',
  description: '在指定坐标或控件上点击',
  parameters: z.object({
    x: z.number().optional().describe('X 坐标'),
    y: z.number().optional().describe('Y 坐标'),
    target: z.string().optional().describe('控件名称（如按钮文字）'),
    windowTitle: z.string().optional().describe('窗口标题'),
  }),
  execute: async (args: { x?: number; y?: number; target?: string; windowTitle?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/click`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Click failed');
    }
    
    return data.result;
  },
};

/**
 * 输入文字工具
 */
export const typeTextTool: Tool = {
  name: 'type_text',
  description: '在指定控件或当前焦点处输入文字',
  parameters: z.object({
    text: z.string().describe('要输入的文字'),
    target: z.string().optional().describe('目标控件名称'),
    windowTitle: z.string().optional().describe('窗口标题'),
  }),
  execute: async (args: { text: string; target?: string; windowTitle?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/type`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Type failed');
    }
    
    return data.result;
  },
};

/**
 * 菜单操作工具
 */
export const menuSelectTool: Tool = {
  name: 'menu_select',
  description: '选择窗口菜单项 (如 "File->Save")',
  parameters: z.object({
    menuPath: z.string().describe('菜单路径，如 "File->Save" 或 "编辑->复制"'),
    windowTitle: z.string().describe('窗口标题'),
  }),
  execute: async (args: { menuPath: string; windowTitle: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/menu`, {
      method: 'POST',
      body: JSON.stringify({
        menu_path: args.menuPath,
        window_title: args.windowTitle,
      }),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Menu operation failed');
    }
    
    return data.result;
  },
};

/**
 * 截图工具
 */
export const screenshotTool: Tool = {
  name: 'screenshot',
  description: '截取屏幕或指定窗口',
  parameters: z.object({
    windowTitle: z.string().optional().describe('窗口标题（不传则截取全屏）'),
    region: z.object({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional().describe('截图区域'),
  }),
  execute: async (args: { windowTitle?: string; region?: any }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/screenshot`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Screenshot failed');
    }
    
    return {
      path: data.result.path,
      size: data.result.size,
    };
  },
};

/**
 * OCR 文字识别工具
 */
export const ocrTool: Tool = {
  name: 'ocr_recognize',
  description: '识别图片中的文字',
  parameters: z.object({
    imagePath: z.string().optional().describe('图片路径（不传则自动截图）'),
  }),
  execute: async (args: { imagePath?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'OCR failed');
    }
    
    return {
      texts: data.result.texts.map((t: any) => ({
        text: t.text,
        confidence: t.confidence,
        position: t.center,
      })),
      count: data.result.count,
    };
  },
};

/**
 * OCR 查找文字工具
 */
export const ocrFindTextTool: Tool = {
  name: 'ocr_find_text',
  description: '在屏幕上查找指定文字并返回位置',
  parameters: z.object({
    text: z.string().describe('要查找的文字'),
  }),
  execute: async (args: { text: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr/find`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Find text failed');
    }
    
    return {
      found: data.result.found,
      text: data.result.text,
      position: data.result.center,
      confidence: data.result.confidence,
    };
  },
};

/**
 * OCR 点击文字工具
 */
export const ocrClickTextTool: Tool = {
  name: 'ocr_click_text',
  description: '通过 OCR 找到文字并点击',
  parameters: z.object({
    text: z.string().describe('要点击的文字'),
  }),
  execute: async (args: { text: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr/click`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Click text failed');
    }
    
    return {
      clicked: data.result.clicked,
      position: data.result.position,
    };
  },
};

/**
 * 快捷键工具
 */
export const hotkeyTool: Tool = {
  name: 'hotkey',
  description: '发送快捷键组合',
  parameters: z.object({
    keys: z.array(z.string()).describe('按键列表，如 ["ctrl", "c"]'),
  }),
  execute: async (args: { keys: string[] }) => {
    // Python API 中没有直接的 hotkey 接口，需要通过 pyautogui
    // 这里模拟调用，实际实现可能需要扩展 Python 服务
    return {
      action: 'hotkey',
      keys: args.keys,
      status: 'not_implemented',
    };
  },
};

export const codingProgressTool: Tool = {
  name: 'get_coding_progress',
  description: 'Get git-based coding progress summary for current workspace',
  parameters: z.object({
    sinceDays: z.number().int().min(1).max(365).optional().describe('How many recent days to summarize commits'),
    maxFiles: z.number().int().min(1).max(200).optional().describe('Maximum changed file entries to return'),
    includeUntracked: z.boolean().optional().describe('Whether to include untracked files'),
  }),
  execute: async (args: { sinceDays?: number; maxFiles?: number; includeUntracked?: boolean }) => {
    return await analyzeCodingProgress(args);
  },
};

/**
 * 工具注册表
 */
export const tools: Tool[] = [
  listWindowsTool,
  getWindowControlsTool,
  clickTool,
  typeTextTool,
  menuSelectTool,
  screenshotTool,
  ocrTool,
  ocrFindTextTool,
  ocrClickTextTool,
  hotkeyTool,
  codingProgressTool,
];

/**
 * 工具管理器
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // 注册所有工具
    tools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }

  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具定义
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具定义 (用于 Claude Function Calling)
   */
  getToolDefinitions(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: this.zodToJsonSchema(tool.parameters),
        required: Object.keys(tool.parameters.shape).filter(
          key => !tool.parameters.shape[key].isOptional()
        ),
      },
    }));
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // 验证参数
    const validated = tool.parameters.parse(args);
    
    // 执行
    return await tool.execute(validated);
  }

  /**
   * 简单的 Zod 到 JSON Schema 转换
   */
  private zodToJsonSchema(zodObj: z.ZodObject<any>): Record<string, any> {
    const shape = zodObj.shape;
    const properties: Record<string, any> = {};

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      
      if (zodType instanceof z.ZodString) {
        properties[key] = { type: 'string' };
      } else if (zodType instanceof z.ZodNumber) {
        properties[key] = { type: 'number' };
      } else if (zodType instanceof z.ZodBoolean) {
        properties[key] = { type: 'boolean' };
      } else if (zodType instanceof z.ZodArray) {
        properties[key] = { type: 'array' };
      } else if (zodType instanceof z.ZodObject) {
        properties[key] = { 
          type: 'object',
          properties: this.zodToJsonSchema(zodType)
        };
      } else {
        properties[key] = {};
      }

      // 添加描述
      if (zodType.description) {
        properties[key].description = zodType.description;
      }
    }

    return properties;
  }
}

// 导出单例
export const toolManager = new ToolManager();
