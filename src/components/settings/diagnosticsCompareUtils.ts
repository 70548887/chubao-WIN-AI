import {
  filterDiagnosticCompareEntries,
  formatSchemaHint as formatSchemaHintCore,
} from '../../core/diagnostics/compareUtils';
import type {
  PythonOcrDependenciesPayload,
  PythonOcrHealthPayload,
  ServiceDiagnosticsPayload,
  ServiceKey,
  SidecarDiagnosticsResponse,
  SidecarPortOccupantPayload,
  SidecarPortInspectionPayload,
} from './serviceTypes';

export interface PythonOcrSummaryPayload {
  state: string;
  dependencies: {
    paddleocr?: boolean;
    paddle?: boolean;
  };
  engineInitialized: boolean | null;
  apiVersion: string | null;
  lastError: string | null;
}

export interface PortConflictServiceSummaryPayload {
  port: number | null;
  listening: boolean | null;
  hasConflict: boolean | null;
  managedPid: number | null;
  occupants: number;
  occupantPids: number[];
}

export interface PortConflictSummaryPayload {
  node: PortConflictServiceSummaryPayload;
  python: PortConflictServiceSummaryPayload;
}

export interface DiagnosticsExportPayload {
  schemaVersion?: string;
  exportedAt?: string;
  app?: string;
  appVersion?: string | null;
  pythonOcrSummary?: PythonOcrSummaryPayload | null;
  portConflictSummary?: PortConflictSummaryPayload | null;
  diagnostics?: SidecarDiagnosticsResponse;
  node?: ServiceDiagnosticsPayload;
  python?: ServiceDiagnosticsPayload;
}

export interface ParsedDiagnosticsFile {
  name: string;
  payload: DiagnosticsExportPayload;
  diagnostics: SidecarDiagnosticsResponse;
}

export type DiffGroup = 'meta' | 'node' | 'python';

export interface DiffEntry {
  group: DiffGroup;
  field: string;
  before: string;
  after: string;
  changed: boolean;
  line: string;
}

export interface DiagnosticsDiffPayload {
  schemaVersion: string;
  comparedAt: string;
  baseline: {
    fileName: string;
    exportedAt: string | null;
    appVersion: string | null;
    schemaVersion: string | null;
  };
  target: {
    fileName: string;
    exportedAt: string | null;
    appVersion: string | null;
    schemaVersion: string | null;
  };
  summary: string;
  diffCount: number;
  lineCount: number;
  scope: 'all' | 'filtered';
  filterState?: {
    group: 'all' | DiffGroup;
    onlyChanged: boolean;
    schemaOnly: boolean;
    keywords: string[];
  };
  lines: string[];
}

export interface CompareEntryFilterState {
  groupFilter: 'all' | DiffGroup;
  onlyChanged: boolean;
  schemaOnly: boolean;
  keywords: string[];
}

export interface CompareFilterHistoryItem {
  id: string;
  tags: string[];
  query: string;
  pinned: boolean;
  updatedAt: number;
}

export const DIFF_GROUP_LABELS: Record<DiffGroup, string> = {
  meta: 'Meta',
  node: 'Node',
  python: 'Python',
};

export const COMPARE_FIELD_PRESET_TAGS = [
  { label: 'deps', value: 'deps' },
  { label: 'health', value: 'health' },
  { label: 'port', value: 'port' },
  { label: 'pid', value: 'pid' },
  { label: 'managed', value: 'managed' },
  { label: 'ocr', value: 'ocr' },
] as const;

export const DIAGNOSTICS_EXPORT_SCHEMA_CURRENT = 'diagnostics.v1.2';
export const DIAGNOSTICS_EXPORT_SCHEMA_COMPAT = [
  'diagnostics.v1.1',
  DIAGNOSTICS_EXPORT_SCHEMA_CURRENT,
] as const;

export const COMPARE_HISTORY_MAX_ITEMS = 8;
export const COMPARE_HISTORY_STORAGE_KEY = 'chubao.compare.filter.history.v1';

export function formatSchemaHint(fileName: string, schemaVersion: string | undefined): string | null {
  return formatSchemaHintCore(
    fileName,
    schemaVersion,
    DIAGNOSTICS_EXPORT_SCHEMA_CURRENT,
    DIAGNOSTICS_EXPORT_SCHEMA_COMPAT,
  );
}

export function normalizeCompareKeyword(input: string): string {
  return input.trim().toLowerCase();
}

export function collectCompareKeywords(query: string, tags: string[]): string[] {
  const queryTokens = query
    .split(/[\s,]+/)
    .map((token) => normalizeCompareKeyword(token))
    .filter((token) => token.length > 0);
  const tagTokens = tags.map((tag) => normalizeCompareKeyword(tag)).filter((token) => token.length > 0);
  return Array.from(new Set([...tagTokens, ...queryTokens]));
}

export function buildCompareHistoryLabel(item: CompareFilterHistoryItem): string {
  const tagsPart = item.tags.length > 0 ? item.tags.join('+') : '';
  const queryPart = item.query.trim();
  if (tagsPart && queryPart) {
    return `${tagsPart} | ${queryPart}`;
  }
  if (tagsPart) {
    return tagsPart;
  }
  return queryPart || '(empty)';
}

export function sortCompareHistoryItems(items: CompareFilterHistoryItem[]): CompareFilterHistoryItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return a.id.localeCompare(b.id);
  });
}

export function filterCompareEntries(entries: DiffEntry[], state: CompareEntryFilterState): DiffEntry[] {
  return filterDiagnosticCompareEntries(entries, state);
}

export function getCompareLineClass(entry: DiffEntry): 'same' | 'changed' | 'conflict' {
  if (!entry.changed) {
    return 'same';
  }
  if (entry.field.toLowerCase().includes('hasconflict') && entry.after === 'true') {
    return 'conflict';
  }
  return 'changed';
}

export function buildCompareDiffText(payload: DiagnosticsDiffPayload): string {
  const keywords = payload.filterState?.keywords ?? [];
  const filterSummary = payload.filterState
    ? `filter=group:${payload.filterState.group},onlyChanged:${payload.filterState.onlyChanged},schemaOnly:${payload.filterState.schemaOnly},keywords:${keywords.join('+') || 'none'}`
    : 'filter=none';
  return [
    `${payload.summary}`,
    `scope=${payload.scope}`,
    `diffCount=${payload.diffCount}`,
    `lineCount=${payload.lineCount}`,
    `baseline=${payload.baseline.fileName}`,
    `baselineSchema=${payload.baseline.schemaVersion ?? 'unknown'}`,
    `target=${payload.target.fileName}`,
    `targetSchema=${payload.target.schemaVersion ?? 'unknown'}`,
    filterSummary,
    ...payload.lines,
  ].join('\n');
}

export function coerceDiagnosticsPayload(payload: DiagnosticsExportPayload): SidecarDiagnosticsResponse | null {
  if (payload.diagnostics?.node && payload.diagnostics?.python) {
    return payload.diagnostics;
  }
  if (payload.node && payload.python) {
    return {
      node: payload.node,
      python: payload.python,
    };
  }
  return null;
}

function buildDiffEntry(group: DiffGroup, field: string, before: string, after: string): DiffEntry {
  return {
    group,
    field,
    before,
    after,
    changed: before !== after,
    line: `${group}.${field}: ${before} -> ${after}`,
  };
}

function compareDeps(
  group: DiffGroup,
  leftDeps: Record<string, string> | undefined,
  rightDeps: Record<string, string> | undefined,
): DiffEntry[] {
  const keys = new Set<string>([
    ...Object.keys(leftDeps ?? {}),
    ...Object.keys(rightDeps ?? {}),
  ]);
  const diffs: DiffEntry[] = [];
  for (const key of Array.from(keys).sort()) {
    const left = leftDeps?.[key] ?? 'undefined';
    const right = rightDeps?.[key] ?? 'undefined';
    diffs.push(buildDiffEntry(group, `deps.${key}`, left, right));
  }
  return diffs;
}

function compareOcrDetails(
  group: DiffGroup,
  left: PythonOcrHealthPayload | undefined,
  right: PythonOcrHealthPayload | undefined,
): DiffEntry[] {
  const lines: DiffEntry[] = [];
  lines.push(buildDiffEntry(
    group,
    'health.ocr.engineInitialized',
    String(left?.engineInitialized ?? 'undefined'),
    String(right?.engineInitialized ?? 'undefined'),
  ));
  lines.push(buildDiffEntry(
    group,
    'health.ocr.apiVersion',
    left?.apiVersion ?? 'undefined',
    right?.apiVersion ?? 'undefined',
  ));
  lines.push(buildDiffEntry(
    group,
    'health.ocr.lastError',
    left?.lastError ?? 'undefined',
    right?.lastError ?? 'undefined',
  ));

  const leftDeps = left?.dependencies ?? {};
  const rightDeps = right?.dependencies ?? {};
  const depKeys = new Set<string>([...Object.keys(leftDeps), ...Object.keys(rightDeps)]);
  for (const dep of Array.from(depKeys).sort()) {
    lines.push(buildDiffEntry(
      group,
      `health.ocr.dependencies.${dep}`,
      String(leftDeps[dep as keyof PythonOcrDependenciesPayload] ?? 'undefined'),
      String(rightDeps[dep as keyof PythonOcrDependenciesPayload] ?? 'undefined'),
    ));
  }
  return lines;
}

function formatPortOccupantSummary(occupants: SidecarPortOccupantPayload[] | undefined): string {
  if (!occupants || occupants.length === 0) {
    return 'none';
  }
  return occupants
    .map((item) => `${item.pid}:${item.processName || 'unknown'}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

function comparePortInspection(
  group: DiffGroup,
  left: SidecarPortInspectionPayload | undefined,
  right: SidecarPortInspectionPayload | undefined,
): DiffEntry[] {
  const lines: DiffEntry[] = [];
  lines.push(buildDiffEntry(
    group,
    'portInspection.port',
    String(left?.port ?? 'undefined'),
    String(right?.port ?? 'undefined'),
  ));
  lines.push(buildDiffEntry(
    group,
    'portInspection.listening',
    String(left?.listening ?? 'undefined'),
    String(right?.listening ?? 'undefined'),
  ));
  lines.push(buildDiffEntry(
    group,
    'portInspection.hasConflict',
    String(left?.hasConflict ?? 'undefined'),
    String(right?.hasConflict ?? 'undefined'),
  ));
  lines.push(buildDiffEntry(
    group,
    'portInspection.managedPid',
    String(left?.managedPid ?? 'null'),
    String(right?.managedPid ?? 'null'),
  ));
  lines.push(buildDiffEntry(
    group,
    'portInspection.occupants.count',
    String(left?.occupants.length ?? 0),
    String(right?.occupants.length ?? 0),
  ));
  lines.push(buildDiffEntry(
    group,
    'portInspection.occupants.summary',
    formatPortOccupantSummary(left?.occupants),
    formatPortOccupantSummary(right?.occupants),
  ));
  return lines;
}

export function buildPortConflictServiceSummary(
  inspection: SidecarPortInspectionPayload | undefined,
): PortConflictServiceSummaryPayload {
  if (!inspection) {
    return {
      port: null,
      listening: null,
      hasConflict: null,
      managedPid: null,
      occupants: 0,
      occupantPids: [],
    };
  }

  const occupantPids = inspection.occupants
    .map((item) => item.pid)
    .sort((a, b) => a - b);

  return {
    port: inspection.port,
    listening: inspection.listening,
    hasConflict: inspection.hasConflict,
    managedPid: inspection.managedPid ?? null,
    occupants: inspection.occupants.length,
    occupantPids,
  };
}

export function comparePortConflictSummary(
  left: PortConflictSummaryPayload | undefined | null,
  right: PortConflictSummaryPayload | undefined | null,
): DiffEntry[] {
  const lines: DiffEntry[] = [];
  const services: ServiceKey[] = ['node', 'python'];

  for (const service of services) {
    const leftService = left?.[service];
    const rightService = right?.[service];
    lines.push(buildDiffEntry(
      'meta',
      `portConflictSummary.${service}.hasConflict`,
      String(leftService?.hasConflict ?? 'null'),
      String(rightService?.hasConflict ?? 'null'),
    ));
    lines.push(buildDiffEntry(
      'meta',
      `portConflictSummary.${service}.listening`,
      String(leftService?.listening ?? 'null'),
      String(rightService?.listening ?? 'null'),
    ));
    lines.push(buildDiffEntry(
      'meta',
      `portConflictSummary.${service}.occupants`,
      String(leftService?.occupants ?? 0),
      String(rightService?.occupants ?? 0),
    ));
    lines.push(buildDiffEntry(
      'meta',
      `portConflictSummary.${service}.managedPid`,
      String(leftService?.managedPid ?? 'null'),
      String(rightService?.managedPid ?? 'null'),
    ));
    lines.push(buildDiffEntry(
      'meta',
      `portConflictSummary.${service}.occupantPids`,
      leftService?.occupantPids.join('|') || 'none',
      rightService?.occupantPids.join('|') || 'none',
    ));
  }

  return lines;
}

function compareServiceDiagnostics(
  group: DiffGroup,
  left: ServiceDiagnosticsPayload,
  right: ServiceDiagnosticsPayload,
): DiffEntry[] {
  const lines: DiffEntry[] = [];
  const leftStatus = left.status;
  const rightStatus = right.status;

  lines.push(buildDiffEntry(group, 'running', String(leftStatus.running), String(rightStatus.running)));
  lines.push(buildDiffEntry(group, 'healthy', String(leftStatus.healthy), String(rightStatus.healthy)));
  lines.push(buildDiffEntry(group, 'managed', String(leftStatus.managed), String(rightStatus.managed)));
  lines.push(buildDiffEntry(group, 'pid', String(leftStatus.pid ?? 'null'), String(rightStatus.pid ?? 'null')));

  const leftHealthStatus = left.health?.status ?? 'unknown';
  const rightHealthStatus = right.health?.status ?? 'unknown';
  lines.push(buildDiffEntry(group, 'health.status', leftHealthStatus, rightHealthStatus));

  const leftVersion = left.health?.version ?? 'unknown';
  const rightVersion = right.health?.version ?? 'unknown';
  lines.push(buildDiffEntry(group, 'health.version', leftVersion, rightVersion));

  const leftUptime = typeof left.health?.uptimeSec === 'number' ? left.health.uptimeSec : null;
  const rightUptime = typeof right.health?.uptimeSec === 'number' ? right.health.uptimeSec : null;
  lines.push(buildDiffEntry(group, 'health.uptimeSec', String(leftUptime ?? 'null'), String(rightUptime ?? 'null')));

  lines.push(...comparePortInspection(group, left.portInspection, right.portInspection));
  lines.push(...compareDeps(group, left.health?.deps, right.health?.deps));
  if (group === 'python') {
    lines.push(...compareOcrDetails(group, left.health?.ocr, right.health?.ocr));
  }
  return lines;
}

export function buildDiagnosticsDiff(left: ParsedDiagnosticsFile, right: ParsedDiagnosticsFile): {
  summary: string;
  lines: string[];
  entries: DiffEntry[];
} {
  const entries: DiffEntry[] = [];
  const leftSchemaVersion = left.payload.schemaVersion ?? 'unknown';
  const rightSchemaVersion = right.payload.schemaVersion ?? 'unknown';
  entries.push(buildDiffEntry('meta', 'schemaVersion', leftSchemaVersion, rightSchemaVersion));
  const leftAppVersion = left.payload.appVersion ?? 'unknown';
  const rightAppVersion = right.payload.appVersion ?? 'unknown';
  entries.push(buildDiffEntry('meta', 'appVersion', leftAppVersion, rightAppVersion));
  entries.push(buildDiffEntry('meta', 'exportedAt', left.payload.exportedAt ?? 'null', right.payload.exportedAt ?? 'null'));
  entries.push(...comparePortConflictSummary(left.payload.portConflictSummary, right.payload.portConflictSummary));

  entries.push(...compareServiceDiagnostics('node', left.diagnostics.node, right.diagnostics.node));
  entries.push(...compareServiceDiagnostics('python', left.diagnostics.python, right.diagnostics.python));

  const lines = entries.filter((entry) => entry.changed).map((entry) => entry.line);

  return {
    summary: lines.length === 0
      ? `Comparison done: ${left.name} vs ${right.name}, no differences`
      : `Comparison done: ${lines.length} changed fields`,
    lines,
    entries,
  };
}
