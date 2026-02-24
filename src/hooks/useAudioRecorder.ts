/**
 * Audio Recorder Hook - 音频录制 Hook
 *
 * 提供语音录制功能，包括开始/停止、时长计算、音量检测
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error';

interface UseAudioRecorderOptions {
  /** 最大录制时长（秒），默认 60 */
  maxDuration?: number;
  /** 采样率，默认 16000 */
  sampleRate?: number;
  /** 录制格式，默认 'audio/webm' */
  mimeType?: string;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

interface UseAudioRecorderReturn {
  /** 当前录制状态 */
  state: RecordingState;
  /** 录制时长（秒） */
  duration: number;
  /** 当前音量（0-100） */
  volume: number;
  /** 录制的音频 Blob */
  audioBlob: Blob | null;
  /** 错误信息 */
  error: Error | null;
  /** 开始录制 */
  startRecording: () => Promise<void>;
  /** 停止录制 */
  stopRecording: () => void;
  /** 取消录制 */
  cancelRecording: () => void;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 音频录制 Hook
 *
 * @example
 * ```tsx
 * function VoiceInput() {
 *   const { state, duration, volume, startRecording, stopRecording, audioBlob } = useAudioRecorder();
 *
 *   return (
 *     <button
 *       onMouseDown={startRecording}
 *       onMouseUp={stopRecording}
 *       onTouchStart={startRecording}
 *       onTouchEnd={stopRecording}
 *     >
 *       {state === 'recording' ? `录制中 ${duration}s` : '按住说话'}
 *     </button>
 *   );
 * }
 * ```
 */
export const useAudioRecorder = (options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn => {
  const {
    maxDuration = 60,
    sampleRate = 16000,
    mimeType = 'audio/webm;codecs=opus',
    onError,
  } = options;

  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  /**
   * 计算音量
   */
  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // 计算平均音量
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedVolume = Math.min(100, Math.max(0, (average / 255) * 100 * 2));

    setVolume(normalizedVolume);

    if (state === 'recording') {
      animationFrameRef.current = requestAnimationFrame(updateVolume);
    }
  }, [state]);

  /**
   * 开始录制
   */
  const startRecording = useCallback(async () => {
    // 重置状态
    setAudioBlob(null);
    setError(null);
    setDuration(0);
    setVolume(0);
    audioChunksRef.current = [];

    try {
      setState('requesting');

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // 创建音频上下文用于音量检测
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;

      // 收集音频数据
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 录制停止处理
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        setState('idle');
      };

      // 开始录制
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      startTimeRef.current = Date.now();
      setState('recording');

      // 开始音量检测
      updateVolume();

      // 开始计时
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // 检查最大时长
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 100);

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setError(error);
      setState('error');
      onError?.(error);
    }
  }, [maxDuration, sampleRate, mimeType, onError, updateVolume]);

  /**
   * 停止录制
   */
  const stopRecording = useCallback(() => {
    // 停止计时
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 停止音量检测
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setState('processing');
    }

    // 停止所有音轨
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 关闭音频上下文
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  /**
   * 取消录制
   */
  const cancelRecording = useCallback(() => {
    stopRecording();
    setAudioBlob(null);
    setState('idle');
  }, [stopRecording]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    cancelRecording();
    setError(null);
    setDuration(0);
    setVolume(0);
  }, [cancelRecording]);

  /**
   * 清理资源
   */
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    state,
    duration,
    volume,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  };
};

export default useAudioRecorder;
