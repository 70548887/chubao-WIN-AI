import { useState } from 'react';
import { useLocale } from '../i18n';

interface WindowInfo {
  title: string;
  class_name: string;
}

interface WindowsResponse {
  success: boolean;
  windows: WindowInfo[];
}

export default function AutomationPanel() {
  const { t } = useLocale();
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
      console.error(t.automation.fetchError, error);
    }
    setLoading(false);
  };

  return (
    <div className="panel">
      <h2>{t.automation.title}</h2>
      <button onClick={fetchWindows} disabled={loading}>
        {loading ? t.automation.loading : t.automation.fetchWindowList}
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
