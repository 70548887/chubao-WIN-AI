/**
 * Tool Definitions - Unified exports
 */
export { automationTools } from './automation.js';
export { browserTools } from './browser.js';

// Re-export individual tools for granular access
export {
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
} from './automation.js';

export {
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
} from './browser.js';
