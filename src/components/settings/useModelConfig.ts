import { useState, useEffect, useCallback } from 'react';

export interface ModelProviderInfo {
  model: string;
  baseUrl: string;
  hasKey: boolean;
}

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'ohmygpt';
  openai: ModelProviderInfo;
  anthropic: ModelProviderInfo;
  ohmygpt: ModelProviderInfo;
}

interface ModelConfigState {
  config: ModelConfig | null;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  persisting: boolean;
  persisted: boolean;
  persistError: string | null;
  error: string | null;
  claudeCodeStatus: 'idle' | 'syncing' | 'synced' | 'not_found' | 'error';
  claudeCodeFound: boolean;
  claudeCodeError: string | null;
}

const API_BASE = 'http://localhost:3100';

export function useModelConfig() {
  const [state, setState] = useState<ModelConfigState>({
    config: null,
    loading: true,
    saving: false,
    saved: false,
    persisting: false,
    persisted: false,
    persistError: null,
    error: null,
    claudeCodeStatus: 'idle',
    claudeCodeFound: false,
    claudeCodeError: null,
  });

  const fetchConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [configRes, ccRes] = await Promise.all([
        fetch(`${API_BASE}/api/config/model`),
        fetch(`${API_BASE}/api/config/claude-code`).catch(() => null),
      ]);
      const data = await configRes.json();
      let ccFound = false;
      if (ccRes && ccRes.ok) {
        const ccData = await ccRes.json();
        ccFound = !!ccData.found && !!ccData.apiKey;
      }
      if (data.success && data.config) {
        setState((prev) => ({ ...prev, config: data.config, loading: false, claudeCodeFound: ccFound }));
      } else {
        setState((prev) => ({ ...prev, loading: false, error: data.message ?? 'Failed to load config' }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: (err as Error).message }));
    }
  }, []);

  const saveConfig = useCallback(async (patch: Record<string, string>) => {
    setState((prev) => ({ ...prev, saving: true, saved: false, error: null }));
    try {
      const response = await fetch(`${API_BASE}/api/config/model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (data.success && data.config) {
        setState((prev) => ({ ...prev, config: data.config, saving: false, saved: true }));
        setTimeout(() => setState((prev) => ({ ...prev, saved: false })), 2000);
      } else {
        setState((prev) => ({ ...prev, saving: false, error: data.message ?? 'Save failed' }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, saving: false, error: (err as Error).message }));
    }
  }, []);

  const persistConfig = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      persisting: true,
      persisted: false,
      persistError: null,
      error: null,
    }));

    try {
      const response = await fetch(`${API_BASE}/api/config/model/persist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          includeSecrets: true,
        }),
      });

      const data = await response.json();
      if (data.success === true && data.result) {
        setState((prev) => ({
          ...prev,
          persisting: false,
          persisted: true,
          persistError: null,
        }));
        setTimeout(() => setState((prev) => ({ ...prev, persisted: false })), 2500);
      } else {
        setState((prev) => ({
          ...prev,
          persisting: false,
          persistError: data.message ?? 'Persist failed',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        persisting: false,
        persistError: (err as Error).message,
      }));
    }
  }, []);

  const syncFromClaudeCode = useCallback(async () => {
    setState((prev) => ({ ...prev, claudeCodeStatus: 'syncing', claudeCodeError: null }));
    try {
      const response = await fetch(`${API_BASE}/api/config/sync-claude-code`, { method: 'POST' });
      const data = await response.json();
      if (data.success && data.config) {
        setState((prev) => ({
          ...prev,
          config: data.config,
          claudeCodeStatus: 'synced',
          claudeCodeError: null,
        }));
        setTimeout(() => setState((prev) => ({ ...prev, claudeCodeStatus: 'idle' })), 3000);
      } else {
        setState((prev) => ({
          ...prev,
          claudeCodeStatus: data.error?.includes('not found') ? 'not_found' : 'error',
          claudeCodeError: data.error ?? 'Sync failed',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        claudeCodeStatus: 'error',
        claudeCodeError: (err as Error).message,
      }));
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { ...state, fetchConfig, saveConfig, persistConfig, syncFromClaudeCode };
}
