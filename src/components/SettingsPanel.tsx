import { useMemo } from 'react';
import { analyzeCodingProgress } from '../skills/coding';
import CliToolsSection from './settings/CliToolsSection';
import CodingProgressSection from './settings/CodingProgressSection';
import ContinuousDevSection from './settings/ContinuousDevSection';
import DiagnosticsCompareSection from './settings/DiagnosticsCompareSection';
import ModelConfigSection from './settings/ModelConfigSection';
import MultiAgentSection from './settings/MultiAgentSection';
import ServiceLogsSection from './settings/ServiceLogsSection';
import ServiceStatusSection from './settings/ServiceStatusSection';
import { useCliToolsStatus } from './settings/useCliToolsStatus';
import { useCodingProgress } from './settings/useCodingProgress';
import { useContinuousDev } from './settings/useContinuousDev';
import { useDiagnosticsCompare } from './settings/useDiagnosticsCompare';
import { useDiagnosticsExport } from './settings/useDiagnosticsExport';
import { useMultiAgentGroups } from './settings/useMultiAgentGroups';
import {
  useServiceIssueView,
} from './settings/useServiceIssueView';
import { useSidecarServices } from './settings/useSidecarServices';
import { useLocale } from '../i18n';
import type { Messages } from '../i18n';
import type { IssueFilter } from './settings/serviceIssueTypes';
function getIssueFilterLabels(t: Messages): Record<IssueFilter, string> {
  return {
    all: t.issueFilters.all,
    issues: t.issueFilters.issues,
    offline: t.issueFilters.offline,
    external: t.issueFilters.external,
    errors: t.issueFilters.errors,
  };
}

function getVelocityLabels(t: Messages): Record<string, string> {
  return {
    low: t.velocityLabels.low,
    medium: t.velocityLabels.medium,
    high: t.velocityLabels.high,
  };
}

function SettingsPanel() {
  const { t } = useLocale();
  const ISSUE_FILTER_LABELS = getIssueFilterLabels(t);
  const CODING_VELOCITY_LABELS = getVelocityLabels(t);
  const cliTools = useCliToolsStatus();
  const {
    diagnostics,
    loading,
    refreshing,
    error,
    actionBusy,
    portInspectBusy,
    portInspections,
    portInspectErrors,
    logs,
    logService,
    logLoading,
    logError,
    loadStatus,
    loadLogs,
    inspectPort,
    restartService,
  } = useSidecarServices();
  const {
    codingProgress,
    codingLoading,
    codingError,
    codingSinceDays,
    codingMaxFiles,
    codingIncludeUntracked,
    loadCodingProgress,
    setCodingSinceDays,
    setCodingMaxFiles,
    setCodingIncludeUntracked,
  } = useCodingProgress();
  const compare = useDiagnosticsCompare({ t });
  const multiAgent = useMultiAgentGroups();
  const continuousDev = useContinuousDev();

  const {
    issueFilter,
    setIssueFilter,
    services,
    servicesToShow,
    issueServiceCount,
  } = useServiceIssueView(diagnostics);
  const diagnosticsExport = useDiagnosticsExport({
    t,
    diagnostics,
    services,
    servicesToShow,
    issueFilter,
    issueFilterLabels: ISSUE_FILTER_LABELS,
  });
  const codingInsights = useMemo(
    () => (codingProgress ? analyzeCodingProgress(codingProgress) : null),
    [codingProgress],
  );

  return (
    <div className="panel">
      <h2>{t.settings.title}</h2>
      <ModelConfigSection />
      <div className="settings-section">
        <h3>{t.settings.apiConfig}</h3>
        <label>
          {t.settings.anthropicApiKey}
          <input type="password" placeholder="sk-ant-..." />
        </label>
      </div>

      <CliToolsSection
        health={cliTools.health}
        loading={cliTools.loading}
        error={cliTools.error}
        onRefresh={() => void cliTools.loadHealth()}
      />

      <CodingProgressSection
        t={t}
        codingSinceDays={codingSinceDays}
        codingMaxFiles={codingMaxFiles}
        codingIncludeUntracked={codingIncludeUntracked}
        codingLoading={codingLoading}
        codingError={codingError}
        codingProgress={codingProgress}
        codingInsights={codingInsights}
        codingVelocityLabels={CODING_VELOCITY_LABELS}
        onCodingSinceDaysChange={setCodingSinceDays}
        onCodingMaxFilesChange={setCodingMaxFiles}
        onCodingIncludeUntrackedChange={setCodingIncludeUntracked}
        onLoadCodingProgress={() => void loadCodingProgress()}
      />

      <ContinuousDevSection
        monitorState={continuousDev.monitorState}
        loading={continuousDev.loading}
        actionBusy={continuousDev.actionBusy}
        error={continuousDev.error}
        onLoadStatus={() => void continuousDev.loadStatus()}
        onStart={async (params) => { await continuousDev.startMonitor(params); }}
        onStop={async () => { await continuousDev.stopMonitor(); }}
        onPause={async () => { await continuousDev.pauseMonitor(); }}
        onResume={async () => { await continuousDev.resumeMonitor(); }}
      />

      <MultiAgentSection
        groups={multiAgent.groups}
        groupsLoading={multiAgent.groupsLoading}
        groupsError={multiAgent.groupsError}
        listQuery={multiAgent.listQuery}
        startingGroup={multiAgent.startingGroup}
        actionError={multiAgent.actionError}
        selectedGroupId={multiAgent.selectedGroupId}
        selectedGroupDetail={multiAgent.selectedGroupDetail}
        detailLoading={multiAgent.detailLoading}
        detailError={multiAgent.detailError}
        onLoadGroups={() => void multiAgent.loadGroups()}
        onApplyListQuery={async (query) => { await multiAgent.applyListQuery(query); }}
        onResetListQuery={async () => { await multiAgent.resetListQuery(); }}
        onStartGroup={async (params) => { await multiAgent.startGroup(params); }}
        onLoadGroupDetail={async (groupId) => { await multiAgent.loadGroupDetail(groupId); }}
        onCancelGroup={async (groupId) => { await multiAgent.cancelGroup(groupId); }}
      />

      <ServiceStatusSection
        t={t}
        loading={loading}
        diagnostics={diagnostics}
        error={error}
        issueServiceCount={issueServiceCount}
        services={services}
        servicesToShow={servicesToShow}
        issueFilterLabels={ISSUE_FILTER_LABELS}
        issueFilter={issueFilter}
        onIssueFilterChange={setIssueFilter}
        summaryMode={diagnosticsExport.summaryMode}
        onSummaryModeChange={diagnosticsExport.setSummaryMode}
        copyCurrentFilterOnly={diagnosticsExport.copyCurrentFilterOnly}
        onCopyCurrentFilterOnlyChange={diagnosticsExport.setCopyCurrentFilterOnly}
        copyingSummary={diagnosticsExport.copyingSummary}
        summaryCopied={diagnosticsExport.summaryCopied}
        onCopyDiagnosticsSummary={diagnosticsExport.copyDiagnosticsSummary}
        redactExport={diagnosticsExport.redactExport}
        onToggleRedactExport={diagnosticsExport.toggleRedactExport}
        exporting={diagnosticsExport.exporting}
        onExportDiagnostics={diagnosticsExport.exportDiagnostics}
        includeLogsExport={diagnosticsExport.includeLogsExport}
        onIncludeLogsExportChange={diagnosticsExport.setIncludeLogsExport}
        selectedExportLogServices={diagnosticsExport.selectedExportLogServices}
        onToggleExportLogService={diagnosticsExport.toggleExportLogService}
        exportLogLimit={diagnosticsExport.exportLogLimit}
        onExportLogLimitChange={diagnosticsExport.setExportLogLimit}
        copyError={diagnosticsExport.copyError}
        refreshing={refreshing}
        onRefreshStatus={() => loadStatus(true)}
        actionBusy={actionBusy}
        portInspectBusy={portInspectBusy}
        portInspections={portInspections}
        portInspectErrors={portInspectErrors}
        onRestartService={restartService}
        onLoadLogs={loadLogs}
        onInspectPort={inspectPort}
      />

      <ServiceLogsSection
        t={t}
        logService={logService}
        logError={logError}
        logLoading={logLoading}
        logs={logs}
        onLoadLogs={loadLogs}
      />

      <DiagnosticsCompareSection
        t={t}
        compareBusy={compare.compareBusy}
        compareLeftFile={compare.compareLeftFile}
        compareRightFile={compare.compareRightFile}
        onLoadCompareFile={compare.loadCompareFile}
        runDiagnosticsCompare={compare.runDiagnosticsCompare}
        copyCompareDiff={compare.copyCompareDiff}
        exportCompareDiff={compare.exportCompareDiff}
        exportCompareText={compare.exportCompareText}
        compareCopying={compare.compareCopying}
        compareCopied={compare.compareCopied}
        compareExporting={compare.compareExporting}
        compareTextExporting={compare.compareTextExporting}
        compareGroupFilter={compare.compareGroupFilter}
        onCompareGroupFilterChange={compare.setCompareGroupFilter}
        compareOnlyChanged={compare.compareOnlyChanged}
        onCompareOnlyChangedChange={compare.setCompareOnlyChanged}
        compareSchemaOnly={compare.compareSchemaOnly}
        onCompareSchemaOnlyChange={compare.setCompareSchemaOnly}
        compareCopyCurrentFilterOnly={compare.compareCopyCurrentFilterOnly}
        onCompareCopyCurrentFilterOnlyChange={compare.setCompareCopyCurrentFilterOnly}
        compareFieldQuery={compare.compareFieldQuery}
        onCompareFieldQueryChange={compare.setCompareFieldQuery}
        compareActiveTags={compare.compareActiveTags}
        compareFieldPresetTags={compare.compareFieldPresetTags}
        onToggleCompareTag={compare.toggleCompareTag}
        hasCompareKeywordFilter={compare.hasCompareKeywordFilter}
        onSaveCurrentCompareFilter={compare.saveCurrentCompareFilter}
        hasCompareFilter={compare.hasCompareFilter}
        onClearCompareFilters={compare.clearCompareFilters}
        compareRecentFilters={compare.compareRecentFilters}
        comparePinnedCount={compare.comparePinnedCount}
        compareUnpinnedCount={compare.compareUnpinnedCount}
        compareHistoryPinnedOnly={compare.compareHistoryPinnedOnly}
        onToggleCompareHistoryPinnedOnly={compare.toggleCompareHistoryPinnedOnly}
        onClearCompareHistoryUnpinned={compare.clearCompareHistoryUnpinned}
        onClearCompareHistoryAll={compare.clearCompareHistoryAll}
        visibleCompareHistoryItems={compare.visibleCompareHistoryItems}
        onToggleCompareHistoryPin={compare.toggleCompareHistoryPin}
        onApplyCompareHistory={compare.applyCompareHistory}
        buildCompareHistoryLabel={compare.buildCompareHistoryLabel}
        onMoveCompareHistoryToTop={compare.moveCompareHistoryToTop}
        onRemoveCompareHistory={compare.removeCompareHistory}
        compareEntries={compare.compareEntries}
        filteredCompareEntries={compare.filteredCompareEntries}
        compareKeywords={compare.compareKeywords}
        compareSummary={compare.compareSummary}
        visibleCompareGroups={compare.visibleCompareGroups}
        groupedCompareEntries={compare.groupedCompareEntries}
        compareGroupCollapsed={compare.compareGroupCollapsed}
        diffGroupLabels={compare.diffGroupLabels}
        onToggleCompareGroup={compare.toggleCompareGroup}
        getCompareLineClass={compare.getCompareLineClass}
        compareError={compare.compareError}
      />
    </div>
  );
}

export default SettingsPanel;


