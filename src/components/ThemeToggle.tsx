/**
 * Theme Toggle Component - 主题切换组件
 * 
 * 提供主题切换按钮和下拉选择
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

// 主题选项配置
const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: '亮色', icon: '☀️' },
  { value: 'dark', label: '暗色', icon: '🌙' },
  { value: 'auto', label: '自动', icon: '🔄' },
];

interface ThemeToggleProps {
  /** 显示样式：button（按钮）或 select（下拉选择） */
  variant?: 'button' | 'select';
  /** 尺寸：sm、md、lg */
  size?: 'sm' | 'md' | 'lg';
  /** 自定义类名 */
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'button',
  size = 'md',
  className = '',
}) => {
  const { theme, effectiveTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 获取当前主题选项
  const currentOption = themeOptions.find(opt => opt.value === theme) || themeOptions[0];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 尺寸样式
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  // 按钮样式
  const buttonClasses = `
    inline-flex items-center gap-2
    rounded-lg border border-[var(--border-color)]
    bg-[var(--bg-secondary)] text-[var(--text-primary)]
    hover:bg-[var(--bg-hover)]
    transition-colors duration-200
    focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
    ${sizeClasses[size]}
    ${className}
  `;

  // 下拉菜单样式
  const dropdownClasses = `
    absolute right-0 mt-2 w-40
    rounded-lg border border-[var(--border-color)]
    bg-[var(--bg-primary)] shadow-lg
    overflow-hidden z-50
  `;

  // 选项样式
  const optionClasses = (isActive: boolean) => `
    w-full flex items-center gap-3 px-4 py-2
    text-left text-sm
    transition-colors duration-150
    ${isActive 
      ? 'bg-[var(--accent-color-light)] text-[var(--accent-color)]' 
      : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
    }
  `;

  const handleSelect = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  // 按钮变体
  if (variant === 'button') {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className={buttonClasses}
          onClick={() => setIsOpen(!isOpen)}
          title={`当前主题: ${currentOption.label}${theme === 'auto' ? ` (${effectiveTheme === 'dark' ? '暗色' : '亮色'})` : ''}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="text-lg">{currentOption.icon}</span>
          <span className="hidden sm:inline">{currentOption.label}</span>
          <svg 
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className={dropdownClasses} role="listbox">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={optionClasses(theme === option.value)}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={theme === option.value}
              >
                <span className="text-lg">{option.icon}</span>
                <span className="flex-1">{option.label}</span>
                {theme === option.value && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 下拉选择变体
  return (
    <div className={`relative ${className}`}>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeMode)}
        className={`
          w-full appearance-none
          rounded-lg border border-[var(--border-color)]
          bg-[var(--bg-primary)] text-[var(--text-primary)]
          ${sizeClasses[size]}
          pr-10
          focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
          cursor-pointer
        `}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.icon} {option.label}
            {option.value === 'auto' && effectiveTheme && ` (${effectiveTheme === 'dark' ? '当前暗色' : '当前亮色'})`}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};

// 简化的主题图标按钮（仅图标，无下拉）
export const ThemeIconButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { effectiveTheme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`
        p-2 rounded-lg
        text-[var(--text-secondary)]
        hover:text-[var(--text-primary)]
        hover:bg-[var(--bg-hover)]
        transition-colors duration-200
        focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
        ${className}
      `}
      title={`切换主题 (当前: ${effectiveTheme === 'dark' ? '暗色' : '亮色'})`}
    >
      {effectiveTheme === 'dark' ? (
        // 月亮图标
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        // 太阳图标
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
