import { useEffect, useCallback, useState } from 'react';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: string;
  description: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { key: 'Enter', ctrl: true, action: 'send', description: '发送消息' },
  { key: 'n', ctrl: true, shift: true, action: 'new-chat', description: '新建对话' },
  { key: 'f', ctrl: true, action: 'focus-input', description: '聚焦输入框' },
  { key: 's', ctrl: true, shift: true, action: 'screenshot', description: '截图' },
  { key: 't', ctrl: true, shift: true, action: 'toggle-theme', description: '切换主题' },
  { key: '1', ctrl: true, action: 'switch-tab-chat', description: '切换到聊天' },
  { key: '2', ctrl: true, action: 'switch-tab-dashboard', description: '切换到控制台' },
  { key: '3', ctrl: true, action: 'switch-tab-automation', description: '切换到自动化' },
  { key: '4', ctrl: true, action: 'switch-tab-skills', description: '切换到技能' },
  { key: '5', ctrl: true, action: 'switch-tab-settings', description: '切换到设置' },
];

const STORAGE_KEY = 'chubao-shortcuts';

export function useShortcuts(
  onAction: (action: string) => void,
  enabled: boolean = true
) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_SHORTCUTS;
      }
    }
    return DEFAULT_SHORTCUTS;
  });

  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // 保存快捷键配置
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  }, [shortcuts]);

  // 检查快捷键是否匹配
  const matchShortcut = useCallback((
    event: KeyboardEvent,
    shortcut: ShortcutConfig
  ): boolean => {
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
    if (!!shortcut.ctrl !== event.ctrlKey) return false;
    if (!!shortcut.shift !== event.shiftKey) return false;
    if (!!shortcut.alt !== event.altKey) return false;
    if (!!shortcut.meta !== event.metaKey) return false;
    return true;
  }, []);

  // 处理键盘事件
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果在输入框中，只处理特定快捷键
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;

      setPressedKeys(prev => new Set(prev).add(event.key));

      for (const shortcut of shortcuts) {
        if (matchShortcut(event, shortcut)) {
          // 在输入框中，只允许特定快捷键
          if (isInput && !['send', 'focus-input'].includes(shortcut.action)) {
            continue;
          }

          event.preventDefault();
          onAction(shortcut.action);
          break;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setPressedKeys(prev => {
        const next = new Set(prev);
        next.delete(event.key);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, shortcuts, matchShortcut, onAction]);

  // 更新快捷键
  const updateShortcut = useCallback((action: string, newConfig: Partial<ShortcutConfig>) => {
    setShortcuts(prev => prev.map(s => 
      s.action === action ? { ...s, ...newConfig } : s
    ));
  }, []);

  // 重置为默认
  const resetToDefault = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
  }, []);

  // 获取快捷键显示文本
  const getShortcutDisplay = useCallback((shortcut: ShortcutConfig): string => {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.meta) parts.push('Meta');
    parts.push(shortcut.key.toUpperCase());
    return parts.join('+');
  }, []);

  return {
    shortcuts,
    pressedKeys,
    updateShortcut,
    resetToDefault,
    getShortcutDisplay,
  };
}

// 全局快捷键注册（通过 Tauri）
export async function registerGlobalShortcut(
  shortcut: string,
  callback: () => void
): Promise<boolean> {
  try {
    // 检查是否在 Tauri 环境中
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { register } = await import('@tauri-apps/plugin-global-shortcut');
      await register(shortcut, callback);
      return true;
    }
  } catch (error) {
    console.error('Failed to register global shortcut:', error);
  }
  return false;
}

export async function unregisterGlobalShortcut(shortcut: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { unregister } = await import('@tauri-apps/plugin-global-shortcut');
      await unregister(shortcut);
    }
  } catch (error) {
    console.error('Failed to unregister global shortcut:', error);
  }
}
