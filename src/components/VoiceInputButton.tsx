import { useVoiceInput, useVoiceSynthesis } from '../hooks/useVoiceInput';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const {
    status,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    clearTranscript,
  } = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    interimResults: true,
    onResult: (text) => {
      onTranscript(text);
    },
  });

  // 语音合成功能（预留）
  useVoiceSynthesis();

  if (!isSupported) {
    return (
      <button className="voice-btn unsupported" title="浏览器不支持语音识别" disabled>
        🎤
      </button>
    );
  }

  const isListening = status === 'listening';

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      clearTranscript();
      startListening();
    }
  };

  return (
    <div className="voice-input-container">
      <button
        className={`voice-btn ${isListening ? 'listening' : ''} ${error ? 'error' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        title={isListening ? '点击停止录音' : '点击开始语音输入'}
      >
        {isListening ? '🔴' : '🎤'}
      </button>

      {isListening && (
        <div className="voice-overlay">
          <div className="voice-waves">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p className="voice-hint">
            {interimTranscript || '正在聆听...'}
          </p>
          <button className="voice-stop-btn" onClick={stopListening}>
            停止录音
          </button>
        </div>
      )}

      {error && (
        <div className="voice-error" onClick={() => clearTranscript()}>
          {error}
        </div>
      )}
    </div>
  );
}

// 朗读按钮组件
interface SpeakButtonProps {
  text: string;
  lang?: string;
}

export function SpeakButton({ text, lang = 'zh-CN' }: SpeakButtonProps) {
  const { isSpeaking, isSupported, speak, stop } = useVoiceSynthesis();

  if (!isSupported) return null;

  const handleClick = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(text, lang);
    }
  };

  return (
    <button
      className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
      onClick={handleClick}
      title={isSpeaking ? '停止朗读' : '朗读文本'}
    >
      {isSpeaking ? '🔊' : '🔈'}
    </button>
  );
}
