import {
  buildPortConflictServiceSummary,
  DIAGNOSTICS_EXPORT_SCHEMA_CURRENT,
} from './diagnosticsCompareUtils';
import type {
  PortConflictSummaryPayload,
  PythonOcrSummaryPayload,
} from './diagnosticsCompareUtils';
import { getServiceIssueFlags } from './serviceIssueUtils';
import type {
  IssueFilter,
  ServiceViewItem,
  SummaryMode,
} from './serviceIssueTypes';
import type {
  ServiceKey,
  SidecarDiagnosticsResponse,
} from './serviceTypes';

interface BuildDiagnosticsSummaryTextOptions {
  services: ServiceViewItem[];
  servicesToShow: ServiceViewItem[];
  copyCurrentFilterOnly: boolean;
  summaryMode: SummaryMode;
  issueFilter: IssueFilter;
  issueFilterLabels: Record<IssueFilter, string>;
  appVersion: string | null | undefined;
}

interface BuildDiagnosticsExportPayloadOptions {
  diagnostics: SidecarDiagnosticsResponse;
  appName: string | null | undefined;
  appVersion: string | null | undefined;
  redactExport: boolean;
  includeLogsExport: boolean;
  selectedLogServices: ServiceKey[];
  safeLogLimit: number;
  exportLogs: Partial<Record<ServiceKey, string[]>> | null;
  exportLogErrors: Partial<Record<ServiceKey, string>>;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9\-_]+/g, 'sk-ant-***')
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(token\s*[:=]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(secret\s*[:=]\s*)([^\s,;]+)/gi, '$1***');
}

export function redactSensitiveData<T>(input: T): T {
  if (typeof input === 'string') {
    return redactSensitiveText(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as T;
  }
  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('secret') || lower.includes('apikey') || lower.includes('api_key')) {
        result[key] = '***';
      } else {
        result[key] = redactSensitiveData(value);
      }
    }
    return result as T;
  }
  return input;
}

function buildServiceSummaryLine(item: ServiceViewItem, summaryMode: SummaryMode): string {
  const status = item.diagnostics.status;
  const health = item.diagnostics.health;
  const portInspection = item.diagnostics.portInspection;
  const flags = getServiceIssueFlags(item.diagnostics);
  const healthStatus = health?.status ?? 'unknown';
  const managedBy = status.managed ? 'tauri' : status.healthy ? 'external' : 'none';
  const ocrState = item.key === 'python' ? (health?.deps?.ocr ?? 'unknown') : null;
  const portState = portInspection
    ? `port=${portInspection.port}, listening=${portInspection.listening}, conflict=${portInspection.hasConflict}, occupants=${portInspection.occupants.length}`
    : 'port=unknown';
  const issues = [
    flags.offlineOrUnhealthy ? 'unhealthy' : null,
    flags.externalManaged ? 'external' : null,
    flags.hasError ? 'error' : null,
  ]
    .filter(Boolean)
    .join('|') || 'none';

  if (summaryMode === 'detailed') {
    const deps = health?.deps
      ? Object.entries(health.deps).map(([k, v]) => `${k}:${v}`).join(',')
      : 'none';
    const version = health?.version ?? 'unknown';
    const uptime = typeof health?.uptimeSec === 'number'
      ? health.uptimeSec
      : 'unknown';
    const ocrDeps = item.key === 'python'
      ? Object.entries(health?.ocr?.dependencies ?? {})
        .map(([k, v]) => `${k}:${v}`)
        .join(',') || 'none'
      : null;
    const ocrEngine = item.key === 'python'
      ? String(health?.ocr?.engineInitialized ?? 'unknown')
      : null;
    const ocrApi = item.key === 'python'
      ? (health?.ocr?.apiVersion ?? 'unknown')
      : null;
    const ocrError = item.key === 'python'
      ? (health?.ocr?.lastError ?? 'none')
      : null;
    const errors = [status.lastError, item.diagnostics.healthError]
      .filter(Boolean)
      .join(' | ') || 'none';
    const ocrPart = item.key === 'python'
      ? `, ocrState=${ocrState}, ocrEngine=${ocrEngine}, ocrApi=${ocrApi}, ocrDeps=${ocrDeps}, ocrError=${ocrError}`
      : '';
    return `${item.label}: running=${status.running}, healthy=${status.healthy}, managed=${managedBy}, pid=${status.pid ?? 'null'}, health=${healthStatus}, version=${version}, uptimeSec=${uptime}, deps=${deps}, ${portState}${ocrPart}, issues=${issues}, errors=${errors}`;
  }

  const ocrPart = item.key === 'python' ? `, ocrState=${ocrState}` : '';
  return `${item.label}: running=${status.running}, healthy=${status.healthy}, managed=${managedBy}, pid=${status.pid ?? 'null'}, health=${healthStatus}, ${portState}${ocrPart}, issues=${issues}`;
}

export function buildDiagnosticsSummaryText({
  services,
  servicesToShow,
  copyCurrentFilterOnly,
  summaryMode,
  issueFilter,
  issueFilterLabels,
  appVersion,
}: BuildDiagnosticsSummaryTextOptions): string {
  const summaryServices = copyCurrentFilterOnly ? servicesToShow : services;
  const lines = summaryServices.map((item) => buildServiceSummaryLine(item, summaryMode));

  return [
    `chubao diagnostics summary @ ${new Date().toISOString()}`,
    `appVersion=${appVersion ?? 'unknown'}`,
    `mode=${summaryMode}`,
    `scope=${copyCurrentFilterOnly ? 'filtered' : 'all'}`,
    `filter=${issueFilter}(${issueFilterLabels[issueFilter]})`,
    ...lines,
  ].join('\n');
}

export function buildDiagnosticsExportPayload({
  diagnostics,
  appName,
  appVersion,
  redactExport,
  includeLogsExport,
  selectedLogServices,
  safeLogLimit,
  exportLogs,
  exportLogErrors,
}: BuildDiagnosticsExportPayloadOptions) {
  const pythonHealth = diagnostics.python.health;
  const pythonOcrSummaryRaw: PythonOcrSummaryPayload | null = pythonHealth
    ? {
      state: pythonHealth.deps?.ocr ?? 'unknown',
      dependencies: { ...(pythonHealth.ocr?.dependencies ?? {}) },
      engineInitialized: typeof pythonHealth.ocr?.engineInitialized === 'boolean'
        ? pythonHealth.ocr.engineInitialized
        : null,
      apiVersion: pythonHealth.ocr?.apiVersion ?? null,
      lastError: pythonHealth.ocr?.lastError ?? null,
    }
    : null;
  const portConflictSummaryRaw: PortConflictSummaryPayload = {
    node: buildPortConflictServiceSummary(diagnostics.node.portInspection),
    python: buildPortConflictServiceSummary(diagnostics.python.portInspection),
  };

  return {
    schemaVersion: DIAGNOSTICS_EXPORT_SCHEMA_CURRENT,
    exportedAt: new Date().toISOString(),
    app: appName ?? 'unknown',
    appVersion: appVersion ?? null,
    pythonOcrSummary: pythonOcrSummaryRaw
      ? (redactExport ? redactSensitiveData(pythonOcrSummaryRaw) : pythonOcrSummaryRaw)
      : null,
    portConflictSummary: redactExport
      ? redactSensitiveData(portConflictSummaryRaw)
      : portConflictSummaryRaw,
    diagnostics: redactExport ? redactSensitiveData(diagnostics) : diagnostics,
    redacted: redactExport,
    logsIncluded: includeLogsExport && selectedLogServices.length > 0,
    logServices: includeLogsExport ? selectedLogServices : [],
    logLimit: includeLogsExport && selectedLogServices.length > 0 ? safeLogLimit : 0,
    logs: exportLogs
      ? (redactExport ? redactSensitiveData(exportLogs) : exportLogs)
      : undefined,
    logErrors: Object.keys(exportLogErrors).length > 0 ? exportLogErrors : undefined,
  };
}
