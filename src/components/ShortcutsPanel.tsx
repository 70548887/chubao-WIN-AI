import { useState, useCallback } from 'react';
import { useShortcuts, type ShortcutConfig } from '../hooks/useShortcuts';

export function ShortcutsPanel() {
  const { shortcuts, updateShortcut, resetToDefault, getShortcutDisplay } = useShortcuts(() => {}, false);
  const [editing, setEditing] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const handleRecord = useCallback((action: string) => {
    setEditing(action);
    setRecording(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      
      // 忽略单独的功能键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      updateShortcut(action, {
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      });

      setRecording(false);
      setEditing(null);
      window.removeEventListener('keydown', handleKeyDown);
    };

    window.addEventListener('keydown', handleKeyDown, { once: true });
  }, [updateShortcut]);

  return (
    <div className="shortcuts-panel">
      <div className="shortcuts-header">
        <h3>快捷键设置</h3>
        <button className="reset-btn" onClick={resetToDefault}>
          重置为默认
        </button>
      </div>

      <div className="shortcuts-list">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.action} className="shortcut-item">
            <span className="shortcut-description">{shortcut.description}</span>
            <button
              className={`shortcut-key ${editing === shortcut.action ? 'recording' : ''}`}
              onClick={() => handleRecord(shortcut.action)}
              disabled={recording && editing !== shortcut.action}
            >
              {editing === shortcut.action && recording
                ? '按快捷键...'
                : getShortcutDisplay(shortcut)}
            </button>
          </div>
        ))}
      </div>

      <div className="shortcuts-tips">
        <h4>提示</h4>
        <ul>
          <li>点击快捷键按钮开始录制</li>
          <li>支持 Ctrl、Shift、Alt 组合键</li>
          <li>在输入框中只响应特定快捷键</li>
        </ul>
      </div>
    </div>
  );
}
