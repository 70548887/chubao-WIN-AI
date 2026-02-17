import { useTheme, type Theme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme, isDark } = useTheme();

  const themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'dark', label: '暗色', icon: '🌙' },
    { value: 'light', label: '亮色', icon: '☀️' },
    { value: 'auto', label: '自动', icon: '🖥️' },
  ];

  return (
    <div className="theme-toggle">
      <span className="theme-label">主题</span>
      <div className="theme-options">
        {themes.map((t) => (
          <button
            key={t.value}
            className={`theme-option ${theme === t.value ? 'active' : ''}`}
            onClick={() => setTheme(t.value)}
            title={t.label}
          >
            <span className="theme-icon">{t.icon}</span>
            <span className="theme-text">{t.label}</span>
          </button>
        ))}
      </div>
      <span className="theme-status">
        当前: {isDark ? '🌙 暗色' : '☀️ 亮色'}
        {theme === 'auto' && ' (自动)'}
      </span>
    </div>
  );
}
