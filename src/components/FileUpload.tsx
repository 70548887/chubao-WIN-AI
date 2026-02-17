import { useState, useCallback } from 'react';
import {
  useDragDrop,
  formatFileSize,
  readFileAsDataURL,
  readFileAsText,
  isImageFile,
  isCodeFile,
} from '../hooks/useDragDrop';

interface FileUploadProps {
  onUpload?: (files: UploadedFile[]) => void;
  accept?: string[];
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
}

export interface UploadedFile {
  file: File;
  preview?: string;
  content?: string;
  type: 'image' | 'code' | 'other';
}

export function FileUpload({
  onUpload,
  accept,
  multiple = true,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 5,
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrop = useCallback(
    async (files: File[]) => {
      if (uploadedFiles.length + files.length > maxFiles) {
        alert(`最多只能上传 ${maxFiles} 个文件`);
        return;
      }

      setIsProcessing(true);
      const processedFiles: UploadedFile[] = [];

      for (const file of files) {
        const uploadedFile: UploadedFile = {
          file,
          type: isImageFile(file) ? 'image' : isCodeFile(file) ? 'code' : 'other',
        };

        if (uploadedFile.type === 'image' && file.size < 5 * 1024 * 1024) {
          try {
            uploadedFile.preview = await readFileAsDataURL(file);
          } catch {}
        }

        if (uploadedFile.type === 'code' && file.size < 1024 * 1024) {
          try {
            uploadedFile.content = await readFileAsText(file);
          } catch {}
        }

        processedFiles.push(uploadedFile);
      }

      const newFiles = [...uploadedFiles, ...processedFiles];
      setUploadedFiles(newFiles);
      onUpload?.(newFiles);
      setIsProcessing(false);
    },
    [uploadedFiles, maxFiles, onUpload]
  );

  const { isOver, handlers, clearFiles } = useDragDrop({
    accept,
    multiple,
    maxSize,
    onDrop: handleDrop,
    onError: (error) => alert(error),
  });

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = uploadedFiles.filter((_, i) => i !== index);
      setUploadedFiles(newFiles);
      onUpload?.(newFiles);
      if (newFiles.length === 0) clearFiles();
    },
    [uploadedFiles, onUpload, clearFiles]
  );

  const clearAll = useCallback(() => {
    setUploadedFiles([]);
    clearFiles();
    onUpload?.([]);
  }, [clearFiles, onUpload]);

  return (
    <div className="file-upload">
      <div className={`drop-zone ${isOver ? 'drag-over' : ''} ${isProcessing ? 'processing' : ''}`} {...handlers}>
        <div className="drop-zone-content">
          <div className="drop-icon">📁</div>
          <p className="drop-text">
            {isProcessing ? '处理中...' : isOver ? '释放以上传文件' : '拖拽文件到此处，或点击选择文件'}
          </p>
          <p className="drop-hint">支持图片、代码文件等 (最大 {formatFileSize(maxSize)})</p>
          <input
            type="file"
            accept={accept?.join(',')}
            multiple={multiple}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleDrop(files);
            }}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" className="file-input-label">选择文件</label>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <span>已选择 {uploadedFiles.length} 个文件</span>
            <button className="clear-all-btn" onClick={clearAll}>清除全部</button>
          </div>
          {uploadedFiles.map((uploadedFile, index) => (
            <div key={index} className="file-item">
              {uploadedFile.preview ? (
                <img src={uploadedFile.preview} alt={uploadedFile.file.name} className="file-preview" />
              ) : (
                <div className="file-icon">{uploadedFile.type === 'code' ? '📄' : '📎'}</div>
              )}
              <div className="file-info">
                <div className="file-name" title={uploadedFile.file.name}>{uploadedFile.file.name}</div>
                <div className="file-meta">
                  {formatFileSize(uploadedFile.file.size)} · {uploadedFile.type === 'image' ? '图片' : uploadedFile.type === 'code' ? '代码' : '文件'}
                </div>
              </div>
              <button className="file-remove" onClick={() => removeFile(index)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
