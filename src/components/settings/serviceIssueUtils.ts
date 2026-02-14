import type { ServiceDiagnosticsPayload } from './serviceTypes';
import type { IssueFilter } from './serviceIssueTypes';

export interface ServiceIssueFlags {
  hasError: boolean;
  offlineOrUnhealthy: boolean;
  externalManaged: boolean;
  hasIssue: boolean;
}

export function getServiceIssueFlags(diagnostics: ServiceDiagnosticsPayload): ServiceIssueFlags {
  const status = diagnostics.status;
  const hasError = Boolean(status.lastError || diagnostics.healthError);
  const offlineOrUnhealthy = !status.healthy;
  const externalManaged = !status.managed && status.healthy;
  return {
    hasError,
    offlineOrUnhealthy,
    externalManaged,
    hasIssue: hasError || offlineOrUnhealthy || externalManaged,
  };
}

export function matchesIssueFilter(diagnostics: ServiceDiagnosticsPayload, issueFilter: IssueFilter): boolean {
  const flags = getServiceIssueFlags(diagnostics);
  switch (issueFilter) {
    case 'all':
      return true;
    case 'offline':
      return flags.offlineOrUnhealthy;
    case 'external':
      return flags.externalManaged;
    case 'errors':
      return flags.hasError;
    case 'issues':
    default:
      return flags.hasIssue;
  }
}
