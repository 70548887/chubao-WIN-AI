import { useState, useCallback } from 'react';

export interface CliToolStatus {
  name: string;
  available: boolean;
  version?: string;
  command?: string;
  args?: string[];
  checkedAt?: string;
  cached?: boolean;
  error?: string;
  source?: string;
}

export interface CliHealthSnapshot {
  summary: {
    total: number;
    available: number;
    unavailable: number;
  };
  tools: {
    opencode: CliToolStatus;
    ohMyOpencode: CliToolStatus;
  };
}

export function useCliToolsStatus() {
  const [health, setHealth] = useState<CliHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3100/api/tools');
      const data = await response.json();
      if (data.success) {
        setHealth(data.cli);
      } else {
        throw new Error(data.error || 'Failed to load CLI tools health');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { health, loading, error, loadHealth };
}
