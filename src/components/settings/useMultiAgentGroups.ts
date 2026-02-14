import { useCallback, useEffect, useState } from 'react';

const MULTI_AGENT_BASE = 'http://localhost:3100/api/multi-agent';

export interface MultiAgentTaskInput {
  kind?: 'delegate' | 'task';
  name?: string;
  agentType?: string;
  taskDescription?: string;
  taskCategory?: string;
  taskPrompt?: string;
}

export interface MultiAgentGroupListItem {
  groupId: string;
  state: string;
  createdAt: string;
  finishedAt?: string;
  totalTasks: number;
  startedTasks: number;
}

export interface MultiAgentGroupListPage {
  limit: number;
  offset: number;
  returned: number;
}

export interface MultiAgentGroupListCapacity {
  runningGroups: number;
  runningTasks: number;
  maxRunningGroups: number;
  maxRunningTasks: number;
}

export type MultiAgentGroupState = 'all' | 'running' | 'completed' | 'failed' | 'canceled' | 'partial';

export interface MultiAgentGroupListQuery {
  state: MultiAgentGroupState;
  limit: number;
  offset: number;
}

export interface MultiAgentGroupListPayload {
  count: number;
  groups: MultiAgentGroupListItem[];
  page?: MultiAgentGroupListPage;
  capacity?: MultiAgentGroupListCapacity;
}

interface MultiAgentGroupTaskStatus {
  id?: string;
  taskId?: string;
  name?: string;
  kind?: string;
  status?: string;
  error?: string;
}

export interface MultiAgentGroupDetail {
  groupId: string;
  state: string;
  createdAt: string;
  finishedAt?: string;
  projectPath?: string;
  timeoutMs?: number;
  summary?: Record<string, number>;
  tasks?: MultiAgentGroupTaskStatus[];
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  errorCode?: string;
  group?: T;
  groups?: T;
  result?: T;
}

const DEFAULT_GROUP_LIST_QUERY: MultiAgentGroupListQuery = {
  state: 'all',
  limit: 50,
  offset: 0,
};

function normalizeGroupListQuery(
  input?: Partial<MultiAgentGroupListQuery>,
  base: MultiAgentGroupListQuery = DEFAULT_GROUP_LIST_QUERY,
): MultiAgentGroupListQuery {
  const nextState = input?.state ?? base.state;
  const state: MultiAgentGroupState =
    nextState === 'all' ||
    nextState === 'running' ||
    nextState === 'completed' ||
    nextState === 'failed' ||
    nextState === 'canceled' ||
    nextState === 'partial'
      ? nextState
      : 'all';

  const rawLimit = input?.limit ?? base.limit;
  const normalizedLimit = Number(rawLimit);
  const limit =
    Number.isFinite(normalizedLimit) && normalizedLimit > 0
      ? Math.min(200, Math.trunc(normalizedLimit))
      : base.limit;

  const rawOffset = input?.offset ?? base.offset;
  const normalizedOffset = Number(rawOffset);
  const offset =
    Number.isFinite(normalizedOffset) && normalizedOffset >= 0
      ? Math.trunc(normalizedOffset)
      : base.offset;

  return {
    state,
    limit,
    offset,
  };
}

function buildGroupListUrl(query: MultiAgentGroupListQuery): string {
  const params = new URLSearchParams();
  params.set('state', query.state);
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));
  return `${MULTI_AGENT_BASE}/groups?${params.toString()}`;
}

function parseApiError(data: Partial<ApiResponse<unknown>>, status: number): string {
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  return `request failed: ${status}`;
}

export function useMultiAgentGroups() {
  const [groups, setGroups] = useState<MultiAgentGroupListPayload | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [startingGroup, setStartingGroup] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupDetail, setSelectedGroupDetail] = useState<MultiAgentGroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listQuery, setListQuery] = useState<MultiAgentGroupListQuery>(DEFAULT_GROUP_LIST_QUERY);

  const fetchGroupsWithQuery = useCallback(async (query: MultiAgentGroupListQuery) => {
    setGroupsLoading(true);
    try {
      const response = await fetch(buildGroupListUrl(query));
      const data = (await response.json()) as ApiResponse<MultiAgentGroupListPayload>;
      if (!response.ok || data.success !== true || !data.groups) {
        throw new Error(parseApiError(data, response.status));
      }
      setGroups(data.groups);
      setGroupsError(null);
    } catch (error) {
      setGroupsError(error instanceof Error ? error.message : String(error));
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    await fetchGroupsWithQuery(listQuery);
  }, [fetchGroupsWithQuery, listQuery]);

  const applyListQuery = useCallback(
    async (next: Partial<MultiAgentGroupListQuery>) => {
      const normalized = normalizeGroupListQuery(next, listQuery);
      setListQuery(normalized);
      await fetchGroupsWithQuery(normalized);
    },
    [fetchGroupsWithQuery, listQuery],
  );

  const resetListQuery = useCallback(async () => {
    setListQuery(DEFAULT_GROUP_LIST_QUERY);
    await fetchGroupsWithQuery(DEFAULT_GROUP_LIST_QUERY);
  }, [fetchGroupsWithQuery]);

  const startGroup = useCallback(
    async (params: {
      tasks: MultiAgentTaskInput[];
      projectPath?: string;
      timeoutMs?: number;
    }) => {
      setStartingGroup(true);
      setActionError(null);
      try {
        const response = await fetch(`${MULTI_AGENT_BASE}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });
        const data = (await response.json()) as ApiResponse<MultiAgentGroupDetail>;
        if (!response.ok || data.success !== true || !data.group) {
          throw new Error(parseApiError(data, response.status));
        }
        await loadGroups();
        setSelectedGroupId(data.group.groupId);
        setSelectedGroupDetail(data.group);
        setDetailError(null);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setStartingGroup(false);
      }
    },
    [loadGroups],
  );

  const loadGroupDetail = useCallback(async (groupId: string) => {
    setDetailLoading(true);
    setSelectedGroupId(groupId);
    try {
      const response = await fetch(`${MULTI_AGENT_BASE}/groups/${encodeURIComponent(groupId)}`);
      const data = (await response.json()) as ApiResponse<MultiAgentGroupDetail>;
      if (!response.ok || data.success !== true || !data.group) {
        throw new Error(parseApiError(data, response.status));
      }
      setSelectedGroupDetail(data.group);
      setDetailError(null);
    } catch (error) {
      setSelectedGroupDetail(null);
      setDetailError(error instanceof Error ? error.message : String(error));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const cancelGroup = useCallback(
    async (groupId: string) => {
      setActionError(null);
      try {
        const response = await fetch(`${MULTI_AGENT_BASE}/groups/${encodeURIComponent(groupId)}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        const data = (await response.json()) as ApiResponse<Record<string, unknown>>;
        if (!response.ok || data.success !== true) {
          throw new Error(parseApiError(data, response.status));
        }
        await loadGroups();
        if (selectedGroupId === groupId) {
          await loadGroupDetail(groupId);
        }
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    },
    [loadGroupDetail, loadGroups, selectedGroupId],
  );

  useEffect(() => {
    void fetchGroupsWithQuery(DEFAULT_GROUP_LIST_QUERY);
  }, [fetchGroupsWithQuery]);

  return {
    groups,
    groupsLoading,
    groupsError,
    startingGroup,
    actionError,
    selectedGroupId,
    selectedGroupDetail,
    detailLoading,
    detailError,
    listQuery,
    loadGroups,
    applyListQuery,
    resetListQuery,
    startGroup,
    loadGroupDetail,
    cancelGroup,
    setSelectedGroupId,
  };
}
