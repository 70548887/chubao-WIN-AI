/**
 * Skill Registry
 *
 * Skill package shape:
 * - skill.json (schemaVersion: chubao.skill.v1)
 * - entry module (for example: echo-skill.mjs)
 * - exported tools array (default export name: skillTools)
 */

import * as fsSync from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Tool } from './index.js';

const SKILL_SCHEMA_VERSION = 'chubao.skill.v1';
export const CHUBAO_SKILLS_DIR = process.env.CHUBAO_SKILLS_DIR?.trim()
  || path.join(process.cwd(), 'skills');

const SkillManifestSchema = z.object({
  schemaVersion: z.literal(SKILL_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional().default(''),
  entry: z.string().min(1),
  toolsExport: z.string().min(1).optional().default('skillTools'),
  enabled: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
});

const InstalledSkillManifestSchema = z.object({
  schemaVersion: z.string().default(SKILL_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  source: z.string().default('local'),
  module: z.string().min(1),
  toolsExport: z.string().min(1).default('skillTools'),
  installedAt: z.string(),
  directory: z.string().min(1),
  manifestPath: z.string().min(1),
  toolCount: z.number().int().nonnegative().default(0),
});

export interface InstalledSkillManifest extends z.infer<typeof InstalledSkillManifestSchema> {}

interface SkillToolEntry {
  manifest: InstalledSkillManifest;
  tools: Tool[];
  warnings: string[];
}

interface SkillRegistryResult {
  manifests: InstalledSkillManifest[];
  entries: SkillToolEntry[];
  warnings: string[];
}

interface SkillDirs {
  baseDir: string;
  registryDir: string;
  installedDir: string;
}

function getSkillDirs(baseDir: string): SkillDirs {
  const normalized = path.resolve(baseDir);
  return {
    baseDir: normalized,
    registryDir: path.join(normalized, 'registry'),
    installedDir: path.join(normalized, 'installed'),
  };
}

export function ensureSkillDirectories(baseDir: string = CHUBAO_SKILLS_DIR): SkillDirs {
  const dirs = getSkillDirs(baseDir);
  if (!fsSync.existsSync(dirs.baseDir)) {
    fsSync.mkdirSync(dirs.baseDir, { recursive: true });
  }
  if (!fsSync.existsSync(dirs.registryDir)) {
    fsSync.mkdirSync(dirs.registryDir, { recursive: true });
  }
  if (!fsSync.existsSync(dirs.installedDir)) {
    fsSync.mkdirSync(dirs.installedDir, { recursive: true });
  }
  return dirs;
}

function getRegistryFilePath(registryDir: string, skillId: string): string {
  const safe = skillId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(registryDir, `${safe}.json`);
}

async function copyDirectoryRecursive(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function resolveSkillManifestPath(skillPath: string): Promise<{
  sourceDir: string;
  manifestPath: string;
}> {
  const absPath = path.resolve(skillPath);
  if (!fsSync.existsSync(absPath)) {
    throw new Error(`Skill path does not exist: ${absPath}`);
  }

  const stat = await fs.stat(absPath);
  if (stat.isDirectory()) {
    const manifestPath = path.join(absPath, 'skill.json');
    if (!fsSync.existsSync(manifestPath)) {
      throw new Error(`skill.json not found in directory: ${absPath}`);
    }
    return { sourceDir: absPath, manifestPath };
  }

  if (stat.isFile()) {
    if (path.basename(absPath).toLowerCase() !== 'skill.json') {
      throw new Error(`Skill file must be named skill.json: ${absPath}`);
    }
    return { sourceDir: path.dirname(absPath), manifestPath: absPath };
  }

  throw new Error(`Unsupported skill path: ${absPath}`);
}

function parseInstalledManifest(raw: unknown, registryPath: string): InstalledSkillManifest {
  const result = InstalledSkillManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid installed skill manifest at ${registryPath}: ${result.error.issues.map(i => i.message).join('; ')}`,
    );
  }
  return result.data;
}

function validateToolCandidate(candidate: unknown, index: number): {
  tool: Tool | null;
  warning: string | null;
} {
  if (!candidate || typeof candidate !== 'object') {
    return {
      tool: null,
      warning: `tool[${index}] is not an object`,
    };
  }

  const item = candidate as Partial<Tool>;
  if (!item.name || typeof item.name !== 'string') {
    return {
      tool: null,
      warning: `tool[${index}] missing string name`,
    };
  }
  if (!item.description || typeof item.description !== 'string') {
    return {
      tool: null,
      warning: `${item.name}: missing string description`,
    };
  }
  if (!item.parameters || typeof (item.parameters as z.ZodTypeAny).parse !== 'function') {
    return {
      tool: null,
      warning: `${item.name}: parameters must be a zod schema`,
    };
  }
  if (typeof item.execute !== 'function') {
    return {
      tool: null,
      warning: `${item.name}: execute must be a function`,
    };
  }

  return {
    tool: item as Tool,
    warning: null,
  };
}

/**
 * Install a skill from local file system.
 * Supported input:
 * - /path/to/skill-directory
 * - /path/to/skill.json
 */
export async function installSkillFromPath(
  skillPath: string,
  baseDir: string = CHUBAO_SKILLS_DIR,
): Promise<InstalledSkillManifest> {
  const dirs = ensureSkillDirectories(baseDir);
  const { sourceDir, manifestPath } = await resolveSkillManifestPath(skillPath);

  const manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const manifest = SkillManifestSchema.parse(manifestRaw);

  const installedSkillDir = path.join(dirs.installedDir, manifest.id);
  await fs.rm(installedSkillDir, { recursive: true, force: true });
  await copyDirectoryRecursive(sourceDir, installedSkillDir);

  const installedManifest: InstalledSkillManifest = {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    enabled: manifest.enabled,
    tags: manifest.tags,
    source: 'local',
    module: manifest.entry,
    toolsExport: manifest.toolsExport,
    installedAt: new Date().toISOString(),
    directory: installedSkillDir,
    manifestPath: path.join(installedSkillDir, 'skill.json'),
    toolCount: 0,
  };

  const registryPath = getRegistryFilePath(dirs.registryDir, manifest.id);
  await fs.writeFile(registryPath, JSON.stringify(installedManifest, null, 2), 'utf8');

  return installedManifest;
}

export async function loadSkillToolsFromRegistry(
  baseDir: string = CHUBAO_SKILLS_DIR,
): Promise<SkillRegistryResult> {
  const dirs = ensureSkillDirectories(baseDir);
  const manifests: InstalledSkillManifest[] = [];
  const entries: SkillToolEntry[] = [];
  const warnings: string[] = [];

  const files = await fs.readdir(dirs.registryDir, { withFileTypes: true });
  const registryFiles = files
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(dirs.registryDir, entry.name));

  for (const registryPath of registryFiles) {
    try {
      const raw = JSON.parse(await fs.readFile(registryPath, 'utf8'));
      manifests.push(parseInstalledManifest(raw, registryPath));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const manifest of manifests) {
    const entryWarnings: string[] = [];
    const skillEntry: SkillToolEntry = {
      manifest,
      tools: [],
      warnings: entryWarnings,
    };

    if (!manifest.enabled) {
      entries.push(skillEntry);
      continue;
    }

    const modulePath = path.resolve(manifest.directory, manifest.module);
    if (!fsSync.existsSync(modulePath)) {
      entryWarnings.push(`module file missing: ${modulePath}`);
      entries.push(skillEntry);
      continue;
    }

    try {
      const moduleUrl = pathToFileURL(modulePath).href;
      const moduleStat = await fs.stat(modulePath);
      const imported = await import(`${moduleUrl}?v=${moduleStat.mtimeMs}`);

      const exported = imported[manifest.toolsExport]
        ?? imported.skillTools
        ?? imported.tools
        ?? imported.default;

      if (!Array.isArray(exported)) {
        entryWarnings.push(`export "${manifest.toolsExport}" is not an array`);
        entries.push(skillEntry);
        continue;
      }

      const loadedTools: Tool[] = [];
      for (let i = 0; i < exported.length; i++) {
        const { tool, warning } = validateToolCandidate(exported[i], i);
        if (warning) {
          entryWarnings.push(warning);
          continue;
        }
        if (tool) {
          loadedTools.push(tool);
        }
      }

      manifest.toolCount = loadedTools.length;
      skillEntry.tools = loadedTools;
      await fs.writeFile(
        getRegistryFilePath(dirs.registryDir, manifest.id),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
    } catch (error) {
      entryWarnings.push(error instanceof Error ? error.message : String(error));
    }

    entries.push(skillEntry);
  }

  return {
    manifests,
    entries,
    warnings,
  };
}
