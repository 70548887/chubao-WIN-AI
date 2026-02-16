import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { processUserMessage } from '../core';
import { useLocale } from '../i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationContext {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

function Chat() {
  const { t } = useLocale();
  const [conversations, setConversations] = useState<ConversationContext[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取当前对话
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // 加载保存的对话列表
  useEffect(() => {
    const saved = localStorage.getItem('chubao-conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConversations(
          parsed.map((c: ConversationContext) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        );
      } catch {
        // 忽略解析错误
      }
    }
  }, []);

  // 保存对话列表
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('chubao-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 创建新对话
  const createNewConversation = () => {
    const newConversation: ConversationContext = {
      id: Date.now().toString(),
      title: t.chat.newConversation,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setMessages([]);
  };

  // 切换对话
  const switchConversation = (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setActiveConversationId(conversationId);
      setMessages(conversation.messages);
    }
  };

  // 删除对话
  const deleteConversation = (conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  // 更新对话标题（基于第一条用户消息）
  const updateConversationTitle = (conversationId: string, firstMessage: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, title: firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '') }
          : c,
      ),
    );
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    // 如果没有活跃对话，创建一个新对话
    if (!activeConversationId) {
      createNewConversation();
    }

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // 更新对话存储
    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversationId ? { ...c, messages: newMessages, updatedAt: new Date() } : c)),
      );
      // 如果是第一条消息，更新标题
      if (messages.length === 0) {
        updateConversationTitle(activeConversationId, text);
      }
    }

    try {
      const assistantText = await processUserMessage(text);
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
      };
      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      // 更新对话存储
      if (activeConversationId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, messages: finalMessages, updatedAt: new Date() } : c)),
        );
      }
    } catch (error) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: `${t.chat.requestFailed}${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      // 更新对话存储
      if (activeConversationId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, messages: finalMessages, updatedAt: new Date() } : c)),
        );
      }
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
    <div className="chat-layout">
      {/* 对话列表侧边栏 */}
      <div className="conversation-sidebar">
        <button className="new-chat-btn" onClick={createNewConversation}>
          + {t.chat.newConversation}
        </button>
        <div className="conversation-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
              onClick={() => switchConversation(conv.id)}
            >
              <span className="conversation-title">{conv.title}</span>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-header">
          <h2>{activeConversation?.title || t.chat.title}</h2>
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
            <div className="message-content">
              {message.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
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
    </div>
  );
}

export default Chat;
