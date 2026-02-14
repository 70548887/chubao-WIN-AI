import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import { analyzeCodingProgress } from './skills/coding';

type ActiveTab = 'chat' | 'automation' | 'settings';
type ServiceKey = 'node' | 'python';
type IssueFilter = 'all' | 'issues' | 'offline' | 'external' | 'errors';
type SummaryMode = 'compact' | 'detailed';

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
  managed: boolean;
  pid: number | null;
  port: number;
  endpoint: string;
  lastError: string | null;
}

interface SidecarStatusResponse {
  node: SidecarServiceStatus;
  python: SidecarServiceStatus;
}

interface SidecarLogsResponse {
  service: ServiceKey;
  lines: string[];
}

interface PythonOcrDependenciesPayload {
  paddleocr?: boolean;
  paddle?: boolean;
}

interface PythonOcrHealthPayload {
  dependencies?: PythonOcrDependenciesPayload;
  engineInitialized?: boolean;
  apiVersion?: string;
  lastError?: string | null;
}

interface ServiceHealthPayload {
  status?: string;
  service?: string;
  version?: string;
  uptimeSec?: number;
  timestamp?: string;
  deps?: Record<string, string>;
  ocr?: PythonOcrHealthPayload;
}

interface ServiceDiagnosticsPayload {
  status: SidecarServiceStatus;
  health: ServiceHealthPayload | null;
  healthError: string | null;
}

interface SidecarDiagnosticsResponse {
  node: ServiceDiagnosticsPayload;
  python: ServiceDiagnosticsPayload;
}

interface AppHealthPayload {
  status: string;
  app: string;
  version: string;
}

interface CodingCommitItem {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

interface CodingProgressCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  conflicted: number;
  totalFiles: number;
}

interface CodingProgressPayload {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  counts: CodingProgressCounts;
  changedFiles: string[];
  lastCommit: CodingCommitItem | null;
  recentCommits: CodingCommitItem[];
  commitCountSince: number;
  sinceDays: number;
  generatedAt: string;
}

interface CodingProgressResponse {
  success: boolean;
  progress?: CodingProgressPayload;
  message?: string;
}

interface DiagnosticsExportPayload {
  schemaVersion?: string;
  exportedAt?: string;
  app?: string;
  appVersion?: string | null;
  diagnostics?: SidecarDiagnosticsResponse;
  node?: ServiceDiagnosticsPayload;
  python?: ServiceDiagnosticsPayload;
}

interface ParsedDiagnosticsFile {
  name: string;
  payload: DiagnosticsExportPayload;
  diagnostics: SidecarDiagnosticsResponse;
}

interface DiagnosticsDiffPayload {
  schemaVersion: string;
  comparedAt: string;
  baseline: {
    fileName: string;
    exportedAt: string | null;
    appVersion: string | null;
  };
  target: {
    fileName: string;
    exportedAt: string | null;
    appVersion: string | null;
  };
  summary: string;
  diffCount: number;
  lineCount: number;
  scope: 'all' | 'filtered';
  filterState?: {
    group: 'all' | DiffGroup;
    onlyChanged: boolean;
    keywords: string[];
  };
  lines: string[];
}

type DiffGroup = 'meta' | 'node' | 'python';

interface DiffEntry {
  group: DiffGroup;
  field: string;
  before: string;
  after: string;
  changed: boolean;
  line: string;
}

interface CompareEntryFilterState {
  groupFilter: 'all' | DiffGroup;
  onlyChanged: boolean;
  keywords: string[];
}

const ISSUE_FILTER_LABELS: Record<IssueFilter, string> = {
  all: '全部服务',
  issues: '异常服务',
  offline: '离线/未健康',
  external: '外部托管',
  errors: '仅错误信息',
};

const DIFF_GROUP_LABELS: Record<DiffGroup, string> = {
  meta: '元信息',
  node: 'Node',
  python: 'Python',
};

const COMPARE_FIELD_PRESET_TAGS = [
  { label: 'deps', value: 'deps' },
  { label: 'health', value: 'health' },
  { label: 'pid', value: 'pid' },
  { label: 'managed', value: 'managed' },
] as const;

const CODING_VELOCITY_LABELS = {
  low: 'Low velocity',
  medium: 'Medium velocity',
  high: 'High velocity',
} as const;

const COMPARE_HISTORY_MAX_ITEMS = 8;
const COMPARE_HISTORY_STORAGE_KEY = 'chubao.compare.filter.history.v1';

interface CompareFilterHistoryItem {
  id: string;
  tags: string[];
  query: string;
  pinned: boolean;
  updatedAt: number;
}

interface ServiceIssueFlags {
  hasError: boolean;
  offlineOrUnhealthy: boolean;
  externalManaged: boolean;
  hasIssue: boolean;
}

function getServiceIssueFlags(diagnostics: ServiceDiagnosticsPayload): ServiceIssueFlags {
  const status = diagnostics.status;
  const hasError = Boolean(status.lastError || diagnostics.healthError);
  const offlineOrUnhealthy = !status.healthy;
  const externalManaged = !status.managed && status.healthy;
  return {
    hasError,
    offlineOrUnhealthy,
    externalManaged,
    hasIssue: hasError || offlineOrUnhealthy || externalManaged,
  };
}

function matchesIssueFilter(diagnostics: ServiceDiagnosticsPayload, issueFilter: IssueFilter): boolean {
  const flags = getServiceIssueFlags(diagnostics);
  switch (issueFilter) {
    case 'all':
      return true;
    case 'offline':
      return flags.offlineOrUnhealthy;
    case 'external':
      return flags.externalManaged;
    case 'errors':
      return flags.hasError;
    case 'issues':
    default:
      return flags.hasIssue;
  }
}

function normalizeCompareKeyword(input: string): string {
  return input.trim().toLowerCase();
}

function collectCompareKeywords(query: string, tags: string[]): string[] {
  const queryTokens = query
    .split(/[\s,]+/)
    .map((token) => normalizeCompareKeyword(token))
    .filter((token) => token.length > 0);
  const tagTokens = tags.map((tag) => normalizeCompareKeyword(tag)).filter((token) => token.length > 0);
  return Array.from(new Set([...tagTokens, ...queryTokens]));
}

function buildCompareHistoryLabel(item: CompareFilterHistoryItem): string {
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

function sortCompareHistoryItems(items: CompareFilterHistoryItem[]): CompareFilterHistoryItem[] {
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

function filterCompareEntries(entries: DiffEntry[], state: CompareEntryFilterState): DiffEntry[] {
  return entries.filter((entry) => {
    if (state.groupFilter !== 'all' && entry.group !== state.groupFilter) {
      return false;
    }
    if (state.onlyChanged && !entry.changed) {
      return false;
    }
    if (state.keywords.length > 0) {
      const haystack = `${entry.field} ${entry.before} ${entry.after} ${entry.line}`.toLowerCase();
      const allMatched = state.keywords.every((keyword) => haystack.includes(keyword));
      if (!allMatched) {
        return false;
      }
    }
    return true;
  });
}

function buildCompareDiffText(payload: DiagnosticsDiffPayload): string {
  const keywords = payload.filterState?.keywords ?? [];
  const filterSummary = payload.filterState
    ? `filter=group:${payload.filterState.group},onlyChanged:${payload.filterState.onlyChanged},keywords:${keywords.join('+') || 'none'}`
    : 'filter=none';
  return [
    `${payload.summary}`,
    `scope=${payload.scope}`,
    `diffCount=${payload.diffCount}`,
    `lineCount=${payload.lineCount}`,
    `baseline=${payload.baseline.fileName}`,
    `target=${payload.target.fileName}`,
    filterSummary,
    ...payload.lines,
  ].join('\n');
}

function coerceDiagnosticsPayload(payload: DiagnosticsExportPayload): SidecarDiagnosticsResponse | null {
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

  lines.push(...compareDeps(group, left.health?.deps, right.health?.deps));
  return lines;
}

function buildDiagnosticsDiff(left: ParsedDiagnosticsFile, right: ParsedDiagnosticsFile): {
  summary: string;
  lines: string[];
  entries: DiffEntry[];
} {
  const entries: DiffEntry[] = [];
  const leftAppVersion = left.payload.appVersion ?? 'unknown';
  const rightAppVersion = right.payload.appVersion ?? 'unknown';
  entries.push(buildDiffEntry('meta', 'appVersion', leftAppVersion, rightAppVersion));
  entries.push(buildDiffEntry('meta', 'exportedAt', left.payload.exportedAt ?? 'null', right.payload.exportedAt ?? 'null'));

  entries.push(...compareServiceDiagnostics('node', left.diagnostics.node, right.diagnostics.node));
  entries.push(...compareServiceDiagnostics('python', left.diagnostics.python, right.diagnostics.python));

  const lines = entries.filter((entry) => entry.changed).map((entry) => entry.line);

  return {
    summary: lines.length === 0
      ? `对比完成：${left.name} 与 ${right.name} 无差异`
      : `对比完成：发现 ${lines.length} 处差异`,
    lines,
    entries,
  };
}

function sanitizeFileToken(input: string): string {
  const withoutExt = input.replace(/\.[^.]+$/, '');
  const normalized = withoutExt
    .replace(/[^a-zA-Z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized.slice(0, 40) || 'file';
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/sk-ant-[A-Za-z0-9\-_]+/g, 'sk-ant-***')
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(token\s*[:=]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(secret\s*[:=]\s*)([^\s,;]+)/gi, '$1***');
}

function redactSensitiveData<T>(input: T): T {
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
  const [diagnostics, setDiagnostics] = useState<SidecarDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<Record<ServiceKey, boolean>>({
    node: false,
    python: false,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [logService, setLogService] = useState<ServiceKey | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [redactExport, setRedactExport] = useState(true);
  const [includeLogsExport, setIncludeLogsExport] = useState(false);
  const [exportLogLimit, setExportLogLimit] = useState(80);
  const [selectedExportLogServices, setSelectedExportLogServices] = useState<Record<ServiceKey, boolean>>({
    node: true,
    python: true,
  });
  const [copyingSummary, setCopyingSummary] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('compact');
  const [copyCurrentFilterOnly, setCopyCurrentFilterOnly] = useState(true);
  const [appMeta, setAppMeta] = useState<AppHealthPayload | null>(null);
  const [codingProgress, setCodingProgress] = useState<CodingProgressPayload | null>(null);
  const [codingLoading, setCodingLoading] = useState(false);
  const [codingError, setCodingError] = useState<string | null>(null);
  const [codingSinceDays, setCodingSinceDays] = useState(7);
  const [codingMaxFiles, setCodingMaxFiles] = useState(30);
  const [codingIncludeUntracked, setCodingIncludeUntracked] = useState(true);
  const [compareLeftFile, setCompareLeftFile] = useState<ParsedDiagnosticsFile | null>(null);
  const [compareRightFile, setCompareRightFile] = useState<ParsedDiagnosticsFile | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareSummary, setCompareSummary] = useState<string | null>(null);
  const [compareEntries, setCompareEntries] = useState<DiffEntry[]>([]);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareOnlyChanged, setCompareOnlyChanged] = useState(true);
  const [compareGroupFilter, setCompareGroupFilter] = useState<'all' | DiffGroup>('all');
  const [compareFieldQuery, setCompareFieldQuery] = useState('');
  const [compareActiveTags, setCompareActiveTags] = useState<string[]>([]);
  const [compareCopyCurrentFilterOnly, setCompareCopyCurrentFilterOnly] = useState(true);
  const [compareHistoryPinnedOnly, setCompareHistoryPinnedOnly] = useState(false);
  const [compareRecentFilters, setCompareRecentFilters] = useState<CompareFilterHistoryItem[]>([]);
  const [compareGroupCollapsed, setCompareGroupCollapsed] = useState<Record<DiffGroup, boolean>>({
    meta: false,
    node: false,
    python: false,
  });
  const [compareCopying, setCompareCopying] = useState(false);
  const [compareCopied, setCompareCopied] = useState(false);
  const [compareExporting, setCompareExporting] = useState(false);
  const [compareTextExporting, setCompareTextExporting] = useState(false);
  const refreshingRef = useRef(false);
  const summaryCopiedTimerRef = useRef<number | null>(null);
  const compareCopiedTimerRef = useRef<number | null>(null);

  const loadStatus = useCallback(async (ensure: boolean, silent = false) => {
    if (refreshingRef.current) {
      return;
    }

    refreshingRef.current = true;
    if (!silent) {
      setRefreshing(true);
    }

    try {
      if (ensure) {
        await invoke<SidecarStatusResponse>('ensure_sidecars');
      }
      const data = await invoke<SidecarDiagnosticsResponse>('sidecar_diagnostics');
      setDiagnostics(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, []);

  const loadCodingProgress = useCallback(async () => {
    setCodingLoading(true);
    try {
      const params = new URLSearchParams({
        sinceDays: String(Math.min(365, Math.max(1, Math.trunc(codingSinceDays)))),
        maxFiles: String(Math.min(200, Math.max(1, Math.trunc(codingMaxFiles)))),
        includeUntracked: codingIncludeUntracked ? 'true' : 'false',
      });
      const response = await fetch(`http://localhost:3100/api/coding/progress?${params.toString()}`);
      const data = (await response.json()) as CodingProgressResponse;
      if (!response.ok || data.success !== true || !data.progress) {
        throw new Error(data.message ?? `request failed: ${response.status}`);
      }
      setCodingProgress(data.progress);
      setCodingError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCodingError(message);
    } finally {
      setCodingLoading(false);
    }
  }, [codingSinceDays, codingMaxFiles, codingIncludeUntracked]);

  const loadLogs = useCallback(async (service: ServiceKey) => {
    setLogService(service);
    setLogLoading(true);
    try {
      const data = await invoke<SidecarLogsResponse>('sidecar_logs', {
        service,
        limit: 120,
      });
      setLogs(data.lines);
      setLogError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLogError(message);
    } finally {
      setLogLoading(false);
    }
  }, []);

  const restartService = useCallback(async (service: ServiceKey) => {
    setActionBusy((prev) => ({ ...prev, [service]: true }));
    try {
      await invoke<SidecarStatusResponse>('restart_sidecar', { service });
      const diagnosticsData = await invoke<SidecarDiagnosticsResponse>('sidecar_diagnostics');
      setDiagnostics(diagnosticsData);
      setError(null);
      if (logService === service) {
        await loadLogs(service);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setActionBusy((prev) => ({ ...prev, [service]: false }));
    }
  }, [loadLogs, logService]);

  useEffect(() => {
    void loadStatus(true);
    const timer = window.setInterval(() => {
      void loadStatus(false, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    void loadCodingProgress();
  }, [loadCodingProgress]);

  useEffect(() => () => {
    if (summaryCopiedTimerRef.current !== null) {
      window.clearTimeout(summaryCopiedTimerRef.current);
    }
    if (compareCopiedTimerRef.current !== null) {
      window.clearTimeout(compareCopiedTimerRef.current);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_HISTORY_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Array<Partial<CompareFilterHistoryItem>>;
      if (!Array.isArray(parsed)) {
        return;
      }
      const now = Date.now();
      const sanitized = parsed
        .filter((item) => item && typeof item.id === 'string' && Array.isArray(item.tags) && typeof item.query === 'string')
        .map((item, index) => ({
          id: item.id as string,
          tags: (item.tags as string[]).map((tag) => normalizeCompareKeyword(tag)).filter((tag) => tag.length > 0),
          query: item.query as string,
          pinned: item.pinned === true,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now - index,
        }))
        .slice(0, COMPARE_HISTORY_MAX_ITEMS);
      setCompareRecentFilters(sortCompareHistoryItems(sanitized));
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPARE_HISTORY_STORAGE_KEY, JSON.stringify(compareRecentFilters));
    } catch {
      // ignore storage write errors
    }
  }, [compareRecentFilters]);

  const loadCompareFile = useCallback(async (file: File, side: 'left' | 'right') => {
    setCompareBusy(true);
    try {
      const content = await file.text();
      const payload = JSON.parse(content) as DiagnosticsExportPayload;
      const diagnosticsPayload = coerceDiagnosticsPayload(payload);
      if (!diagnosticsPayload) {
        throw new Error(`文件 ${file.name} 不是可识别的诊断 JSON`);
      }

      const parsed: ParsedDiagnosticsFile = {
        name: file.name,
        payload,
        diagnostics: diagnosticsPayload,
      };
      if (side === 'left') {
        setCompareLeftFile(parsed);
      } else {
        setCompareRightFile(parsed);
      }

      setCompareError(null);
      setCompareSummary(null);
      setCompareEntries([]);
      setCompareCopied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompareError(message);
    } finally {
      setCompareBusy(false);
    }
  }, []);

  const runDiagnosticsCompare = useCallback(() => {
    if (!compareLeftFile || !compareRightFile) {
      setCompareError('请先选择两份诊断文件再执行对比');
      return;
    }

    setCompareBusy(true);
    try {
      const result = buildDiagnosticsDiff(compareLeftFile, compareRightFile);
      setCompareSummary(result.summary);
      setCompareEntries(result.entries);
      setCompareGroupCollapsed({
        meta: false,
        node: false,
        python: false,
      });
      setCompareCopied(false);
      setCompareError(null);
    } finally {
      setCompareBusy(false);
    }
  }, [compareLeftFile, compareRightFile]);

  const buildCurrentDiffPayload = useCallback((filteredOnly = compareCopyCurrentFilterOnly): DiagnosticsDiffPayload | null => {
    if (!compareLeftFile || !compareRightFile) {
      return null;
    }
    const result = buildDiagnosticsDiff(compareLeftFile, compareRightFile);
    const keywords = collectCompareKeywords(compareFieldQuery, compareActiveTags);
    const filterState: CompareEntryFilterState = {
      groupFilter: compareGroupFilter,
      onlyChanged: compareOnlyChanged,
      keywords,
    };
    const scopedEntries = filteredOnly
      ? filterCompareEntries(result.entries, filterState)
      : result.entries;
    const scopedLines = scopedEntries.map((entry) => entry.line);
    const scopedChangedCount = scopedEntries.filter((entry) => entry.changed).length;
    const scope = filteredOnly ? 'filtered' : 'all';
    const scopeSummary = filteredOnly
      ? `${result.summary} | scope=filtered(${scopedEntries.length}/${result.entries.length})`
      : result.summary;

    return {
      schemaVersion: 'diagnostics-diff.v1',
      comparedAt: new Date().toISOString(),
      baseline: {
        fileName: compareLeftFile.name,
        exportedAt: compareLeftFile.payload.exportedAt ?? null,
        appVersion: compareLeftFile.payload.appVersion ?? null,
      },
      target: {
        fileName: compareRightFile.name,
        exportedAt: compareRightFile.payload.exportedAt ?? null,
        appVersion: compareRightFile.payload.appVersion ?? null,
      },
      summary: scopeSummary,
      diffCount: scopedChangedCount,
      lineCount: scopedLines.length,
      scope,
      filterState: filteredOnly
        ? {
          group: compareGroupFilter,
          onlyChanged: compareOnlyChanged,
          keywords,
        }
        : undefined,
      lines: scopedLines,
    };
  }, [
    compareCopyCurrentFilterOnly,
    compareLeftFile,
    compareRightFile,
    compareFieldQuery,
    compareActiveTags,
    compareGroupFilter,
    compareOnlyChanged,
  ]);

  const copyCompareDiff = useCallback(async () => {
    setCompareCopying(true);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板写入');
      }
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error('请先选择两份诊断文件');
      }

      const text = buildCompareDiffText(diffPayload);
      await navigator.clipboard.writeText(text);
      setCompareError(null);
      setCompareCopied(true);
      if (compareCopiedTimerRef.current !== null) {
        window.clearTimeout(compareCopiedTimerRef.current);
      }
      compareCopiedTimerRef.current = window.setTimeout(() => {
        setCompareCopied(false);
      }, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompareError(message);
    } finally {
      setCompareCopying(false);
    }
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly]);

  const exportCompareDiff = useCallback(() => {
    setCompareExporting(true);
    try {
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error('请先选择两份诊断文件');
      }

      const blob = new Blob([JSON.stringify(diffPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const leftName = sanitizeFileToken(diffPayload.baseline.fileName);
      const rightName = sanitizeFileToken(diffPayload.target.fileName);
      const scopeToken = diffPayload.scope === 'filtered' ? 'filtered' : 'all';
      link.href = url;
      link.download = `chubao-diagnostics-diff-${scopeToken}-${leftName}-to-${rightName}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setCompareError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompareError(message);
    } finally {
      setCompareExporting(false);
    }
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly]);

  const exportCompareText = useCallback(() => {
    setCompareTextExporting(true);
    try {
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error('请先选择两份诊断文件');
      }

      const text = buildCompareDiffText(diffPayload);
      const blob = new Blob([text], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const leftName = sanitizeFileToken(diffPayload.baseline.fileName);
      const rightName = sanitizeFileToken(diffPayload.target.fileName);
      const scopeToken = diffPayload.scope === 'filtered' ? 'filtered' : 'all';
      link.href = url;
      link.download = `chubao-diagnostics-diff-${scopeToken}-${leftName}-to-${rightName}-${timestamp}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setCompareError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompareError(message);
    } finally {
      setCompareTextExporting(false);
    }
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly]);

  const toggleCompareTag = useCallback((tag: string) => {
    const normalized = normalizeCompareKeyword(tag);
    setCompareActiveTags((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  }, []);

  const saveCurrentCompareFilter = useCallback(() => {
    const normalizedTags = Array.from(new Set(compareActiveTags.map((tag) => normalizeCompareKeyword(tag))))
      .filter((tag) => tag.length > 0)
      .sort();
    const query = compareFieldQuery.trim();
    if (normalizedTags.length === 0 && query.length === 0) {
      return;
    }

    setCompareRecentFilters((prev) => {
      const existing = prev.find((item) => item.query === query && item.tags.join('|') === normalizedTags.join('|'));
      const deduped = prev.filter((item) => !(item.query === query && item.tags.join('|') === normalizedTags.join('|')));
      const next: CompareFilterHistoryItem = {
        id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tags: normalizedTags,
        query,
        pinned: existing?.pinned ?? false,
        updatedAt: Date.now(),
      };
      return sortCompareHistoryItems([next, ...deduped]).slice(0, COMPARE_HISTORY_MAX_ITEMS);
    });
  }, [compareActiveTags, compareFieldQuery]);

  const applyCompareHistory = useCallback((item: CompareFilterHistoryItem) => {
    setCompareActiveTags(item.tags);
    setCompareFieldQuery(item.query);
    setCompareRecentFilters((prev) => sortCompareHistoryItems(
      prev.map((candidate) => (
        candidate.id === item.id
          ? { ...candidate, updatedAt: Date.now() }
          : candidate
      )),
    ));
  }, []);

  const removeCompareHistory = useCallback((id: string) => {
    setCompareRecentFilters((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompareHistoryUnpinned = useCallback(() => {
    const shouldClear = window.confirm('确认仅清空未固定的最近筛选吗？固定项会保留。');
    if (!shouldClear) {
      return;
    }
    setCompareRecentFilters((prev) => prev.filter((item) => item.pinned));
  }, []);

  const clearCompareHistoryAll = useCallback(() => {
    const shouldClear = window.confirm('确认清空全部最近筛选吗？此操作不可撤销。');
    if (!shouldClear) {
      return;
    }
    setCompareRecentFilters([]);
    setCompareHistoryPinnedOnly(false);
  }, []);

  const toggleCompareHistoryPin = useCallback((id: string) => {
    setCompareRecentFilters((prev) => sortCompareHistoryItems(
      prev.map((item) => (
        item.id === id
          ? { ...item, pinned: !item.pinned, updatedAt: Date.now() }
          : item
      )),
    ));
  }, []);

  const moveCompareHistoryToTop = useCallback((id: string) => {
    setCompareRecentFilters((prev) => sortCompareHistoryItems(
      prev.map((item) => (
        item.id === id
          ? { ...item, updatedAt: Date.now() }
          : item
      )),
    ));
  }, []);

  useEffect(() => {
    let active = true;
    invoke<AppHealthPayload>('health')
      .then((data) => {
        if (active) {
          setAppMeta(data);
        }
      })
      .catch(() => {
        // no-op: allow export without app metadata
      });
    return () => {
      active = false;
    };
  }, []);

  const services = diagnostics
    ? ([
      { key: 'node' as const, label: 'Node.js 后端', diagnostics: diagnostics.node },
      { key: 'python' as const, label: 'Python 自动化', diagnostics: diagnostics.python },
    ])
    : [];

  const exportDiagnostics = useCallback(async () => {
    if (!diagnostics) {
      return;
    }

    setExporting(true);
    try {
      const safeLogLimit = Number.isFinite(exportLogLimit)
        ? Math.min(500, Math.max(1, Math.trunc(exportLogLimit)))
        : 80;
      const selectedLogServices = (['node', 'python'] as ServiceKey[]).filter(
        (service) => selectedExportLogServices[service],
      );
      let exportLogs: Partial<Record<ServiceKey, string[]>> | null = null;
      const exportLogErrors: Partial<Record<ServiceKey, string>> = {};

      if (includeLogsExport && selectedLogServices.length > 0) {
        const results = await Promise.allSettled(
          selectedLogServices.map((service) => invoke<SidecarLogsResponse>('sidecar_logs', {
            service,
            limit: safeLogLimit,
          })),
        );

        exportLogs = {};
        results.forEach((result, index) => {
          const service = selectedLogServices[index];
          if (result.status === 'fulfilled') {
            exportLogs![service] = result.value.lines;
          } else {
            exportLogErrors[service] = result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          }
        });
      }

      const payload = {
        schemaVersion: 'diagnostics.v1.1',
        exportedAt: new Date().toISOString(),
        app: appMeta?.app ?? 'unknown',
        appVersion: appMeta?.version ?? null,
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
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filenameMode = redactExport ? 'redacted' : 'raw';
      const filenameLogs = includeLogsExport && selectedLogServices.length > 0
        ? `logs-${selectedLogServices.join('-')}-${safeLogLimit}`
        : 'nologs';
      link.href = url;
      link.download = `chubao-diagnostics-${issueFilter}-${filenameMode}-${filenameLogs}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [diagnostics, redactExport, includeLogsExport, exportLogLimit, selectedExportLogServices, issueFilter, appMeta]);

  const copyDiagnosticsSummary = useCallback(async () => {
    if (!diagnostics) {
      return;
    }

    setCopyingSummary(true);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板写入');
      }

      const summaryServices = copyCurrentFilterOnly
        ? services.filter((item) => matchesIssueFilter(item.diagnostics, issueFilter))
        : services;
      const lines = summaryServices.map((item) => {
        const status = item.diagnostics.status;
        const flags = getServiceIssueFlags(item.diagnostics);
        const healthStatus = item.diagnostics.health?.status ?? 'unknown';
        const managedBy = status.managed ? 'tauri' : status.healthy ? 'external' : 'none';
        const issues = [
          flags.offlineOrUnhealthy ? 'unhealthy' : null,
          flags.externalManaged ? 'external' : null,
          flags.hasError ? 'error' : null,
        ]
          .filter(Boolean)
          .join('|') || 'none';
        if (summaryMode === 'detailed') {
          const deps = item.diagnostics.health?.deps
            ? Object.entries(item.diagnostics.health.deps).map(([k, v]) => `${k}:${v}`).join(',')
            : 'none';
          const version = item.diagnostics.health?.version ?? 'unknown';
          const uptime = typeof item.diagnostics.health?.uptimeSec === 'number'
            ? item.diagnostics.health.uptimeSec
            : 'unknown';
          const errors = [status.lastError, item.diagnostics.healthError]
            .filter(Boolean)
            .join(' | ') || 'none';
          return `${item.label}: running=${status.running}, healthy=${status.healthy}, managed=${managedBy}, pid=${status.pid ?? 'null'}, health=${healthStatus}, version=${version}, uptimeSec=${uptime}, deps=${deps}, issues=${issues}, errors=${errors}`;
        }

        return `${item.label}: running=${status.running}, healthy=${status.healthy}, managed=${managedBy}, pid=${status.pid ?? 'null'}, health=${healthStatus}, issues=${issues}`;
      });

      const summary = [
        `chubao diagnostics summary @ ${new Date().toISOString()}`,
        `appVersion=${appMeta?.version ?? 'unknown'}`,
        `mode=${summaryMode}`,
        `scope=${copyCurrentFilterOnly ? 'filtered' : 'all'}`,
        `filter=${issueFilter}(${ISSUE_FILTER_LABELS[issueFilter]})`,
        ...lines,
      ].join('\n');

      await navigator.clipboard.writeText(summary);
      setCopyError(null);
      setSummaryCopied(true);
      if (summaryCopiedTimerRef.current !== null) {
        window.clearTimeout(summaryCopiedTimerRef.current);
      }
      summaryCopiedTimerRef.current = window.setTimeout(() => {
        setSummaryCopied(false);
      }, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCopyError(message);
    } finally {
      setCopyingSummary(false);
    }
  }, [diagnostics, issueFilter, services, summaryMode, copyCurrentFilterOnly, appMeta]);

  const codingInsights = useMemo(
    () => (codingProgress ? analyzeCodingProgress(codingProgress) : null),
    [codingProgress],
  );
  const servicesToShow = services.filter((item) => matchesIssueFilter(item.diagnostics, issueFilter));
  const issueServiceCount = services.filter((item) => getServiceIssueFlags(item.diagnostics).hasIssue).length;
  const normalizedCompareQuery = compareFieldQuery.trim().toLowerCase();
  const compareKeywords = collectCompareKeywords(compareFieldQuery, compareActiveTags);
  const hasCompareFilter = compareActiveTags.length > 0 || normalizedCompareQuery.length > 0;
  const compareFilterState: CompareEntryFilterState = {
    groupFilter: compareGroupFilter,
    onlyChanged: compareOnlyChanged,
    keywords: compareKeywords,
  };
  const filteredCompareEntries = filterCompareEntries(compareEntries, compareFilterState);
  const groupedCompareEntries: Record<DiffGroup, DiffEntry[]> = {
    meta: [],
    node: [],
    python: [],
  };
  filteredCompareEntries.forEach((entry) => {
    groupedCompareEntries[entry.group].push(entry);
  });
  const visibleCompareGroups = (['meta', 'node', 'python'] as DiffGroup[])
    .filter((group) => groupedCompareEntries[group].length > 0);
  const toggleCompareGroup = (group: DiffGroup) => {
    setCompareGroupCollapsed((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };
  const comparePinnedCount = compareRecentFilters.filter((item) => item.pinned).length;
  const compareUnpinnedCount = compareRecentFilters.length - comparePinnedCount;
  const visibleCompareHistoryItems = compareHistoryPinnedOnly
    ? compareRecentFilters.filter((item) => item.pinned)
    : compareRecentFilters;

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
        <h3>Coding Progress (Qoder)</h3>
        <div className="coding-progress-toolbar">
          <label className="status-log-limit">
            <span>sinceDays</span>
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={codingSinceDays}
              disabled={codingLoading}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setCodingSinceDays(Number.isNaN(parsed) ? 1 : Math.min(365, Math.max(1, parsed)));
              }}
            />
          </label>
          <label className="status-log-limit">
            <span>maxFiles</span>
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={codingMaxFiles}
              disabled={codingLoading}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setCodingMaxFiles(Number.isNaN(parsed) ? 1 : Math.min(200, Math.max(1, parsed)));
              }}
            />
          </label>
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={codingIncludeUntracked}
              disabled={codingLoading}
              onChange={(event) => setCodingIncludeUntracked(event.target.checked)}
            />
            <span>include untracked</span>
          </label>
          <button
            className="status-action-btn secondary"
            onClick={() => void loadCodingProgress()}
            disabled={codingLoading}
          >
            {codingLoading ? 'loading...' : 'refresh progress'}
          </button>
        </div>
        {codingError && <div className="status-error">{codingError}</div>}
        {codingProgress && (
          <div className="coding-progress-panel">
            <div className="coding-progress-summary">
              <span>branch: {codingProgress.branch}</span>
              <span>status: {codingProgress.clean ? 'clean' : 'dirty'}</span>
              <span>ahead/behind: {codingProgress.ahead}/{codingProgress.behind}</span>
              <span>commits({codingProgress.sinceDays}d): {codingProgress.commitCountSince}</span>
              <span>generated: {new Date(codingProgress.generatedAt).toLocaleString()}</span>
            </div>
            <div className="coding-progress-summary">
              <span>repo: {codingProgress.repoRoot}</span>
              {codingProgress.upstream && <span>upstream: {codingProgress.upstream}</span>}
              <span>files: {codingProgress.counts.totalFiles}</span>
              <span>staged: {codingProgress.counts.staged}</span>
              <span>unstaged: {codingProgress.counts.unstaged}</span>
              <span>untracked: {codingProgress.counts.untracked}</span>
            </div>
            {codingInsights && (
              <div className="coding-progress-insights">
                <div className="coding-insight-card">
                  <h4>Velocity</h4>
                  <div className={`coding-velocity-pill is-${codingInsights.velocity}`}>
                    {CODING_VELOCITY_LABELS[codingInsights.velocity]}
                  </div>
                  <div className="coding-insight-detail">
                    {codingInsights.commitsPerDay.toFixed(2)} commits/day
                  </div>
                </div>
                <div className="coding-insight-card">
                  <h4>Top Extensions</h4>
                  <div className="coding-insight-list">
                    {codingInsights.topExtensions.length === 0 && (
                      <span className="coding-insight-empty">No changed files</span>
                    )}
                    {codingInsights.topExtensions.map((item) => (
                      <span key={item.ext} className="coding-insight-chip">
                        {item.ext} x{item.count}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="coding-insight-card">
                  <h4>Active Authors</h4>
                  <div className="coding-insight-list">
                    {codingInsights.activeAuthors.length === 0 && (
                      <span className="coding-insight-empty">No commit authors</span>
                    )}
                    {codingInsights.activeAuthors.map((author) => (
                      <span key={author} className="coding-insight-chip">{author}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="coding-progress-grid">
              <div className="coding-progress-card">
                <h4>Changed Files</h4>
                <div className="coding-progress-files">
                  {codingProgress.changedFiles.length === 0 && <div className="logs-empty">No changed files</div>}
                  {codingProgress.changedFiles.map((file) => (
                    <div key={file} className="coding-progress-line">{file}</div>
                  ))}
                </div>
              </div>
              <div className="coding-progress-card">
                <h4>Recent Commits</h4>
                <div className="coding-progress-files">
                  {codingProgress.recentCommits.length === 0 && <div className="logs-empty">No commits</div>}
                  {codingProgress.recentCommits.map((commit) => (
                    <div key={commit.hash} className="coding-progress-line">
                      <strong>{commit.hash.slice(0, 8)}</strong> {commit.subject}
                      <div className="coding-progress-meta">{commit.author} | {new Date(commit.date).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>服务状态</h3>
        {loading && !diagnostics && <div className="status-loading">检测服务状态中...</div>}
        {error && <div className="status-error">{error}</div>}
        {diagnostics && (
          <>
            <div className="status-summary-row">
              <span>异常服务 {issueServiceCount}/{services.length}</span>
              <span>当前筛选：{ISSUE_FILTER_LABELS[issueFilter]}（{servicesToShow.length}）</span>
            </div>
            {servicesToShow.length === 0 && (
              <div className="status-note">当前筛选条件下没有匹配服务。</div>
            )}
            {servicesToShow.map((item) => (
              <ServiceStatusRow
                key={item.key}
                label={item.label}
                serviceKey={item.key}
                diagnostics={item.diagnostics}
                busy={actionBusy[item.key]}
                onRestart={restartService}
                onViewLogs={loadLogs}
              />
            ))}
          </>
        )}
        <div className="status-toolbar">
          <button className="status-refresh-btn" onClick={() => void loadStatus(true)} disabled={refreshing}>
            {refreshing ? '检测中...' : '重新检测'}
          </button>
          <label className="status-filter">
            <span>筛选</span>
            <select
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.target.value as IssueFilter)}
              disabled={!diagnostics}
            >
              <option value="all">{ISSUE_FILTER_LABELS.all}</option>
              <option value="issues">{ISSUE_FILTER_LABELS.issues}</option>
              <option value="offline">{ISSUE_FILTER_LABELS.offline}</option>
              <option value="external">{ISSUE_FILTER_LABELS.external}</option>
              <option value="errors">{ISSUE_FILTER_LABELS.errors}</option>
            </select>
          </label>
          <label className="status-filter">
            <span>摘要</span>
            <select
              value={summaryMode}
              onChange={(event) => setSummaryMode(event.target.value as SummaryMode)}
              disabled={!diagnostics}
            >
              <option value="compact">简版</option>
              <option value="detailed">详细版</option>
            </select>
          </label>
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={copyCurrentFilterOnly}
              disabled={!diagnostics || copyingSummary}
              onChange={(event) => setCopyCurrentFilterOnly(event.target.checked)}
            />
            <span>复制仅当前筛选</span>
          </label>
          <button
            className="status-action-btn secondary"
            onClick={() => void copyDiagnosticsSummary()}
            disabled={!diagnostics || copyingSummary}
          >
            {copyingSummary ? '复制中...' : summaryCopied ? '摘要已复制' : '复制诊断摘要'}
          </button>
          <button
            className={`status-action-btn secondary ${redactExport ? '' : 'danger'}`}
            onClick={() => setRedactExport((prev) => !prev)}
            disabled={!diagnostics || exporting}
            title="关闭后导出内容将保留原始错误文本"
          >
            {redactExport ? '导出已脱敏' : '导出未脱敏'}
          </button>
          <button
            className="status-action-btn secondary"
            onClick={() => void exportDiagnostics()}
            disabled={exporting || !diagnostics}
          >
            {exporting ? '导出中...' : '导出诊断 JSON'}
          </button>
        </div>
        <div className="status-export-options">
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={includeLogsExport}
              disabled={!diagnostics || exporting}
              onChange={(event) => setIncludeLogsExport(event.target.checked)}
            />
            <span>导出附带最近日志</span>
          </label>
          <div className="status-service-picks">
            <label className="status-checkbox">
              <input
                type="checkbox"
                checked={selectedExportLogServices.node}
                disabled={!includeLogsExport || !diagnostics || exporting}
                onChange={(event) => setSelectedExportLogServices((prev) => ({
                  ...prev,
                  node: event.target.checked,
                }))}
              />
              <span>Node</span>
            </label>
            <label className="status-checkbox">
              <input
                type="checkbox"
                checked={selectedExportLogServices.python}
                disabled={!includeLogsExport || !diagnostics || exporting}
                onChange={(event) => setSelectedExportLogServices((prev) => ({
                  ...prev,
                  python: event.target.checked,
                }))}
              />
              <span>Python</span>
            </label>
          </div>
          <label className="status-log-limit">
            <span>日志条数</span>
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
                  setExportLogLimit(1);
                  return;
                }
                setExportLogLimit(Math.min(500, Math.max(1, parsed)));
              }}
            />
          </label>
        </div>
        {copyError && <div className="status-error">{copyError}</div>}
      </div>

      <div className="settings-section">
        <h3>服务日志</h3>
        {!logService && <div className="logs-empty">选择上方服务的“查看日志”以加载输出。</div>}
        {logError && <div className="status-error">{logError}</div>}
        {logService && (
          <div className="logs-panel">
            <div className="logs-toolbar">
              <span className="logs-title">{logService === 'node' ? 'Node.js 后端日志' : 'Python 自动化日志'}</span>
              <button
                className="status-action-btn secondary"
                onClick={() => void loadLogs(logService)}
                disabled={logLoading}
              >
                {logLoading ? '加载中...' : '刷新日志'}
              </button>
            </div>
            <div className="logs-content">
              {logLoading && logs.length === 0 && <div className="logs-empty">日志加载中...</div>}
              {!logLoading && logs.length === 0 && <div className="logs-empty">暂无日志输出</div>}
              {logs.map((line, idx) => (
                <div key={`${idx}-${line.slice(0, 24)}`} className="logs-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>诊断对比（导入 JSON）</h3>
        <div className="compare-toolbar">
          <label className="compare-file">
            <span>基线文件</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={compareBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void loadCompareFile(file, 'left');
                }
                event.currentTarget.value = '';
              }}
            />
            <span className="compare-file-name">{compareLeftFile?.name ?? '未选择'}</span>
          </label>
          <label className="compare-file">
            <span>目标文件</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={compareBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void loadCompareFile(file, 'right');
                }
                event.currentTarget.value = '';
              }}
            />
            <span className="compare-file-name">{compareRightFile?.name ?? '未选择'}</span>
          </label>
          <button
            className="status-action-btn secondary"
            onClick={() => runDiagnosticsCompare()}
            disabled={compareBusy || !compareLeftFile || !compareRightFile}
          >
            {compareBusy ? '对比中...' : '执行对比'}
          </button>
          <button
            className="status-action-btn secondary"
            onClick={() => void copyCompareDiff()}
            disabled={compareCopying || !compareLeftFile || !compareRightFile}
          >
            {compareCopying ? '复制中...' : compareCopied ? '差异已复制' : '复制差异'}
          </button>
          <button
            className="status-action-btn secondary"
            onClick={() => exportCompareDiff()}
            disabled={compareExporting || !compareLeftFile || !compareRightFile}
          >
            {compareExporting ? '导出中...' : '导出 diff.json'}
          </button>
          <button
            className="status-action-btn secondary"
            onClick={() => exportCompareText()}
            disabled={compareTextExporting || !compareLeftFile || !compareRightFile}
          >
            {compareTextExporting ? '导出中...' : '导出 diff.txt'}
          </button>
        </div>
        <div className="compare-filters">
          <label className="status-filter">
            <span>分组</span>
            <select
              value={compareGroupFilter}
              onChange={(event) => setCompareGroupFilter(event.target.value as 'all' | DiffGroup)}
              disabled={compareBusy}
            >
              <option value="all">全部</option>
              <option value="meta">元信息</option>
              <option value="node">Node</option>
              <option value="python">Python</option>
            </select>
          </label>
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={compareOnlyChanged}
              disabled={compareBusy}
              onChange={(event) => setCompareOnlyChanged(event.target.checked)}
            />
            <span>仅显示变化字段</span>
          </label>
          <label className="status-checkbox">
            <input
              type="checkbox"
              checked={compareCopyCurrentFilterOnly}
              disabled={compareBusy}
              onChange={(event) => setCompareCopyCurrentFilterOnly(event.target.checked)}
            />
            <span>复制/导出仅当前筛选</span>
          </label>
          <label className="status-filter compare-search">
            <span>字段搜索</span>
            <input
              type="text"
              value={compareFieldQuery}
              placeholder="例如 deps / uptime / version"
              disabled={compareBusy}
              onChange={(event) => setCompareFieldQuery(event.target.value)}
            />
          </label>
          <div className="compare-quick-tags">
            {COMPARE_FIELD_PRESET_TAGS.map((tag) => {
              const active = compareActiveTags.includes(tag.value);
              return (
                <button
                  key={tag.value}
                  type="button"
                  className={`compare-tag ${active ? 'active' : ''}`}
                  disabled={compareBusy}
                  onClick={() => toggleCompareTag(tag.value)}
                >
                  {tag.label}
                </button>
              );
            })}
            <button
              type="button"
              className="compare-tag"
              disabled={compareBusy || !hasCompareFilter}
              onClick={() => saveCurrentCompareFilter()}
            >
              保存筛选
            </button>
            <button
              type="button"
              className={`compare-tag clear ${!hasCompareFilter ? 'active' : ''}`}
              disabled={compareBusy || !hasCompareFilter}
              onClick={() => {
                setCompareFieldQuery('');
                setCompareActiveTags([]);
              }}
            >
              清空
            </button>
          </div>
        </div>
        {compareRecentFilters.length > 0 && (
          <div className="compare-history">
            <div className="compare-history-header">
              <span className="compare-history-title">
                最近筛选（固定 {comparePinnedCount} / 未固定 {compareUnpinnedCount}）
              </span>
              <div className="compare-history-actions">
                <button
                  type="button"
                  className={`compare-history-action ${compareHistoryPinnedOnly ? 'active' : ''}`}
                  disabled={compareBusy || comparePinnedCount === 0}
                  onClick={() => setCompareHistoryPinnedOnly((prev) => !prev)}
                >
                  {compareHistoryPinnedOnly ? '显示全部' : '仅看固定'}
                </button>
                <button
                  type="button"
                  className="compare-history-action"
                  disabled={compareBusy || compareUnpinnedCount === 0}
                  onClick={() => clearCompareHistoryUnpinned()}
                >
                  仅清空未固定
                </button>
                <button
                  type="button"
                  className="compare-history-action danger"
                  disabled={compareBusy || compareRecentFilters.length === 0}
                  onClick={() => clearCompareHistoryAll()}
                >
                  清空全部
                </button>
              </div>
            </div>
            <div className="compare-history-list">
              {visibleCompareHistoryItems.map((item) => (
                <div key={item.id} className="compare-history-item">
                  <button
                    type="button"
                    className={`compare-history-pin ${item.pinned ? 'active' : ''}`}
                    disabled={compareBusy}
                    onClick={() => toggleCompareHistoryPin(item.id)}
                  >
                    {item.pinned ? '取消固定' : '固定'}
                  </button>
                  <button
                    type="button"
                    className="compare-history-apply"
                    disabled={compareBusy}
                    onClick={() => applyCompareHistory(item)}
                    title={buildCompareHistoryLabel(item)}
                  >
                    {buildCompareHistoryLabel(item)}
                  </button>
                  <button
                    type="button"
                    className="compare-history-top"
                    disabled={compareBusy}
                    onClick={() => moveCompareHistoryToTop(item.id)}
                  >
                    置顶
                  </button>
                  <button
                    type="button"
                    className="compare-history-remove"
                    disabled={compareBusy}
                    onClick={() => removeCompareHistory(item.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {visibleCompareHistoryItems.length === 0 && (
              <div className="compare-history-empty">当前仅显示已固定筛选，可切换回全部视图。</div>
            )}
          </div>
        )}
        {compareEntries.length > 0 && (
          <div className="compare-stats">
            匹配字段 {filteredCompareEntries.length}/{compareEntries.length}
            {compareKeywords.length > 0 && ` | 关键词 ${compareKeywords.join(' + ')}`}
          </div>
        )}
        {compareSummary && <div className="status-note">{compareSummary}</div>}
        {compareEntries.length > 0 && filteredCompareEntries.length === 0 && (
          <div className="status-note">当前过滤条件下无可显示字段。</div>
        )}
        {visibleCompareGroups.map((group) => {
          const entries = groupedCompareEntries[group];
          const changedCount = entries.filter((entry) => entry.changed).length;
          const collapsed = compareGroupCollapsed[group];
          return (
            <div key={group} className="compare-group">
              <button
                className="compare-group-header"
                type="button"
                onClick={() => toggleCompareGroup(group)}
              >
                <span>{DIFF_GROUP_LABELS[group]}</span>
                <span>{changedCount}/{entries.length}</span>
                <span>{collapsed ? '展开' : '收起'}</span>
              </button>
              {!collapsed && (
                <div className="compare-diff-list">
                  {entries.map((entry, index) => (
                    <div
                      key={`${group}-${index}-${entry.field}`}
                      className={`compare-diff-line ${entry.changed ? 'changed' : 'same'}`}
                    >
                      {entry.line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {compareError && <div className="status-error">{compareError}</div>}
      </div>
    </div>
  );
}

interface ServiceStatusRowProps {
  label: string;
  serviceKey: ServiceKey;
  diagnostics: ServiceDiagnosticsPayload;
  busy: boolean;
  onRestart: (service: ServiceKey) => Promise<void>;
  onViewLogs: (service: ServiceKey) => Promise<void>;
}

function ServiceStatusRow({
  label,
  serviceKey,
  diagnostics,
  busy,
  onRestart,
  onViewLogs,
}: ServiceStatusRowProps) {
  const service = diagnostics.status;
  const managedBy = service.managed
    ? 'Tauri 托管'
    : service.healthy
      ? '外部托管'
      : '未托管';
  const statusText = service.healthy
    ? service.managed
      ? '运行中'
      : '运行中(外部)'
    : service.running
      ? '启动中'
      : '离线';
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

  return (
    <div className="status-item">
      <div className="status-main">
        <span>{label}</span>
        <span className={`status-badge ${badgeClass}`}>{statusText}</span>
      </div>
      <div className="status-meta">
        <span>{service.endpoint}</span>
        <span>{service.pid ? `PID ${service.pid}` : '无进程'}</span>
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
          title={!service.managed && service.healthy ? '当前服务由外部进程管理，无法在此重启' : undefined}
        >
          {busy ? '重启中...' : '重启服务'}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => void onViewLogs(serviceKey)}
        >
          查看日志
        </button>
      </div>
      {!service.managed && service.healthy && (
        <div className="status-hint">该服务由外部进程托管，当前页面可查看状态与日志，但不可重启。</div>
      )}
      {serviceKey === 'python' && ocrState !== 'ok' && (
        <div className="status-hint">OCR is not fully ready. Run npm run setup:ocr and refresh.</div>
      )}
      {ocrLastError && <div className="status-error-inline">OCR error: {ocrLastError}</div>}
      {service.lastError && <div className="status-error-inline">{service.lastError}</div>}
      {diagnostics.healthError && <div className="status-error-inline">{diagnostics.healthError}</div>}
    </div>
  );
}

export default App;

