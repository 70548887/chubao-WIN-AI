/**
 * GUI Automation Tools
 * Windows GUI control and automation
 */
import { z } from 'zod';
import type { Tool } from '../core/types.js';
import { fetchWithRetry } from '../utils/fetch.js';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:3200';

export const listWindowsTool: Tool = {
  name: 'list_windows',
  description: 'Get all visible Windows window list',
  parameters: z.object({}),
  execute: async () => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/windows`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to get windows');
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
    if (!data.success) throw new Error(data.error || 'Failed to get controls');
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
    if (!data.success) throw new Error(data.error || 'Click failed');
    return data.result;
  },
};

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
    if (!data.success) throw new Error(data.message || data.error || 'Right click failed');
    return data.result;
  },
};

export const doubleClickTool: Tool = {
  name: 'double_click',
  description: 'Double click at specified coordinates',
  parameters: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
  }),
  execute: async (args: { x: number; y: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/double_click`, {
      method: 'POST',
      body: JSON.stringify({ x: args.x, y: args.y }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Double click failed');
    return data.result;
  },
};

export const hoverTool: Tool = {
  name: 'hover',
  description: 'Hover mouse at specified coordinates',
  parameters: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
    duration: z.number().optional().describe('Hover duration in seconds'),
  }),
  execute: async (args: { x: number; y: number; duration?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/hover`, {
      method: 'POST',
      body: JSON.stringify({ x: args.x, y: args.y, duration: args.duration }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Hover failed');
    return data.result;
  },
};

export const dragTool: Tool = {
  name: 'drag',
  description: 'Drag from one position to another',
  parameters: z.object({
    fromX: z.number().describe('Start X coordinate'),
    fromY: z.number().describe('Start Y coordinate'),
    toX: z.number().describe('End X coordinate'),
    toY: z.number().describe('End Y coordinate'),
    duration: z.number().optional().describe('Drag duration in seconds'),
  }),
  execute: async (args: { fromX: number; fromY: number; toX: number; toY: number; duration?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/drag`, {
      method: 'POST',
      body: JSON.stringify({
        start_x: args.fromX,
        start_y: args.fromY,
        end_x: args.toX,
        end_y: args.toY,
        duration: args.duration,
      }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Drag failed');
    return data.result;
  },
};

export const typeTextTool: Tool = {
  name: 'type_text',
  description: 'Type text at current cursor position',
  parameters: z.object({
    text: z.string().describe('Text to type'),
    interval: z.number().optional().describe('Interval between keystrokes in seconds'),
  }),
  execute: async (args: { text: string; interval?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/type`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Type failed');
    return data.result;
  },
};

export const hotkeyTool: Tool = {
  name: 'hotkey',
  description: 'Press keyboard shortcut',
  parameters: z.object({
    keys: z.array(z.string()).describe('Keys to press (e.g. ["ctrl", "c"])'),
  }),
  execute: async (args: { keys: string[] }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/hotkey`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Hotkey failed');
    return data.result;
  },
};

export const menuSelectTool: Tool = {
  name: 'menu_select',
  description: 'Select menu item by path',
  parameters: z.object({
    windowTitle: z.string().describe('Window title'),
    menuPath: z.array(z.string()).describe('Menu path (e.g. ["File", "Open"])'),
  }),
  execute: async (args: { windowTitle: string; menuPath: string[] }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/menu_select`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Menu select failed');
    return data.result;
  },
};

export const screenshotTool: Tool = {
  name: 'screenshot',
  description: 'Take a screenshot of the screen or specific window, and perform local OCR to extract text. Returns both the screenshot path and recognized text content.',
  parameters: z.object({
    windowTitle: z.string().optional().describe('Window title (optional)'),
    includeOcr: z.boolean().optional().describe('Include OCR text recognition (default: true)'),
  }),
  execute: async (args: { windowTitle?: string; includeOcr?: boolean }) => {
    // Step 1: Take screenshot
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/screenshot`, {
      method: 'POST',
      body: JSON.stringify({ window_title: args.windowTitle }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'Screenshot failed');

    const screenshotResult = {
      path: data.result?.path || data.path,
      base64: data.result?.base64 || data.base64,
      media_type: data.result?.media_type || 'image/png',
      actual_size: data.result?.actual_size,
      model_size: data.result?.model_size,
      scale_x: data.result?.scale_x,
      scale_y: data.result?.scale_y,
    };

    // Step 2: Perform OCR on the screenshot (if enabled, default true)
    console.log(`[screenshot] includeOcr=${args.includeOcr}, path=${screenshotResult.path}`);
    if (args.includeOcr !== false) {
      try {
        console.log(`[screenshot] Starting OCR for ${screenshotResult.path}`);
        const ocrResponse = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr`, {
          method: 'POST',
          body: JSON.stringify({ image_path: screenshotResult.path }),
        }, 60000); // 60s timeout for OCR
        const ocrData = await ocrResponse.json();
        console.log(`[screenshot] OCR response: success=${ocrData.success}, hasResult=${!!ocrData.result}`);
        if (ocrData.success && ocrData.result) {
          // OCR returns { texts: [...], count: N, image_path: ... }
          // Convert texts array to a single string
          const texts = ocrData.result.texts || [];
          const ocrText = texts.map((t: any) => t.text).join('\n');
          console.log(`[screenshot] OCR succeeded: ${texts.length} regions, ${ocrText.length} chars`);
          return {
            ...screenshotResult,
            ocr_text: ocrText,
            ocr_regions: texts,
          };
        }
      } catch (ocrErr) {
        // OCR failure shouldn't break screenshot functionality
        console.warn('[screenshot] OCR failed:', ocrErr);
      }
    }

    return screenshotResult;
  },
};

export const ocrTool: Tool = {
  name: 'ocr_recognize',
  description: 'Recognize text in image using OCR',
  parameters: z.object({
    imagePath: z.string().optional().describe('Image path (optional, uses screenshot if not provided)'),
  }),
  execute: async (args: { imagePath?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'OCR failed');
    return {
      text: data.text,
      regions: data.regions,
    };
  },
};

export const ocrFindTextTool: Tool = {
  name: 'ocr_find_text',
  description: 'Find text position in image using OCR',
  parameters: z.object({
    text: z.string().describe('Text to find'),
    imagePath: z.string().optional().describe('Image path (optional)'),
  }),
  execute: async (args: { text: string; imagePath?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr_find`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'OCR find failed');
    return {
      found: data.found,
      position: data.position,
      confidence: data.confidence,
    };
  },
};

export const ocrClickTextTool: Tool = {
  name: 'ocr_click_text',
  description: 'Click on text found by OCR',
  parameters: z.object({
    text: z.string().describe('Text to click'),
    imagePath: z.string().optional().describe('Image path (optional)'),
  }),
  execute: async (args: { text: string; imagePath?: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/ocr_click`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || data.error || 'OCR click failed');
    return data.result;
  },
};

// Export all automation tools
export const automationTools: Tool[] = [
  listWindowsTool,
  getWindowControlsTool,
  clickTool,
  rightClickTool,
  doubleClickTool,
  hoverTool,
  dragTool,
  typeTextTool,
  hotkeyTool,
  menuSelectTool,
  screenshotTool,
  ocrTool,
  ocrFindTextTool,
  ocrClickTextTool,
];
