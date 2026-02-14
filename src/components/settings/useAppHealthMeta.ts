import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AppHealthPayload {
  status: string;
  app: string;
  version: string;
}

export function useAppHealthMeta() {
  const [appMeta, setAppMeta] = useState<AppHealthPayload | null>(null);

  useEffect(() => {
    let active = true;
    invoke<AppHealthPayload>('health')
      .then((data) => {
        if (active) {
          setAppMeta(data);
        }
      })
      .catch(() => {
        // no-op: allow export without app metadata
      });

    return () => {
      active = false;
    };
  }, []);

  return appMeta;
}
