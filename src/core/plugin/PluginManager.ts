import type {
  PluginManifest,
  PluginAPI,
  PluginInstance,
  PluginStatus,
  PluginConfig,
  PluginContext,
  PluginEventMap,
} from './types';

const STORAGE_KEY = 'chubao-plugins';
const PLUGIN_CONFIG_KEY = 'chubao-plugin-config';

export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private eventListeners: Map<keyof PluginEventMap, Set<(data: unknown) => void>> = new Map();
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
    this.loadPluginStates();
  }

  // 注册插件
  register(manifest: PluginManifest, api: PluginAPI): void {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already registered`);
    }

    const config = this.loadPluginConfig(manifest.id);
    const instance: PluginInstance = {
      manifest,
      status: 'inactive',
      config,
      api,
    };

    this.plugins.set(manifest.id, instance);
    this.emit('plugin:registered', { id: manifest.id, manifest });

    // 自动激活已启用的插件
    const states = this.loadPluginStates();
    if (states[manifest.id] !== false) {
      this.activate(manifest.id).catch((error) => {
        console.error(`Failed to auto-activate plugin ${manifest.id}:`, error);
      });
    }
  }

  // 注销插件
  async unregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (plugin.status === 'active') {
      await this.deactivate(id);
    }

    this.plugins.delete(id);
    this.emit('plugin:unregistered', { id });
  }

  // 激活插件
  async activate(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (plugin.status === 'active') {
      return;
    }

    if (plugin.status === 'loading') {
      throw new Error(`Plugin ${id} is already loading`);
    }

    plugin.status = 'loading';

    try {
      // 检查依赖
      if (plugin.manifest.dependencies) {
        for (const depId of plugin.manifest.dependencies) {
          const dep = this.plugins.get(depId);
          if (!dep || dep.status !== 'active') {
            throw new Error(`Dependency ${depId} is not active`);
          }
        }
      }

      // 创建插件上下文
      const pluginContext = this.createPluginContext(plugin);

      // 激活插件
      if (!plugin.api) {
        throw new Error(`Plugin ${id} has no API`);
      }
      await plugin.api.activate(pluginContext);

      plugin.status = 'active';
      plugin.activatedAt = new Date();
      plugin.error = undefined;

      this.savePluginState(id, true);
      this.emit('plugin:activated', { id });
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : String(error);
      this.emit('plugin:error', { id, error: plugin.error });
      throw error;
    }
  }

  // 停用插件
  async deactivate(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (plugin.status !== 'active') {
      return;
    }

    try {
      if (plugin.api?.deactivate) {
        await plugin.api.deactivate();
      }

      plugin.status = 'inactive';
      plugin.activatedAt = undefined;

      this.savePluginState(id, false);
      this.emit('plugin:deactivated', { id });
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : String(error);
      this.emit('plugin:error', { id, error: plugin.error });
      throw error;
    }
  }

  // 更新插件配置
  async updateConfig(id: string, config: Partial<PluginConfig>): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} not found`);
    }

    plugin.config = { ...plugin.config, ...config };
    this.savePluginConfig(id, plugin.config);

    if (plugin.api?.onConfigChange) {
      plugin.api.onConfigChange(plugin.config);
    }

    this.emit('plugin:configChanged', { id, config: plugin.config });
  }

  // 获取插件
  get(id: string): PluginInstance | undefined {
    return this.plugins.get(id);
  }

  // 获取所有插件
  getAll(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  // 按状态获取插件
  getByStatus(status: PluginStatus): PluginInstance[] {
    return this.getAll().filter((p) => p.status === status);
  }

  // 事件监听
  on<K extends keyof PluginEventMap>(
    event: K,
    handler: (data: PluginEventMap[K]) => void
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    const listeners = this.eventListeners.get(event)!;
    const wrappedHandler = handler as (data: unknown) => void;
    listeners.add(wrappedHandler);

    return () => {
      listeners.delete(wrappedHandler);
    };
  }

  // 触发事件
  private emit<K extends keyof PluginEventMap>(event: K, data: PluginEventMap[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in plugin event handler for ${event}:`, error);
        }
      });
    }
  }

  // 创建插件上下文
  private createPluginContext(plugin: PluginInstance): PluginContext {
    const storagePrefix = `plugin:${plugin.manifest.id}:`;

    return {
      storage: {
        get: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
          const stored = localStorage.getItem(`${storagePrefix}${key}`);
          return stored ? JSON.parse(stored) : defaultValue;
        },
        set: async <T>(key: string, value: T): Promise<void> => {
          localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(value));
        },
        remove: async (key: string): Promise<void> => {
          localStorage.removeItem(`${storagePrefix}${key}`);
        },
      },
      fetch: window.fetch.bind(window),
      notify: (message: string, options?: { type?: 'info' | 'success' | 'warning' | 'error' }) => {
        this.context.notify(message, options);
      },
      log: {
        debug: (...args: unknown[]) => console.debug(`[${plugin.manifest.id}]`, ...args),
        info: (...args: unknown[]) => console.info(`[${plugin.manifest.id}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[${plugin.manifest.id}]`, ...args),
        error: (...args: unknown[]) => console.error(`[${plugin.manifest.id}]`, ...args),
      },
      events: {
        on: (event: string, handler: (data: unknown) => void) => {
          return this.context.events.on(event, handler);
        },
        emit: (event: string, data?: unknown) => {
          this.context.events.emit(event, data);
        },
      },
      ui: {
        registerPanel: (id: string, component: React.ComponentType) => {
          this.context.ui.registerPanel(`${plugin.manifest.id}:${id}`, component);
        },
        registerCommand: (id: string, command) => {
          this.context.ui.registerCommand(`${plugin.manifest.id}:${id}`, command);
        },
        showModal: (component, props) => {
          return this.context.ui.showModal(component, props);
        },
      },
      system: {
        getPlatform: () => navigator.platform,
        getVersion: () => '0.2.0',
      },
    };
  }

  // 加载插件状态
  private loadPluginStates(): Record<string, boolean> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  // 保存插件状态
  private savePluginState(id: string, enabled: boolean): void {
    const states = this.loadPluginStates();
    states[id] = enabled;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  }

  // 加载插件配置
  private loadPluginConfig(id: string): PluginConfig {
    try {
      const stored = localStorage.getItem(`${PLUGIN_CONFIG_KEY}:${id}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  // 保存插件配置
  private savePluginConfig(id: string, config: PluginConfig): void {
    localStorage.setItem(`${PLUGIN_CONFIG_KEY}:${id}`, JSON.stringify(config));
  }
}

// 单例实例
let pluginManager: PluginManager | null = null;

export function initializePluginManager(context: PluginContext): PluginManager {
  if (!pluginManager) {
    pluginManager = new PluginManager(context);
  }
  return pluginManager;
}

export function getPluginManager(): PluginManager | null {
  return pluginManager;
}
