import { useState, useCallback, useEffect } from 'react';

export interface SettingCategory {
  id: string;
  name: string;
  icon: string;
  settings: SettingItem[];
}

export interface SettingItem {
  id: string;
  name: string;
  description: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'array';
  value: any;
  defaultValue: any;
  options?: { label: string; value: any }[];
  category: string;
}

const STORAGE_KEY = 'chubao-settings';

// 默认设置
const DEFAULT_SETTINGS: SettingCategory[] = [
  {
    id: 'general',
    name: '通用',
    icon: '⚙️',
    settings: [
      {
        id: 'language',
        name: '语言',
        description: '界面显示语言',
        type: 'select',
        value: 'zh-CN',
        defaultValue: 'zh-CN',
        options: [
          { label: '简体中文', value: 'zh-CN' },
          { label: 'English', value: 'en' },
        ],
        category: 'general',
      },
      {
        id: 'autoStart',
        name: '开机自启',
        description: '系统启动时自动运行',
        type: 'boolean',
        value: false,
        defaultValue: false,
        category: 'general',
      },
      {
        id: 'minimizeToTray',
        name: '最小化到托盘',
        description: '关闭窗口时最小化到系统托盘',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'general',
      },
    ],
  },
  {
    id: 'ai',
    name: 'AI 设置',
    icon: '🤖',
    settings: [
      {
        id: 'model',
        name: '默认模型',
        description: 'AI 对话使用的默认模型',
        type: 'select',
        value: 'claude-3-5-sonnet',
        defaultValue: 'claude-3-5-sonnet',
        options: [
          { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
          { label: 'Claude 3 Opus', value: 'claude-3-opus' },
          { label: 'Claude 3 Haiku', value: 'claude-3-haiku' },
        ],
        category: 'ai',
      },
      {
        id: 'maxTokens',
        name: '最大 Token',
        description: '单次响应的最大 Token 数',
        type: 'number',
        value: 4096,
        defaultValue: 4096,
        category: 'ai',
      },
      {
        id: 'temperature',
        name: '温度',
        description: 'AI 响应的创造性程度 (0-1)',
        type: 'number',
        value: 0.7,
        defaultValue: 0.7,
        category: 'ai',
      },
      {
        id: 'streaming',
        name: '流式响应',
        description: '启用实时流式输出',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'ai',
      },
    ],
  },
  {
    id: 'notifications',
    name: '通知',
    icon: '🔔',
    settings: [
      {
        id: 'enableNotifications',
        name: '启用通知',
        description: '接收系统和应用内通知',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'notifications',
      },
      {
        id: 'soundEnabled',
        name: '提示音',
        description: '播放通知提示音',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'notifications',
      },
      {
        id: 'desktopNotifications',
        name: '桌面通知',
        description: '显示系统桌面通知',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'notifications',
      },
    ],
  },
  {
    id: 'privacy',
    name: '隐私',
    icon: '🔒',
    settings: [
      {
        id: 'saveHistory',
        name: '保存对话历史',
        description: '本地保存聊天记录',
        type: 'boolean',
        value: true,
        defaultValue: true,
        category: 'privacy',
      },
      {
        id: 'analyticsEnabled',
        name: '使用分析',
        description: '发送匿名使用数据以改进产品',
        type: 'boolean',
        value: false,
        defaultValue: false,
        category: 'privacy',
      },
    ],
  },
  {
    id: 'advanced',
    name: '高级',
    icon: '🔧',
    settings: [
      {
        id: 'debugMode',
        name: '调试模式',
        description: '显示调试信息和日志',
        type: 'boolean',
        value: false,
        defaultValue: false,
        category: 'advanced',
      },
      {
        id: 'apiEndpoint',
        name: 'API 端点',
        description: '自定义 API 服务器地址',
        type: 'string',
        value: '',
        defaultValue: '',
        category: 'advanced',
      },
    ],
  },
];

export function useSettings() {
  const [categories, setCategories] = useState<SettingCategory[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // 合并存储的设置和默认设置
        return DEFAULT_SETTINGS.map((cat) => ({
          ...cat,
          settings: cat.settings.map((setting) => {
            const storedCat = parsed.find((c: SettingCategory) => c.id === cat.id);
            const storedSetting = storedCat?.settings.find((s: SettingItem) => s.id === setting.id);
            return storedSetting ? { ...setting, value: storedSetting.value } : setting;
          }),
        }));
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [searchQuery, setSearchQuery] = useState('');

  // 持久化设置
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  }, [categories]);

  // 更新设置值
  const updateSetting = useCallback((categoryId: string, settingId: string, value: any) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              settings: cat.settings.map((s) =>
                s.id === settingId ? { ...s, value } : s
              ),
            }
          : cat
      )
    );
  }, []);

  // 获取设置值
  const getSetting = useCallback(
    (categoryId: string, settingId: string) => {
      const category = categories.find((c) => c.id === categoryId);
      return category?.settings.find((s) => s.id === settingId)?.value;
    },
    [categories]
  );

  // 重置单个设置
  const resetSetting = useCallback((categoryId: string, settingId: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              settings: cat.settings.map((s) =>
                s.id === settingId ? { ...s, value: s.defaultValue } : s
              ),
            }
          : cat
      )
    );
  }, []);

  // 重置分类设置
  const resetCategory = useCallback((categoryId: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              settings: cat.settings.map((s) => ({ ...s, value: s.defaultValue })),
            }
          : cat
      )
    );
  }, []);

  // 重置所有设置
  const resetAll = useCallback(() => {
    setCategories(DEFAULT_SETTINGS);
  }, []);

  // 导出设置
  const exportSettings = useCallback(() => {
    const dataStr = JSON.stringify(categories, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chubao-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [categories]);

  // 导入设置
  const importSettings = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          if (Array.isArray(imported)) {
            setCategories(imported);
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }, []);

  // 搜索过滤
  const filteredCategories = searchQuery
    ? categories
        .map((cat) => ({
          ...cat,
          settings: cat.settings.filter(
            (s) =>
              s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.description.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((cat) => cat.settings.length > 0)
    : categories;

  return {
    categories,
    filteredCategories,
    searchQuery,
    setSearchQuery,
    updateSetting,
    getSetting,
    resetSetting,
    resetCategory,
    resetAll,
    exportSettings,
    importSettings,
  };
}
