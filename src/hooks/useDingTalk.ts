import { useState, useCallback } from 'react';

export interface DingTalkConfig {
  webhook: string;
  secret?: string;
  atMobiles?: string[];
  atUserIds?: string[];
  isAtAll?: boolean;
}

export interface DingTalkMessage {
  msgtype: 'text' | 'markdown' | 'link' | 'actionCard' | 'feedCard';
  text?: {
    content: string;
  };
  markdown?: {
    title: string;
    text: string;
  };
  link?: {
    title: string;
    text: string;
    messageUrl: string;
    picUrl?: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

export interface DingTalkResponse {
  errcode: number;
  errmsg: string;
}

const STORAGE_KEY = 'chubao-dingtalk-config';

// 生成签名
async function generateSign(secret: string, timestamp: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}\n${secret}`)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export function useDingTalk() {
  const [config, setConfig] = useState<DingTalkConfig | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // 保存配置
  const saveConfig = useCallback((newConfig: DingTalkConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
  }, []);

  // 清除配置
  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
  }, []);

  // 发送消息
  const sendMessage = useCallback(
    async (message: Omit<DingTalkMessage, 'at'>): Promise<boolean> => {
      if (!config?.webhook) {
        setLastError('钉钉配置未设置');
        return false;
      }

      setIsLoading(true);
      setLastError(null);

      try {
        let url = config.webhook;
        const timestamp = Date.now().toString();

        // 如果有密钥，添加签名
        if (config.secret) {
          const sign = await generateSign(config.secret, timestamp);
          url += `${url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
        }

        // 构建完整消息
        const fullMessage: DingTalkMessage = {
          ...message,
          at: {
            atMobiles: config.atMobiles,
            atUserIds: config.atUserIds,
            isAtAll: config.isAtAll,
          },
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fullMessage),
        });

        const result: DingTalkResponse = await response.json();

        if (result.errcode !== 0) {
          throw new Error(result.errmsg);
        }

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '发送失败';
        setLastError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [config]
  );

  // 发送文本消息
  const sendText = useCallback(
    async (content: string): Promise<boolean> => {
      return sendMessage({
        msgtype: 'text',
        text: { content },
      });
    },
    [sendMessage]
  );

  // 发送 Markdown 消息
  const sendMarkdown = useCallback(
    async (title: string, text: string): Promise<boolean> => {
      return sendMessage({
        msgtype: 'markdown',
        markdown: { title, text },
      });
    },
    [sendMessage]
  );

  // 发送链接消息
  const sendLink = useCallback(
    async (title: string, text: string, messageUrl: string, picUrl?: string): Promise<boolean> => {
      return sendMessage({
        msgtype: 'link',
        link: { title, text, messageUrl, picUrl },
      });
    },
    [sendMessage]
  );

  // 测试配置
  const testConfig = useCallback(async (): Promise<boolean> => {
    return sendText('🤖 Chubao AI 测试消息\n\n钉钉机器人配置成功！');
  }, [sendText]);

  return {
    config,
    isLoading,
    lastError,
    isConfigured: !!config?.webhook,
    saveConfig,
    clearConfig,
    sendMessage,
    sendText,
    sendMarkdown,
    sendLink,
    testConfig,
  };
}
