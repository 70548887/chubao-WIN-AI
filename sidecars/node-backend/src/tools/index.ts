/**
 * Agent Tools - Tool registration and dispatch center
 *
 * Integrates Python automation capabilities:
 * - GUI control (click, type, menu)
 * - OCR text recognition
 * - Screenshot
 * - Window management
 */

import { z } from 'zod';
import { analyzeCodingProgress } from '../coding/progress.js';
import {
  installSkillFromPath,
  loadSkillToolsFromRegistry,
  type InstalledSkillManifest,
} from './skillRegistry.js';
import {
  cancelOpenCodeTask,
  createOpenCodeProject,
  getOpenCodeConcurrentStatus,
  getOpenCodeTaskStatus,
  listOpenCodeTasks,
  probeOpenCodeCli,
  runOpenCodeTask,
} from './opencode.js';
import {
  cancelOhMyTask,
  getOhMyConcurrentStatus,
  listOhMyAgents,
  probeOhMyCli,
  runOhMyDelegate,
  runOhMyTask,
} from './ohmyopencode.js';
import {
  cancelMultiAgentGroup,
  getMultiAgentGroupStatus,
  listMultiAgentGroups,
  startMultiAgentGroup,
} from './multiAgentCoordinator.js';
import { devTools } from './devTools.js';
import { externalCliTools } from './externalCliTools.js';

// Tool definition interface
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any) => Promise<any>;
}

type ToolSandboxMode = 'off' | 'allowlist';

export interface ToolSandboxPolicy {
  mode: ToolSandboxMode;
  enabled: boolean;
  configuredAllowedTools: string[];
  effectiveAllowedTools: string[];
  blockedTools: string[];
  visibleTools: string[];
}

export interface CliToolProbeSnapshot {
  name: string;
  available: boolean;
  version?: string;
  source?: string;
  command?: string;
  args?: string[];
  checkedAt?: string;
  cached?: boolean;
  error?: string;
}

export interface CliHealthSnapshot {
  summary: {
    total: number;
    available: number;
    unavailable: number;
  };
  tools: {
    opencode: CliToolProbeSnapshot;
    ohMyOpencode: CliToolProbeSnapshot;
  };
}

const DEFAULT_SANDBOX_ALLOWLIST: ReadonlySet<string> = new Set([
  'list_windows',
  'get_window_controls',
  'screenshot',
  'ocr_recognize',
  'ocr_find_text',
  'get_coding_progress',
  'browser_launch',
  'browser_navigate',
  'browser_read_page',
  'browser_get_text',
  'browser_screenshot',
  'browser_close',
  'opencode_check_status',
  'opencode_list_tasks',
  'opencode_check_concurrent_status',
  'ohmyopencode_check_concurrent_status',
  'ohmyopencode_list_agents',
]);

function parseToolList(raw: string | undefined): Set<string> {
  if (!raw || raw.trim().length === 0) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function normalizeSandboxMode(raw: string | undefined): ToolSandboxMode {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'allowlist' || value === 'allow' || value === 'whitelist' || value === 'restricted') {
    return 'allowlist';
  }
  return 'off';
}

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

// Python service config
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:3200';

/**
 * Fetch with retry
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
 * List windows tool
 */
export const listWindowsTool: Tool = {
  name: 'list_windows',
  description: 'Get all visible Windows window list',
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
 * Get window controls tool
 */
export const getWindowControlsTool: Tool = {
  name: 'get_window_controls',
  description: 'Get all controls of the specified window',
  parameters: z.object({
    windowTitle: z.string().describe('Window title (supports fuzzy match)'),
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
 * Click tool
 */
export const clickTool: Tool = {
  name: 'click',
  description: 'Click at specified coordinates or on a control',
  parameters: z.object({
    x: z.number().optional().describe('X coordinate'),
    y: z.number().optional().describe('Y coordinate'),
    target: z.string().optional().describe('Control name (e.g. button text)'),
    windowTitle: z.string().optional().describe('Window title'),
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
 * Right click tool
 */
export const rightClickTool: Tool = {
  name: 'right_click',
  description: 'Right click at specified coordinates',
  parameters: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
  }),
  execute: async (args: { x: number; y: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/right_click`, {
      method: 'POST',
      body: JSON.stringify({ x: args.x, y: args.y }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Right click failed');
    }

    return data.result;
  },
};

/**
 * Double click tool
 */
export const doubleClickTool: Tool = {
  name: 'double_click',
  description: 'Double click at specified coordinates',
  parameters: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
    interval: z.number().min(0).optional().describe('Interval between clicks (seconds)'),
  }),
  execute: async (args: { x: number; y: number; interval?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/double_click`, {
      method: 'POST',
      body: JSON.stringify({
        x: args.x,
        y: args.y,
        interval: args.interval,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Double click failed');
    }

    return data.result;
  },
};

/**
 * Hover tool
 */
export const hoverTool: Tool = {
  name: 'hover',
  description: 'Move mouse cursor to specified coordinates',
  parameters: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
    duration: z.number().min(0).optional().describe('Move duration (seconds)'),
  }),
  execute: async (args: { x: number; y: number; duration?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/hover`, {
      method: 'POST',
      body: JSON.stringify({
        x: args.x,
        y: args.y,
        duration: args.duration,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Hover failed');
    }

    return data.result;
  },
};

/**
 * Drag tool
 */
export const dragTool: Tool = {
  name: 'drag',
  description: 'Drag mouse from start coordinates to end coordinates',
  parameters: z.object({
    startX: z.number().describe('Drag start X coordinate'),
    startY: z.number().describe('Drag start Y coordinate'),
    endX: z.number().describe('Drag end X coordinate'),
    endY: z.number().describe('Drag end Y coordinate'),
    duration: z.number().min(0).optional().describe('Drag duration (seconds)'),
    button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
  }),
  execute: async (args: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    duration?: number;
    button?: 'left' | 'right' | 'middle';
  }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/drag`, {
      method: 'POST',
      body: JSON.stringify({
        start_x: args.startX,
        start_y: args.startY,
        end_x: args.endX,
        end_y: args.endY,
        duration: args.duration,
        button: args.button,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Drag failed');
    }

    return data.result;
  },
};

/**
 * Browser launch tool
 */
export const browserLaunchTool: Tool = {
  name: 'browser_launch',
  description: 'Launch browser session for web automation',
  parameters: z.object({
    headless: z.boolean().optional().describe('Run browser in headless mode'),
    width: z.number().int().min(320).optional().describe('Viewport width'),
    height: z.number().int().min(240).optional().describe('Viewport height'),
  }),
  execute: async (args: { headless?: boolean; width?: number; height?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/launch`, {
      method: 'POST',
      body: JSON.stringify({
        headless: args.headless,
        width: args.width,
        height: args.height,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser launch failed');
    }

    return data.result;
  },
};

/**
 * Browser navigate tool
 */
export const browserNavigateTool: Tool = {
  name: 'browser_navigate',
  description: 'Navigate browser to a URL',
  parameters: z.object({
    url: z.string().describe('Target URL'),
    waitUntil: z.enum(['commit', 'domcontentloaded', 'load', 'networkidle']).optional().describe(
      'Wait condition for navigation',
    ),
    timeoutMs: z.number().int().min(1000).optional().describe('Navigation timeout in milliseconds'),
  }),
  execute: async (args: { url: string; waitUntil?: string; timeoutMs?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/navigate`, {
      method: 'POST',
      body: JSON.stringify({
        url: args.url,
        wait_until: args.waitUntil,
        timeout_ms: args.timeoutMs,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser navigate failed');
    }

    return data.result;
  },
};

/**
 * Browser click tool
 */
export const browserClickTool: Tool = {
  name: 'browser_click',
  description: 'Click element in browser by selector',
  parameters: z.object({
    selector: z.string().describe('CSS selector to click'),
    timeoutMs: z.number().int().min(1000).optional().describe('Element wait timeout in milliseconds'),
  }),
  execute: async (args: { selector: string; timeoutMs?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/click`, {
      method: 'POST',
      body: JSON.stringify({
        selector: args.selector,
        timeout_ms: args.timeoutMs,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser click failed');
    }

    return data.result;
  },
};

/**
 * Browser type tool
 */
export const browserTypeTool: Tool = {
  name: 'browser_type',
  description: 'Type text into browser element by selector',
  parameters: z.object({
    selector: z.string().describe('CSS selector for input element'),
    text: z.string().describe('Text to type'),
    clear: z.boolean().optional().describe('Clear field before typing'),
    timeoutMs: z.number().int().min(1000).optional().describe('Element wait timeout in milliseconds'),
  }),
  execute: async (args: { selector: string; text: string; clear?: boolean; timeoutMs?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/type`, {
      method: 'POST',
      body: JSON.stringify({
        selector: args.selector,
        text: args.text,
        clear: args.clear,
        timeout_ms: args.timeoutMs,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser type failed');
    }

    return data.result;
  },
};

/**
 * Browser read-page tool
 */
export const browserReadPageTool: Tool = {
  name: 'browser_read_page',
  description: 'Read current browser page structure (HTML excerpt, text excerpt, forms)',
  parameters: z.object({
    includeHtml: z.boolean().optional().describe('Include page HTML excerpt in result'),
    includeForms: z.boolean().optional().describe('Include parsed form metadata in result'),
    maxHtmlChars: z.number().int().min(1000).max(200000).optional().describe('Maximum HTML characters to return'),
  }),
  execute: async (args: { includeHtml?: boolean; includeForms?: boolean; maxHtmlChars?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/read_page`, {
      method: 'POST',
      body: JSON.stringify({
        include_html: args.includeHtml,
        include_forms: args.includeForms,
        max_html_chars: args.maxHtmlChars,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser read page failed');
    }

    return data.result;
  },
};

/**
 * Browser get-text tool
 */
export const browserGetTextTool: Tool = {
  name: 'browser_get_text',
  description: 'Get visible text from the page body or a specific selector',
  parameters: z.object({
    selector: z.string().optional().describe('Optional CSS selector'),
    maxChars: z.number().int().min(200).max(200000).optional().describe('Maximum text characters to return'),
    normalizeWhitespace: z.boolean().optional().describe('Normalize whitespace in text result'),
    timeoutMs: z.number().int().min(1000).optional().describe('Element wait timeout in milliseconds'),
  }),
  execute: async (args: {
    selector?: string;
    maxChars?: number;
    normalizeWhitespace?: boolean;
    timeoutMs?: number;
  }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/get_text`, {
      method: 'POST',
      body: JSON.stringify({
        selector: args.selector,
        max_chars: args.maxChars,
        normalize_whitespace: args.normalizeWhitespace,
        timeout_ms: args.timeoutMs,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser get text failed');
    }

    return data.result;
  },
};

/**
 * Browser form-input tool
 */
export const browserFormInputTool: Tool = {
  name: 'browser_form_input',
  description: 'Fill multiple form inputs by selector-value map and optionally submit',
  parameters: z.object({
    fields: z.record(z.union([z.string(), z.number(), z.boolean()])).describe('Selector-value map'),
    clear: z.boolean().optional().describe('Clear fields before setting values'),
    submit: z.boolean().optional().describe('Submit by Enter key after filling'),
    submitSelector: z.string().optional().describe('Optional submit button selector'),
    timeoutMs: z.number().int().min(1000).optional().describe('Element wait timeout in milliseconds'),
  }),
  execute: async (args: {
    fields: Record<string, string | number | boolean>;
    clear?: boolean;
    submit?: boolean;
    submitSelector?: string;
    timeoutMs?: number;
  }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/form_input`, {
      method: 'POST',
      body: JSON.stringify({
        fields: args.fields,
        clear: args.clear,
        submit: args.submit,
        submit_selector: args.submitSelector,
        timeout_ms: args.timeoutMs,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser form input failed');
    }

    return data.result;
  },
};

/**
 * Browser key press tool
 */
export const browserPressTool: Tool = {
  name: 'browser_press',
  description: 'Send keyboard key to browser page',
  parameters: z.object({
    key: z.string().describe('Keyboard key, e.g. "Enter", "Tab", "Control+A"'),
  }),
  execute: async (args: { key: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/press`, {
      method: 'POST',
      body: JSON.stringify({ key: args.key }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser key press failed');
    }

    return data.result;
  },
};

/**
 * Browser scroll tool
 */
export const browserScrollTool: Tool = {
  name: 'browser_scroll',
  description: 'Scroll browser page by wheel delta values',
  parameters: z.object({
    deltaX: z.number().optional().describe('Horizontal wheel delta'),
    deltaY: z.number().optional().describe('Vertical wheel delta'),
  }),
  execute: async (args: { deltaX?: number; deltaY?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/scroll`, {
      method: 'POST',
      body: JSON.stringify({
        delta_x: args.deltaX,
        delta_y: args.deltaY,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser scroll failed');
    }

    return data.result;
  },
};

/**
 * Browser screenshot tool
 */
export const browserScreenshotTool: Tool = {
  name: 'browser_screenshot',
  description: 'Capture screenshot from current browser page',
  parameters: z.object({
    fullPage: z.boolean().optional().describe('Capture full scrollable page'),
  }),
  execute: async (args: { fullPage?: boolean }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/screenshot`, {
      method: 'POST',
      body: JSON.stringify({
        full_page: args.fullPage,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser screenshot failed');
    }

    return {
      path: data.result.path,
      size: data.result.size,
      url: data.result.url,
      base64: data.result.base64,
      mediaType: data.result.media_type,
    };
  },
};

/**
 * Browser close tool
 */
export const browserCloseTool: Tool = {
  name: 'browser_close',
  description: 'Close browser session and release resources',
  parameters: z.object({}),
  execute: async () => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Browser close failed');
    }

    return data.result;
  },
};

/**
 * Type text tool
 */
export const typeTextTool: Tool = {
  name: 'type_text',
  description: 'Type text at the specified control or current focus',
  parameters: z.object({
    text: z.string().describe('Text to type'),
    target: z.string().optional().describe('Target control name'),
    windowTitle: z.string().optional().describe('Window title'),
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
 * Menu select tool
 */
export const menuSelectTool: Tool = {
  name: 'menu_select',
  description: 'Select a window menu item (e.g. "File->Save")',
  parameters: z.object({
    menuPath: z.string().describe('Menu path, e.g. "File->Save"'),
    windowTitle: z.string().describe('Window title'),
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
 * Screenshot tool
 */
export const screenshotTool: Tool = {
  name: 'screenshot',
  description: 'Capture screen or specified window',
  parameters: z.object({
    windowTitle: z.string().optional().describe('Window title (omit for fullscreen)'),
    region: z.object({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional().describe('Screenshot region'),
    modelWidth: z.number().int().min(1).optional().describe('Model viewport width for coordinate scaling'),
    modelHeight: z.number().int().min(1).optional().describe('Model viewport height for coordinate scaling'),
  }),
  execute: async (args: {
    windowTitle?: string;
    region?: any;
    modelWidth?: number;
    modelHeight?: number;
  }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/screenshot`, {
      method: 'POST',
      body: JSON.stringify({
        window_title: args.windowTitle,
        region: args.region,
        model_width: args.modelWidth,
        model_height: args.modelHeight,
      }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Screenshot failed');
    }

    return {
      path: data.result.path,
      size: data.result.size,
      base64: data.result.base64,
      mediaType: data.result.media_type,
      actualSize: data.result.actual_size,
      modelSize: data.result.model_size,
      scaleX: data.result.scale_x,
      scaleY: data.result.scale_y,
    };
  },
};

/**
 * OCR text recognition tool
 */
export const ocrTool: Tool = {
  name: 'ocr_recognize',
  description: 'Recognize text in an image',
  parameters: z.object({
    imagePath: z.string().optional().describe('Image path (auto screenshot if omitted)'),
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
 * OCR find text tool
 */
export const ocrFindTextTool: Tool = {
  name: 'ocr_find_text',
  description: 'Find specified text on screen and return its position',
  parameters: z.object({
    text: z.string().describe('Text to find'),
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
 * OCR click text tool
 */
export const ocrClickTextTool: Tool = {
  name: 'ocr_click_text',
  description: 'Find text via OCR and click on it',
  parameters: z.object({
    text: z.string().describe('Text to click'),
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
 * Hotkey tool
 */
export const hotkeyTool: Tool = {
  name: 'hotkey',
  description: 'Send keyboard shortcut combination',
  parameters: z.object({
    combo: z.array(z.string()).describe('Key combo list, e.g. ["ctrl", "c"]'),
  }),
  execute: async (args: { combo: string[] }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/hotkey`, {
      method: 'POST',
      body: JSON.stringify({ keys: args.combo }),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || data.error || 'Hotkey failed');
    }

    return data.result;
  },
};

export const opencodeRunTool: Tool = {
  name: 'opencode_run',
  description: 'Run OpenCode CLI task for code generation/refactor in a project directory',
  parameters: z.object({
    projectPath: z.string().describe('Absolute or relative project path'),
    prompt: z.string().describe('Task instruction prompt'),
    agentType: z.string().optional().describe('OpenCode agent profile, e.g. build/review'),
    background: z.boolean().optional().describe('Run in background and return taskId'),
    timeoutMs: z.number().int().min(1000).max(3600000).optional().describe('Timeout in milliseconds'),
  }),
  execute: async (args: {
    projectPath: string;
    prompt: string;
    agentType?: string;
    background?: boolean;
    timeoutMs?: number;
  }) => {
    return await runOpenCodeTask(args);
  },
};

export const opencodeCreateProjectTool: Tool = {
  name: 'opencode_create_project',
  description: 'Create a new project scaffold via OpenCode task',
  parameters: z.object({
    projectName: z.string().describe('Project folder name'),
    template: z.string().optional().describe('Template identifier, e.g. react-ts'),
    baseDir: z.string().optional().describe('Base directory where project will be created'),
    agentType: z.string().optional().describe('OpenCode agent profile'),
    background: z.boolean().optional().describe('Run in background and return taskId'),
    timeoutMs: z.number().int().min(1000).max(3600000).optional().describe('Timeout in milliseconds'),
  }),
  execute: async (args: {
    projectName: string;
    template?: string;
    baseDir?: string;
    agentType?: string;
    background?: boolean;
    timeoutMs?: number;
  }) => {
    return await createOpenCodeProject(args);
  },
};

export const opencodeCheckStatusTool: Tool = {
  name: 'opencode_check_status',
  description: 'Check status of an OpenCode background task',
  parameters: z.object({
    taskId: z.string().describe('Background task id returned by opencode_run'),
  }),
  execute: async (args: { taskId: string }) => {
    return getOpenCodeTaskStatus(args.taskId);
  },
};

export const opencodeListTasksTool: Tool = {
  name: 'opencode_list_tasks',
  description: 'List OpenCode tasks with optional state filter and pagination',
  parameters: z.object({
    state: z.enum(['all', 'running', 'completed', 'failed', 'canceled'])
      .optional()
      .describe('Optional state filter'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of tasks to return'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination'),
  }),
  execute: async (args: {
    state?: 'all' | 'running' | 'completed' | 'failed' | 'canceled';
    limit?: number;
    offset?: number;
  }) => {
    return listOpenCodeTasks(args);
  },
};

export const opencodeCheckConcurrentStatusTool: Tool = {
  name: 'opencode_check_concurrent_status',
  description: 'Check concurrent task summary managed by OpenCode wrapper',
  parameters: z.object({}),
  execute: async () => {
    return getOpenCodeConcurrentStatus();
  },
};

export const opencodeCancelTaskTool: Tool = {
  name: 'opencode_cancel_task',
  description: 'Cancel an OpenCode background task',
  parameters: z.object({
    taskId: z.string().describe('Background task id returned by opencode_run'),
  }),
  execute: async (args: { taskId: string }) => {
    return cancelOpenCodeTask(args.taskId);
  },
};

export const ohmyOpencodeTaskTool: Tool = {
  name: 'ohmyopencode_task',
  description: 'Dispatch development task through Oh-My-OpenCode atlas workflow',
  parameters: z.object({
    taskCategory: z.string().describe('Task category, e.g. frontend/backend/refactor'),
    taskPrompt: z.string().describe('Detailed task prompt'),
    runInBackground: z.boolean().optional().describe('Run in background and return taskId'),
    projectPath: z.string().optional().describe('Working directory path'),
    timeoutMs: z.number().int().min(1000).max(3600000).optional().describe('Timeout in milliseconds'),
  }),
  execute: async (args: {
    taskCategory: string;
    taskPrompt: string;
    runInBackground?: boolean;
    projectPath?: string;
    timeoutMs?: number;
  }) => {
    return await runOhMyTask(args);
  },
};

export const ohmyOpencodeDelegateTool: Tool = {
  name: 'ohmyopencode_delegate',
  description: 'Delegate development task to a specialized Oh-My-OpenCode agent',
  parameters: z.object({
    agentType: z.string().describe('Agent type, e.g. architect/frontend/backend/tester'),
    taskDescription: z.string().describe('Task description for selected agent'),
    runInBackground: z.boolean().optional().describe('Run in background and return taskId'),
    projectPath: z.string().optional().describe('Working directory path'),
    timeoutMs: z.number().int().min(1000).max(3600000).optional().describe('Timeout in milliseconds'),
  }),
  execute: async (args: {
    agentType: string;
    taskDescription: string;
    runInBackground?: boolean;
    projectPath?: string;
    timeoutMs?: number;
  }) => {
    return await runOhMyDelegate(args);
  },
};

export const ohmyOpencodeListAgentsTool: Tool = {
  name: 'ohmyopencode_list_agents',
  description: 'List available Oh-My-OpenCode specialized agents',
  parameters: z.object({}),
  execute: async () => {
    return await listOhMyAgents();
  },
};

export const ohmyOpencodeCheckConcurrentStatusTool: Tool = {
  name: 'ohmyopencode_check_concurrent_status',
  description: 'Check concurrent task status managed by Oh-My-OpenCode and local wrappers',
  parameters: z.object({}),
  execute: async () => {
    return await getOhMyConcurrentStatus();
  },
};

export const ohmyOpencodeCancelTaskTool: Tool = {
  name: 'ohmyopencode_cancel_task',
  description: 'Cancel a background Oh-My-OpenCode wrapper task',
  parameters: z.object({
    taskId: z.string().describe('Background task id returned by ohmyopencode_task/delegate'),
  }),
  execute: async (args: { taskId: string }) => {
    return cancelOhMyTask(args.taskId);
  },
};

export const multiAgentStartTool: Tool = {
  name: 'multi_agent_start',
  description: 'Start a multi-agent parallel execution group using Oh-My-OpenCode tasks',
  parameters: z.object({
    projectPath: z.string().optional().describe('Working directory path'),
    timeoutMs: z.number().int().min(1000).max(3600000).optional().describe('Timeout for each task in milliseconds'),
    tasks: z.array(
      z.object({
        kind: z.enum(['delegate', 'task']).optional().describe('Dispatch kind'),
        name: z.string().optional().describe('Optional display name'),
        agentType: z.string().optional().describe('Required for delegate kind'),
        taskDescription: z.string().optional().describe('Required for delegate kind'),
        taskCategory: z.string().optional().describe('Required for task kind'),
        taskPrompt: z.string().optional().describe('Required for task kind'),
      }),
    ).min(1).max(20).describe('Parallel task specs'),
  }),
  execute: async (args: {
    projectPath?: string;
    timeoutMs?: number;
    tasks: Array<{
      kind?: 'delegate' | 'task';
      name?: string;
      agentType?: string;
      taskDescription?: string;
      taskCategory?: string;
      taskPrompt?: string;
    }>;
  }) => {
    return await startMultiAgentGroup(args);
  },
};

export const multiAgentStatusTool: Tool = {
  name: 'multi_agent_group_status',
  description: 'Get runtime status for a multi-agent parallel group',
  parameters: z.object({
    groupId: z.string().describe('Group id returned by multi_agent_start'),
  }),
  execute: async (args: { groupId: string }) => {
    return getMultiAgentGroupStatus(args.groupId);
  },
};

export const multiAgentCancelTool: Tool = {
  name: 'multi_agent_group_cancel',
  description: 'Cancel a running multi-agent parallel group',
  parameters: z.object({
    groupId: z.string().describe('Group id returned by multi_agent_start'),
  }),
  execute: async (args: { groupId: string }) => {
    return cancelMultiAgentGroup(args.groupId);
  },
};

export const multiAgentListTool: Tool = {
  name: 'multi_agent_group_list',
  description: 'List recent multi-agent parallel groups',
  parameters: z.object({
    state: z.enum(['all', 'running', 'completed', 'failed', 'canceled', 'partial'])
      .optional()
      .describe('Optional state filter'),
    limit: z.number().int().min(1).max(200).optional().describe('Maximum number of groups to return'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination'),
  }),
  execute: async (args: {
    state?: 'all' | 'running' | 'completed' | 'failed' | 'canceled' | 'partial';
    limit?: number;
    offset?: number;
  }) => {
    return listMultiAgentGroups(args);
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
 * Tool registry
 */
export const tools: Tool[] = [
  listWindowsTool,
  getWindowControlsTool,
  clickTool,
  rightClickTool,
  doubleClickTool,
  hoverTool,
  dragTool,
  browserLaunchTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserReadPageTool,
  browserGetTextTool,
  browserFormInputTool,
  browserPressTool,
  browserScrollTool,
  browserScreenshotTool,
  browserCloseTool,
  typeTextTool,
  menuSelectTool,
  screenshotTool,
  ocrTool,
  ocrFindTextTool,
  ocrClickTextTool,
  hotkeyTool,
  opencodeRunTool,
  opencodeCreateProjectTool,
  opencodeCheckStatusTool,
  opencodeListTasksTool,
  opencodeCheckConcurrentStatusTool,
  opencodeCancelTaskTool,
  ohmyOpencodeTaskTool,
  ohmyOpencodeDelegateTool,
  ohmyOpencodeListAgentsTool,
  ohmyOpencodeCheckConcurrentStatusTool,
  ohmyOpencodeCancelTaskTool,
  multiAgentStartTool,
  multiAgentStatusTool,
  multiAgentCancelTool,
  multiAgentListTool,
  codingProgressTool,
  ...devTools,
  ...externalCliTools,
];

/**
 * Tool Manager
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private builtInToolNames: Set<string> = new Set();
  private skillToolNames: Set<string> = new Set();
  private skillToolIndex: Map<string, string[]> = new Map();
  private installedSkills: InstalledSkillManifest[] = [];
  private skillWarnings: string[] = [];
  private skillsInitialized = false;
  private skillsInitializing: Promise<void> | null = null;
  private sandboxMode: ToolSandboxMode;
  private configuredAllowedTools: Set<string>;
  private blockedTools: Set<string>;

  constructor() {
    this.sandboxMode = normalizeSandboxMode(
      process.env.CHUBAO_TOOL_SANDBOX_MODE ?? process.env.CHUBAO_TOOL_SANDBOX,
    );
    this.configuredAllowedTools = parseToolList(process.env.CHUBAO_ALLOWED_TOOLS);
    this.blockedTools = parseToolList(process.env.CHUBAO_BLOCKED_TOOLS);

    tools.forEach((tool) => {
      this.tools.set(tool.name, tool);
      this.builtInToolNames.add(tool.name);
    });
  }

  async initializeSkills(): Promise<void> {
    if (this.skillsInitialized) {
      return;
    }
    if (this.skillsInitializing) {
      await this.skillsInitializing;
      return;
    }

    this.skillsInitializing = this.reloadSkills();
    try {
      await this.skillsInitializing;
      this.skillsInitialized = true;
    } finally {
      this.skillsInitializing = null;
    }
  }

  /**
   * Force-reload all skills, resetting the initialized flag.
   * Called after agent creates a new skill or installs one.
   */
  async forceReloadSkills(): Promise<void> {
    this.skillsInitialized = false;
    this.skillsInitializing = null;
    await this.reloadSkills();
    this.skillsInitialized = true;
    console.log(`\u{1F504} Skills reloaded: ${this.skillToolNames.size} skill tools active`);
  }

  async installSkill(skillPath: string): Promise<{
    manifest: InstalledSkillManifest;
    loadedTools: number;
    warnings: string[];
  }> {
    const manifest = await installSkillFromPath(skillPath);
    await this.reloadSkills();
    this.skillsInitialized = true;
    const loadedTools = this.skillToolIndex.get(manifest.id)?.length ?? 0;
    return {
      manifest,
      loadedTools,
      warnings: [...this.skillWarnings],
    };
  }

  getInstalledSkills(): InstalledSkillManifest[] {
    return [...this.installedSkills];
  }

  getSkillWarnings(): string[] {
    return [...this.skillWarnings];
  }

  getTool(name: string): Tool | undefined {
    const tool = this.tools.get(name);
    if (!tool) {
      return undefined;
    }
    const access = this.isToolAllowed(name);
    return access.allowed ? tool : undefined;
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).filter((tool) => this.isToolAllowed(tool.name).allowed);
  }

  getSandboxPolicy(): ToolSandboxPolicy {
    return {
      mode: this.sandboxMode,
      enabled: this.sandboxMode !== 'off' || this.blockedTools.size > 0,
      configuredAllowedTools: Array.from(this.configuredAllowedTools.values()).sort(),
      effectiveAllowedTools:
        this.sandboxMode === 'allowlist'
          ? Array.from(this.getEffectiveAllowedTools().values()).sort()
          : [],
      blockedTools: Array.from(this.blockedTools.values()).sort(),
      visibleTools: this.getAllTools()
        .map((tool) => tool.name)
        .sort(),
    };
  }

  async getCliHealth(): Promise<CliHealthSnapshot> {
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

  getToolDefinitions(): any[] {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: this.zodToJsonSchema(tool.parameters),
        required: Object.keys(tool.parameters.shape).filter(
          (key) => !tool.parameters.shape[key].isOptional(),
        ),
      },
    }));
  }

  async executeTool(name: string, args: any): Promise<any> {
    await this.initializeSkills();
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    const access = this.isToolAllowed(name);
    if (!access.allowed) {
      throw new Error(`Tool "${name}" is not allowed by sandbox policy (${access.reason})`);
    }

    const validated = tool.parameters.parse(args);
    return await tool.execute(validated);
  }

  private getEffectiveAllowedTools(): Set<string> {
    if (this.configuredAllowedTools.size > 0) {
      return this.configuredAllowedTools;
    }
    return new Set(DEFAULT_SANDBOX_ALLOWLIST);
  }

  private isToolAllowed(name: string): { allowed: boolean; reason?: string } {
    if (this.blockedTools.has(name)) {
      return { allowed: false, reason: 'blocked' };
    }

    if (this.sandboxMode === 'allowlist') {
      const allowlist = this.getEffectiveAllowedTools();
      if (!allowlist.has(name)) {
        return { allowed: false, reason: 'not_allowlisted' };
      }
    }

    return { allowed: true };
  }

  private async reloadSkills(): Promise<void> {
    for (const toolName of this.skillToolNames) {
      this.tools.delete(toolName);
    }
    this.skillToolNames.clear();
    this.skillToolIndex.clear();
    this.skillWarnings = [];

    const result = await loadSkillToolsFromRegistry();
    this.installedSkills = result.manifests;
    this.skillWarnings.push(...result.warnings);

    for (const entry of result.entries) {
      const loadedNames: string[] = [];
      for (const tool of entry.tools) {
        if (this.builtInToolNames.has(tool.name)) {
          this.skillWarnings.push(
            `${entry.manifest.id}: tool "${tool.name}" conflicts with built-in tool and was skipped`,
          );
          continue;
        }
        if (this.skillToolNames.has(tool.name)) {
          this.skillWarnings.push(
            `${entry.manifest.id}: tool "${tool.name}" already provided by another skill and was skipped`,
          );
          continue;
        }

        this.tools.set(tool.name, tool);
        this.skillToolNames.add(tool.name);
        loadedNames.push(tool.name);
      }

      this.skillToolIndex.set(entry.manifest.id, loadedNames);
      this.skillWarnings.push(
        ...entry.warnings.map((warning) => `${entry.manifest.id}: ${warning}`),
      );
    }
  }

  private zodToJsonSchema(zodObj: z.ZodObject<any>): Record<string, any> {
    const shape = zodObj.shape;
    const properties: Record<string, any> = {};

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = this.zodTypeToJsonSchema(value as z.ZodTypeAny);
    }

    return properties;
  }

  /**
   * Convert a single Zod type to JSON Schema, handling wrappers
   * like ZodOptional, ZodDefault, ZodNullable, etc.
   */
  private zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, any> {
    // Unwrap optional / default / nullable wrappers
    let inner: z.ZodTypeAny = zodType;
    while (
      inner instanceof z.ZodOptional ||
      inner instanceof z.ZodDefault ||
      inner instanceof z.ZodNullable
    ) {
      inner = (inner as any)._def.innerType;
    }

    let schema: Record<string, any>;

    if (inner instanceof z.ZodString) {
      schema = { type: 'string' };
    } else if (inner instanceof z.ZodNumber) {
      schema = { type: 'number' };
    } else if (inner instanceof z.ZodBoolean) {
      schema = { type: 'boolean' };
    } else if (inner instanceof z.ZodEnum) {
      const values = inner._def.values as string[];
      schema = { type: 'string', enum: values };
    } else if (inner instanceof z.ZodArray) {
      const itemType = inner._def.type as z.ZodTypeAny;
      schema = { type: 'array', items: this.zodTypeToJsonSchema(itemType) };
    } else if (inner instanceof z.ZodObject) {
      schema = {
        type: 'object',
        properties: this.zodToJsonSchema(inner),
      };
    } else {
      // Fallback for unsupported types
      schema = {};
    }

    // Attach description from the original (possibly wrapped) type
    if (zodType.description) {
      schema.description = zodType.description;
    } else if (inner.description) {
      schema.description = inner.description;
    }

    return schema;
  }
}
export const toolManager = new ToolManager();
