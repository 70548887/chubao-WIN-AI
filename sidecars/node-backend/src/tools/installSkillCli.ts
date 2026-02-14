import { installSkillFromPath, loadSkillToolsFromRegistry } from './skillRegistry.js';

function printUsage(): void {
  console.log('Usage: npm run skill:install -- <path-to-skill-dir-or-skill.json>');
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

  console.log('Skill installed successfully.');
  console.log(`- id: ${manifest.id}`);
  console.log(`- name: ${manifest.name}`);
  console.log(`- version: ${manifest.version}`);
  console.log(`- enabled: ${manifest.enabled}`);
  console.log(`- module: ${manifest.module}`);
  console.log(`- loaded tools: ${loadedTools.length > 0 ? loadedTools.join(', ') : '(none)'}`);

  if (loaded.warnings.length > 0) {
    console.log('Warnings:');
    loaded.warnings.forEach((warning) => {
      console.log(`- ${warning}`);
    });
  }
}

main().catch((error) => {
  console.error('Skill install failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
