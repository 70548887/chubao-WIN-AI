/**
 * Agent Router — multi-agent routing and isolation system.
 *
 * Supports multiple specialized agents with different roles:
 * - Architect: Design and coordination
 * - Frontend: UI/UX development
 * - Backend: API and database
 * - Tester: Testing and QA
 *
 * Each agent has isolated workspace, tools, and session context.
 */

import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { AgentRuntime } from './runtime.js';
import type { MemoryManager } from '../memory/manager.js';

export type AgentRole = 'architect' | 'frontend' | 'backend' | 'tester' | 'custom';

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  deniedTools?: string[];
  workspace?: string;
  model?: string;
  maxIterations?: number;
}

export interface AgentInstance {
  config: AgentConfig;
  runtime: AgentRuntime;
  sessionId: string;
  createdAt: string;
  lastActivityAt?: string;
  messageCount: number;
}

export interface AgentRoutingRule {
  agentId: string;
  channel?: string;
  senderId?: string;
  keyword?: string;
}

interface PersistedAgentRouterState {
  schemaVersion: string;
  updatedAt: string;
  configs: AgentConfig[];
  rules: AgentRoutingRule[];
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'architect',
    name: '架构师',
    role: 'architect',
    description: '负责需求分析、架构设计和任务拆解',
    systemPrompt: `你是项目架构师，负责：
1. 分析用户需求并拆解为可执行的任务
2. 设计系统架构和模块划分
3. 制定技术方案和选型决策
4. 审查代码质量和架构合理性
5. 协调多个开发者 Agent 的工作

你拥有所有工具的完整权限，可以调用任何工具来完成分析和设计工作。`,
    allowedTools: ['all'],
  },
  {
    id: 'frontend',
    name: '前端开发',
    role: 'frontend',
    description: '负责 React 组件、UI 样式和前端逻辑',
    systemPrompt: `你是前端开发工程师，专注于：
1. React 组件开发和优化
2. TypeScript 类型定义
3. CSS/Tailwind 样式实现
4. 前端状态管理
5. 响应式设计和用户体验

你主要使用文件操作工具、代码编辑工具和截图验证工具。避免直接操作后端 API 或数据库。`,
    allowedTools: ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_files', 'screenshot', 'click', 'type_text'],
    deniedTools: ['restart_sidecar', 'git_rollback'],
  },
  {
    id: 'backend',
    name: '后端开发',
    role: 'backend',
    description: '负责 API、数据库和业务逻辑',
    systemPrompt: `你是后端开发工程师，专注于：
1. API 路由和控制器开发
2. 数据库模型和查询
3. 业务逻辑实现
4. 性能优化和安全性
5. 接口文档编写

你主要使用文件操作工具、代码编辑工具和命令执行工具。谨慎使用重启和回滚类工具。`,
    allowedTools: ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_files', 'run_command', 'validate_code'],
    deniedTools: ['restart_sidecar', 'git_rollback'],
  },
  {
    id: 'tester',
    name: '测试工程师',
    role: 'tester',
    description: '负责编写测试用例和执行测试',
    systemPrompt: `你是测试工程师，专注于：
1. 单元测试编写
2. 集成测试设计
3. 测试覆盖率分析
4. Bug 报告和复现
5. 自动化测试脚本

你主要使用文件操作工具读取代码，编写测试文件，运行测试命令。不要修改生产代码逻辑。`,
    allowedTools: ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_files', 'run_command', 'screenshot'],
    deniedTools: ['restart_sidecar', 'git_rollback', 'edit_file'],
  },
];

const ROUTER_SCHEMA_VERSION = 'agent-router.v1';
const DEFAULT_STATE_PATH = path.join(process.cwd(), '../../memory', 'agents', 'router.json');

export class AgentRouter {
  private readonly memoryManager: MemoryManager;
  private readonly stateEnabled: boolean;
  private readonly statePath: string;
  private configs = new Map<string, AgentConfig>();
  private agents = new Map<string, AgentInstance>();
  private rules: AgentRoutingRule[] = [];

  constructor(options: {
    memoryManager: MemoryManager;
    stateEnabled?: boolean;
    statePath?: string;
  }) {
    this.memoryManager = options.memoryManager;
    this.stateEnabled = options.stateEnabled ?? true;
    this.statePath = options.statePath ?? process.env.CHUBAO_AGENT_ROUTER_STATE_PATH ?? DEFAULT_STATE_PATH;

    this.initializeDefaultAgents();
    this.loadState();
  }

  /**
   * Initialize default agent configurations.
   */
  private initializeDefaultAgents(): void {
    for (const config of DEFAULT_AGENTS) {
      this.configs.set(config.id, config);
    }
  }

  /**
   * Register a custom agent configuration.
   */
  registerAgent(config: AgentConfig): void {
    if (this.configs.has(config.id)) {
      console.warn(`[AgentRouter] Overwriting existing agent config: ${config.id}`);
    }
    this.configs.set(config.id, config);
    this.persistState();
    console.log(`[AgentRouter] Registered agent: ${config.id} (${config.name})`);
  }

  /**
   * Unregister an agent configuration.
   */
  unregisterAgent(agentId: string): boolean {
    // Stop any running instance
    this.stopAgent(agentId);
    
    const deleted = this.configs.delete(agentId);
    if (deleted) {
      this.persistState();
      console.log(`[AgentRouter] Unregistered agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Get an agent configuration.
   */
  getAgentConfig(agentId: string): AgentConfig | null {
    return this.configs.get(agentId) ?? null;
  }

  /**
   * List all agent configurations.
   */
  listAgentConfigs(): AgentConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Start an agent instance.
   */
  async startAgent(agentId: string): Promise<AgentInstance> {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new Error(`Agent config not found: ${agentId}`);
    }

    // Stop existing instance if running
    this.stopAgent(agentId);

    // Create new runtime with isolated session
    const sessionId = `agent:${agentId}:${randomUUID()}`;
    
    // Note: In a full implementation, we would create a new AgentRuntime
    // with custom system prompt and tool filtering. For now, we use the
    // main runtime but track the session separately.
    const instance: AgentInstance = {
      config,
      runtime: null as any, // Will be replaced with actual runtime reference
      sessionId,
      createdAt: new Date().toISOString(),
      messageCount: 0,
    };

    this.agents.set(agentId, instance);
    console.log(`[AgentRouter] Started agent: ${agentId} with session ${sessionId}`);
    
    return instance;
  }

  /**
   * Stop an agent instance.
   */
  stopAgent(agentId: string): boolean {
    const instance = this.agents.get(agentId);
    if (!instance) {
      return false;
    }

    // Clean up session
    this.agents.delete(agentId);
    console.log(`[AgentRouter] Stopped agent: ${agentId}`);
    return true;
  }

  /**
   * Get an active agent instance.
   */
  getAgentInstance(agentId: string): AgentInstance | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * List all active agent instances.
   */
  listActiveAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Route a message to the appropriate agent.
   */
  routeMessage(message: string, context: {
    channel?: string;
    senderId?: string;
  } = {}): string | null {
    // Check routing rules
    for (const rule of this.rules) {
      if (rule.channel && context.channel !== rule.channel) continue;
      if (rule.senderId && context.senderId !== rule.senderId) continue;
      if (rule.keyword && !message.includes(rule.keyword)) continue;
      
      return rule.agentId;
    }

    // Default to architect
    return 'architect';
  }

  /**
   * Add a routing rule.
   */
  addRoutingRule(rule: AgentRoutingRule): void {
    this.rules.push(rule);
    this.persistState();
  }

  /**
   * Remove routing rules for an agent.
   */
  removeRoutingRules(agentId: string): void {
    this.rules = this.rules.filter((r) => r.agentId !== agentId);
    this.persistState();
  }

  /**
   * List all routing rules.
   */
  listRoutingRules(): AgentRoutingRule[] {
    return [...this.rules];
  }

  /**
   * Check if a tool is allowed for an agent.
   */
  isToolAllowed(agentId: string, toolName: string): boolean {
    const config = this.configs.get(agentId);
    if (!config) return false;

    // Check denied tools first
    if (config.deniedTools?.includes(toolName)) {
      return false;
    }

    // Check allowed tools
    if (config.allowedTools?.includes('all')) {
      return true;
    }

    if (config.allowedTools?.includes(toolName)) {
      return true;
    }

    return false;
  }

  /**
   * Get agent statistics.
   */
  getStats(): {
    totalConfigs: number;
    activeAgents: number;
    routingRules: number;
  } {
    return {
      totalConfigs: this.configs.size,
      activeAgents: this.agents.size,
      routingRules: this.rules.length,
    };
  }

  /**
   * Persist router state to disk.
   */
  private persistState(): void {
    if (!this.stateEnabled) return;

    try {
      const dir = path.dirname(this.statePath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }

      const payload: PersistedAgentRouterState = {
        schemaVersion: ROUTER_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        configs: Array.from(this.configs.values()),
        rules: this.rules,
      };

      fsSync.writeFileSync(this.statePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[AgentRouter] Failed to persist state:', error);
    }
  }

  /**
   * Load router state from disk.
   */
  private loadState(): void {
    if (!this.stateEnabled) return;

    try {
      if (!fsSync.existsSync(this.statePath)) {
        return;
      }

      const content = fsSync.readFileSync(this.statePath, 'utf-8');
      const payload = JSON.parse(content) as PersistedAgentRouterState;

      if (payload.schemaVersion !== ROUTER_SCHEMA_VERSION) {
        console.warn('[AgentRouter] Schema version mismatch, using defaults');
        return;
      }

      // Load custom configs (don't overwrite defaults)
      for (const config of payload.configs) {
        if (!DEFAULT_AGENTS.find((d) => d.id === config.id)) {
          this.configs.set(config.id, config);
        }
      }

      // Load routing rules
      this.rules = payload.rules ?? [];

      console.log(`[AgentRouter] Loaded ${this.configs.size} configs, ${this.rules.length} rules`);
    } catch (error) {
      console.warn('[AgentRouter] Failed to load state:', error);
    }
  }
}

// Singleton instance
let globalRouter: AgentRouter | null = null;

export function initializeAgentRouter(options: {
  memoryManager: MemoryManager;
}): AgentRouter {
  if (!globalRouter) {
    globalRouter = new AgentRouter(options);
  }
  return globalRouter;
}

export function getAgentRouter(): AgentRouter | null {
  return globalRouter;
}

export function resetAgentRouter(): void {
  globalRouter = null;
}
