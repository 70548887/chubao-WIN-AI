/**
 * Upgrade API - 自升级接口
 *
 * 提供下载更新包、执行升级功能
 */

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fetch from 'node-fetch';

const router = Router();

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 升级相关路径
const UPGRADE_DIR = path.join(process.cwd(), 'upgrade');
const BACKUP_DIR = path.join(process.cwd(), 'backup');

// 确保目录存在
[UPGRADE_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * POST /api/upgrade - 执行升级
 */
router.post('/', async (req, res) => {
  try {
    const { downloadUrl } = req.body;

    if (!downloadUrl) {
      return res.status(400).json({
        success: false,
        error: 'Download URL is required',
      });
    }

    logger.info('Starting upgrade process', { downloadUrl });

    // 1. 下载更新包
    const filename = `update-${Date.now()}.zip`;
    const downloadPath = path.join(UPGRADE_DIR, filename);

    logger.info('Downloading update package...');
    const downloadResponse = await fetch(downloadUrl);
    
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download: ${downloadResponse.status}`);
    }

    const buffer = await downloadResponse.buffer();
    fs.writeFileSync(downloadPath, buffer);
    logger.info('Download completed', { size: buffer.length });

    // 2. 创建备份
    const backupName = `backup-${Date.now()}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    logger.info('Creating backup...', { backupPath });

    // 备份关键目录
    const dirsToBackup = ['dist', 'sidecars', 'skills'];
    for (const dir of dirsToBackup) {
      const sourcePath = path.join(process.cwd(), dir);
      const targetPath = path.join(backupPath, dir);
      if (fs.existsSync(sourcePath)) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      }
    }
    logger.info('Backup created');

    // 3. 启动升级脚本（异步执行，不等待）
    logger.info('Starting upgrade script...');
    
    const scriptPath = path.join(process.cwd(), 'scripts', 'upgrade.ps1');
    
    // 如果脚本不存在，创建一个简单的升级脚本
    if (!fs.existsSync(scriptPath)) {
      createUpgradeScript(scriptPath);
    }

    // 异步执行升级脚本
    const upgradeProcess = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-DownloadPath', downloadPath,
      '-BackupPath', backupPath,
    ], {
      detached: true,
      stdio: 'ignore',
    });

    upgradeProcess.unref();

    res.json({
      success: true,
      message: '升级已启动，应用将在几秒后重启',
      backupPath,
    });

  } catch (error) {
    logger.error('Upgrade failed', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Upgrade failed',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/upgrade/status - 获取升级状态
 */
router.get('/status', (_req, res) => {
  const statusFile = path.join(UPGRADE_DIR, 'status.json');
  
  if (fs.existsSync(statusFile)) {
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    res.json({ success: true, status });
  } else {
    res.json({
      success: true,
      status: { state: 'idle', message: 'No upgrade in progress' },
    });
  }
});

/**
 * POST /api/upgrade/rollback - 回滚到备份版本
 */
router.post('/rollback', (req, res) => {
  try {
    const { backupName } = req.body;
    
    if (!backupName) {
      // 使用最新的备份
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(name => name.startsWith('backup-'))
        .sort()
        .reverse();
      
      if (backups.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No backup found',
        });
      }
      
      const latestBackup = backups[0];
      const backupPath = path.join(BACKUP_DIR, latestBackup);
      
      // 恢复备份
      const dirsToRestore = ['dist', 'sidecars', 'skills'];
      for (const dir of dirsToRestore) {
        const sourcePath = path.join(backupPath, dir);
        const targetPath = path.join(process.cwd(), dir);
        if (fs.existsSync(sourcePath)) {
          if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true });
          }
          fs.cpSync(sourcePath, targetPath, { recursive: true });
        }
      }

      logger.info('Rollback completed', { backup: latestBackup });
      
      res.json({
        success: true,
        message: '回滚完成，请重启应用',
        backup: latestBackup,
      });
    }
  } catch (error) {
    logger.error('Rollback failed', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Rollback failed',
      message: (error as Error).message,
    });
  }
});

/**
 * 创建升级脚本
 */
function createUpgradeScript(scriptPath: string): void {
  const scriptContent = `
# 触宝AI 升级脚本
param(
    [Parameter(Mandatory=$true)]
    [string]$DownloadPath,
    
    [Parameter(Mandatory=$true)]
    [string]$BackupPath
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 开始升级触宝AI..."
Write-Host "📦 更新包: $DownloadPath"
Write-Host "💾 备份路径: $BackupPath"

# 1. 停止服务
Write-Host "🛑 停止服务..."
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
$pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue

foreach ($proc in $nodeProcesses) {
    Stop-Process -Id $proc.Id -Force
}
foreach ($proc in $pythonProcesses) {
    Stop-Process -Id $proc.Id -Force
}

Start-Sleep -Seconds 2

# 2. 解压更新包
Write-Host "📂 解压更新包..."
$extractPath = Join-Path $env:TEMP "chubao-upgrade-$(Get-Random)"
Expand-Archive -Path $DownloadPath -DestinationPath $extractPath -Force

# 3. 复制新文件
Write-Host "📝 更新文件..."
$sourceDirs = @("dist", "sidecars", "skills", "scripts")
foreach ($dir in $sourceDirs) {
    $source = Join-Path $extractPath $dir
    $target = Join-Path $PSScriptRoot ".." $dir
    
    if (Test-Path $source) {
        if (Test-Path $target) {
            Remove-Item -Path $target -Recurse -Force
        }
        Copy-Item -Path $source -Destination $target -Recurse -Force
        Write-Host "  ✓ $dir"
    }
}

# 4. 清理临时文件
Write-Host "🧹 清理临时文件..."
Remove-Item -Path $extractPath -Recurse -Force
Remove-Item -Path $DownloadPath -Force

# 5. 重启应用
Write-Host "🔄 重启应用..."
$appPath = Join-Path $PSScriptRoot ".."
Start-Process -FilePath "powershell.exe" -ArgumentList "-Command", "cd '$appPath'; .\\scripts\\start.ps1" -WindowStyle Hidden

Write-Host "✅ 升级完成！"
`;

  fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
  logger.info('Created upgrade script', { path: scriptPath });
}

export default router;
