import { useState, useEffect } from 'react';
import Chat from './components/Chat';
import CodingDashboard from './components/CodingDashboard';
import AutomationPanel from './components/AutomationPanel';
import Sidebar from './components/Sidebar';
import SkillsPanel from './components/SkillsPanel';
import { SettingsPanelNew } from './components/SettingsPanelNew';
import { ToastContainer } from './components/NotificationCenter';
import { PerformancePanel } from './components/PerformancePanel';
import { PluginManagerPanel } from './components/PluginManager';
import { DingTalkConfig } from './components/DingTalkConfig';
import { WeChatWorkConfig } from './components/WeChatWorkConfig';
import { initializePluginManager } from './core/plugin/PluginManager';
import { useThemeShortcut } from './hooks/useThemeShortcut';
import EditorPanel from './components/EditorPanel';
import type { PluginContext } from './core/plugin/types';

type ActiveTab = 'chat' | 'dashboard' | 'automation' | 'skills' | 'settings' | 'plugins' | 'platforms' | 'editor';

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  // 初始化插件系统
  useEffect(() => {
    const context: PluginContext = {
      storage: {
        get: async <T,>(key: string, defaultValue?: T): Promise<T | undefined> => {
          const stored = localStorage.getItem(`app:${key}`);
          return stored ? JSON.parse(stored) : defaultValue;
        },
        set: async <T,>(key: string, value: T): Promise<void> => {
          localStorage.setItem(`app:${key}`, JSON.stringify(value));
        },
        remove: async (key: string): Promise<void> => {
          localStorage.removeItem(`app:${key}`);
        },
      },
      fetch: window.fetch.bind(window),
      notify: (message: string) => {
        console.log('[App Notify]', message);
      },
      log: {
        debug: console.debug,
        info: console.info,
        warn: console.warn,
        error: console.error,
      },
      events: {
        on: (event: string, handler: (data: unknown) => void) => {
          const listener = (e: Event) => handler((e as CustomEvent).detail);
          window.addEventListener(event, listener);
          return () => window.removeEventListener(event, listener);
        },
        emit: (event: string, data?: unknown) => {
          window.dispatchEvent(new CustomEvent(event, { detail: data }));
        },
      },
      ui: {
        registerPanel: () => {},
        registerCommand: () => {},
        showModal: async () => {},
      },
      system: {
        getPlatform: () => navigator.platform,
        getVersion: () => '0.2.0',
      },
    };

    initializePluginManager(context);
  }, []);

  // 启用主题快捷键
  useThemeShortcut();

  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'dashboard' && <CodingDashboard />}
        {activeTab === 'automation' && <AutomationPanel />}
        {activeTab === 'skills' && <SkillsPanel />}
        {activeTab === 'settings' && <SettingsPanelNew />}
        {activeTab === 'plugins' && <PluginManagerPanel />}
        {activeTab === 'platforms' && (
          <div className="platforms-config">
            <h2>📱 平台配置</h2>
            <DingTalkConfig />
            <div style={{ marginTop: '32px' }} />
            <WeChatWorkConfig />
          </div>
        )}
        {activeTab === 'editor' && <EditorPanel />}
      </main>
      <ToastContainer />
      <PerformancePanel />
    </div>
  );
}

export default App;
