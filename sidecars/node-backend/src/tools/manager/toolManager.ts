/**
 * Tool Manager - Core tool registration and dispatch
 */
import {
  installSkillFromPath,
  loadSkillToolsFromRegistry,
  type InstalledSkillManifest,
} from '../skillRegistry.js';
import { SandboxManager } from './sandbox.js';
import { zodToJsonSchema, getRequiredParams } from './schema.js';
import { getCliHealth } from './cliHealth.js';
import type { Tool, ToolSandboxPolicy, CliHealthSnapshot } from './types.js';

export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private builtInToolNames: Set<string> = new Set();
  private skillToolNames: Set<string> = new Set();
  private skillToolIndex: Map<string, string[]> = new Map();
  private installedSkills: InstalledSkillManifest[] = [];
  private skillWarnings: string[] = [];
  private skillsInitialized = false;
  private skillsInitializing: Promise<void> | null = null;
  private sandbox: SandboxManager;

  constructor(builtInTools: Tool[], env: NodeJS.ProcessEnv = process.env) {
    this.sandbox = new SandboxManager(env);

    builtInTools.forEach((tool) => {
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

  async forceReloadSkills(): Promise<void> {
    this.skillsInitialized = false;
    this.skillsInitializing = null;
    await this.reloadSkills();
    this.skillsInitialized = true;
    console.log(`🔄 Skills reloaded: ${this.skillToolNames.size} skill tools active`);
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
    const access = this.sandbox.isToolAllowed(name);
    return access.allowed ? tool : undefined;
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => this.sandbox.isToolAllowed(tool.name).allowed,
    );
  }

  getSandboxPolicy(): ToolSandboxPolicy {
    return this.sandbox.getPolicy(this.getAllTools().map((t) => t.name));
  }

  async getCliHealth(): Promise<CliHealthSnapshot> {
    return getCliHealth();
  }

  getToolDefinitions(): any[] {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: zodToJsonSchema(tool.parameters),
        required: getRequiredParams(tool.parameters),
      },
    }));
  }

  async executeTool(name: string, args: any): Promise<any> {
    await this.initializeSkills();
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    const access = this.sandbox.isToolAllowed(name);
    if (!access.allowed) {
      throw new Error(`Tool "${name}" is not allowed by sandbox policy (${access.reason})`);
    }

    const validated = tool.parameters.parse(args);
    return await tool.execute(validated);
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
}
