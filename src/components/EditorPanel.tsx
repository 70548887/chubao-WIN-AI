/**
 * Editor Panel Component - 编辑器面板
 *
 * 集成文件浏览器和代码编辑器
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FileTree, type FileNode } from './FileTree';
import { CodeEditor } from './CodeEditor';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  isModified: boolean;
  isLoading?: boolean;
}

const API_BASE_URL = 'http://localhost:3100';

export const EditorPanel: React.FC = () => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 加载文件树
  useEffect(() => {
    loadFileTree();
  }, []);

  const loadFileTree = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/files/tree`);
      const data = await response.json();
      if (data.success) {
        setFileTree(data.tree);
      }
    } catch (error) {
      console.error('Failed to load file tree:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 打开文件
  const handleFileClick = useCallback(async (node: FileNode) => {
    if (node.type !== 'file') return;

    // 检查文件是否已经打开
    const existingFile = openFiles.find(f => f.path === node.path);
    if (existingFile) {
      setActiveFile(node.path);
      return;
    }

    // 添加加载中的占位
    const newFile: OpenFile = {
      path: node.path,
      name: node.name,
      content: '',
      isModified: false,
      isLoading: true,
    };
    setOpenFiles(prev => [...prev, newFile]);
    setActiveFile(node.path);

    // 加载文件内容
    try {
      const response = await fetch(`${API_BASE_URL}/api/files/read?path=${encodeURIComponent(node.path)}`);
      const data = await response.json();
      
      if (data.success) {
        setOpenFiles(prev =>
          prev.map(f =>
            f.path === node.path
              ? { ...f, content: data.content, isLoading: false }
              : f
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
      setOpenFiles(prev => prev.filter(f => f.path !== node.path));
      setActiveFile(null);
    }
  }, [openFiles]);

  // 关闭文件
  const handleCloseFile = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setOpenFiles(prev => {
      const newFiles = prev.filter(f => f.path !== path);
      
      // 如果关闭的是当前激活的文件，切换到其他文件
      if (activeFile === path && newFiles.length > 0) {
        setActiveFile(newFiles[newFiles.length - 1].path);
      } else if (newFiles.length === 0) {
        setActiveFile(null);
      }
      
      return newFiles;
    });
  }, [activeFile]);

  // 修改文件内容
  const handleContentChange = useCallback((path: string, content: string) => {
    setOpenFiles(prev =>
      prev.map(f =>
        f.path === path ? { ...f, content, isModified: true } : f
      )
    );
  }, []);

  // 保存文件
  const handleSave = useCallback(async (path: string) => {
    const file = openFiles.find(f => f.path === path);
    if (!file || !file.isModified) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: file.content }),
      });

      const data = await response.json();
      if (data.success) {
        setOpenFiles(prev =>
          prev.map(f =>
            f.path === path ? { ...f, isModified: false } : f
          )
        );
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [openFiles]);

  // 监听保存事件
  useEffect(() => {
    const handleSaveEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.filePath && activeFile) {
        handleSave(activeFile);
      }
    };

    window.addEventListener('editor:save', handleSaveEvent);
    return () => window.removeEventListener('editor:save', handleSaveEvent);
  }, [activeFile, handleSave]);

  const activeFileData = openFiles.find(f => f.path === activeFile);

  return (
    <div className="flex h-full bg-[var(--bg-primary)]">
      {/* 文件浏览器 */}
      <div className="w-64 border-r border-[var(--border-color)] flex flex-col">
        <div className="p-3 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">文件浏览器</h3>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-secondary)]">
              <span>加载中...</span>
            </div>
          ) : (
            <FileTree
              nodes={fileTree}
              selectedPath={activeFile || undefined}
              onFileClick={handleFileClick}
            />
          )}
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 标签栏 */}
        {openFiles.length > 0 && (
          <div className="flex border-b border-[var(--border-color)] overflow-x-auto">
            {openFiles.map(file => (
              <div
                key={file.path}
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm cursor-pointer
                  border-r border-[var(--border-color)]
                  transition-colors duration-150
                  ${activeFile === file.path
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }
                `}
                onClick={() => setActiveFile(file.path)}
              >
                <span className="truncate max-w-[150px]">{file.name}</span>
                {file.isModified && <span className="text-[var(--accent-color)]">●</span>}
                <button
                  className="ml-1 p-0.5 rounded hover:bg-[var(--bg-hover)] opacity-60 hover:opacity-100"
                  onClick={(e) => handleCloseFile(file.path, e)}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 编辑器 */}
        <div className="flex-1 min-h-0">
          {activeFileData ? (
            activeFileData.isLoading ? (
              <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>加载中...</span>
                </div>
              </div>
            ) : (
              <CodeEditor
                filePath={activeFileData.path}
                value={activeFileData.content}
                onChange={(value) => handleContentChange(activeFileData.path, value)}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>选择左侧文件开始编辑</p>
              <p className="text-sm mt-2 opacity-60">支持 TypeScript、Python、JSON 等格式</p>
            </div>
          )}
        </div>

        {/* 状态栏 */}
        {activeFileData && (
          <div className="flex items-center justify-between px-3 py-1 text-xs text-[var(--text-tertiary)] border-t border-[var(--border-color)]">
            <div className="flex items-center gap-4">
              <span>{activeFileData.path}</span>
              {activeFileData.isModified && (
                <span className="text-[var(--accent-color)]">已修改</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span>UTF-8</span>
              <span>{activeFileData.content.split('\n').length} 行</span>
              <span>{activeFileData.content.length} 字符</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorPanel;
