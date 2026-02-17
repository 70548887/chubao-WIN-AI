import { useState, useCallback, useEffect, useRef } from 'react';

export interface DragDropState {
  isDragging: boolean;
  isOver: boolean;
  files: File[];
}

export interface DragDropOptions {
  accept?: string[]; // 接受的文件类型，如 ['image/*', '.pdf']
  multiple?: boolean;
  maxSize?: number; // 最大文件大小（字节）
  onDrop?: (files: File[]) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onError?: (error: string) => void;
}

export function useDragDrop(options: DragDropOptions = {}) {
  const {
    accept,
    multiple = true,
    maxSize,
    onDrop,
    onDragEnter,
    onDragLeave,
    onError,
  } = options;

  const [state, setState] = useState<DragDropState>({
    isDragging: false,
    isOver: false,
    files: [],
  });

  const dragCounter = useRef(0);

  // 验证文件类型
  const validateFile = useCallback((file: File): boolean => {
    // 检查文件类型
    if (accept && accept.length > 0) {
      const isAccepted = accept.some((type) => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('/*', ''));
        }
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        return file.type === type;
      });

      if (!isAccepted) {
        onError?.(`不支持的文件类型: ${file.name}`);
        return false;
      }
    }

    // 检查文件大小
    if (maxSize && file.size > maxSize) {
      onError?.(`文件过大: ${file.name} (最大 ${formatFileSize(maxSize)})`);
      return false;
    }

    return true;
  }, [accept, maxSize, onError]);

  // 处理拖拽进入
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current++;

    if (e.dataTransfer?.types.includes('Files')) {
      setState((prev) => ({ ...prev, isOver: true }));
      onDragEnter?.();
    }
  }, [onDragEnter]);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current--;

    if (dragCounter.current === 0) {
      setState((prev) => ({ ...prev, isOver: false }));
      onDragLeave?.();
    }
  }, [onDragLeave]);

  // 处理拖拽悬停
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // 处理放置
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current = 0;
    setState((prev) => ({ ...prev, isOver: false }));

    const droppedFiles = Array.from(e.dataTransfer?.files || []);

    if (droppedFiles.length === 0) return;

    // 如果不是多选，只取第一个文件
    const filesToProcess = multiple ? droppedFiles : [droppedFiles[0]];

    // 验证文件
    const validFiles = filesToProcess.filter(validateFile);

    if (validFiles.length > 0) {
      setState((prev) => ({ ...prev, files: validFiles }));
      onDrop?.(validFiles);
    }
  }, [multiple, validateFile, onDrop]);

  // 清除文件
  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, files: [] }));
  }, []);

  // 设置拖拽状态
  const setDragging = useCallback((isDragging: boolean) => {
    setState((prev) => ({ ...prev, isDragging }));
  }, []);

  return {
    ...state,
    clearFiles,
    setDragging,
    handlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 读取文件为 Data URL
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 读取文件为文本
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// 检查文件是否为图片
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

// 检查文件是否为代码文件
export function isCodeFile(file: File): boolean {
  const codeExtensions = [
    '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.scss', '.less',
    '.py', '.java', '.cpp', '.c', '.h', '.hpp', '.go', '.rs', '.php', '.rb',
    '.swift', '.kt', '.scala', '.r', '.m', '.sql', '.sh', '.bat', '.ps1',
    '.md', '.txt', '.yaml', '.yml', '.xml', '.toml', '.ini', '.conf',
  ];
  return codeExtensions.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );
}
