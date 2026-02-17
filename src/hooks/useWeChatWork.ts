import { useState, useCallback } from 'react';

export interface WeChatWorkConfig {
  corpid: string;
  corpsecret: string;
  agentid: string;
  touser?: string;
  toparty?: string;
  totag?: string;
}

export interface WeChatWorkMessage {
  msgtype: 'text' | 'markdown' | 'news' | 'file' | 'image';
  text?: {
    content: string;
  };
  markdown?: {
    content: string;
  };
  news?: {
    articles: {
      title: string;
      description: string;
      url: string;
      picurl?: string;
    }[];
  };
  file?: {
    media_id: string;
  };
  image?: {
    media_id: string;
  };
  safe?: number;
}

export interface WeChatWorkTokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

export interface WeChatWorkSendResponse {
  errcode: number;
  errmsg: string;
  invaliduser?: string;
}

const STORAGE_KEY = 'chubao-wechatwork-config';
const TOKEN_STORAGE_KEY = 'chubao-wechatwork-token';

// 获取访问令牌
async function getAccessToken(corpid: string, corpsecret: string): Promise<string | null> {
  try {
    // 检查本地存储的 token
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      const { token, expiresAt } = JSON.parse(stored);
      if (Date.now() < expiresAt) {
        return token;
      }
    }

    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`
    );
    const data: WeChatWorkTokenResponse = await response.json();

    if (data.errcode !== 0 || !data.access_token) {
      throw new Error(data.errmsg);
    }

    // 存储 token，提前 5 分钟过期
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 7200) * 1000 - 300000,
      })
    );

    return data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

export function useWeChatWork() {
  const [config, setConfig] = useState<WeChatWorkConfig | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // 保存配置
  const saveConfig = useCallback((newConfig: WeChatWorkConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
    // 清除旧的 token
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  // 清除配置
  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setConfig(null);
  }, []);

  // 发送消息
  const sendMessage = useCallback(
    async (message: Omit<WeChatWorkMessage, 'safe'>): Promise<boolean> => {
      if (!config?.corpid || !config?.corpsecret || !config?.agentid) {
        setLastError('企业微信配置不完整');
        return false;
      }

      setIsLoading(true);
      setLastError(null);

      try {
        const accessToken = await getAccessToken(config.corpid, config.corpsecret);
        if (!accessToken) {
          throw new Error('获取访问令牌失败');
        }

        const fullMessage = {
          ...message,
          safe: 0,
        };

        const response = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...fullMessage,
              agentid: config.agentid,
              touser: config.touser || '@all',
              toparty: config.toparty,
              totag: config.totag,
            }),
          }
        );

        const result: WeChatWorkSendResponse = await response.json();

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
    async (content: string): Promise<boolean> => {
      return sendMessage({
        msgtype: 'markdown',
        markdown: { content },
      });
    },
    [sendMessage]
  );

  // 发送图文消息
  const sendNews = useCallback(
    async (
      title: string,
      description: string,
      url: string,
      picurl?: string
    ): Promise<boolean> => {
      return sendMessage({
        msgtype: 'news',
        news: {
          articles: [{ title, description, url, picurl }],
        },
      });
    },
    [sendMessage]
  );

  // 测试配置
  const testConfig = useCallback(async (): Promise<boolean> => {
    return sendText('🤖 Chubao AI 测试消息\n\n企业微信应用消息配置成功！');
  }, [sendText]);

  return {
    config,
    isLoading,
    lastError,
    isConfigured: !!(config?.corpid && config?.corpsecret && config?.agentid),
    saveConfig,
    clearConfig,
    sendMessage,
    sendText,
    sendMarkdown,
    sendNews,
    testConfig,
  };
}
