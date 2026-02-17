import { installSkillFromPath, loadSkillToolsFromRegistry } from './skillRegistry.js';
import { logger } from '../utils/logger.js';

function printUsage(): void {
  logger.info('Usage: npm run skill:install -- <path-to-skill-dir-or-skill.json>');
}

async function main(): Promise<void> {
  const skillPath = process.argv[2];
  if (!skillPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const manifest = await installSkillFromPath(skillPath);
  const loaded = await loadSkillToolsFromRegistry();
  const loadedEntry = loaded.entries.find((entry) => entry.manifest.id === manifest.id);
  const loadedTools = loadedEntry?.tools.map((tool) => tool.name) ?? [];

  logger.info('Skill installed successfully.');
  logger.info(`- id: ${manifest.id}`);
  logger.info(`- name: ${manifest.name}`);
  logger.info(`- version: ${manifest.version}`);
  logger.info(`- enabled: ${manifest.enabled}`);
  logger.info(`- module: ${manifest.module}`);
  logger.info(`- loaded tools: ${loadedTools.length > 0 ? loadedTools.join(', ') : '(none)'}`);

  if (loaded.warnings.length > 0) {
    logger.warn('Warnings:');
    loaded.warnings.forEach((warning) => {
      logger.warn(`- ${warning}`);
    });
  }
}

main().catch((error) => {
  logger.error('Skill install failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
