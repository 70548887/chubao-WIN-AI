import { useCallback, useState } from 'react';

const API_BASE = 'http://localhost:3100/api';

export interface SkillInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  description: string;
  tags: string[];
  source: string;
  installedAt: string;
}

export interface SkillsData {
  skills: SkillInfo[];
  warnings: string[];
  toolCount: number;
}

export interface InstallResult {
  skill: {
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    description: string;
  };
  loadedTools: string[];
  warnings: string[];
}

export interface ConfigSkill {
  id: string;
  enabled: boolean;
  capabilities: string[];
  automation: Record<string, unknown>;
  [key: string]: unknown;
}

export function useSkills() {
  const [skillsData, setSkillsData] = useState<SkillsData | null>(null);
  const [configSkills, setConfigSkills] = useState<ConfigSkill[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/skills`);
      const data = await res.json();
      if (data.success) {
        setSkillsData({
          skills: data.skills ?? [],
          warnings: data.warnings ?? [],
          toolCount: data.toolCount ?? 0,
        });
      } else {
        setError(data.message ?? 'Failed to load skills');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfigSkills = useCallback(async () => {
    try {
      const res = await fetch('/config/skills.json');
      if (!res.ok) return;
      const data = await res.json();
      if (data.skills && typeof data.skills === 'object') {
        const entries = Object.entries(data.skills).map(([id, cfg]) => ({
          id,
          ...(cfg as Record<string, unknown>),
          enabled: (cfg as Record<string, unknown>).enabled !== false,
          capabilities: Array.isArray((cfg as Record<string, unknown>).capabilities)
            ? (cfg as Record<string, unknown>).capabilities as string[]
            : [],
          automation: typeof (cfg as Record<string, unknown>).automation === 'object'
            ? (cfg as Record<string, unknown>).automation as Record<string, unknown>
            : {},
        }));
        setConfigSkills(entries as ConfigSkill[]);
      }
    } catch {
      // config/skills.json is optional
    }
  }, []);

  const installSkill = useCallback(async (skillPath: string) => {
    setInstalling(true);
    setError(null);
    setInstallResult(null);
    try {
      const res = await fetch(`${API_BASE}/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: skillPath }),
      });
      const data = await res.json();
      if (data.success) {
        setInstallResult({
          skill: data.skill,
          loadedTools: data.loadedTools ?? [],
          warnings: data.warnings ?? [],
        });
        // Refresh skills list
        await loadSkills();
      } else {
        setError(data.message ?? 'Failed to install skill');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  }, [loadSkills]);

  return {
    skillsData,
    configSkills,
    loading,
    installing,
    error,
    installResult,
    loadSkills,
    loadConfigSkills,
    installSkill,
  };
}
