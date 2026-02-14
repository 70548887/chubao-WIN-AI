import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../i18n';
import type {
  MultiAgentTaskInput,
  MultiAgentGroupDetail,
  MultiAgentGroupListPayload,
  MultiAgentGroupListQuery,
  MultiAgentGroupState,
} from './useMultiAgentGroups';

const DEFAULT_TASKS_JSON = `[
  {
    "kind": "delegate",
    "name": "frontend-login",
    "agentType": "frontend",
    "taskDescription": "Implement login page with validation"
  },
  {
    "kind": "task",
    "name": "backend-auth-api",
    "taskCategory": "backend",
    "taskPrompt": "Implement /api/auth/login endpoint with JWT"
  }
]`;

interface MultiAgentSectionProps {
  groups: MultiAgentGroupListPayload | null;
  groupsLoading: boolean;
  groupsError: string | null;
  listQuery: MultiAgentGroupListQuery;
  startingGroup: boolean;
  actionError: string | null;
  selectedGroupId: string | null;
  selectedGroupDetail: MultiAgentGroupDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onLoadGroups: () => void;
  onApplyListQuery: (query: Partial<MultiAgentGroupListQuery>) => Promise<void>;
  onResetListQuery: () => Promise<void>;
  onStartGroup: (params: {
    tasks: MultiAgentTaskInput[];
    projectPath?: string;
    timeoutMs?: number;
  }) => Promise<void>;
  onLoadGroupDetail: (groupId: string) => Promise<void>;
  onCancelGroup: (groupId: string) => Promise<void>;
}

function parseTasksJson(raw: string, invalidMessage: string): MultiAgentTaskInput[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(invalidMessage);
  }
  return parsed as MultiAgentTaskInput[];
}

export default function MultiAgentSection({
  groups,
  groupsLoading,
  groupsError,
  listQuery,
  startingGroup,
  actionError,
  selectedGroupId,
  selectedGroupDetail,
  detailLoading,
  detailError,
  onLoadGroups,
  onApplyListQuery,
  onResetListQuery,
  onStartGroup,
  onLoadGroupDetail,
  onCancelGroup,
}: MultiAgentSectionProps) {
  const { t, locale } = useLocale();
  const [projectPath, setProjectPath] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(180000);
  const [tasksJson, setTasksJson] = useState(DEFAULT_TASKS_JSON);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [listQueryError, setListQueryError] = useState<string | null>(null);
  const [listState, setListState] = useState<MultiAgentGroupState>(listQuery.state);
  const [listLimitInput, setListLimitInput] = useState(String(listQuery.limit));
  const [listOffsetInput, setListOffsetInput] = useState(String(listQuery.offset));

  const localeTag = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const formatDateTime = (value: string) => new Date(value).toLocaleString(localeTag);

  useEffect(() => {
    setListState(listQuery.state);
    setListLimitInput(String(listQuery.limit));
    setListOffsetInput(String(listQuery.offset));
  }, [listQuery.limit, listQuery.offset, listQuery.state]);

  const listStateOptions = useMemo(
    () => [
      { value: 'all' as const, label: t.settings.multiAgentStateAll },
      { value: 'running' as const, label: t.settings.multiAgentStateRunning },
      { value: 'completed' as const, label: t.settings.multiAgentStateCompleted },
      { value: 'failed' as const, label: t.settings.multiAgentStateFailed },
      { value: 'canceled' as const, label: t.settings.multiAgentStateCanceled },
      { value: 'partial' as const, label: t.settings.multiAgentStatePartial },
    ],
    [
      t.settings.multiAgentStateAll,
      t.settings.multiAgentStateRunning,
      t.settings.multiAgentStateCompleted,
      t.settings.multiAgentStateFailed,
      t.settings.multiAgentStateCanceled,
      t.settings.multiAgentStatePartial,
    ],
  );

  const groupItems = groups?.groups ?? [];
  const hasGroups = groupItems.length > 0;
  const summaryText = useMemo(() => {
    if (!groups) {
      return t.settings.multiAgentSummaryEmpty;
    }
    return t.settings.multiAgentSummaryCount.replace('{count}', String(groups.count));
  }, [groups, t.settings.multiAgentSummaryCount, t.settings.multiAgentSummaryEmpty]);

  const capacityText = useMemo(() => {
    if (!groups?.capacity) {
      return null;
    }
    return `${t.settings.multiAgentCapacityLabel}: ${t.settings.multiAgentRunningGroupsLabel} ${groups.capacity.runningGroups}/${groups.capacity.maxRunningGroups}, ${t.settings.multiAgentRunningTasksLabel} ${groups.capacity.runningTasks}/${groups.capacity.maxRunningTasks}`;
  }, [
    groups?.capacity,
    t.settings.multiAgentCapacityLabel,
    t.settings.multiAgentRunningGroupsLabel,
    t.settings.multiAgentRunningTasksLabel,
  ]);

  const startGroup = async () => {
    setEditorError(null);
    try {
      const tasks = parseTasksJson(tasksJson, t.settings.multiAgentTasksJsonInvalid);
      await onStartGroup({
        tasks,
        projectPath: projectPath.trim() || undefined,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : undefined,
      });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    }
  };

  const applyListQuery = async () => {
    const limitValue = Number.parseInt(listLimitInput, 10);
    if (!Number.isInteger(limitValue) || limitValue <= 0) {
      setListQueryError(t.settings.multiAgentListLimitInvalid);
      return;
    }

    const offsetValue = Number.parseInt(listOffsetInput, 10);
    if (!Number.isInteger(offsetValue) || offsetValue < 0) {
      setListQueryError(t.settings.multiAgentListOffsetInvalid);
      return;
    }

    setListQueryError(null);
    await onApplyListQuery({
      state: listState,
      limit: limitValue,
      offset: offsetValue,
    });
  };

  const resetListQuery = async () => {
    setListQueryError(null);
    await onResetListQuery();
  };

  return (
    <div className="settings-section">
      <h3>{t.settings.multiAgentTitle}</h3>
      <div className="multi-agent-toolbar">
        <label className="status-log-limit">
          <span>{t.settings.multiAgentProjectPath}</span>
          <input
            type="text"
            value={projectPath}
            placeholder={t.settings.multiAgentProjectPathPlaceholder}
            onChange={(event) => setProjectPath(event.target.value)}
          />
        </label>
        <label className="status-log-limit">
          <span>{t.settings.multiAgentTimeoutMs}</span>
          <input
            type="number"
            min={1000}
            step={1000}
            value={timeoutMs}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setTimeoutMs(Number.isNaN(next) ? 1000 : Math.max(1000, next));
            }}
          />
        </label>
        <button
          className="status-action-btn secondary"
          disabled={groupsLoading}
          onClick={onLoadGroups}
        >
          {groupsLoading ? t.settings.multiAgentRefreshingGroups : t.settings.multiAgentRefreshGroups}
        </button>
        <button
          className="status-action-btn"
          disabled={startingGroup}
          onClick={() => void startGroup()}
        >
          {startingGroup ? t.settings.multiAgentStartingGroup : t.settings.multiAgentStartGroup}
        </button>
      </div>

      <div className="multi-agent-list-query">
        <label className="status-log-limit">
          <span>{t.settings.multiAgentListStateLabel}</span>
          <select
            value={listState}
            onChange={(event) => setListState(event.target.value as MultiAgentGroupState)}
          >
            {listStateOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="status-log-limit">
          <span>{t.settings.multiAgentListLimitLabel}</span>
          <input
            type="number"
            min={1}
            max={200}
            value={listLimitInput}
            onChange={(event) => setListLimitInput(event.target.value)}
          />
        </label>
        <label className="status-log-limit">
          <span>{t.settings.multiAgentListOffsetLabel}</span>
          <input
            type="number"
            min={0}
            value={listOffsetInput}
            onChange={(event) => setListOffsetInput(event.target.value)}
          />
        </label>
        <button
          className="status-action-btn secondary"
          disabled={groupsLoading}
          onClick={() => void applyListQuery()}
        >
          {t.settings.multiAgentApplyListQuery}
        </button>
        <button
          className="status-action-btn secondary"
          disabled={groupsLoading}
          onClick={() => void resetListQuery()}
        >
          {t.settings.multiAgentResetListQuery}
        </button>
      </div>

      <p className="multi-agent-summary">{summaryText}</p>
      {capacityText && <p className="multi-agent-summary">{capacityText}</p>}
      <label className="multi-agent-editor">
        <span>{t.settings.multiAgentTasksJson}</span>
        <textarea
          value={tasksJson}
          onChange={(event) => setTasksJson(event.target.value)}
          rows={10}
        />
      </label>

      {listQueryError && <div className="status-error">{listQueryError}</div>}
      {editorError && <div className="status-error">{editorError}</div>}
      {actionError && <div className="status-error">{actionError}</div>}
      {groupsError && <div className="status-error">{groupsError}</div>}

      <div className="multi-agent-groups">
        {!hasGroups && <div className="logs-empty">{t.settings.multiAgentNoGroups}</div>}
        {hasGroups && groupItems.map((group) => (
          <div key={group.groupId} className="multi-agent-group-item">
            <div className="multi-agent-group-main">
              <div className="multi-agent-group-id">{group.groupId}</div>
              <div className="multi-agent-group-meta">
                <span>{t.settings.multiAgentStateLabel}: {group.state}</span>
                <span>{t.settings.multiAgentTasksLabel}: {group.startedTasks}/{group.totalTasks}</span>
                <span>{t.settings.multiAgentCreatedLabel}: {formatDateTime(group.createdAt)}</span>
              </div>
            </div>
            <div className="multi-agent-group-actions">
              <button
                className="status-action-btn secondary"
                disabled={detailLoading}
                onClick={() => void onLoadGroupDetail(group.groupId)}
              >
                {selectedGroupId === group.groupId && detailLoading
                  ? t.settings.multiAgentLoadingDetail
                  : t.settings.multiAgentViewStatus}
              </button>
              <button
                className="status-action-btn danger"
                onClick={() => void onCancelGroup(group.groupId)}
              >
                {t.settings.multiAgentCancelGroup}
              </button>
            </div>
          </div>
        ))}
      </div>

      {detailError && <div className="status-error">{detailError}</div>}
      {selectedGroupDetail && (
        <div className="multi-agent-detail">
          <h4>{t.settings.multiAgentDetailTitle}: {selectedGroupDetail.groupId}</h4>
          <div className="multi-agent-detail-meta">
            <span>{t.settings.multiAgentStateLabel}: {selectedGroupDetail.state}</span>
            <span>{t.settings.multiAgentCreatedLabel}: {formatDateTime(selectedGroupDetail.createdAt)}</span>
            {selectedGroupDetail.finishedAt && (
              <span>{t.settings.multiAgentFinishedLabel}: {formatDateTime(selectedGroupDetail.finishedAt)}</span>
            )}
          </div>
          {selectedGroupDetail.tasks && selectedGroupDetail.tasks.length > 0 ? (
            <div className="multi-agent-detail-list">
              {selectedGroupDetail.tasks.map((task, index) => (
                <div key={`${task.taskId ?? task.id ?? index}`} className="multi-agent-detail-item">
                  <div className="multi-agent-detail-title">
                    #{index + 1} {task.name ?? task.kind ?? t.settings.multiAgentTaskFallback}
                  </div>
                  <div className="multi-agent-detail-meta">
                    <span>{t.settings.multiAgentStatusLabel}: {task.status ?? t.settings.multiAgentUnknown}</span>
                    {task.taskId && <span>{t.settings.multiAgentTaskIdLabel}: {task.taskId}</span>}
                    {task.error && <span className="status-error-inline">{t.settings.multiAgentErrorLabel}: {task.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="logs-empty">{t.settings.multiAgentNoTaskDetails}</div>
          )}
        </div>
      )}
    </div>
  );
}
