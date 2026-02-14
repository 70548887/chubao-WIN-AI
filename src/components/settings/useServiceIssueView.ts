import { useMemo, useState } from 'react';
import type { SidecarDiagnosticsResponse } from './serviceTypes';
import type {
  IssueFilter,
  ServiceViewItem,
} from './serviceIssueTypes';
import {
  getServiceIssueFlags,
  matchesIssueFilter,
} from './serviceIssueUtils';

export type { IssueFilter, ServiceViewItem } from './serviceIssueTypes';

export function useServiceIssueView(diagnostics: SidecarDiagnosticsResponse | null) {
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');

  const services = useMemo<ServiceViewItem[]>(
    () => (diagnostics
      ? [
        { key: 'node', label: 'Node.js Backend', diagnostics: diagnostics.node },
        { key: 'python', label: 'Python Automation', diagnostics: diagnostics.python },
      ]
      : []),
    [diagnostics],
  );

  const servicesToShow = useMemo(
    () => services.filter((item) => matchesIssueFilter(item.diagnostics, issueFilter)),
    [services, issueFilter],
  );

  const issueServiceCount = useMemo(
    () => services.filter((item) => getServiceIssueFlags(item.diagnostics).hasIssue).length,
    [services],
  );

  return {
    issueFilter,
    setIssueFilter,
    services,
    servicesToShow,
    issueServiceCount,
  };
}
