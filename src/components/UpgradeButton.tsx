/**
 * Upgrade Button Component - 升级按钮组件
 *
 * 显示版本信息和更新状态
 */

import React, { useState } from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { CURRENT_VERSION, formatFileSize, formatDate, triggerUpgrade } from '../services/upgradeService';

export const UpgradeButton: React.FC = () => {
  const { result, isChecking, check, lastCheckedAt } = useVersionCheck({ enabled: true });
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');

  const handleUpgrade = async () => {
    if (!result?.release?.downloadUrl) return;

    setIsUpgrading(true);
    setUpgradeMessage('正在启动升级...');

    const upgradeResult = await triggerUpgrade(result.release.downloadUrl);
    
    setUpgradeMessage(upgradeResult.message);
    setIsUpgrading(false);

    if (upgradeResult.success) {
      // 升级成功，提示用户重启
      alert('升级已启动，应用将在几秒后重启。');
    }
  };

  // 格式化最后检查时间
  const formatLastChecked = () => {
    if (!lastCheckedAt) return '未检查';
    const now = new Date();
    const diff = now.getTime() - lastCheckedAt.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return formatDate(lastCheckedAt.toISOString());
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
      {/* 版本信息 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">当前版本</h3>
          <p className="text-2xl font-bold text-[var(--accent-color)]">v{CURRENT_VERSION}</p>
        </div>
        <button
          onClick={() => check()}
          disabled={isChecking}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] transition-colors disabled:opacity-50"
        >
          {isChecking ? '检查中...' : '检查更新'}
        </button>
      </div>

      {/* 检查时间 */}
      <p className="text-xs text-[var(--text-tertiary)] mb-3">
        最后检查: {formatLastChecked()}
      </p>

      {/* 更新状态 */}
      {result?.error ? (
        <div className="p-3 rounded-lg bg-[var(--error-color)]/10 border border-[var(--error-color)]/20">
          <p className="text-sm text-[var(--error-color)]">
            检查失败: {result.error}
          </p>
        </div>
      ) : result?.hasUpdate ? (
        <div className="space-y-3">
          {/* 发现新版本 */}
          <div className="p-3 rounded-lg bg-[var(--success-color)]/10 border border-[var(--success-color)]/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎉</span>
              <span className="font-medium text-[var(--success-color)]">
                发现新版本: v{result.latestVersion}
              </span>
            </div>
            
            {result.release && (
              <div className="text-sm text-[var(--text-secondary)] space-y-1">
                <p>发布时间: {formatDate(result.release.publishedAt)}</p>
                {result.release.size > 0 && (
                  <p>文件大小: {formatFileSize(result.release.size)}</p>
                )}
              </div>
            )}
          </div>

          {/* 更新日志 */}
          {result.release?.body && (
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">更新内容</h4>
              <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto">
                {result.release.body}
              </div>
            </div>
          )}

          {/* 升级按钮 */}
          <button
            onClick={handleUpgrade}
            disabled={isUpgrading || !result.release?.downloadUrl}
            className="w-full px-4 py-2 rounded-lg bg-[var(--accent-color)] text-white font-medium hover:bg-[var(--accent-color-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpgrading ? upgradeMessage || '升级中...' : '立即升级'}
          </button>

          {!result.release?.downloadUrl && (
            <p className="text-xs text-[var(--warning-color)] text-center">
              未找到可用的下载链接，请手动从 GitHub 下载
            </p>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="text-lg">✅</span>
            <span>已是最新版本</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpgradeButton;
