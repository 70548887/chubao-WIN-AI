import { useEffect, useRef, useState } from 'react';
import { processUserMessage } from '../core';
import { useLocale } from '../i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function Chat() {
  const { t } = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const assistantText = await processUserMessage(text);
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: `${t.chat.requestFailed}${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>{t.chat.title}</h2>
        <span className="subtitle">{t.chat.subtitle}</span>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h3>{t.chat.welcomeTitle}</h3>
            <p>{t.chat.welcomeHint}</p>
            <ul>
              {t.chat.welcomeItems.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">{message.content}</div>
            <div className="message-time">{message.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-content typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.chat.placeholder}
          rows={1}
        />
        <button onClick={() => void sendMessage()} disabled={loading || !input.trim()}>
          {t.chat.send}
        </button>
      </div>
    </div>
  );
}

export default Chat;
