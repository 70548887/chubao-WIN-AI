/**
 * Version Check Hook - 版本检查 Hook
 *
 * 定期检查更新，缓存检查结果
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { checkForUpdates, type VersionCheckResult } from '../services/upgradeService';

interface UseVersionCheckOptions {
  /** 是否启用自动检查 */
  enabled?: boolean;
  /** 检查间隔（毫秒），默认 1 小时 */
  interval?: number;
  /** 初始延迟（毫秒），默认 5 秒 */
  initialDelay?: number;
}

interface UseVersionCheckReturn {
  /** 检查结果 */
  result: VersionCheckResult | null;
  /** 是否正在检查 */
  isChecking: boolean;
  /** 手动检查 */
  check: () => Promise<void>;
  /** 最后检查时间 */
  lastCheckedAt: Date | null;
}

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 小时
const INITIAL_DELAY = 5000; // 5 秒
const STORAGE_KEY = 'chubao-version-check';

/**
 * 从 localStorage 读取缓存的检查结果
 */
function getCachedResult(): { result: VersionCheckResult; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // 忽略错误
  }
  return null;
}

/**
 * 保存检查结果到 localStorage
 */
function setCachedResult(result: VersionCheckResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      result,
      timestamp: Date.now(),
    }));
  } catch {
    // 忽略错误
  }
}

/**
 * 版本检查 Hook
 *
 * @example
 * ```tsx
 * function App() {
 *   const { result, isChecking, check } = useVersionCheck({ enabled: true });
 *
 *   if (result?.hasUpdate) {
 *     return <div>发现新版本: {result.latestVersion}</div>;
 *   }
 * }
 * ```
 */
export const useVersionCheck = (options: UseVersionCheckOptions = {}): UseVersionCheckReturn => {
  const {
    enabled = true,
    interval = CHECK_INTERVAL,
    initialDelay = INITIAL_DELAY,
  } = options;

  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 执行检查
   */
  const check = useCallback(async () => {
    setIsChecking(true);
    try {
      const checkResult = await checkForUpdates();
      setResult(checkResult);
      setLastCheckedAt(new Date());
      setCachedResult(checkResult);
    } finally {
      setIsChecking(false);
    }
  }, []);

  /**
   * 初始化：读取缓存并设置定时检查
   */
  useEffect(() => {
    if (!enabled) return;

    // 读取缓存
    const cached = getCachedResult();
    if (cached && Date.now() - cached.timestamp < interval) {
      setResult(cached.result);
      setLastCheckedAt(new Date(cached.timestamp));
    }

    // 延迟首次检查（避免启动时立即请求）
    const initialTimer = setTimeout(() => {
      check();
    }, initialDelay);

    // 设置定时检查
    intervalRef.current = setInterval(() => {
      check();
    }, interval);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, initialDelay, check]);

  return {
    result,
    isChecking,
    check,
    lastCheckedAt,
  };
};

export default useVersionCheck;
