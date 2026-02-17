import { useState, useCallback, useRef, useEffect } from 'react';

// Web Speech API 类型声明
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceInputState {
  status: VoiceStatus;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
}

export interface VoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxDuration?: number;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

// 检查浏览器是否支持语音识别
function checkSpeechRecognitionSupport(): boolean {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

// 获取 SpeechRecognition 构造函数
function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceInput(options: VoiceInputOptions = {}) {
  const {
    lang = 'zh-CN',
    continuous = false,
    interimResults = true,
    maxDuration = 60000,
    onResult,
    onError,
  } = options;

  const [state, setState] = useState<VoiceInputState>({
    status: 'idle',
    transcript: '',
    interimTranscript: '',
    error: null,
    isSupported: checkSpeechRecognitionSupport(),
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化语音识别
  useEffect(() => {
    if (!state.isSupported) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setState((prev) => ({ ...prev, status: 'listening', error: null }));

      // 设置最大录音时长
      if (maxDuration > 0) {
        timeoutRef.current = setTimeout(() => {
          stopListening();
        }, maxDuration);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setState((prev) => ({
        ...prev,
        transcript: prev.transcript + finalTranscript,
        interimTranscript,
      }));

      if (finalTranscript) {
        onResult?.(finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = getErrorMessage(event.error);
      setState((prev) => ({ ...prev, status: 'error', error: errorMessage }));
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      setState((prev) => ({
        ...prev,
        status: 'idle',
        interimTranscript: '',
      }));

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [lang, continuous, interimResults, maxDuration, onResult, onError, state.isSupported]);

  // 开始录音
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((prev) => ({ ...prev, error: '语音识别不支持' }));
      return;
    }

    // 重置状态
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));

    try {
      recognitionRef.current.start();
    } catch (error) {
      setState((prev) => ({ ...prev, error: '启动语音识别失败' }));
    }
  }, []);

  // 停止录音
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // 切换录音状态
  const toggleListening = useCallback(() => {
    if (state.status === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  }, [state.status, startListening, stopListening]);

  // 清除文本
  const clearTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
    }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
  };
}

// 获取错误信息
function getErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    'no-speech': '未检测到语音，请重试',
    'audio-capture': '无法访问麦克风',
    'not-allowed': '麦克风权限被拒绝',
    'network': '网络错误，请检查连接',
    'aborted': '语音识别已取消',
    'language-not-supported': '不支持该语言',
  };
  return errorMessages[error] || `语音识别错误: ${error}`;
}

// 语音合成 Hook
export function useVoiceSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
  }, []);

  const speak = useCallback((text: string, lang = 'zh-CN', rate = 1) => {
    if (!isSupported || !text) return;

    // 取消之前的朗读
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  return {
    isSpeaking,
    isSupported,
    speak,
    stop,
  };
}
