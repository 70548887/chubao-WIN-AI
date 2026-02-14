import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Messages } from '../../i18n';
import {
  buildCompareDiffText,
  buildCompareHistoryLabel,
  buildDiagnosticsDiff,
  collectCompareKeywords,
  COMPARE_FIELD_PRESET_TAGS,
  COMPARE_HISTORY_MAX_ITEMS,
  COMPARE_HISTORY_STORAGE_KEY,
  coerceDiagnosticsPayload,
  DIFF_GROUP_LABELS,
  filterCompareEntries,
  formatSchemaHint,
  getCompareLineClass,
  normalizeCompareKeyword,
  sortCompareHistoryItems,
} from './diagnosticsCompareUtils';
import type {
  CompareEntryFilterState,
  CompareFilterHistoryItem,
  DiagnosticsDiffPayload,
  DiagnosticsExportPayload,
  DiffEntry,
  DiffGroup,
  ParsedDiagnosticsFile,
} from './diagnosticsCompareUtils';

interface UseDiagnosticsCompareOptions {
  t: Messages;
}

const DEFAULT_GROUP_COLLAPSED: Record<DiffGroup, boolean> = {
  meta: false,
  node: false,
  python: false,
};

function sanitizeFileToken(input: string): string {
  const withoutExt = input.replace(/\.[^.]+$/, '');
  const normalized = withoutExt
    .replace(/[^a-zA-Z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized.slice(0, 40) || 'file';
}

export function useDiagnosticsCompare({ t }: UseDiagnosticsCompareOptions) {
  const [compareLeftFile, setCompareLeftFile] = useState<ParsedDiagnosticsFile | null>(null);
  const [compareRightFile, setCompareRightFile] = useState<ParsedDiagnosticsFile | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareSummary, setCompareSummary] = useState<string | null>(null);
  const [compareEntries, setCompareEntries] = useState<DiffEntry[]>([]);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareOnlyChanged, setCompareOnlyChanged] = useState(true);
  const [compareSchemaOnly, setCompareSchemaOnly] = useState(false);
  const [compareGroupFilter, setCompareGroupFilter] = useState<'all' | DiffGroup>('all');
  const [compareFieldQuery, setCompareFieldQuery] = useState('');
  const [compareActiveTags, setCompareActiveTags] = useState<string[]>([]);
  const [compareCopyCurrentFilterOnly, setCompareCopyCurrentFilterOnly] = useState(true);
  const [compareHistoryPinnedOnly, setCompareHistoryPinnedOnly] = useState(false);
  const [compareRecentFilters, setCompareRecentFilters] = useState<CompareFilterHistoryItem[]>([]);
  const [compareGroupCollapsed, setCompareGroupCollapsed] = useState<Record<DiffGroup, boolean>>(DEFAULT_GROUP_COLLAPSED);
  const [compareCopying, setCompareCopying] = useState(false);
  const [compareCopied, setCompareCopied] = useState(false);
  const [compareExporting, setCompareExporting] = useState(false);
  const [compareTextExporting, setCompareTextExporting] = useState(false);

  const compareCopiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
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
        throw new Error(`${file.name} ${t.settings.fileNotRecognized}`);
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

      const schemaHint = formatSchemaHint(file.name, payload.schemaVersion);
      setCompareError(null);
      setCompareSummary(schemaHint);
      setCompareEntries([]);
      setCompareCopied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCompareError(message);
    } finally {
      setCompareBusy(false);
    }
  }, [t.settings.fileNotRecognized]);

  const runDiagnosticsCompare = useCallback(() => {
    if (!compareLeftFile || !compareRightFile) {
      setCompareError(t.settings.selectBothFiles);
      return;
    }

    setCompareBusy(true);
    try {
      const result = buildDiagnosticsDiff(compareLeftFile, compareRightFile);
      const schemaHints = [
        formatSchemaHint(compareLeftFile.name, compareLeftFile.payload.schemaVersion),
        formatSchemaHint(compareRightFile.name, compareRightFile.payload.schemaVersion),
      ].filter((item): item is string => Boolean(item));
      const summary = schemaHints.length > 0
        ? `${result.summary} | ${schemaHints.join(' ; ')}`
        : result.summary;
      setCompareSummary(summary);
      setCompareEntries(result.entries);
      setCompareGroupCollapsed(DEFAULT_GROUP_COLLAPSED);
      setCompareCopied(false);
      setCompareError(null);
    } finally {
      setCompareBusy(false);
    }
  }, [compareLeftFile, compareRightFile, t.settings.selectBothFiles]);

  const buildCurrentDiffPayload = useCallback((filteredOnly = compareCopyCurrentFilterOnly): DiagnosticsDiffPayload | null => {
    if (!compareLeftFile || !compareRightFile) {
      return null;
    }
    const result = buildDiagnosticsDiff(compareLeftFile, compareRightFile);
    const keywords = collectCompareKeywords(compareFieldQuery, compareActiveTags);
    const filterState: CompareEntryFilterState = {
      groupFilter: compareGroupFilter,
      onlyChanged: compareOnlyChanged,
      schemaOnly: compareSchemaOnly,
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
        schemaVersion: compareLeftFile.payload.schemaVersion ?? null,
      },
      target: {
        fileName: compareRightFile.name,
        exportedAt: compareRightFile.payload.exportedAt ?? null,
        appVersion: compareRightFile.payload.appVersion ?? null,
        schemaVersion: compareRightFile.payload.schemaVersion ?? null,
      },
      summary: scopeSummary,
      diffCount: scopedChangedCount,
      lineCount: scopedLines.length,
      scope,
      filterState: filteredOnly
        ? {
          group: compareGroupFilter,
          onlyChanged: compareOnlyChanged,
          schemaOnly: compareSchemaOnly,
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
    compareSchemaOnly,
  ]);

  const copyCompareDiff = useCallback(async () => {
    setCompareCopying(true);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(t.settings.clipboardNotSupported);
      }
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error(t.settings.selectTwoFiles);
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
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly, t.settings.clipboardNotSupported, t.settings.selectTwoFiles]);

  const exportCompareDiff = useCallback(() => {
    setCompareExporting(true);
    try {
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error(t.settings.selectTwoFiles);
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
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly, t.settings.selectTwoFiles]);

  const exportCompareText = useCallback(() => {
    setCompareTextExporting(true);
    try {
      const diffPayload = buildCurrentDiffPayload(compareCopyCurrentFilterOnly);
      if (!diffPayload) {
        throw new Error(t.settings.selectTwoFiles);
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
  }, [buildCurrentDiffPayload, compareCopyCurrentFilterOnly, t.settings.selectTwoFiles]);

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
    const shouldClear = window.confirm(t.settings.confirmClearUnpinned);
    if (!shouldClear) {
      return;
    }
    setCompareRecentFilters((prev) => prev.filter((item) => item.pinned));
  }, [t.settings.confirmClearUnpinned]);

  const clearCompareHistoryAll = useCallback(() => {
    const shouldClear = window.confirm(t.settings.confirmClearAll);
    if (!shouldClear) {
      return;
    }
    setCompareRecentFilters([]);
    setCompareHistoryPinnedOnly(false);
  }, [t.settings.confirmClearAll]);

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

  const compareKeywords = useMemo(
    () => collectCompareKeywords(compareFieldQuery, compareActiveTags),
    [compareFieldQuery, compareActiveTags],
  );
  const normalizedCompareQuery = compareFieldQuery.trim().toLowerCase();
  const hasCompareKeywordFilter = compareActiveTags.length > 0 || normalizedCompareQuery.length > 0;
  const hasCompareFilter = hasCompareKeywordFilter || compareSchemaOnly;

  const filteredCompareEntries = useMemo(() => {
    const compareFilterState: CompareEntryFilterState = {
      groupFilter: compareGroupFilter,
      onlyChanged: compareOnlyChanged,
      schemaOnly: compareSchemaOnly,
      keywords: compareKeywords,
    };
    return filterCompareEntries(compareEntries, compareFilterState);
  }, [compareEntries, compareGroupFilter, compareOnlyChanged, compareSchemaOnly, compareKeywords]);

  const groupedCompareEntries = useMemo(() => {
    const grouped: Record<DiffGroup, DiffEntry[]> = {
      meta: [],
      node: [],
      python: [],
    };
    filteredCompareEntries.forEach((entry) => {
      grouped[entry.group].push(entry);
    });
    return grouped;
  }, [filteredCompareEntries]);

  const visibleCompareGroups = useMemo(
    () => (['meta', 'node', 'python'] as DiffGroup[])
      .filter((group) => groupedCompareEntries[group].length > 0),
    [groupedCompareEntries],
  );

  const toggleCompareGroup = useCallback((group: DiffGroup) => {
    setCompareGroupCollapsed((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }, []);

  const comparePinnedCount = useMemo(
    () => compareRecentFilters.filter((item) => item.pinned).length,
    [compareRecentFilters],
  );
  const compareUnpinnedCount = compareRecentFilters.length - comparePinnedCount;

  const visibleCompareHistoryItems = useMemo(
    () => (compareHistoryPinnedOnly
      ? compareRecentFilters.filter((item) => item.pinned)
      : compareRecentFilters),
    [compareHistoryPinnedOnly, compareRecentFilters],
  );

  const clearCompareFilters = useCallback(() => {
    setCompareFieldQuery('');
    setCompareActiveTags([]);
    setCompareSchemaOnly(false);
  }, []);

  const toggleCompareHistoryPinnedOnly = useCallback(() => {
    setCompareHistoryPinnedOnly((prev) => !prev);
  }, []);

  return {
    compareBusy,
    compareLeftFile,
    compareRightFile,
    compareCopying,
    compareCopied,
    compareExporting,
    compareTextExporting,
    compareGroupFilter,
    setCompareGroupFilter,
    compareOnlyChanged,
    setCompareOnlyChanged,
    compareSchemaOnly,
    setCompareSchemaOnly,
    compareCopyCurrentFilterOnly,
    setCompareCopyCurrentFilterOnly,
    compareFieldQuery,
    setCompareFieldQuery,
    compareActiveTags,
    compareHistoryPinnedOnly,
    compareRecentFilters,
    comparePinnedCount,
    compareUnpinnedCount,
    visibleCompareHistoryItems,
    compareEntries,
    filteredCompareEntries,
    compareKeywords,
    compareSummary,
    compareError,
    visibleCompareGroups,
    groupedCompareEntries,
    compareGroupCollapsed,
    hasCompareKeywordFilter,
    hasCompareFilter,
    compareFieldPresetTags: COMPARE_FIELD_PRESET_TAGS,
    diffGroupLabels: DIFF_GROUP_LABELS,
    loadCompareFile,
    runDiagnosticsCompare,
    copyCompareDiff,
    exportCompareDiff,
    exportCompareText,
    toggleCompareTag,
    saveCurrentCompareFilter,
    applyCompareHistory,
    removeCompareHistory,
    clearCompareHistoryUnpinned,
    clearCompareHistoryAll,
    toggleCompareHistoryPin,
    moveCompareHistoryToTop,
    toggleCompareGroup,
    clearCompareFilters,
    toggleCompareHistoryPinnedOnly,
    buildCompareHistoryLabel,
    getCompareLineClass,
  };
}
