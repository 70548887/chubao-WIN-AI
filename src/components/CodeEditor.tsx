import { useState, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export type EditorLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'kotlin'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'sql'
  | 'powershell'
  | 'shell'
  | 'plaintext';

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  height?: string;
  readOnly?: boolean;
  theme?: 'vs' | 'vs-dark' | 'hc-black';
  onSave?: (value: string) => void;
  onRun?: (value: string) => void;
}

const LANGUAGE_OPTIONS: { value: EditorLanguage; label: string }[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'shell', label: 'Shell' },
  { value: 'plaintext', label: 'Plain Text' },
];

export function CodeEditor({
  value = '',
  onChange,
  language = 'typescript',
  height = '400px',
  readOnly = false,
  theme = 'vs-dark',
  onSave,
  onRun,
}: CodeEditorProps) {
  const [currentLanguage, setCurrentLanguage] = useState<EditorLanguage>(language);
  const [currentValue, setCurrentValue] = useState(value);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // 添加快捷键
    editor.addCommand(2048 | 49, () => {
      // Ctrl+S
      onSave?.(editor.getValue());
    });

    editor.addCommand(2048 | 52, () => {
      // Ctrl+R
      onRun?.(editor.getValue());
    });
  }, [onSave, onRun]);

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      const val = newValue || '';
      setCurrentValue(val);
      onChange?.(val);
    },
    [onChange]
  );

  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentLanguage(e.target.value as EditorLanguage);
  }, []);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(currentValue);
  }, [currentValue]);

  const handleClear = useCallback(() => {
    setCurrentValue('');
    onChange?.('');
  }, [onChange]);

  return (
    <div className="code-editor">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <select
            value={currentLanguage}
            onChange={handleLanguageChange}
            className="language-select"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="char-count">{currentValue.length} 字符</span>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn" onClick={handleFormat} title="格式化 (Ctrl+Shift+F)">
            ✨ 格式化
          </button>
          <button className="toolbar-btn" onClick={handleCopy} title="复制">
            📋 复制
          </button>
          <button className="toolbar-btn" onClick={handleClear} title="清空">
            🗑️ 清空
          </button>
          {onSave && (
            <button className="toolbar-btn primary" onClick={() => onSave(currentValue)} title="保存 (Ctrl+S)">
              💾 保存
            </button>
          )}
          {onRun && (
            <button className="toolbar-btn success" onClick={() => onRun(currentValue)} title="运行 (Ctrl+R)">
              ▶️ 运行
            </button>
          )}
        </div>
      </div>
      <Editor
        height={height}
        language={currentLanguage}
        value={currentValue}
        theme={theme}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          folding: true,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  );
}

// 代码对比组件
interface CodeDiffProps {
  original: string;
  modified: string;
  language?: EditorLanguage;
  height?: string;
}

export function CodeDiff({
  original,
  modified,
  language = 'typescript',
  height = '400px',
}: CodeDiffProps) {
  const diffText = `--- 原始\n+++ 修改\n\n${modified}`;
  
  return (
    <div className="code-diff">
      <div className="diff-header">
        <span>代码对比</span>
      </div>
      <Editor
        height={height}
        language={language}
        value={diffText}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
        }}
      />
    </div>
  );
}

// 代码片段组件
interface CodeSnippetProps {
  code: string;
  language?: EditorLanguage;
  title?: string;
  collapsible?: boolean;
}

export function CodeSnippet({
  code,
  language = 'typescript',
  title,
  collapsible = true,
}: CodeSnippetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [code]);

  if (!isExpanded && collapsible) {
    return (
      <div className="code-snippet collapsed">
        <div className="snippet-header" onClick={() => setIsExpanded(true)}>
          <span className="snippet-title">{title || language}</span>
          <span className="expand-hint">点击展开</span>
        </div>
      </div>
    );
  }

  return (
    <div className="code-snippet">
      <div className="snippet-header">
        <span className="snippet-title">{title || language}</span>
        <div className="snippet-actions">
          <button className="snippet-btn" onClick={handleCopy}>
            {isCopied ? '✓ 已复制' : '📋 复制'}
          </button>
          {collapsible && (
            <button className="snippet-btn" onClick={() => setIsExpanded(false)}>
              收起
            </button>
          )}
        </div>
      </div>
      <Editor
        height="200px"
        language={language}
        value={code}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
