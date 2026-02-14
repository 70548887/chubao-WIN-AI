import { describe, expect, it } from 'vitest';
import {
  filterDiagnosticCompareEntries,
  formatSchemaHint,
  getDiagnosticsSchemaCompatibilityHint,
  type CompareEntryLike,
} from './compareUtils';

const CURRENT_SCHEMA = 'diagnostics.v1.2';
const COMPAT_SCHEMAS = ['diagnostics.v1.1', CURRENT_SCHEMA] as const;

describe('compareUtils schema filtering', () => {
  const entries: CompareEntryLike[] = [
    {
      group: 'meta',
      field: 'schemaVersion',
      before: 'diagnostics.v1.1',
      after: 'diagnostics.v1.2',
      changed: true,
      line: 'meta.schemaVersion: diagnostics.v1.1 -> diagnostics.v1.2',
    },
    {
      group: 'meta',
      field: 'appVersion',
      before: '0.1.0',
      after: '0.1.1',
      changed: true,
      line: 'meta.appVersion: 0.1.0 -> 0.1.1',
    },
    {
      group: 'python',
      field: 'health.ocr.apiVersion',
      before: 'v2',
      after: 'v3',
      changed: true,
      line: 'python.health.ocr.apiVersion: v2 -> v3',
    },
  ];

  it('filters only schema-related entries when schemaOnly=true', () => {
    const filtered = filterDiagnosticCompareEntries(entries, {
      groupFilter: 'all',
      onlyChanged: false,
      schemaOnly: true,
      keywords: [],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.field).toBe('schemaVersion');
  });

  it('keeps schema filter composable with keywords', () => {
    const filtered = filterDiagnosticCompareEntries(entries, {
      groupFilter: 'all',
      onlyChanged: false,
      schemaOnly: true,
      keywords: ['diagnostics.v1.2'],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.line).toContain('diagnostics.v1.2');
  });

  it('applies schema filter together with group filter', () => {
    const filtered = filterDiagnosticCompareEntries(entries, {
      groupFilter: 'python',
      onlyChanged: false,
      schemaOnly: true,
      keywords: [],
    });

    expect(filtered).toHaveLength(0);
  });
});

describe('compareUtils schema compatibility hints', () => {
  it('returns null for current schema', () => {
    expect(getDiagnosticsSchemaCompatibilityHint(CURRENT_SCHEMA, CURRENT_SCHEMA, COMPAT_SCHEMAS)).toBeNull();
  });

  it('returns legacy hint for v1.1 schema', () => {
    const hint = getDiagnosticsSchemaCompatibilityHint('diagnostics.v1.1', CURRENT_SCHEMA, COMPAT_SCHEMAS);
    expect(hint).toContain('legacy schema diagnostics.v1.1');
  });

  it('returns legacy hint for missing schema', () => {
    const hint = getDiagnosticsSchemaCompatibilityHint(undefined, CURRENT_SCHEMA, COMPAT_SCHEMAS);
    expect(hint).toContain('missing schemaVersion');
  });

  it('formats file-level compatibility hint', () => {
    const hint = formatSchemaHint('baseline.json', 'diagnostics.v1.1', CURRENT_SCHEMA, COMPAT_SCHEMAS);
    expect(hint).toContain('baseline.json');
    expect(hint).toContain('legacy schema diagnostics.v1.1');
  });
});
