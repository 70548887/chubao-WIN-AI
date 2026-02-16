import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n';
import type { MonitorState, StartMonitorParams } from './useContinuousDev';

interface ContinuousDevSectionProps {
  monitorState: MonitorState | null;
  loading: boolean;
  actionBusy: boolean;
  error: string | null;
  onLoadStatus: () => void;
  onStart: (params: StartMonitorParams) => Promise<void>;
  onStop: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#888',
  running: '#4caf50',
  paused: '#ff9800',
  stopped: '#f44336',
  completed: '#2196f3',
};

export default function ContinuousDevSection({
  monitorState,
  loading,
  actionBusy,
  error,
  onLoadStatus,
  onStart,
  onStop,
  onPause,
  onResume,
}: ContinuousDevSectionProps) {
  const { t } = useLocale();
  const s = t.settings;

  const [taskDescription, setTaskDescription] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [maxCycles, setMaxCycles] = useState(0);
  const [projectPath, setProjectPath] = useState('');
  const [windowTitle, setWindowTitle] = useState('OpenCode');
  const [pauseOnError, setPauseOnError] = useState(true);
  const [maxConsecutiveErrors, setMaxConsecutiveErrors] = useState(3);

  useEffect(() => {
    onLoadStatus();
  }, [onLoadStatus]);

  // Auto-refresh while running
  useEffect(() => {
    if (monitorState?.status !== 'running') return;
    const timer = setInterval(onLoadStatus, 10_000);
    return () => clearInterval(timer);
  }, [monitorState?.status, onLoadStatus]);

  const handleStart = async () => {
    if (!taskDescription.trim()) return;
    await onStart({
      taskDescription: taskDescription.trim(),
      intervalSeconds,
      maxCycles,
      projectPath: projectPath.trim() || undefined,
      windowTitle: windowTitle.trim() || undefined,
      pauseOnError,
      maxConsecutiveErrors,
    });
  };

  const status = monitorState?.status ?? 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const canStart = !isRunning && !isPaused;

  const statusLabel = {
    idle: s.continuousDevStatusIdle,
    running: s.continuousDevStatusRunning,
    paused: s.continuousDevStatusPaused,
    stopped: s.continuousDevStatusStopped,
    completed: s.continuousDevStatusCompleted,
  }[status] ?? status;

  return (
    <div className="settings-section">
      <h3>{s.continuousDevTitle}</h3>

      {/* Status indicator */}
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[status] ?? '#888',
            marginRight: 6,
          }}
        />
        <strong>{statusLabel}</strong>
        {monitorState && (isRunning || isPaused) && (
          <span style={{ marginLeft: 12, color: '#888' }}>
            {s.continuousDevCycleLabel}: {monitorState.currentCycle}
            {monitorState.totalCycles > 0 ? ` / ${monitorState.totalCycles}` : ''}
          </span>
        )}
      </div>

      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {/* Config form - show only when can start */}
      {canStart && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <label>
            {s.continuousDevTaskDescription}
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder={s.continuousDevTaskDescriptionPlaceholder}
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              {s.continuousDevIntervalSeconds}
              <input
                type="number"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Math.max(10, Number(e.target.value) || 30))}
                min={10}
              />
            </label>
            <label>
              {s.continuousDevMaxCycles}
              <input
                type="number"
                value={maxCycles}
                onChange={(e) => setMaxCycles(Math.max(0, Number(e.target.value) || 0))}
                min={0}
              />
              <small style={{ color: '#888' }}>{s.continuousDevMaxCyclesHint}</small>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              {s.continuousDevProjectPath}
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder={s.continuousDevProjectPathPlaceholder}
              />
            </label>
            <label>
              {s.continuousDevWindowTitle}
              <input
                type="text"
                value={windowTitle}
                onChange={(e) => setWindowTitle(e.target.value)}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={pauseOnError}
                onChange={(e) => setPauseOnError(e.target.checked)}
              />
              {s.continuousDevPauseOnError}
            </label>
            <label>
              {s.continuousDevMaxConsecutiveErrors}
              <input
                type="number"
                value={maxConsecutiveErrors}
                onChange={(e) => setMaxConsecutiveErrors(Math.max(1, Number(e.target.value) || 3))}
                min={1}
                style={{ width: 60, marginLeft: 4 }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {canStart && (
          <button
            onClick={() => void handleStart()}
            disabled={actionBusy || !taskDescription.trim()}
          >
            {actionBusy ? s.continuousDevStarting : s.continuousDevStart}
          </button>
        )}
        {isRunning && (
          <>
            <button onClick={() => void onPause()} disabled={actionBusy}>
              {s.continuousDevPause}
            </button>
            <button onClick={() => void onStop()} disabled={actionBusy}>
              {s.continuousDevStop}
            </button>
          </>
        )}
        {isPaused && (
          <>
            <button onClick={() => void onResume()} disabled={actionBusy}>
              {s.continuousDevResume}
            </button>
            <button onClick={() => void onStop()} disabled={actionBusy}>
              {s.continuousDevStop}
            </button>
          </>
        )}
        <button onClick={onLoadStatus} disabled={loading}>
          {loading ? t.common.loading : t.settings.refreshStatus}
        </button>
      </div>

      {/* Runtime info */}
      {monitorState && monitorState.status !== 'idle' && (
        <div style={{ fontSize: '0.9em', marginBottom: 12 }}>
          {monitorState.taskDescription && (
            <div><strong>{s.continuousDevTaskDescription}:</strong> {monitorState.taskDescription}</div>
          )}
          {monitorState.lastDetectedState && (
            <div><strong>{s.continuousDevLastState}:</strong> {monitorState.lastDetectedState}</div>
          )}
          {monitorState.lastAction && (
            <div><strong>{s.continuousDevLastAction}:</strong> {monitorState.lastAction.slice(0, 120)}</div>
          )}
          {monitorState.lastScreenshotAt && (
            <div><strong>{s.continuousDevLastScreenshot}:</strong> {monitorState.lastScreenshotAt}</div>
          )}
          {monitorState.consecutiveErrors > 0 && (
            <div style={{ color: '#f44336' }}>
              <strong>{s.continuousDevConsecutiveErrors}:</strong> {monitorState.consecutiveErrors}
            </div>
          )}
          {monitorState.startedAt && (
            <div><strong>{s.continuousDevStartedAt}:</strong> {monitorState.startedAt}</div>
          )}
          {monitorState.stoppedAt && (
            <div><strong>{s.continuousDevStoppedAt}:</strong> {monitorState.stoppedAt}</div>
          )}
        </div>
      )}

      {/* History */}
      {monitorState && monitorState.history.length > 0 && (
        <details>
          <summary>{s.continuousDevHistoryTitle} ({monitorState.history.length})</summary>
          <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: '0.85em', marginTop: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>{s.continuousDevLastState}</th>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>{s.continuousDevLastAction}</th>
                  <th style={{ textAlign: 'left', padding: '2px 6px' }}>{s.continuousDevStartedAt}</th>
                </tr>
              </thead>
              <tbody>
                {[...monitorState.history].reverse().map((entry, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid #333' }}>
                    <td style={{ padding: '2px 6px' }}>{entry.cycle}</td>
                    <td style={{ padding: '2px 6px' }}>
                      <span style={{
                        color: entry.success ? '#4caf50' : '#f44336',
                      }}>
                        {entry.detectedState}
                      </span>
                    </td>
                    <td style={{ padding: '2px 6px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.error ?? entry.action}
                    </td>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      {entry.timestamp?.slice(11, 19) ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {monitorState && monitorState.history.length === 0 && monitorState.status !== 'idle' && (
        <p style={{ color: '#888' }}>{s.continuousDevNoHistory}</p>
      )}
    </div>
  );
}
