/**
 * Browser Automation Tools
 * Web browser control and interaction
 */
import { z } from 'zod';
import type { Tool } from '../core/types.js';
import { fetchWithRetry } from '../utils/fetch.js';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:3200';

export const browserLaunchTool: Tool = {
  name: 'browser_launch',
  description: 'Launch a browser instance',
  parameters: z.object({
    url: z.string().optional().describe('Initial URL to navigate to'),
    headless: z.boolean().optional().describe('Run in headless mode'),
  }),
  execute: async (args: { url?: string; headless?: boolean }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/launch`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to launch browser');
    return { sessionId: data.sessionId, url: data.url };
  },
};

export const browserNavigateTool: Tool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    url: z.string().describe('URL to navigate to'),
  }),
  execute: async (args: { sessionId: string; url: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/navigate`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Navigation failed');
    return { url: data.url, title: data.title };
  },
};

export const browserClickTool: Tool = {
  name: 'browser_click',
  description: 'Click on an element in the browser',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    selector: z.string().describe('CSS selector or XPath'),
  }),
  execute: async (args: { sessionId: string; selector: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/click`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Click failed');
    return data.result;
  },
};

export const browserTypeTool: Tool = {
  name: 'browser_type',
  description: 'Type text into an input element',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    selector: z.string().describe('CSS selector or XPath'),
    text: z.string().describe('Text to type'),
    clear: z.boolean().optional().describe('Clear field before typing'),
  }),
  execute: async (args: { sessionId: string; selector: string; text: string; clear?: boolean }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/type`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Type failed');
    return data.result;
  },
};

export const browserReadPageTool: Tool = {
  name: 'browser_read_page',
  description: 'Read the current page content',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
  }),
  execute: async (args: { sessionId: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/read`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Read failed');
    return {
      url: data.url,
      title: data.title,
      content: data.content,
      links: data.links,
    };
  },
};

export const browserGetTextTool: Tool = {
  name: 'browser_get_text',
  description: 'Get text content of an element',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    selector: z.string().describe('CSS selector or XPath'),
  }),
  execute: async (args: { sessionId: string; selector: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/get_text`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Get text failed');
    return { text: data.text };
  },
};

export const browserFormInputTool: Tool = {
  name: 'browser_form_input',
  description: 'Fill a form with multiple fields',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    fields: z.record(z.string()).describe('Field selector to value mapping'),
  }),
  execute: async (args: { sessionId: string; fields: Record<string, string> }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/form_input`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Form input failed');
    return data.result;
  },
};

export const browserPressTool: Tool = {
  name: 'browser_press',
  description: 'Press a key in the browser',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    key: z.string().describe('Key to press (e.g. "Enter", "Tab")'),
  }),
  execute: async (args: { sessionId: string; key: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/press`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Key press failed');
    return data.result;
  },
};

export const browserScrollTool: Tool = {
  name: 'browser_scroll',
  description: 'Scroll the page',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
    amount: z.number().optional().describe('Scroll amount in pixels'),
  }),
  execute: async (args: { sessionId: string; direction: string; amount?: number }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/scroll`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Scroll failed');
    return data.result;
  },
};

export const browserScreenshotTool: Tool = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the browser',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
    fullPage: z.boolean().optional().describe('Capture full page'),
  }),
  execute: async (args: { sessionId: string; fullPage?: boolean }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/screenshot`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Screenshot failed');
    return { path: data.path, base64: data.base64 };
  },
};

export const browserCloseTool: Tool = {
  name: 'browser_close',
  description: 'Close the browser instance',
  parameters: z.object({
    sessionId: z.string().describe('Browser session ID'),
  }),
  execute: async (args: { sessionId: string }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/browser/close`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Close failed');
    return { closed: true };
  },
};

// Export all browser tools
export const browserTools: Tool[] = [
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
];
