#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const scanMode = args.has('--all') ? 'all' : 'staged';

const repoRoot = process.cwd();

const IGNORED_DIR_PREFIXES = [
  'node_modules/',
  'dist/',
  'openclaw-main/',
  '.git/',
  'src-tauri/target/',
];

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml', '.toml',
  '.ps1', '.sh', '.py', '.rs', '.env', '.txt', '.css', '.html', '.xml', '.ini',
]);

const RULES = [
  {
    id: 'openai-key',
    regex: /\bsk-[A-Za-z0-9]{32,}\b/g,
    message: 'Possible API key',
  },
  {
    id: 'github-token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    message: 'Possible GitHub token',
  },
  {
    id: 'google-api-key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    message: 'Possible Google API key',
  },
  {
    id: 'private-key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    message: 'Private key material',
  },
  {
    id: 'bearer-token-inline',
    regex: /(?:api[-_ ]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/gi,
    message: 'Inline token-like assignment',
  },
];

function runGit(argsList) {
  return execFileSync('git', argsList, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function normalizeRelative(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function shouldSkipFile(relativePath) {
  if (!relativePath) {
    return true;
  }

  const normalized = normalizeRelative(relativePath);
  if (IGNORED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  if (normalized.endsWith('.lock') || normalized.endsWith('.png') || normalized.endsWith('.jpg') || normalized.endsWith('.jpeg') || normalized.endsWith('.pdf')) {
    return true;
  }

  const ext = path.extname(normalized).toLowerCase();
  if (!ext && path.basename(normalized).startsWith('.env')) {
    return false;
  }

  return ext && !TEXT_EXTENSIONS.has(ext);
}

function getCandidateFiles() {
  if (scanMode === 'all') {
    const out = runGit(['ls-files']);
    return out ? out.split(/\r?\n/) : [];
  }

  const out = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return out ? out.split(/\r?\n/) : [];
}

function readContent(relativePath) {
  if (scanMode === 'all') {
    const absolute = path.join(repoRoot, relativePath);
    return fs.readFileSync(absolute, 'utf8');
  }

  return execFileSync('git', ['show', `:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isLikelyExampleLine(line) {
  const lower = line.toLowerCase();
  return lower.includes('example') || lower.includes('placeholder') || lower.includes('your_') || lower.includes('sk-ant-xxx');
}

function scanFile(relativePath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || isLikelyExampleLine(line)) {
      continue;
    }

    for (const rule of RULES) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        findings.push({
          file: relativePath,
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          excerpt: line.trim().slice(0, 180),
        });
      }
    }
  }

  return findings;
}

function main() {
  let files = [];
  try {
    files = getCandidateFiles();
  } catch (error) {
    console.error('[secret-scan] failed to list git files:', error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const candidates = files
    .map((file) => normalizeRelative(file))
    .filter((file) => !shouldSkipFile(file));

  if (candidates.length === 0) {
    console.log(`[secret-scan] no ${scanMode} files to scan`);
    process.exit(0);
  }

  const allFindings = [];
  for (const file of candidates) {
    try {
      const content = readContent(file);
      const findings = scanFile(file, content);
      allFindings.push(...findings);
    } catch (error) {
      console.warn(`[secret-scan] skip unreadable file: ${file} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (allFindings.length === 0) {
    console.log(`[secret-scan] no high-confidence secrets found in ${scanMode} files (${candidates.length} scanned)`);
    process.exit(0);
  }

  console.error('[secret-scan] blocked potential secret leak:');
  for (const finding of allFindings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
    console.error(`  ${finding.excerpt}`);
  }

  console.error('[secret-scan] if this is a false positive, replace with placeholder or move secret to environment variables.');
  process.exit(1);
}

main();
