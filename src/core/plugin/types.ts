// 插件系统类型定义

export type PluginStatus = 'inactive' | 'loading' | 'active' | 'error' | 'disabled';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  icon?: string;
  permissions: PluginPermission[];
  dependencies?: string[];
  configSchema?: PluginConfigSchema;
}

export type PluginPermission =
  | 'storage'
  | 'network'
  | 'clipboard'
  | 'notification'
  | 'fs'
  | 'shell'
  | 'window'
  | 'system';

export interface PluginConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: unknown;
    description?: string;
    required?: boolean;
    enum?: unknown[];
  };
}

export interface PluginConfig {
  [key: string]: unknown;
}

export interface PluginContext {
  // 存储 API
  storage: {
    get: <T>(key: string, defaultValue?: T) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  // 网络 API
  fetch: typeof fetch;
  // 通知 API
  notify: (message: string, options?: { type?: 'info' | 'success' | 'warning' | 'error' }) => void;
  // 日志 API
  log: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  // 事件总线
  events: {
    on: (event: string, handler: (data: unknown) => void) => () => void;
    emit: (event: string, data?: unknown) => void;
  };
  // UI API
  ui: {
    registerPanel: (id: string, component: React.ComponentType) => void;
    registerCommand: (id: string, command: PluginCommand) => void;
    showModal: (component: React.ComponentType, props?: Record<string, unknown>) => Promise<unknown>;
  };
  // 系统 API
  system: {
    getPlatform: () => string;
    getVersion: () => string;
  };
}

export interface PluginCommand {
  name: string;
  description: string;
  shortcut?: string;
  execute: () => void | Promise<void>;
}

export interface PluginAPI {
  activate: (context: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
  onConfigChange?: (config: PluginConfig) => void;
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  config: PluginConfig;
  api?: PluginAPI;
  error?: string;
  loadedAt?: Date;
  activatedAt?: Date;
}

export interface PluginRegistry {
  register: (manifest: PluginManifest, api: PluginAPI) => void;
  unregister: (id: string) => void;
  get: (id: string) => PluginInstance | undefined;
  getAll: () => PluginInstance[];
  getByStatus: (status: PluginStatus) => PluginInstance[];
}

// 插件事件
export interface PluginEventMap {
  'plugin:registered': { id: string; manifest: PluginManifest };
  'plugin:loaded': { id: string };
  'plugin:activated': { id: string };
  'plugin:deactivated': { id: string };
  'plugin:error': { id: string; error: string };
  'plugin:unregistered': { id: string };
  'plugin:configChanged': { id: string; config: PluginConfig };
}
