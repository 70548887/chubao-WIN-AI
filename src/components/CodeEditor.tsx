/**
 * Code Editor Component - 代码编辑器组件
 *
 * 基于 Monaco Editor 的代码编辑功能
 */

import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTheme } from '../contexts/ThemeContext';

// 文件扩展名到语言的映射
const EXT_TO_LANGUAGE: Record<string, string> = {
  // TypeScript/JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  // 配置
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  // 文档
  '.md': 'markdown',
  '.mdx': 'markdown',
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  // Rust
  '.rs': 'rust',
  // Go
  '.go': 'go',
  // Java
  '.java': 'java',
  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  // 其他
  '.sql': 'sql',
  '.xml': 'xml',
  '.dockerfile': 'dockerfile',
  '.gitignore': 'ignore',
};

interface CodeEditorProps {
  /** 文件路径 */
  filePath: string;
  /** 文件内容 */
  value: string;
  /** 内容变化回调 */
  onChange?: (value: string) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 根据文件路径获取语言
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  
  // 特殊文件名处理
  const basename = filePath.split('/').pop()?.toLowerCase() || '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === '.gitignore') return 'ignore';
  if (basename === 'makefile') return 'makefile';
  
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  filePath,
  value,
  onChange,
  readOnly = false,
  className = '',
}) => {
  const { effectiveTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const language = getLanguageFromPath(filePath);
  const isDark = effectiveTheme === 'dark';

  /**
   * 编辑器挂载回调
   */
  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // 添加快捷键
    editor.addCommand(
      // Ctrl+S / Cmd+S
      (window as any).monaco.KeyMod.CtrlCmd | (window as any).monaco.KeyCode.KeyS,
      () => {
        // 触发保存事件
        const event = new CustomEvent('editor:save', { detail: { filePath } });
        window.dispatchEvent(event);
      }
    );

    // 添加格式化快捷键
    editor.addCommand(
      // Shift+Alt+F
      (window as any).monaco.KeyMod.Shift | (window as any).monaco.KeyMod.Alt | (window as any).monaco.KeyCode.KeyF,
      () => {
        editor.getAction('editor.action.formatDocument')?.run();
      }
    );
  }, [filePath]);

  /**
   * 编辑器配置
   */
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    readOnly,
    minimap: { enabled: true },
    fontSize: 14,
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    fontLigatures: true,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    folding: true,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    formatOnPaste: true,
    formatOnType: true,
  };

  return (
    <div className={`h-full w-full ${className}`}>
      <Editor
        height="100%"
        language={language}
        value={value}
        theme={isDark ? 'vs-dark' : 'light'}
        options={editorOptions}
        onChange={(value) => onChange?.(value || '')}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>加载编辑器...</span>
            </div>
          </div>
        }
      />
    </div>
  );
};

export default CodeEditor;
