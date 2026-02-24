/**
 * Voice Service - 语音服务
 *
 * 提供语音识别和语音合成功能
 */

const API_BASE_URL = 'http://localhost:3100';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

export interface TTSResult {
  audioUrl: string;
  duration?: number;
}

/**
 * 语音识别 - 将音频转为文字
 *
 * @param audioBlob 音频数据
 * @returns 识别结果
 */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.text,
    confidence: data.confidence,
    language: data.language,
  };
}

/**
 * 语音合成 - 将文字转为音频
 *
 * @param text 要合成的文字
 * @param options 合成选项
 * @returns 音频 URL
 */
export async function synthesizeSpeech(
  text: string,
  options: {
    voice?: string;
    speed?: number;
  } = {}
): Promise<TTSResult> {
  const response = await fetch(`${API_BASE_URL}/api/voice/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice: options.voice || 'zh-CN-XiaoxiaoNeural',
      speed: options.speed || 1.0,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    audioUrl: `${API_BASE_URL}${data.audioUrl}`,
    duration: data.duration,
  };
}

/**
 * 获取支持的语音列表
 */
export async function getVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
  const response = await fetch(`${API_BASE_URL}/api/voice/voices`);

  if (!response.ok) {
    throw new Error(`Failed to fetch voices: ${response.status}`);
  }

  const data = await response.json();
  return data.voices;
}

/**
 * 播放音频
 *
 * @param audioUrl 音频 URL 或 Blob
 * @returns 音频元素和控制函数
 */
export function playAudio(audioUrl: string | Blob): {
  audio: HTMLAudioElement;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
} {
  const url = typeof audioUrl === 'string' ? audioUrl : URL.createObjectURL(audioUrl);
  const audio = new Audio(url);

  return {
    audio,
    play: async () => {
      try {
        await audio.play();
      } catch (error) {
        console.error('Failed to play audio:', error);
        throw error;
      }
    },
    pause: () => {
      audio.pause();
    },
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      if (typeof audioUrl !== 'string') {
        URL.revokeObjectURL(url);
      }
    },
  };
}

export default {
  transcribeAudio,
  synthesizeSpeech,
  getVoices,
  playAudio,
};
