import type { Messages } from '../../i18n';

type DiffGroup = 'meta' | 'node' | 'python';

interface DiffEntry {
  group: DiffGroup;
  field: string;
  before: string;
  after: string;
  changed: boolean;
  line: string;
}

interface CompareFilterHistoryItem {
  id: string;
  tags: string[];
  query: string;
  pinned: boolean;
  updatedAt: number;
}

interface CompareFileLike {
  name: string;
}

interface DiagnosticsCompareSectionProps {
  t: Messages;
  compareBusy: boolean;
  compareLeftFile: CompareFileLike | null;
  compareRightFile: CompareFileLike | null;
  onLoadCompareFile: (file: File, side: 'left' | 'right') => Promise<void>;
  runDiagnosticsCompare: () => void;
  copyCompareDiff: () => Promise<void>;
  exportCompareDiff: () => void;
  exportCompareText: () => void;
  compareCopying: boolean;
  compareCopied: boolean;
  compareExporting: boolean;
  compareTextExporting: boolean;
  compareGroupFilter: 'all' | DiffGroup;
  onCompareGroupFilterChange: (value: 'all' | DiffGroup) => void;
  compareOnlyChanged: boolean;
  onCompareOnlyChangedChange: (value: boolean) => void;
  compareSchemaOnly: boolean;
  onCompareSchemaOnlyChange: (value: boolean) => void;
  compareCopyCurrentFilterOnly: boolean;
  onCompareCopyCurrentFilterOnlyChange: (value: boolean) => void;
  compareFieldQuery: string;
  onCompareFieldQueryChange: (value: string) => void;
  compareActiveTags: string[];
  compareFieldPresetTags: ReadonlyArray<{ label: string; value: string }>;
  onToggleCompareTag: (value: string) => void;
  hasCompareKeywordFilter: boolean;
  onSaveCurrentCompareFilter: () => void;
  hasCompareFilter: boolean;
  onClearCompareFilters: () => void;
  compareRecentFilters: CompareFilterHistoryItem[];
  comparePinnedCount: number;
  compareUnpinnedCount: number;
  compareHistoryPinnedOnly: boolean;
  onToggleCompareHistoryPinnedOnly: () => void;
  onClearCompareHistoryUnpinned: () => void;
  onClearCompareHistoryAll: () => void;
  visibleCompareHistoryItems: CompareFilterHistoryItem[];
  onToggleCompareHistoryPin: (id: string) => void;
  onApplyCompareHistory: (item: CompareFilterHistoryItem) => void;
  buildCompareHistoryLabel: (item: CompareFilterHistoryItem) => string;
  onMoveCompareHistoryToTop: (id: string) => void;
  onRemoveCompareHistory: (id: string) => void;
  compareEntries: DiffEntry[];
  filteredCompareEntries: DiffEntry[];
  compareKeywords: string[];
  compareSummary: string | null;
  visibleCompareGroups: DiffGroup[];
  groupedCompareEntries: Record<DiffGroup, DiffEntry[]>;
  compareGroupCollapsed: Record<DiffGroup, boolean>;
  diffGroupLabels: Record<DiffGroup, string>;
  onToggleCompareGroup: (group: DiffGroup) => void;
  getCompareLineClass: (entry: DiffEntry) => string;
  compareError: string | null;
}

export default function DiagnosticsCompareSection({
  t,
  compareBusy,
  compareLeftFile,
  compareRightFile,
  onLoadCompareFile,
  runDiagnosticsCompare,
  copyCompareDiff,
  exportCompareDiff,
  exportCompareText,
  compareCopying,
  compareCopied,
  compareExporting,
  compareTextExporting,
  compareGroupFilter,
  onCompareGroupFilterChange,
  compareOnlyChanged,
  onCompareOnlyChangedChange,
  compareSchemaOnly,
  onCompareSchemaOnlyChange,
  compareCopyCurrentFilterOnly,
  onCompareCopyCurrentFilterOnlyChange,
  compareFieldQuery,
  onCompareFieldQueryChange,
  compareActiveTags,
  compareFieldPresetTags,
  onToggleCompareTag,
  hasCompareKeywordFilter,
  onSaveCurrentCompareFilter,
  hasCompareFilter,
  onClearCompareFilters,
  compareRecentFilters,
  comparePinnedCount,
  compareUnpinnedCount,
  compareHistoryPinnedOnly,
  onToggleCompareHistoryPinnedOnly,
  onClearCompareHistoryUnpinned,
  onClearCompareHistoryAll,
  visibleCompareHistoryItems,
  onToggleCompareHistoryPin,
  onApplyCompareHistory,
  buildCompareHistoryLabel,
  onMoveCompareHistoryToTop,
  onRemoveCompareHistory,
  compareEntries,
  filteredCompareEntries,
  compareKeywords,
  compareSummary,
  visibleCompareGroups,
  groupedCompareEntries,
  compareGroupCollapsed,
  diffGroupLabels,
  onToggleCompareGroup,
  getCompareLineClass,
  compareError,
}: DiagnosticsCompareSectionProps) {
  return (
    <div className="settings-section">
      <h3>{t.settings.diagnosticsCompare}</h3>
      <div className="compare-toolbar">
        <label className="compare-file">
          <span>{t.settings.baselineFile}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={compareBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onLoadCompareFile(file, 'left');
              }
              event.currentTarget.value = '';
            }}
          />
          <span className="compare-file-name">{compareLeftFile?.name ?? t.settings.notSelected}</span>
        </label>
        <label className="compare-file">
          <span>{t.settings.targetFile}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={compareBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onLoadCompareFile(file, 'right');
              }
              event.currentTarget.value = '';
            }}
          />
          <span className="compare-file-name">{compareRightFile?.name ?? t.settings.notSelected}</span>
        </label>
        <button
          className="status-action-btn secondary"
          onClick={() => runDiagnosticsCompare()}
          disabled={compareBusy || !compareLeftFile || !compareRightFile}
        >
          {compareBusy ? t.settings.comparing : t.settings.runCompare}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => void copyCompareDiff()}
          disabled={compareCopying || !compareLeftFile || !compareRightFile}
        >
          {compareCopying ? t.settings.copying : compareCopied ? t.settings.diffCopied : t.settings.copyDiff}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => exportCompareDiff()}
          disabled={compareExporting || !compareLeftFile || !compareRightFile}
        >
          {compareExporting ? t.settings.exporting : t.settings.exportDiffJson}
        </button>
        <button
          className="status-action-btn secondary"
          onClick={() => exportCompareText()}
          disabled={compareTextExporting || !compareLeftFile || !compareRightFile}
        >
          {compareTextExporting ? t.settings.exporting : t.settings.exportDiffTxt}
        </button>
      </div>
      <div className="compare-filters">
        <label className="status-filter">
          <span>{t.settings.group}</span>
          <select
            value={compareGroupFilter}
            onChange={(event) => onCompareGroupFilterChange(event.target.value as 'all' | DiffGroup)}
            disabled={compareBusy}
          >
            <option value="all">All</option>
            <option value="meta">Meta</option>
            <option value="node">Node</option>
            <option value="python">Python</option>
          </select>
        </label>
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={compareOnlyChanged}
            disabled={compareBusy}
            onChange={(event) => onCompareOnlyChangedChange(event.target.checked)}
          />
          <span>{t.settings.onlyChangedFields}</span>
        </label>
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={compareSchemaOnly}
            disabled={compareBusy}
            onChange={(event) => onCompareSchemaOnlyChange(event.target.checked)}
          />
          <span>{t.settings.onlySchemaFields}</span>
        </label>
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={compareCopyCurrentFilterOnly}
            disabled={compareBusy}
            onChange={(event) => onCompareCopyCurrentFilterOnlyChange(event.target.checked)}
          />
          <span>{t.settings.copyExportCurrentFilterOnly}</span>
        </label>
        <label className="status-filter compare-search">
          <span>{t.settings.fieldSearch}</span>
          <input
            type="text"
            value={compareFieldQuery}
            placeholder={t.settings.fieldSearchPlaceholder}
            disabled={compareBusy}
            onChange={(event) => onCompareFieldQueryChange(event.target.value)}
          />
        </label>
        <div className="compare-quick-tags">
          {compareFieldPresetTags.map((tag) => {
            const active = compareActiveTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                type="button"
                className={`compare-tag ${active ? 'active' : ''}`}
                disabled={compareBusy}
                onClick={() => onToggleCompareTag(tag.value)}
              >
                {tag.label}
              </button>
            );
          })}
          <button
            type="button"
            className="compare-tag"
            disabled={compareBusy || !hasCompareKeywordFilter}
            onClick={() => onSaveCurrentCompareFilter()}
          >
            {t.settings.saveFilter}
          </button>
          <button
            type="button"
            className={`compare-tag clear ${!hasCompareFilter ? 'active' : ''}`}
            disabled={compareBusy || !hasCompareFilter}
            onClick={() => onClearCompareFilters()}
          >
            {t.settings.clear}
          </button>
        </div>
      </div>
      {compareRecentFilters.length > 0 && (
        <div className="compare-history">
          <div className="compare-history-header">
            <span className="compare-history-title">
              {t.settings.recentFilters} ({t.settings.pinned} {comparePinnedCount} / {t.settings.unpinned} {compareUnpinnedCount})
            </span>
            <div className="compare-history-actions">
              <button
                type="button"
                className={`compare-history-action ${compareHistoryPinnedOnly ? 'active' : ''}`}
                disabled={compareBusy || comparePinnedCount === 0}
                onClick={() => onToggleCompareHistoryPinnedOnly()}
              >
                {compareHistoryPinnedOnly ? t.settings.showAll : t.settings.pinnedOnly}
              </button>
              <button
                type="button"
                className="compare-history-action"
                disabled={compareBusy || compareUnpinnedCount === 0}
                onClick={() => onClearCompareHistoryUnpinned()}
              >
                {t.settings.clearUnpinned}
              </button>
              <button
                type="button"
                className="compare-history-action danger"
                disabled={compareBusy || compareRecentFilters.length === 0}
                onClick={() => onClearCompareHistoryAll()}
              >
                {t.settings.clearAll}
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
                  onClick={() => onToggleCompareHistoryPin(item.id)}
                >
                  {item.pinned ? t.settings.unpin : t.settings.pin}
                </button>
                <button
                  type="button"
                  className="compare-history-apply"
                  disabled={compareBusy}
                  onClick={() => onApplyCompareHistory(item)}
                  title={buildCompareHistoryLabel(item)}
                >
                  {buildCompareHistoryLabel(item)}
                </button>
                <button
                  type="button"
                  className="compare-history-top"
                  disabled={compareBusy}
                  onClick={() => onMoveCompareHistoryToTop(item.id)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="compare-history-remove"
                  disabled={compareBusy}
                  onClick={() => onRemoveCompareHistory(item.id)}
                >
                  {t.settings.removeSymbol}
                </button>
              </div>
            ))}
          </div>
          {visibleCompareHistoryItems.length === 0 && (
            <div className="compare-history-empty">{t.settings.pinnedOnlyEmpty}</div>
          )}
        </div>
      )}
      {compareEntries.length > 0 && (
        <div className="compare-stats">
          {t.settings.matchedFields} {filteredCompareEntries.length}/{compareEntries.length}
          {compareKeywords.length > 0 && ` | ${t.settings.keywords}: ${compareKeywords.join(' + ')}`}
        </div>
      )}
      {compareSummary && <div className="status-note">{compareSummary}</div>}
      {compareEntries.length > 0 && filteredCompareEntries.length === 0 && (
        <div className="status-note">{t.settings.noFieldsMatch}</div>
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
              onClick={() => onToggleCompareGroup(group)}
            >
              <span>{diffGroupLabels[group]}</span>
              <span>{changedCount}/{entries.length}</span>
              <span>{collapsed ? t.settings.expand : t.settings.collapse}</span>
            </button>
            {!collapsed && (
              <div className="compare-diff-list">
                {entries.map((entry, index) => (
                  <div
                    key={`${group}-${index}-${entry.field}`}
                    className={`compare-diff-line ${getCompareLineClass(entry)}`}
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
  );
}
