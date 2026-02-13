import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';

type ActiveTab = 'chat' | 'automation' | 'settings';

interface WindowInfo {
  title: string;
  class_name: string;
}

interface WindowsResponse {
  success: boolean;
  windows: WindowInfo[];
}

interface SidecarServiceStatus {
  name: string;
  running: boolean;
  healthy: boolean;
  pid: number | null;
  port: number;
  endpoint: string;
  lastError: string | null;
}

interface SidecarStatusResponse {
  node: SidecarServiceStatus;
  python: SidecarServiceStatus;
}

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'automation' && <AutomationPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

function AutomationPanel() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWindows = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:3200/api/windows');
      const data = (await response.json()) as WindowsResponse;
      if (data.success) {
        setWindows(data.windows);
      }
    } catch (error) {
      console.error('获取窗口列表失败:', error);
    }
    setLoading(false);
  };

  return (
    <div className="panel">
      <h2>桌面自动化</h2>
      <button onClick={fetchWindows} disabled={loading}>
        {loading ? '加载中...' : '获取窗口列表'}
      </button>
      <div className="window-list">
        {windows.map((win, idx) => (
          <div key={`${win.title}-${idx}`} className="window-item">
            <span className="window-title">{win.title}</span>
            <span className="window-class">{win.class_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const [status, setStatus] = useState<SidecarStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (ensure: boolean) => {
    try {
      const command = ensure ? 'ensure_sidecars' : 'sidecar_status';
      const data = await invoke<SidecarStatusResponse>(command);
      setStatus(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus(true);
    const timer = window.setInterval(() => {
      void loadStatus(false);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  return (
    <div className="panel">
      <h2>设置</h2>
      <div className="settings-section">
        <h3>API 配置</h3>
        <label>
          Anthropic API Key:
          <input type="password" placeholder="sk-ant-..." />
        </label>
      </div>

      <div className="settings-section">
        <h3>服务状态</h3>
        {loading && !status && <div className="status-loading">检测服务状态中...</div>}
        {error && <div className="status-error">{error}</div>}
        {status && (
          <>
            <ServiceStatusRow label="Node.js 后端" service={status.node} />
            <ServiceStatusRow label="Python 自动化" service={status.python} />
          </>
        )}
        <button className="status-refresh-btn" onClick={() => void loadStatus(true)} disabled={loading}>
          {loading ? '检测中...' : '重新检测'}
        </button>
      </div>
    </div>
  );
}

interface ServiceStatusRowProps {
  label: string;
  service: SidecarServiceStatus;
}

function ServiceStatusRow({ label, service }: ServiceStatusRowProps) {
  const statusText = service.healthy ? '运行中' : service.running ? '启动中' : '离线';
  const badgeClass = service.healthy ? 'online' : service.running ? 'starting' : 'offline';

  return (
    <div className="status-item">
      <div className="status-main">
        <span>{label}</span>
        <span className={`status-badge ${badgeClass}`}>{statusText}</span>
      </div>
      <div className="status-meta">
        <span>{service.endpoint}</span>
        <span>{service.pid ? `PID ${service.pid}` : '无进程'}</span>
      </div>
      {service.lastError && <div className="status-error-inline">{service.lastError}</div>}
    </div>
  );
}

export default App;
