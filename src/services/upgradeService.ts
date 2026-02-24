/**
 * Upgrade Service - 自升级服务
 *
 * 提供版本检查、更新下载、升级执行功能
 */

// 当前版本号
export const CURRENT_VERSION = '0.3.0';

// GitHub 仓库信息
const GITHUB_OWNER = 'YaTou91-code';
const GITHUB_REPO = 'chubao-WIN-AI';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  downloadUrl: string;
  size: number;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  release: ReleaseInfo | null;
  error?: string;
}

/**
 * 比较版本号
 * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<VersionCheckResult> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // 如果有 GitHub Token，可以添加（通过 localStorage 配置）
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          hasUpdate: false,
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          release: null,
          error: '未找到 Release',
        };
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const latestVersion = data.tag_name.replace(/^v/, '');
    
    // 查找 Windows 安装包
    const asset = data.assets?.find((a: any) => 
      a.name.includes('windows') || 
      a.name.endsWith('.exe') ||
      a.name.endsWith('.msi') ||
      a.name.endsWith('.zip')
    );

    const release: ReleaseInfo = {
      version: latestVersion,
      tagName: data.tag_name,
      name: data.name,
      body: data.body,
      publishedAt: data.published_at,
      downloadUrl: asset?.browser_download_url || '',
      size: asset?.size || 0,
    };

    const comparison = compareVersions(CURRENT_VERSION, latestVersion);
    const hasUpdate = comparison < 0;

    return {
      hasUpdate,
      currentVersion: CURRENT_VERSION,
      latestVersion,
      release: hasUpdate ? release : null,
    };

  } catch (error) {
    console.error('Failed to check for updates:', error);
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      release: null,
      error: (error as Error).message,
    };
  }
}

/**
 * 获取版本历史
 */
export async function getVersionHistory(limit: number = 10): Promise<ReleaseInfo[]> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/releases?per_page=${limit}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = await response.json();
    
    return releases.map((data: any) => {
      const asset = data.assets?.find((a: any) => 
        a.name.includes('windows') || 
        a.name.endsWith('.exe') ||
        a.name.endsWith('.msi') ||
        a.name.endsWith('.zip')
      );

      return {
        version: data.tag_name.replace(/^v/, ''),
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        publishedAt: data.published_at,
        downloadUrl: asset?.browser_download_url || '',
        size: asset?.size || 0,
      };
    });

  } catch (error) {
    console.error('Failed to get version history:', error);
    return [];
  }
}

/**
 * 触发升级（调用后端 API）
 */
export async function triggerUpgrade(downloadUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('http://localhost:3100/api/upgrade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ downloadUrl }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Upgrade failed');
    }

    return {
      success: true,
      message: data.message || '升级已启动',
    };

  } catch (error) {
    console.error('Failed to trigger upgrade:', error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化日期
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default {
  CURRENT_VERSION,
  compareVersions,
  checkForUpdates,
  getVersionHistory,
  triggerUpgrade,
  formatFileSize,
  formatDate,
};
