/**
 * File Tree Component - 文件树组件
 *
 * 递归渲染项目文件结构
 */

import React, { useState, useCallback } from 'react';

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

interface FileTreeProps {
  /** 文件树数据 */
  nodes: FileNode[];
  /** 选中的文件路径 */
  selectedPath?: string;
  /** 文件点击回调 */
  onFileClick?: (node: FileNode) => void;
  /** 目录展开/折叠回调 */
  onToggleDirectory?: (path: string, expanded: boolean) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 文件图标
 */
const FileIcon: React.FC<{ name: string; isOpen?: boolean }> = ({ name, isOpen }) => {
  // 目录图标
  if (isOpen !== undefined) {
    return isOpen ? (
      <svg className="w-4 h-4 text-[var(--accent-color)]" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }

  // 根据扩展名返回图标
  const ext = name.split('.').pop()?.toLowerCase();
  
  // 代码文件
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
    return <span className="text-[#3178c6] text-xs">TS</span>;
  }
  if (['py'].includes(ext || '')) {
    return <span className="text-[#3776ab] text-xs">PY</span>;
  }
  if (['json'].includes(ext || '')) {
    return <span className="text-[#f1c40f] text-xs">JSON</span>;
  }
  if (['md', 'mdx'].includes(ext || '')) {
    return <span className="text-[var(--text-secondary)]">📝</span>;
  }
  if (['css', 'scss', 'less'].includes(ext || '')) {
    return <span className="text-[#264de4] text-xs">CSS</span>;
  }
  if (['html', 'htm'].includes(ext || '')) {
    return <span className="text-[#e34c26] text-xs">HTML</span>;
  }
  if (['rs'].includes(ext || '')) {
    return <span className="text-[#dea584] text-xs">RS</span>;
  }
  
  // 默认文件图标
  return (
    <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

/**
 * 树节点组件
 */
interface TreeNodeProps {
  node: FileNode;
  level: number;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onFileClick?: (node: FileNode) => void;
  onToggleDirectory: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  selectedPath,
  expandedPaths,
  onFileClick,
  onToggleDirectory,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';

  const handleClick = useCallback(() => {
    if (isDirectory) {
      onToggleDirectory(node.path);
    } else {
      onFileClick?.(node);
    }
  }, [isDirectory, node, onFileClick, onToggleDirectory]);

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-2 py-1 cursor-pointer select-none
          transition-colors duration-150
          ${isSelected 
            ? 'bg-[var(--accent-color-light)] text-[var(--accent-color)]' 
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* 展开/折叠图标 */}
        {isDirectory && (
          <svg 
            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {!isDirectory && <span className="w-3" />}

        {/* 文件/目录图标 */}
        <FileIcon name={node.name} isOpen={isDirectory ? isExpanded : undefined} />

        {/* 名称 */}
        <span className="text-sm truncate">{node.name}</span>
      </div>

      {/* 子节点 */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onFileClick={onFileClick}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 文件树组件
 */
export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  selectedPath,
  onFileClick,
  className = '',
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const handleToggleDirectory = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <div className={`overflow-auto ${className}`}>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onFileClick={onFileClick}
          onToggleDirectory={handleToggleDirectory}
        />
      ))}
    </div>
  );
};

export default FileTree;
