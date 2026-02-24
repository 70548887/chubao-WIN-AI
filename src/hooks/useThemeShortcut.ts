/**
 * Theme Shortcut Hook - 主题切换快捷键
 * 
 * 提供 Ctrl/Cmd + Shift + L 快捷键切换主题
 */

import { useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface UseThemeShortcutOptions {
  /** 是否启用快捷键 */
  enabled?: boolean;
  /** 快捷键组合，默认 'ctrl+shift+l' */
  shortcut?: string;
  /** 切换时的回调 */
  onToggle?: (newTheme: 'light' | 'dark') => void;
}

/**
 * 主题切换快捷键 Hook
 * 
 * 默认快捷键：Ctrl/Cmd + Shift + L
 * 
 * @example
 * ```tsx
 * function App() {
 *   useThemeShortcut();
 *   return <div>...</div>;
 * }
 * ```
 */
export const useThemeShortcut = (options: UseThemeShortcutOptions = {}) => {
  const { enabled = true, onToggle } = options;
  const { effectiveTheme, setEffectiveTheme } = useTheme();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 检查是否按下了 Ctrl/Cmd + Shift + L
    const isModifierPressed = event.ctrlKey || event.metaKey;
    const isShiftPressed = event.shiftKey;
    const isLKey = event.key === 'l' || event.key === 'L';

    if (!isModifierPressed || !isShiftPressed || !isLKey) {
      return;
    }

    // 如果在输入框中，不触发
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // 阻止默认行为
    event.preventDefault();

    // 切换主题
    const newTheme = effectiveTheme === 'light' ? 'dark' : 'light';
    setEffectiveTheme(newTheme);

    // 触发回调
    onToggle?.(newTheme);

    // 显示提示（可选）
    showThemeNotification(newTheme);
  }, [effectiveTheme, setEffectiveTheme, onToggle]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
};

/**
 * 显示主题切换提示
 */
function showThemeNotification(theme: 'light' | 'dark'): void {
  // 创建提示元素
  const notification = document.createElement('div');
  notification.className = `
    fixed bottom-4 right-4
    px-4 py-2 rounded-lg
    bg-[var(--bg-secondary)] text-[var(--text-primary)]
    border border-[var(--border-color)]
    shadow-lg
    z-50
    animate-fade-in-up
  `;
  notification.innerHTML = `
    <span class="flex items-center gap-2">
      <span class="text-lg">${theme === 'dark' ? '🌙' : '☀️'}</span>
      <span>已切换到${theme === 'dark' ? '暗色' : '亮色'}主题</span>
    </span>
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .animate-fade-in-up {
      animation: fade-in-up 0.3s ease-out;
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // 3秒后移除
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(10px)';
    notification.style.transition = 'opacity 0.3s, transform 0.3s';
    
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 300);
  }, 2000);
}

export default useThemeShortcut;
