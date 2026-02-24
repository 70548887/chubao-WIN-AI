import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(__dirname, 'skills');

console.log('检查技能元数据...\n');

const skills = fs.readdirSync(skillsDir).filter(name => {
  const stat = fs.statSync(path.join(skillsDir, name));
  return stat.isDirectory() && !['installed', 'registry'].includes(name);
});

let allPassed = true;

for (const skillName of skills) {
  const skillPath = path.join(skillsDir, skillName);
  const skillJsonPath = path.join(skillPath, 'skill.json');
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  
  console.log(`📦 ${skillName}`);
  
  // 检查 skill.json
  if (fs.existsSync(skillJsonPath)) {
    try {
      const skillJson = JSON.parse(fs.readFileSync(skillJsonPath, 'utf8'));
      console.log(`  ✅ skill.json: ${skillJson.name} v${skillJson.version}`);
    } catch (err) {
      console.log(`  ❌ skill.json: 解析失败 - ${err.message}`);
      allPassed = false;
    }
  } else {
    console.log(`  ⚠️  skill.json: 不存在`);
  }
  
  // 检查 SKILL.md metadata
  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const metadataMatch = frontmatter.match(/metadata:\s*\n\s*(\{[\s\S]*?\})/);
      
      if (metadataMatch) {
        try {
          const metadata = JSON.parse(metadataMatch[1]);
          console.log(`  ✅ SKILL.md metadata: 已解析`);
        } catch (err) {
          console.log(`  ❌ SKILL.md metadata: 解析失败 - ${err.message}`);
          allPassed = false;
        }
      } else {
        console.log(`  ℹ️  SKILL.md: 无 metadata`);
      }
    }
  }
  
  console.log('');
}

console.log(allPassed ? '✅ 所有技能元数据检查通过！' : '❌ 部分技能存在问题');
process.exit(allPassed ? 0 : 1);
