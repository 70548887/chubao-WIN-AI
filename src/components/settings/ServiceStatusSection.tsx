import type { Messages } from '../../i18n';
import ServiceStatusRow from '../ServiceStatusRow';
import type {
  ServiceKey,
  SidecarDiagnosticsResponse,
  SidecarPortInspectionPayload,
} from './serviceTypes';
import type {
  IssueFilter,
  ServiceViewItem,
  SummaryMode,
} from './serviceIssueTypes';

interface ServiceStatusSectionProps {
  t: Messages;
  loading: boolean;
  diagnostics: SidecarDiagnosticsResponse | null;
  error: string | null;
  issueServiceCount: number;
  services: ServiceViewItem[];
  servicesToShow: ServiceViewItem[];
  issueFilterLabels: Record<IssueFilter, string>;
  issueFilter: IssueFilter;
  onIssueFilterChange: (value: IssueFilter) => void;
  summaryMode: SummaryMode;
  onSummaryModeChange: (value: SummaryMode) => void;
  copyCurrentFilterOnly: boolean;
  onCopyCurrentFilterOnlyChange: (value: boolean) => void;
  copyingSummary: boolean;
  summaryCopied: boolean;
  onCopyDiagnosticsSummary: () => Promise<void>;
  redactExport: boolean;
  onToggleRedactExport: () => void;
  exporting: boolean;
  onExportDiagnostics: () => Promise<void>;
  includeLogsExport: boolean;
  onIncludeLogsExportChange: (value: boolean) => void;
  selectedExportLogServices: Record<ServiceKey, boolean>;
  onToggleExportLogService: (service: ServiceKey, checked: boolean) => void;
  exportLogLimit: number;
  onExportLogLimitChange: (value: number) => void;
  copyError: string | null;
  refreshing: boolean;
  onRefreshStatus: () => Promise<void>;
  actionBusy: Record<ServiceKey, boolean>;
  portInspectBusy: Record<ServiceKey, boolean>;
  portInspections: Partial<Record<ServiceKey, SidecarPortInspectionPayload>>;
  portInspectErrors: Partial<Record<ServiceKey, string>>;
  onRestartService: (service: ServiceKey) => Promise<void>;
  onLoadLogs: (service: ServiceKey) => Promise<void>;
  onInspectPort: (service: ServiceKey) => Promise<void>;
}

export default function ServiceStatusSection({
  t,
  loading,
  diagnostics,
  error,
  issueServiceCount,
  services,
  servicesToShow,
  issueFilterLabels,
  issueFilter,
  onIssueFilterChange,
  summaryMode,
  onSummaryModeChange,
  copyCurrentFilterOnly,
  onCopyCurrentFilterOnlyChange,
  copyingSummary,
  summaryCopied,
  onCopyDiagnosticsSummary,
  redactExport,
  onToggleRedactExport,
  exporting,
  onExportDiagnostics,
  includeLogsExport,
  onIncludeLogsExportChange,
  selectedExportLogServices,
  onToggleExportLogService,
  exportLogLimit,
  onExportLogLimitChange,
  copyError,
  refreshing,
  onRefreshStatus,
  actionBusy,
  portInspectBusy,
  portInspections,
  portInspectErrors,
  onRestartService,
  onLoadLogs,
  onInspectPort,
}: ServiceStatusSectionProps) {
  return (
    <div className="settings-section">
      <h3>{t.settings.serviceStatus}</h3>
      {loading && !diagnostics && <div className="status-loading">{t.settings.detectingStatus}</div>}
      {error && <div className="status-error">{error}</div>}
      {diagnostics && (
        <>
          <div className="status-summary-row">
            <span>{t.settings.abnormalServices} {issueServiceCount}/{services.length}</span>
            <span>{t.settings.filterLabel}: {issueFilterLabels[issueFilter]} ({servicesToShow.length})</span>
          </div>
          {servicesToShow.length === 0 && (
            <div className="status-note">{t.settings.noServicesMatch}</div>
          )}
          {servicesToShow.map((item) => (
            <ServiceStatusRow
              key={item.key}
              label={item.label}
              serviceKey={item.key}
              diagnostics={item.diagnostics}
              busy={actionBusy[item.key]}
              portInspectBusy={portInspectBusy[item.key]}
              portInspection={portInspections[item.key]}
              portInspectError={portInspectErrors[item.key] ?? null}
              onRestart={onRestartService}
              onViewLogs={onLoadLogs}
              onInspectPort={onInspectPort}
            />
          ))}
        </>
      )}
      <div className="status-toolbar">
        <button className="status-refresh-btn" onClick={() => void onRefreshStatus()} disabled={refreshing}>
          {refreshing ? t.settings.refreshing : t.settings.refreshStatus}
        </button>
        <label className="status-filter">
          <span>{t.settings.filterLabel}</span>
          <select
            value={issueFilter}
            onChange={(event) => onIssueFilterChange(event.target.value as IssueFilter)}
            disabled={!diagnostics}
          >
            <option value="all">{issueFilterLabels.all}</option>
            <option value="issues">{issueFilterLabels.issues}</option>
            <option value="offline">{issueFilterLabels.offline}</option>
            <option value="external">{issueFilterLabels.external}</option>
            <option value="errors">{issueFilterLabels.errors}</option>
          </select>
        </label>
        <label className="status-filter">
          <span>{t.settings.summaryLabel}</span>
          <select
            value={summaryMode}
            onChange={(event) => onSummaryModeChange(event.target.value as SummaryMode)}
            disabled={!diagnostics}
          >
            <option value="compact">{t.settings.compact}</option>
            <option value="detailed">{t.settings.detailed}</option>
          </select>
        </label>
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={copyCurrentFilterOnly}
            disabled={!diagnostics || copyingSummary}
            onChange={(event) => onCopyCurrentFilterOnlyChange(event.target.checked)}
          />
          <span>{t.settings.copyCurrentFilterOnly}</span>
        </label>
        <button
          className="status-action-btn secondary"
          onClick={() => void onCopyDiagnosticsSummary()}
          disabled={!diagnostics || copyingSummary}
        >
          {copyingSummary ? t.settings.copying : summaryCopied ? t.settings.summaryCopied : t.settings.copyDiagnosticsSummary}
        </button>
        <button
          className={`status-action-btn secondary ${redactExport ? '' : 'danger'}`}
          onClick={() => onToggleRedactExport()}
          disabled={!diagnostics || exporting}
          title={t.settings.exportRedactedTooltip}
        >
          {redactExport ? t.settings.exportRedacted : t.settings.exportRaw}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => void onExportDiagnostics()}
          disabled={exporting || !diagnostics}
        >
          {exporting ? t.settings.exporting : t.settings.exportDiagnosticsJson}
        </button>
      </div>
      <div className="status-export-options">
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={includeLogsExport}
            disabled={!diagnostics || exporting}
            onChange={(event) => onIncludeLogsExportChange(event.target.checked)}
          />
          <span>{t.settings.includeRecentLogs}</span>
        </label>
        <div className="status-service-picks">
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={selectedExportLogServices.node}
              disabled={!includeLogsExport || !diagnostics || exporting}
              onChange={(event) => onToggleExportLogService('node', event.target.checked)}
            />
            <span>Node</span>
          </label>
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={selectedExportLogServices.python}
              disabled={!includeLogsExport || !diagnostics || exporting}
              onChange={(event) => onToggleExportLogService('python', event.target.checked)}
            />
            <span>Python</span>
          </label>
        </div>
        <label className="status-log-limit">
          <span>{t.settings.logLines}</span>
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={exportLogLimit}
            disabled={!includeLogsExport || !diagnostics || exporting}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              if (Number.isNaN(parsed)) {
                onExportLogLimitChange(1);
                return;
              }
              onExportLogLimitChange(Math.min(500, Math.max(1, parsed)));
            }}
          />
        </label>
      </div>
      {copyError && <div className="status-error">{copyError}</div>}
    </div>
  );
}
