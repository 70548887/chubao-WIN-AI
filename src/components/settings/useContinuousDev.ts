import { useCallback, useState } from 'react';

const API_BASE = 'http://localhost:3100/api/continuous-dev';

export type MonitorStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

export interface MonitorHistoryEntry {
  cycle: number;
  timestamp: string;
  detectedState: string;
  action: string;
  success: boolean;
  error?: string;
}

export interface MonitorState {
  status: MonitorStatus;
  currentCycle: number;
  totalCycles: number;
  lastScreenshotAt: string | null;
  lastAction: string | null;
  lastDetectedState: string | null;
  consecutiveErrors: number;
  history: MonitorHistoryEntry[];
  startedAt: string | null;
  stoppedAt: string | null;
  taskDescription: string;
}

export interface StartMonitorParams {
  taskDescription: string;
  intervalSeconds?: number;
  maxCycles?: number;
  projectPath?: string;
  windowTitle?: string;
  pauseOnError?: boolean;
  maxConsecutiveErrors?: number;
}

interface ApiResult {
  success: boolean;
  state?: MonitorState;
  message?: string;
}

export function useContinuousDev() {
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data: ApiResult = await res.json();
      if (data.success && data.state) {
        setMonitorState(data.state);
      } else {
        setError(data.message ?? 'Failed to load status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const startMonitor = useCallback(async (params: StartMonitorParams) => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data: ApiResult = await res.json();
      if (data.success && data.state) {
        setMonitorState(data.state);
      } else {
        setError(data.message ?? 'Failed to start monitor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, []);

  const stopMonitor = useCallback(async () => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      const data: ApiResult = await res.json();
      if (data.success && data.state) {
        setMonitorState(data.state);
      } else {
        setError(data.message ?? 'Failed to stop monitor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, []);

  const pauseMonitor = useCallback(async () => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pause`, { method: 'POST' });
      const data: ApiResult = await res.json();
      if (data.success && data.state) {
        setMonitorState(data.state);
      } else {
        setError(data.message ?? 'Failed to pause monitor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, []);

  const resumeMonitor = useCallback(async () => {
    setActionBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resume`, { method: 'POST' });
      const data: ApiResult = await res.json();
      if (data.success && data.state) {
        setMonitorState(data.state);
      } else {
        setError(data.message ?? 'Failed to resume monitor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, []);

  return {
    monitorState,
    loading,
    actionBusy,
    error,
    loadStatus,
    startMonitor,
    stopMonitor,
    pauseMonitor,
    resumeMonitor,
  };
}
