import { usePerformanceMonitor, useLongTaskMonitor } from '../hooks/usePerformanceMonitor';
import { useState, useCallback } from 'react';

export function PerformancePanel() {
  const { metrics } = usePerformanceMonitor(true);
  const longTasks = useLongTaskMonitor(true, 50);
  const [isExpanded, setIsExpanded] = useState(false);

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return 'var(--success)';
    if (fps >= 30) return 'var(--warning)';
    return 'var(--error)';
  };

  const formatBytes = (mb: number) => `${mb} MB`;

  if (!isExpanded) {
    return (
      <div className="performance-badge" onClick={() => setIsExpanded(true)}>
        <span style={{ color: getFPSColor(metrics.fps) }}>
          {metrics.fps} FPS
        </span>
        {metrics.memory && (
          <span className="memory-badge">
            {formatBytes(metrics.memory.used)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="performance-panel">
      <div className="panel-header">
        <h4>性能监控</h4>
        <button onClick={() => setIsExpanded(false)}>收起</button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">FPS</span>
          <span className="metric-value" style={{ color: getFPSColor(metrics.fps) }}>
            {metrics.fps}
          </span>
        </div>

        {metrics.memory && (
          <>
            <div className="metric-card">
              <span className="metric-label">内存使用</span>
              <span className="metric-value">
                {formatBytes(metrics.memory.used)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">内存限制</span>
              <span className="metric-value">
                {formatBytes(metrics.memory.limit)}
              </span>
            </div>
          </>
        )}

        {metrics.timing && (
          <>
            <div className="metric-card">
              <span className="metric-label">DOM 加载</span>
              <span className="metric-value">
                {metrics.timing.domContentLoaded}ms
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">页面加载</span>
              <span className="metric-value">
                {metrics.timing.loadComplete}ms
              </span>
            </div>
          </>
        )}
      </div>

      {longTasks.length > 0 && (
        <div className="long-tasks">
          <h5>长任务警告 ({longTasks.length})</h5>
          <ul>
            {longTasks.slice(-5).map((task, index) => (
              <li key={index}>
                {task.name}: {task.duration.toFixed(2)}ms
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
