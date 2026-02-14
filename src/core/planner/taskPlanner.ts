import type { UserIntent } from '../intent/types';
import type { ExecutionPlan } from './types';

export function buildExecutionPlan(intent: UserIntent, message: string): ExecutionPlan {
  switch (intent) {
    case 'coding_progress':
      return {
        intent,
        originalMessage: message,
        steps: [
          {
            id: 'coding-status-precheck-1',
            action: 'check_services',
            reason: 'Collect current sidecar health before requesting coding progress.',
            required: false,
            timeoutMs: 4000,
            retryCount: 0,
            retryDelayMs: 0,
          },
          {
            id: 'coding-progress-fetch-2',
            action: 'fetch_coding_progress',
            reason: 'Message asks for coding/git progress information.',
            required: true,
            timeoutMs: 12000,
            retryCount: 1,
            retryDelayMs: 350,
          },
        ],
      };
    case 'automation_windows':
      return {
        intent,
        originalMessage: message,
        steps: [
          {
            id: 'automation-status-precheck-1',
            action: 'check_services',
            reason: 'Collect current sidecar health before querying window list.',
            required: false,
            timeoutMs: 4000,
            retryCount: 0,
            retryDelayMs: 0,
          },
          {
            id: 'automation-windows-fetch-2',
            action: 'fetch_windows',
            reason: 'Message asks for desktop window/automation context.',
            required: true,
            timeoutMs: 9000,
            retryCount: 1,
            retryDelayMs: 300,
          },
        ],
      };
    case 'service_status':
      return {
        intent,
        originalMessage: message,
        steps: [
          {
            id: 'service-status-1',
            action: 'check_services',
            reason: 'Message asks for runtime health/status of sidecars.',
            required: true,
            timeoutMs: 5000,
            retryCount: 0,
            retryDelayMs: 0,
          },
        ],
      };
    case 'general_chat':
    default:
      return {
        intent: 'general_chat',
        originalMessage: message,
        steps: [
          {
            id: 'chat-1',
            action: 'call_chat',
            reason: 'Fallback to normal chat completion endpoint.',
            required: true,
            timeoutMs: 30000,
            retryCount: 1,
            retryDelayMs: 400,
          },
        ],
      };
  }
}
