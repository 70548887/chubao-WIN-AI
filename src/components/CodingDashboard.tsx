import { useCallback, useEffect, useState } from 'react';
import type {
  CodingProgressPayload,
  CodingCommitItem,
} from '../skills/coding/types';
import { analyzeCodingProgress, type CodingProgressInsights } from '../skills/coding';
import { useLocale } from '../i18n';

const API_URL =
  'http://localhost:3100/api/coding/progress?sinceDays=7&maxFiles=30&includeUntracked=true';

function CodingDashboard() {
  const { t } = useLocale();
  const [progress, setProgress] = useState<CodingProgressPayload | null>(null);
  const [insights, setInsights] = useState<CodingProgressInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      if (!res.ok || !data.success || !data.progress) {
        throw new Error(data.message ?? 'Failed to fetch coding progress');
      }
      const p: CodingProgressPayload = data.progress;
      setProgress(p);
      setInsights(analyzeCodingProgress(p));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading && !progress) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-loading">{t.dashboard.loading}</div>
      </div>
    );
  }

  if (error && !progress) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-error">
          <p>{error}</p>
          <button onClick={() => void refresh()}>{t.dashboard.retry}</button>
        </div>
      </div>
    );
  }

  if (!progress) return null;

  const { counts } = progress;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>{t.dashboard.title}</h2>
        <div className="dashboard-actions">
          {lastRefresh && (
            <span className="refresh-time">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            className="refresh-btn"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? '...' : t.dashboard.refresh}
          </button>
        </div>
      </div>

      {/* Git Branch Info */}
      <div className="dashboard-section">
        <h3>{t.dashboard.repository}</h3>
        <div className="info-grid">
          <div className="info-card">
            <span className="info-label">{t.dashboard.branch}</span>
            <span className="info-value branch-name">{progress.branch}</span>
          </div>
          <div className="info-card">
            <span className="info-label">{t.dashboard.upstream}</span>
            <span className="info-value">{progress.upstream ?? t.dashboard.upstreamNone}</span>
          </div>
          <div className="info-card">
            <span className="info-label">{t.dashboard.aheadBehind}</span>
            <span className="info-value">
              <span className={progress.ahead > 0 ? 'text-green' : ''}>{progress.ahead}</span>
              {' / '}
              <span className={progress.behind > 0 ? 'text-red' : ''}>{progress.behind}</span>
            </span>
          </div>
          <div className="info-card">
            <span className="info-label">{t.dashboard.workingTree}</span>
            <span className={`info-value ${progress.clean ? 'text-green' : 'text-yellow'}`}>
              {progress.clean ? t.dashboard.clean : t.dashboard.dirty}
            </span>
          </div>
        </div>
      </div>

      {/* File Change Stats */}
      <div className="dashboard-section">
        <h3>{t.dashboard.fileChanges}</h3>
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-number">{counts.totalFiles}</span>
            <span className="stat-label">{t.dashboard.total}</span>
          </div>
          <div className="stat-item text-green">
            <span className="stat-number">+{counts.added}</span>
            <span className="stat-label">{t.dashboard.added}</span>
          </div>
          <div className="stat-item text-yellow">
            <span className="stat-number">{counts.modified}</span>
            <span className="stat-label">{t.dashboard.modified}</span>
          </div>
          <div className="stat-item text-red">
            <span className="stat-number">-{counts.deleted}</span>
            <span className="stat-label">{t.dashboard.deleted}</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{counts.staged}</span>
            <span className="stat-label">{t.dashboard.staged}</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{counts.untracked}</span>
            <span className="stat-label">{t.dashboard.untracked}</span>
          </div>
        </div>
      </div>

      {/* Velocity */}
      {insights && (
        <div className="dashboard-section">
          <h3>{t.dashboard.developmentVelocity} ({progress.sinceDays}d)</h3>
          <div className="info-grid">
            <div className="info-card">
              <span className="info-label">{t.dashboard.totalCommits}</span>
              <span className="info-value">{progress.commitCountSince}</span>
            </div>
            <div className="info-card">
              <span className="info-label">{t.dashboard.commitsPerDay}</span>
              <span className="info-value">{insights.commitsPerDay.toFixed(1)}</span>
            </div>
            <div className="info-card">
              <span className="info-label">{t.dashboard.velocity}</span>
              <span className={`info-value velocity-${insights.velocity}`}>
                {insights.velocity}
              </span>
            </div>
            {insights.activeAuthors.length > 0 && (
              <div className="info-card">
                <span className="info-label">{t.dashboard.authors}</span>
                <span className="info-value">{insights.activeAuthors.join(', ')}</span>
              </div>
            )}
          </div>
          {insights.topExtensions.length > 0 && (
            <div className="extension-bar">
              {insights.topExtensions.map((ext) => (
                <span key={ext.ext} className="ext-tag">
                  {ext.ext} ({ext.count})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Commits */}
      <div className="dashboard-section">
        <h3>{t.dashboard.recentCommits}</h3>
        <div className="commit-list">
          {progress.recentCommits.length === 0 && (
            <div className="empty-state">{t.dashboard.noCommitsFound}</div>
          )}
          {progress.recentCommits.map((commit: CodingCommitItem) => (
            <div key={commit.hash} className="commit-item">
              <div className="commit-header">
                <span className="commit-hash">{commit.hash.slice(0, 8)}</span>
                <span className="commit-date">
                  {new Date(commit.date).toLocaleDateString()}
                </span>
              </div>
              <div className="commit-subject">{commit.subject}</div>
              <div className="commit-author">{commit.author}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Changed Files */}
      <div className="dashboard-section">
        <h3>{t.dashboard.changedFilesTitle} ({counts.totalFiles})</h3>
        <div className="file-list">
          {progress.changedFiles.length === 0 && (
            <div className="empty-state">{t.dashboard.noChangedFiles}</div>
          )}
          {progress.changedFiles.map((file) => (
            <div key={file} className="file-item">
              <span className="file-icon">
                {file.endsWith('/') ? '📁' : '📄'}
              </span>
              <span className="file-path">{file}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="dashboard-toast-error">
          {t.dashboard.refreshFailed}{error}
        </div>
      )}
    </div>
  );
}

export default CodingDashboard;
