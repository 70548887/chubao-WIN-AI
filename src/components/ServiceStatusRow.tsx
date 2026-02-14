import { useLocale } from '../i18n';
import type {
  ServiceDiagnosticsPayload,
  ServiceKey,
  SidecarPortInspectionPayload,
} from './settings/serviceTypes';

interface ServiceStatusRowProps {
  label: string;
  serviceKey: ServiceKey;
  diagnostics: ServiceDiagnosticsPayload;
  busy: boolean;
  portInspectBusy: boolean;
  portInspection?: SidecarPortInspectionPayload;
  portInspectError: string | null;
  onRestart: (service: ServiceKey) => Promise<void>;
  onViewLogs: (service: ServiceKey) => Promise<void>;
  onInspectPort: (service: ServiceKey) => Promise<void>;
}

export default function ServiceStatusRow({
  label,
  serviceKey,
  diagnostics,
  busy,
  portInspectBusy,
  portInspection,
  portInspectError,
  onRestart,
  onViewLogs,
  onInspectPort,
}: ServiceStatusRowProps) {
  const { t } = useLocale();
  const service = diagnostics.status;
  const managedBy = service.managed
    ? t.service.tauriManaged
    : service.healthy
      ? t.service.externallyManaged
      : t.service.notManaged;
  const statusText = service.healthy
    ? service.managed
      ? t.service.running
      : t.service.runningExternal
    : service.running
      ? t.service.starting
      : t.service.offline;
  const badgeClass = service.healthy ? 'online' : service.running ? 'starting' : 'offline';
  const restartDisabled = busy || (!service.managed && service.healthy);
  const managedClass = service.managed
    ? 'managed-tauri'
    : service.healthy
      ? 'managed-external'
      : 'managed-none';
  const depsText =
    diagnostics.health?.deps &&
    Object.entries(diagnostics.health.deps)
      .map(([k, v]) => `${k}:${v}`)
      .join(' | ');
  const ocrDetail = serviceKey === 'python' ? diagnostics.health?.ocr : undefined;
  const ocrDependencies = ocrDetail?.dependencies;
  const ocrState = diagnostics.health?.deps?.ocr ?? 'unknown';
  const ocrBadgeClass = ocrState === 'ok' ? 'ready' : ocrState === 'degraded' ? 'degraded' : 'unknown';
  const ocrLastError = typeof ocrDetail?.lastError === 'string' && ocrDetail.lastError.trim().length > 0
    ? ocrDetail.lastError
    : null;
  const inspectBadgeClass = portInspection?.hasConflict ? 'conflict' : 'ok';
  const inspectedAt = portInspection?.inspectedAtMs
    ? new Date(portInspection.inspectedAtMs).toLocaleTimeString()
    : null;

  return (
    <div className="status-item">
      <div className="status-main">
        <span>{label}</span>
        <span className={`status-badge ${badgeClass}`}>{statusText}</span>
      </div>
      <div className="status-meta">
        <span>{service.endpoint}</span>
        <span>{service.pid ? `PID ${service.pid}` : t.service.noPid}</span>
        <span className={`status-managed ${managedClass}`}>{managedBy}</span>
        {diagnostics.health?.version && <span>v{diagnostics.health.version}</span>}
        {typeof diagnostics.health?.uptimeSec === 'number' && (
          <span>up {diagnostics.health.uptimeSec}s</span>
        )}
        {depsText && <span>{depsText}</span>}
      </div>
      {serviceKey === 'python' && (
        <div className="status-ocr">
          <span className={`status-ocr-badge ${ocrBadgeClass}`}>ocr: {ocrState}</span>
          {ocrDependencies && (
            <>
              <span className={`status-ocr-flag ${ocrDependencies.paddle ? 'ok' : 'missing'}`}>
                paddle: {ocrDependencies.paddle ? 'ok' : 'missing'}
              </span>
              <span className={`status-ocr-flag ${ocrDependencies.paddleocr ? 'ok' : 'missing'}`}>
                paddleocr: {ocrDependencies.paddleocr ? 'ok' : 'missing'}
              </span>
            </>
          )}
          {typeof ocrDetail?.engineInitialized === 'boolean' && (
            <span>engine: {ocrDetail.engineInitialized ? 'ready' : 'lazy-init'}</span>
          )}
          {ocrDetail?.apiVersion && <span>api: {ocrDetail.apiVersion}</span>}
        </div>
      )}
      <div className="status-actions">
        <button
          className="status-action-btn"
          onClick={() => void onRestart(serviceKey)}
          disabled={restartDisabled}
          title={!service.managed && service.healthy ? t.service.externalHint : undefined}
        >
          {busy ? t.service.restarting : t.service.restart}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => void onViewLogs(serviceKey)}
        >
          {t.service.viewLogs}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => void onInspectPort(serviceKey)}
          disabled={portInspectBusy}
        >
          {portInspectBusy ? t.service.portInspecting : t.service.portInspect}
        </button>
      </div>
      {portInspection && (
        <div className={`status-port-inspect ${inspectBadgeClass}`}>
          <div className="status-port-header">
            <span>port {portInspection.port}</span>
            <span>{portInspection.listening ? t.service.listening : t.service.notListening}</span>
            <span>{t.service.occupants}: {portInspection.occupants.length}</span>
            {portInspection.managedPid && <span>{t.service.managedPid}: {portInspection.managedPid}</span>}
            {inspectedAt && <span>{t.service.inspected}: {inspectedAt}</span>}
          </div>
          {portInspection.occupants.length > 0 && (
            <div className="status-port-occupants">
              {portInspection.occupants.map((occupant) => (
                <div key={`${serviceKey}-${occupant.pid}`} className="status-port-line">
                  <span>PID {occupant.pid}</span>
                  <span>{occupant.processName || 'unknown'}</span>
                  {occupant.localAddress && <span>@ {occupant.localAddress}:{portInspection.port}</span>}
                  {occupant.commandLine && <code>{occupant.commandLine}</code>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!service.managed && service.healthy && (
        <div className="status-hint">{t.service.externalHint}</div>
      )}
      {serviceKey === 'python' && ocrState !== 'ok' && (
        <div className="status-hint">{t.service.ocrNotReady}</div>
      )}
      {portInspectError && <div className="status-error-inline">{t.service.portInspectError}{portInspectError}</div>}
      {ocrLastError && <div className="status-error-inline">{t.service.ocrError}{ocrLastError}</div>}
      {service.lastError && <div className="status-error-inline">{service.lastError}</div>}
      {diagnostics.healthError && <div className="status-error-inline">{diagnostics.healthError}</div>}
    </div>
  );
}
