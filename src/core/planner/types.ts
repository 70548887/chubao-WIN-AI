import type { UserIntent } from '../intent/types';

export type PlanAction =
  | 'fetch_coding_progress'
  | 'fetch_windows'
  | 'check_services'
  | 'call_chat';

export interface PlanStep {
  id: string;
  action: PlanAction;
  reason: string;
  required: boolean;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
}

export interface ExecutionPlan {
  intent: UserIntent;
  originalMessage: string;
  steps: PlanStep[];
}
