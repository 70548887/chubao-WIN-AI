import type {
  ServiceDiagnosticsPayload,
  ServiceKey,
} from './serviceTypes';

export type IssueFilter = 'all' | 'issues' | 'offline' | 'external' | 'errors';
export type SummaryMode = 'compact' | 'detailed';

export interface ServiceViewItem {
  key: ServiceKey;
  label: string;
  diagnostics: ServiceDiagnosticsPayload;
}
