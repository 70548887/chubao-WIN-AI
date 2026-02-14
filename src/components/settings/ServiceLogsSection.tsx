import type { Messages } from '../../i18n';
import type { ServiceKey } from './serviceTypes';

interface ServiceLogsSectionProps {
  t: Messages;
  logService: ServiceKey | null;
  logError: string | null;
  logLoading: boolean;
  logs: string[];
  onLoadLogs: (service: ServiceKey) => Promise<void>;
}

export default function ServiceLogsSection({
  t,
  logService,
  logError,
  logLoading,
  logs,
  onLoadLogs,
}: ServiceLogsSectionProps) {
  return (
    <div className="settings-section">
      <h3>{t.settings.serviceLogs}</h3>
      {!logService && <div className="logs-empty">{t.settings.selectServiceHint}</div>}
      {logError && <div className="status-error">{logError}</div>}
      {logService && (
        <div className="logs-panel">
          <div className="logs-toolbar">
            <span className="logs-title">{logService === 'node' ? t.settings.nodeBackendLogs : t.settings.pythonAutomationLogs}</span>
            <button
              className="status-action-btn secondary"
              onClick={() => void onLoadLogs(logService)}
              disabled={logLoading}
            >
              {logLoading ? t.settings.loadingLogs : t.settings.refreshLogs}
            </button>
          </div>
          <div className="logs-content">
            {logLoading && logs.length === 0 && <div className="logs-empty">{t.settings.loadingLogsHint}</div>}
            {!logLoading && logs.length === 0 && <div className="logs-empty">{t.settings.noLogOutput}</div>}
            {logs.map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 24)}`} className="logs-line">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
