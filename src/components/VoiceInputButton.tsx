/**
 * Voice Input Button Component - 语音输入按钮
 *
 * 提供按住录音、波形动画、时长显示功能
 */

import React, { useState, useCallback } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface VoiceInputButtonProps {
  /** 录音完成回调 */
  onRecordingComplete: (audioBlob: Blob) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 格式化时长显示
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onRecordingComplete,
  disabled = false,
  className = '',
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const { state, duration, volume, audioBlob, startRecording, stopRecording, cancelRecording } = useAudioRecorder({
    maxDuration: 60,
    onError: (error) => {
      console.error('Recording error:', error);
      alert(`录音失败: ${error.message}`);
    },
  });

  const isRecording = state === 'recording';
  isRecording && audioBlob && onRecordingComplete(audioBlob);

  const handleMouseDown = useCallback(async () => {
    if (disabled) return;
    setIsPressed(true);
    await startRecording();
  }, [disabled, startRecording]);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
    stopRecording();
  }, [stopRecording]);

  const handleMouseLeave = useCallback(() => {
    if (isRecording) {
      setIsPressed(false);
      cancelRecording();
    }
  }, [isRecording, cancelRecording]);

  const handleTouchStart = useCallback(async (e: React.TouchEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsPressed(true);
    await startRecording();
  }, [disabled, startRecording]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsPressed(false);
    stopRecording();
  }, [stopRecording]);

  // 波形条高度计算
  const getWaveHeight = (index: number): number => {
    if (!isRecording) return 20;
    // 根据音量和索引生成波形效果
    const baseHeight = 20 + (volume * 0.8);
    const variation = Math.sin((Date.now() / 200) + index) * 10;
    return Math.max(8, Math.min(80, baseHeight + variation));
  };

  return (
    <div className={`relative ${className}`}>
      {/* 录音状态提示 */}
      {isRecording && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--error-color)] text-white text-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>录音中 {formatDuration(duration)}</span>
          </div>
        </div>
      )}

      {/* 波形动画 */}
      {isRecording && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 flex items-end gap-1 h-12">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-[var(--accent-color)] rounded-full transition-all duration-75"
              style={{
                height: `${getWaveHeight(i)}%`,
                opacity: 0.3 + (i / 20) * 0.7,
              }}
            />
          ))}
        </div>
      )}

      {/* 录音按钮 */}
      <button
        type="button"
        disabled={disabled || state === 'requesting' || state === 'processing'}
        className={`
          relative flex items-center justify-center
          w-10 h-10 rounded-full
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
          ${isRecording
            ? 'bg-[var(--error-color)] text-white scale-110'
            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--accent-color)] hover:bg-[var(--accent-color-light)]'
          }
          ${isPressed ? 'scale-95' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        title={isRecording ? '松开结束录音' : '按住说话'}
      >
        {state === 'processing' ? (
          // 处理中动画
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : isRecording ? (
          // 录音中图标（方形停止）
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          // 麦克风图标
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default VoiceInputButton;
