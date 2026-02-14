import { useEffect, useRef, useState } from 'react';
import { processUserMessage } from '../core';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function Chat() {
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
        content: `Request failed: ${
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
        <h2>Chubao AI</h2>
        <span className="subtitle">Windows local AI assistant</span>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h3>Welcome to Chubao AI</h3>
            <p>Try messages like:</p>
            <ul>
              <li>show coding progress</li>
              <li>list windows</li>
              <li>check sidecar status</li>
              <li>normal chat question</li>
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
          placeholder="Type a message... (Enter to send)"
          rows={1}
        />
        <button onClick={() => void sendMessage()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export default Chat;
