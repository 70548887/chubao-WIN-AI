/**
 * Theme Context - 主题状态管理
 * 
 * 提供主题切换、自动模式、持久化存储功能
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type EffectiveTheme = 'light' | 'dark';

interface ThemeContextType {
  /** 当前设置的主题模式 */
  theme: ThemeMode;
  /** 实际生效的主题（auto 模式下根据系统决定） */
  effectiveTheme: EffectiveTheme;
  /** 设置主题模式 */
  setTheme: (theme: ThemeMode) => void;
  /** 切换主题（light -> dark -> auto -> light） */
  toggleTheme: () => void;
  /** 设置具体主题（不经过 auto） */
  setEffectiveTheme: (theme: EffectiveTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'chubao-theme';

/**
 * 获取系统主题偏好
 */
function getSystemTheme(): EffectiveTheme {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * 从 localStorage 读取主题设置
 */
function getStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['light', 'dark', 'auto'].includes(stored)) {
      return stored as ThemeMode;
    }
  } catch {
    // localStorage 不可用（隐私模式等）
  }
  return null;
}

/**
 * 保存主题设置到 localStorage
 */
function setStoredTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 忽略存储错误
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'auto' 
}) => {
  // 初始化主题状态
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return getStoredTheme() || defaultTheme;
  });

  // 计算实际生效的主题
  const [effectiveTheme, setEffectiveThemeState] = useState<EffectiveTheme>(() => {
    const stored = getStoredTheme();
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return getSystemTheme();
  });

  /**
   * 更新主题并持久化
   */
  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);

    // 如果不是 auto，立即更新生效主题
    if (newTheme !== 'auto') {
      setEffectiveThemeState(newTheme);
    } else {
      // auto 模式下根据系统决定
      setEffectiveThemeState(getSystemTheme());
    }
  }, []);

  /**
   * 直接设置生效主题（用于快捷键等）
   */
  const setEffectiveTheme = useCallback((newTheme: EffectiveTheme) => {
    setEffectiveThemeState(newTheme);
    // 同时更新设置为主题模式（不再是 auto）
    setThemeState(newTheme);
    setStoredTheme(newTheme);
  }, []);

  /**
   * 循环切换主题
   */
  const toggleTheme = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'auto'];
    const currentIndex = order.indexOf(theme);
    const nextTheme = order[(currentIndex + 1) % order.length];
    setTheme(nextTheme);
  }, [theme, setTheme]);

  /**
   * 监听系统主题变化（auto 模式下）
   */
  useEffect(() => {
    if (theme !== 'auto') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setEffectiveThemeState(e.matches ? 'dark' : 'light');
    };

    // 现代浏览器
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // 旧版浏览器
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme]);

  /**
   * 应用主题到 document
   */
  useEffect(() => {
    const root = document.documentElement;
    
    // 移除旧主题
    root.removeAttribute('data-theme');
    
    // 应用新主题
    if (effectiveTheme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    }
    // light 主题不需要属性（使用默认样式）

    // 同时设置 color-scheme（影响浏览器 UI 如滚动条）
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  /**
   * 监听存储变化（多标签页同步）
   */
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newTheme = e.newValue as ThemeMode;
        if (newTheme !== theme) {
          setThemeState(newTheme);
          if (newTheme === 'auto') {
            setEffectiveThemeState(getSystemTheme());
          } else {
            setEffectiveThemeState(newTheme);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [theme]);

  const value: ThemeContextType = {
    theme,
    effectiveTheme,
    setTheme,
    toggleTheme,
    setEffectiveTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * 使用主题上下文的 Hook
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
