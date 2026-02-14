export interface CompareEntryLike {
  group: string;
  field: string;
  before: string;
  after: string;
  changed: boolean;
  line: string;
}

export interface CompareFilterStateLike {
  groupFilter: string;
  onlyChanged: boolean;
  schemaOnly: boolean;
  keywords: string[];
}

export function filterDiagnosticCompareEntries<T extends CompareEntryLike>(
  entries: T[],
  state: CompareFilterStateLike,
): T[] {
  return entries.filter((entry) => {
    if (state.groupFilter !== 'all' && entry.group !== state.groupFilter) {
      return false;
    }
    if (state.onlyChanged && !entry.changed) {
      return false;
    }
    if (state.schemaOnly && !entry.field.toLowerCase().includes('schema')) {
      return false;
    }
    if (state.keywords.length > 0) {
      const haystack = `${entry.field} ${entry.before} ${entry.after} ${entry.line}`.toLowerCase();
      const allMatched = state.keywords.every((keyword) => haystack.includes(keyword));
      if (!allMatched) {
        return false;
      }
    }
    return true;
  });
}

export function getDiagnosticsSchemaCompatibilityHint(
  schemaVersion: string | undefined,
  currentSchema: string,
  compatSchemas: readonly string[],
): string | null {
  if (!schemaVersion) {
    return 'legacy export (missing schemaVersion), compatibility mode enabled';
  }
  if (schemaVersion === currentSchema) {
    return null;
  }
  if (compatSchemas.includes(schemaVersion)) {
    return `legacy schema ${schemaVersion}, compatibility mode enabled`;
  }
  if (schemaVersion.startsWith('diagnostics.')) {
    return `unrecognized schema ${schemaVersion}, using best-effort compatibility mode`;
  }
  return `non-standard schema ${schemaVersion}, using best-effort compatibility mode`;
}

export function formatSchemaHint(
  fileName: string,
  schemaVersion: string | undefined,
  currentSchema: string,
  compatSchemas: readonly string[],
): string | null {
  const hint = getDiagnosticsSchemaCompatibilityHint(schemaVersion, currentSchema, compatSchemas);
  if (!hint) {
    return null;
  }
  return `${fileName}: ${hint}`;
}
