import type { Express, Response } from 'express';

export type MultiAgentErrorCode =
  | 'INVALID_ARGUMENT'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

export type MultiAgentSendError = (
  res: Response,
  statusCode: number,
  errorCode: MultiAgentErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => void;

interface MultiAgentRouteDeps {
  app: Express;
  initializeSkills: () => Promise<void>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  inferErrorCode: (error: unknown) => MultiAgentErrorCode;
  sendError: MultiAgentSendError;
}

type MultiAgentGroupState = 'all' | 'running' | 'completed' | 'failed' | 'canceled' | 'partial';

const MULTI_AGENT_GROUP_STATES: ReadonlySet<MultiAgentGroupState> = new Set([
  'all',
  'running',
  'completed',
  'failed',
  'canceled',
  'partial',
]);

function readQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') {
      return first;
    }
  }
  return undefined;
}

function parseQueryInt(raw: string | undefined, field: string, min: number): number | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${field} must be an integer >= ${min}`);
  }
  return parsed;
}

function statusCodeForErrorCode(code: MultiAgentErrorCode): number {
  if (code === 'INVALID_ARGUMENT') {
    return 400;
  }
  if (code === 'FORBIDDEN') {
    return 403;
  }
  if (code === 'NOT_FOUND') {
    return 404;
  }
  if (code === 'TIMEOUT') {
    return 504;
  }
  if (code === 'SERVICE_UNAVAILABLE' || code === 'DEPENDENCY_UNAVAILABLE') {
    return 503;
  }
  return 500;
}

export function registerMultiAgentRoutes({
  app,
  initializeSkills,
  executeTool,
  inferErrorCode,
  sendError,
}: MultiAgentRouteDeps): void {
  app.post('/api/multi-agent/start', async (req, res) => {
    const tasks = req.body?.tasks;
    const projectPath = req.body?.projectPath;
    const timeoutMsRaw = req.body?.timeoutMs;
    const timeoutMs = timeoutMsRaw === undefined ? undefined : Number(timeoutMsRaw);

    if (!Array.isArray(tasks) || tasks.length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'tasks (non-empty array) is required', {
        field: 'tasks',
      });
      return;
    }
    if (projectPath !== undefined && typeof projectPath !== 'string') {
      sendError(res, 400, 'INVALID_ARGUMENT', 'projectPath must be a string', {
        field: 'projectPath',
      });
      return;
    }
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 1000)) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'timeoutMs must be >= 1000', {
        field: 'timeoutMs',
      });
      return;
    }

    try {
      await initializeSkills();
      const group = await executeTool('multi_agent_start', {
        tasks,
        projectPath,
        timeoutMs,
      });
      res.json({
        success: true,
        group,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/multi-agent/groups', async (req, res) => {
    const stateRaw = readQueryString(req.query.state);
    const limitRaw = readQueryString(req.query.limit);
    const offsetRaw = readQueryString(req.query.offset);
    let state: MultiAgentGroupState | undefined;
    let limit: number | undefined;
    let offset: number | undefined;

    try {
      if (stateRaw !== undefined) {
        const normalizedState = stateRaw.trim().toLowerCase() as MultiAgentGroupState;
        if (!MULTI_AGENT_GROUP_STATES.has(normalizedState)) {
          throw new Error('state must be one of all/running/completed/failed/canceled/partial');
        }
        state = normalizedState;
      }

      limit = parseQueryInt(limitRaw, 'limit', 1);
      offset = parseQueryInt(offsetRaw, 'offset', 0);
    } catch (error) {
      sendError(res, 400, 'INVALID_ARGUMENT', error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      await initializeSkills();
      const listArgs: Record<string, unknown> = {};
      if (state !== undefined) {
        listArgs.state = state;
      }
      if (limit !== undefined) {
        listArgs.limit = limit;
      }
      if (offset !== undefined) {
        listArgs.offset = offset;
      }
      const data = await executeTool('multi_agent_group_list', {
        ...listArgs,
      });
      res.json({
        success: true,
        groups: data,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/multi-agent/groups/:groupId', async (req, res) => {
    const groupId = req.params.groupId;
    if (!groupId || groupId.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'groupId is required', {
        field: 'groupId',
      });
      return;
    }

    try {
      await initializeSkills();
      const group = await executeTool('multi_agent_group_status', {
        groupId,
      });
      res.json({
        success: true,
        group,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });

  app.post('/api/multi-agent/groups/:groupId/cancel', async (req, res) => {
    const groupId = req.params.groupId;
    if (!groupId || groupId.trim().length === 0) {
      sendError(res, 400, 'INVALID_ARGUMENT', 'groupId is required', {
        field: 'groupId',
      });
      return;
    }

    try {
      await initializeSkills();
      const result = await executeTool('multi_agent_group_cancel', {
        groupId,
      });
      res.json({
        success: true,
        result,
      });
    } catch (error) {
      const code = inferErrorCode(error);
      sendError(res, statusCodeForErrorCode(code), code, error instanceof Error ? error.message : String(error));
    }
  });
}
