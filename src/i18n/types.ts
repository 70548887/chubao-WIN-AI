export type Locale = 'zh-CN' | 'en';

export interface Messages {
  sidebar: {
    chat: string;
    dashboard: string;
    automation: string;
    skills: string;
    settings: string;
    serviceRunning: string;
    serviceOffline: string;
  };

  chat: {
    title: string;
    subtitle: string;
    welcomeTitle: string;
    welcomeHint: string;
    welcomeItems: string[];
    placeholder: string;
    send: string;
    requestFailed: string;
    newConversation: string;
  };

  dashboard: {
    title: string;
    loading: string;
    retry: string;
    refresh: string;
    repository: string;
    branch: string;
    upstream: string;
    upstreamNone: string;
    aheadBehind: string;
    workingTree: string;
    clean: string;
    dirty: string;
    fileChanges: string;
    total: string;
    added: string;
    modified: string;
    deleted: string;
    staged: string;
    untracked: string;
    developmentVelocity: string;
    totalCommits: string;
    commitsPerDay: string;
    velocity: string;
    authors: string;
    recentCommits: string;
    noCommitsFound: string;
    changedFilesTitle: string;
    noChangedFiles: string;
    refreshFailed: string;
  };

  automation: {
    title: string;
    loading: string;
    fetchWindowList: string;
    fetchError: string;
  };

  skills: {
    title: string;
    loading: string;
    refreshSkills: string;
    refreshing: string;
    // Count bar
    installed: string;
    totalTools: string;
    // Action buttons
    installFromZip: string;
    importExisting: string;
    discoverSkills: string;
    // Install form
    installSkill: string;
    installing: string;
    installPathLabel: string;
    installPathPlaceholder: string;
    installSuccess: string;
    // Empty state
    noInstalled: string;
    noInstalledDescription: string;
    // Skill list
    skillEnabled: string;
    skillDisabled: string;
    skillSource: string;
    local: string;
    uninstall: string;
    uninstallConfirm: string;
    uninstallSuccess: string;
    // Config section
    configSkills: string;
    enabledLabel: string;
    capabilitiesLabel: string;
    automationLabel: string;
    // Warnings
    warnings: string;
    noWarnings: string;
    // Discovery
    searchPlaceholder: string;
    noResults: string;
    emptyDescription: string;
    // Import
    noUnmanagedFound: string;
    importSuccess: string;
  };

  settings: {
    title: string;
    apiConfig: string;
    anthropicApiKey: string;
    // Model config
    modelConfig: string;
    modelConfigDesc: string;
    activeProvider: string;
    modelName: string;
    baseUrl: string;
    apiKey: string;
    apiKeyConfigured: string;
    apiKeyNotConfigured: string;
    apiKeyPlaceholder: string;
    saveConfig: string;
    saving: string;
    saved: string;
    modelConfigRuntimeNotice: string;
    persistConfig: string;
    persistingConfig: string;
    persistedToEnv: string;
    saveFailed: string;
    loadingConfig: string;
    // Claude Code sync
    claudeCodeSync: string;
    claudeCodeSyncDesc: string;
    claudeCodeSyncing: string;
    claudeCodeSynced: string;
    claudeCodeNotFound: string;
    claudeCodeDetected: string;
    // Coding progress
    codingProgress: string;
    sinceDays: string;
    maxFiles: string;
    includeUntracked: string;
    loadingProgress: string;
    refreshProgress: string;
    branchLabel: string;
    statusLabel: string;
    aheadBehindLabel: string;
    commitsLabel: string;
    generatedLabel: string;
    repoLabel: string;
    upstreamLabel: string;
    filesLabel: string;
    stagedLabel: string;
    unstagedLabel: string;
    untrackedLabel: string;
    velocityTitle: string;
    topExtensions: string;
    activeAuthors: string;
    noChangedFiles: string;
    noCommits: string;
    noCommitAuthors: string;
    changedFiles: string;
    recentCommits: string;
    // Service status
    serviceStatus: string;
    detectingStatus: string;
    abnormalServices: string;
    filterLabel: string;
    noServicesMatch: string;
    refreshing: string;
    refreshStatus: string;
    summaryLabel: string;
    compact: string;
    detailed: string;
    copyCurrentFilterOnly: string;
    copying: string;
    summaryCopied: string;
    copyDiagnosticsSummary: string;
    exportRedacted: string;
    exportRaw: string;
    exportRedactedTooltip: string;
    exporting: string;
    exportDiagnosticsJson: string;
    includeRecentLogs: string;
    logLines: string;
    // Service logs
    serviceLogs: string;
    selectServiceHint: string;
    nodeBackendLogs: string;
    pythonAutomationLogs: string;
    loadingLogs: string;
    refreshLogs: string;
    loadingLogsHint: string;
    noLogOutput: string;
    // Diagnostics compare
    diagnosticsCompare: string;
    baselineFile: string;
    targetFile: string;
    notSelected: string;
    comparing: string;
    runCompare: string;
    diffCopied: string;
    copyDiff: string;
    exportDiffJson: string;
    exportDiffTxt: string;
    group: string;
    onlyChangedFields: string;
    onlySchemaFields: string;
    copyExportCurrentFilterOnly: string;
    fieldSearch: string;
    fieldSearchPlaceholder: string;
    saveFilter: string;
    clear: string;
    recentFilters: string;
    pinned: string;
    unpinned: string;
    showAll: string;
    pinnedOnly: string;
    clearUnpinned: string;
    clearAll: string;
    unpin: string;
    pin: string;
    removeSymbol: string;
    pinnedOnlyEmpty: string;
    matchedFields: string;
    keywords: string;
    noFieldsMatch: string;
    expand: string;
    collapse: string;
    // Confirm dialogs
    confirmClearUnpinned: string;
    confirmClearAll: string;
    // Errors
    clipboardNotSupported: string;
    selectTwoFiles: string;
    selectBothFiles: string;
    fileNotRecognized: string;
    // Multi-agent
    multiAgentTitle: string;
    multiAgentSummaryEmpty: string;
    multiAgentSummaryCount: string;
    multiAgentProjectPath: string;
    multiAgentProjectPathPlaceholder: string;
    multiAgentTimeoutMs: string;
    multiAgentRefreshGroups: string;
    multiAgentRefreshingGroups: string;
    multiAgentStartGroup: string;
    multiAgentStartingGroup: string;
    multiAgentTasksJson: string;
    multiAgentNoGroups: string;
    multiAgentViewStatus: string;
    multiAgentLoadingDetail: string;
    multiAgentCancelGroup: string;
    multiAgentDetailTitle: string;
    multiAgentNoTaskDetails: string;
    multiAgentStateLabel: string;
    multiAgentTasksLabel: string;
    multiAgentCreatedLabel: string;
    multiAgentFinishedLabel: string;
    multiAgentStatusLabel: string;
    multiAgentTaskIdLabel: string;
    multiAgentErrorLabel: string;
    multiAgentUnknown: string;
    multiAgentTaskFallback: string;
    multiAgentTasksJsonInvalid: string;
    multiAgentListStateLabel: string;
    multiAgentListLimitLabel: string;
    multiAgentListOffsetLabel: string;
    multiAgentApplyListQuery: string;
    multiAgentResetListQuery: string;
    multiAgentListLimitInvalid: string;
    multiAgentListOffsetInvalid: string;
    multiAgentStateAll: string;
    multiAgentStateRunning: string;
    multiAgentStateCompleted: string;
    multiAgentStateFailed: string;
    multiAgentStateCanceled: string;
    multiAgentStatePartial: string;
    multiAgentCapacityLabel: string;
    multiAgentRunningGroupsLabel: string;
    multiAgentRunningTasksLabel: string;
    // Continuous Dev Monitor
    continuousDevTitle: string;
    continuousDevTaskDescription: string;
    continuousDevTaskDescriptionPlaceholder: string;
    continuousDevIntervalSeconds: string;
    continuousDevMaxCycles: string;
    continuousDevMaxCyclesHint: string;
    continuousDevProjectPath: string;
    continuousDevProjectPathPlaceholder: string;
    continuousDevWindowTitle: string;
    continuousDevPauseOnError: string;
    continuousDevMaxConsecutiveErrors: string;
    continuousDevStart: string;
    continuousDevStarting: string;
    continuousDevStop: string;
    continuousDevPause: string;
    continuousDevResume: string;
    continuousDevStatusIdle: string;
    continuousDevStatusRunning: string;
    continuousDevStatusPaused: string;
    continuousDevStatusStopped: string;
    continuousDevStatusCompleted: string;
    continuousDevCycleLabel: string;
    continuousDevLastScreenshot: string;
    continuousDevLastAction: string;
    continuousDevLastState: string;
    continuousDevConsecutiveErrors: string;
    continuousDevHistoryTitle: string;
    continuousDevNoHistory: string;
    continuousDevStartedAt: string;
    continuousDevStoppedAt: string;
  };

  service: {
    tauriManaged: string;
    externallyManaged: string;
    notManaged: string;
    running: string;
    runningExternal: string;
    starting: string;
    offline: string;
    noPid: string;
    restarting: string;
    restart: string;
    viewLogs: string;
    portInspecting: string;
    portInspect: string;
    listening: string;
    notListening: string;
    occupants: string;
    managedPid: string;
    inspected: string;
    externalHint: string;
    ocrNotReady: string;
    portInspectError: string;
    ocrError: string;
  };

  issueFilters: {
    all: string;
    issues: string;
    offline: string;
    external: string;
    errors: string;
  };

  velocityLabels: {
    low: string;
    medium: string;
    high: string;
  };

  common: {
    loading: string;
    all: string;
    node: string;
    python: string;
    meta: string;
    unknown: string;
    language: string;
  };
}
