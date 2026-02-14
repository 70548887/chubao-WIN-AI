import type { UserIntent } from './types';

const INTENT_RULES: Array<{
  intent: Exclude<UserIntent, 'general_chat'>;
  patterns: RegExp[];
}> = [
  {
    intent: 'coding_progress',
    patterns: [
      /\bqoder\b/i,
      /\bcoding\s+progress\b/i,
      /\bgit\b/i,
      /\bcommit(s)?\b/i,
      /\bbranch\b/i,
      /\u4ee3\u7801/, // "code"
      /\u7f16\u7a0b/, // "coding"
      /\u8fdb\u5ea6/, // "progress"
    ],
  },
  {
    intent: 'automation_windows',
    patterns: [
      /\bwindow(s)?\b/i,
      /\bui\s*automation\b/i,
      /\u7a97\u53e3/, // "window"
      /\u81ea\u52a8\u5316/, // "automation"
    ],
  },
  {
    intent: 'service_status',
    patterns: [
      /\bstatus\b/i,
      /\bhealth\b/i,
      /\bsidecar\b/i,
      /\u72b6\u6001/, // "status"
      /\u5065\u5eb7/, // "health"
      /\u540e\u7aef/, // "backend"
    ],
  },
];

export function classifyIntent(message: string): UserIntent {
  const normalized = message.trim();
  if (!normalized) {
    return 'general_chat';
  }

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.intent;
    }
  }

  return 'general_chat';
}
