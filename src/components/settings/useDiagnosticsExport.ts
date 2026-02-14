import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Messages } from '../../i18n';
import type {
  ServiceKey,
  SidecarDiagnosticsResponse,
  SidecarLogsResponse,
} from './serviceTypes';
import type {
  IssueFilter,
  ServiceViewItem,
  SummaryMode,
} from './serviceIssueTypes';
import { useAppHealthMeta } from './useAppHealthMeta';
import {
  buildDiagnosticsExportPayload,
  buildDiagnosticsSummaryText,
} from './diagnosticsExportUtils';

interface UseDiagnosticsExportOptions {
  t: Messages;
  diagnostics: SidecarDiagnosticsResponse | null;
  services: ServiceViewItem[];
  servicesToShow: ServiceViewItem[];
  issueFilter: IssueFilter;
  issueFilterLabels: Record<IssueFilter, string>;
}

export function useDiagnosticsExport({
  t,
  diagnostics,
  services,
  servicesToShow,
  issueFilter,
  issueFilterLabels,
}: UseDiagnosticsExportOptions) {
  const [exporting, setExporting] = useState(false);
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
  const appMeta = useAppHealthMeta();

  const summaryCopiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (summaryCopiedTimerRef.current !== null) {
      window.clearTimeout(summaryCopiedTimerRef.current);
    }
  }, []);

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

      const payload = buildDiagnosticsExportPayload({
        diagnostics,
        appName: appMeta?.app,
        appVersion: appMeta?.version,
        redactExport,
        includeLogsExport,
        selectedLogServices,
        safeLogLimit,
        exportLogs,
        exportLogErrors,
      });
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
        throw new Error(t.settings.clipboardNotSupported);
      }

      const summary = buildDiagnosticsSummaryText({
        services,
        servicesToShow,
        copyCurrentFilterOnly,
        summaryMode,
        issueFilter,
        issueFilterLabels,
        appVersion: appMeta?.version,
      });

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
  }, [diagnostics, issueFilter, servicesToShow, services, summaryMode, copyCurrentFilterOnly, appMeta, issueFilterLabels, t.settings.clipboardNotSupported]);

  const toggleRedactExport = useCallback(() => {
    setRedactExport((prev) => !prev);
  }, []);

  const toggleExportLogService = useCallback((service: ServiceKey, checked: boolean) => {
    setSelectedExportLogServices((prev) => ({
      ...prev,
      [service]: checked,
    }));
  }, []);

  return {
    exporting,
    redactExport,
    includeLogsExport,
    exportLogLimit,
    selectedExportLogServices,
    copyingSummary,
    summaryCopied,
    copyError,
    summaryMode,
    copyCurrentFilterOnly,
    setSummaryMode,
    setCopyCurrentFilterOnly,
    setIncludeLogsExport,
    setExportLogLimit,
    toggleRedactExport,
    toggleExportLogService,
    exportDiagnostics,
    copyDiagnosticsSummary,
  };
}

