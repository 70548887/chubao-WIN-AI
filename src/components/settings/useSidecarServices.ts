import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ServiceKey,
  SidecarDiagnosticsResponse,
  SidecarLogsResponse,
  SidecarPortInspectionPayload,
  SidecarStatusResponse,
} from './serviceTypes';

const SIDE_STATUS_POLL_MS = 3000;

export function useSidecarServices() {
  const [diagnostics, setDiagnostics] = useState<SidecarDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<Record<ServiceKey, boolean>>({
    node: false,
    python: false,
  });
  const [portInspectBusy, setPortInspectBusy] = useState<Record<ServiceKey, boolean>>({
    node: false,
    python: false,
  });
  const [portInspections, setPortInspections] = useState<Partial<Record<ServiceKey, SidecarPortInspectionPayload>>>({});
  const [portInspectErrors, setPortInspectErrors] = useState<Partial<Record<ServiceKey, string>>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [logService, setLogService] = useState<ServiceKey | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const refreshingRef = useRef(false);

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
      setPortInspections({
        node: data.node.portInspection,
        python: data.python.portInspection,
      });
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

  const inspectPort = useCallback(async (service: ServiceKey) => {
    setPortInspectBusy((prev) => ({ ...prev, [service]: true }));
    try {
      const data = await invoke<SidecarPortInspectionPayload>('sidecar_port_inspect', {
        service,
      });
      setPortInspections((prev) => ({
        ...prev,
        [service]: data,
      }));
      setPortInspectErrors((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPortInspectErrors((prev) => ({
        ...prev,
        [service]: message,
      }));
    } finally {
      setPortInspectBusy((prev) => ({ ...prev, [service]: false }));
    }
  }, []);

  const restartService = useCallback(async (service: ServiceKey) => {
    setActionBusy((prev) => ({ ...prev, [service]: true }));
    try {
      await invoke<SidecarStatusResponse>('restart_sidecar', { service });
      const diagnosticsData = await invoke<SidecarDiagnosticsResponse>('sidecar_diagnostics');
      setDiagnostics(diagnosticsData);
      setPortInspections((prev) => ({
        ...prev,
        [service]: diagnosticsData[service].portInspection,
      }));
      setPortInspectErrors((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
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
    }, SIDE_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  return {
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
  };
}
