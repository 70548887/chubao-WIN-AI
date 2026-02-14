import type { Messages } from '../../i18n';

interface CodingCommitItem {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

interface CodingProgressCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  modified: number;
  added: number;
  deleted: number;
  renamed: number;
  conflicted: number;
  totalFiles: number;
}

interface CodingProgressPayload {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  counts: CodingProgressCounts;
  changedFiles: string[];
  lastCommit: CodingCommitItem | null;
  recentCommits: CodingCommitItem[];
  commitCountSince: number;
  sinceDays: number;
  generatedAt: string;
}

interface CodingProgressInsights {
  velocity: 'low' | 'medium' | 'high';
  commitsPerDay: number;
  topExtensions: Array<{ ext: string; count: number }>;
  activeAuthors: string[];
}

interface CodingProgressSectionProps {
  t: Messages;
  codingSinceDays: number;
  codingMaxFiles: number;
  codingIncludeUntracked: boolean;
  codingLoading: boolean;
  codingError: string | null;
  codingProgress: CodingProgressPayload | null;
  codingInsights: CodingProgressInsights | null;
  codingVelocityLabels: Record<string, string>;
  onCodingSinceDaysChange: (value: number) => void;
  onCodingMaxFilesChange: (value: number) => void;
  onCodingIncludeUntrackedChange: (value: boolean) => void;
  onLoadCodingProgress: () => void;
}

export default function CodingProgressSection({
  t,
  codingSinceDays,
  codingMaxFiles,
  codingIncludeUntracked,
  codingLoading,
  codingError,
  codingProgress,
  codingInsights,
  codingVelocityLabels,
  onCodingSinceDaysChange,
  onCodingMaxFilesChange,
  onCodingIncludeUntrackedChange,
  onLoadCodingProgress,
}: CodingProgressSectionProps) {
  return (
    <div className="settings-section">
      <h3>{t.settings.codingProgress}</h3>
      <div className="coding-progress-toolbar">
        <label className="status-log-limit">
          <span>{t.settings.sinceDays}</span>
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={codingSinceDays}
            disabled={codingLoading}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onCodingSinceDaysChange(Number.isNaN(parsed) ? 1 : Math.min(365, Math.max(1, parsed)));
            }}
          />
        </label>
        <label className="status-log-limit">
          <span>{t.settings.maxFiles}</span>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={codingMaxFiles}
            disabled={codingLoading}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onCodingMaxFilesChange(Number.isNaN(parsed) ? 1 : Math.min(200, Math.max(1, parsed)));
            }}
          />
        </label>
        <label className="status-checkbox">
          <input
            type="checkbox"
            checked={codingIncludeUntracked}
            disabled={codingLoading}
            onChange={(event) => onCodingIncludeUntrackedChange(event.target.checked)}
          />
          <span>{t.settings.includeUntracked}</span>
        </label>
        <button
          className="status-action-btn secondary"
          onClick={() => onLoadCodingProgress()}
          disabled={codingLoading}
        >
          {codingLoading ? t.settings.loadingProgress : t.settings.refreshProgress}
        </button>
      </div>
      {codingError && <div className="status-error">{codingError}</div>}
      {codingProgress && (
        <div className="coding-progress-panel">
          <div className="coding-progress-summary">
            <span>{t.settings.branchLabel}: {codingProgress.branch}</span>
            <span>{t.settings.statusLabel}: {codingProgress.clean ? 'clean' : 'dirty'}</span>
            <span>{t.settings.aheadBehindLabel}: {codingProgress.ahead}/{codingProgress.behind}</span>
            <span>{t.settings.commitsLabel}({codingProgress.sinceDays}d): {codingProgress.commitCountSince}</span>
            <span>{t.settings.generatedLabel}: {new Date(codingProgress.generatedAt).toLocaleString()}</span>
          </div>
          <div className="coding-progress-summary">
            <span>{t.settings.repoLabel}: {codingProgress.repoRoot}</span>
            {codingProgress.upstream && <span>{t.settings.upstreamLabel}: {codingProgress.upstream}</span>}
            <span>{t.settings.filesLabel}: {codingProgress.counts.totalFiles}</span>
            <span>{t.settings.stagedLabel}: {codingProgress.counts.staged}</span>
            <span>{t.settings.unstagedLabel}: {codingProgress.counts.unstaged}</span>
            <span>{t.settings.untrackedLabel}: {codingProgress.counts.untracked}</span>
          </div>
          {codingInsights && (
            <div className="coding-progress-insights">
              <div className="coding-insight-card">
                <h4>{t.settings.velocityTitle}</h4>
                <div className={`coding-velocity-pill is-${codingInsights.velocity}`}>
                  {codingVelocityLabels[codingInsights.velocity]}
                </div>
                <div className="coding-insight-detail">
                  {codingInsights.commitsPerDay.toFixed(2)} commits/day
                </div>
              </div>
              <div className="coding-insight-card">
                <h4>{t.settings.topExtensions}</h4>
                <div className="coding-insight-list">
                  {codingInsights.topExtensions.length === 0 && (
                    <span className="coding-insight-empty">{t.settings.noChangedFiles}</span>
                  )}
                  {codingInsights.topExtensions.map((item) => (
                    <span key={item.ext} className="coding-insight-chip">
                      {item.ext} x{item.count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="coding-insight-card">
                <h4>{t.settings.activeAuthors}</h4>
                <div className="coding-insight-list">
                  {codingInsights.activeAuthors.length === 0 && (
                    <span className="coding-insight-empty">{t.settings.noCommitAuthors}</span>
                  )}
                  {codingInsights.activeAuthors.map((author) => (
                    <span key={author} className="coding-insight-chip">{author}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="coding-progress-grid">
            <div className="coding-progress-card">
              <h4>{t.settings.changedFiles}</h4>
              <div className="coding-progress-files">
                {codingProgress.changedFiles.length === 0 && <div className="logs-empty">{t.settings.noChangedFiles}</div>}
                {codingProgress.changedFiles.map((file) => (
                  <div key={file} className="coding-progress-line">{file}</div>
                ))}
              </div>
            </div>
            <div className="coding-progress-card">
              <h4>{t.settings.recentCommits}</h4>
              <div className="coding-progress-files">
                {codingProgress.recentCommits.length === 0 && <div className="logs-empty">{t.settings.noCommits}</div>}
                {codingProgress.recentCommits.map((commit) => (
                  <div key={commit.hash} className="coding-progress-line">
                    <strong>{commit.hash.slice(0, 8)}</strong> {commit.subject}
                    <div className="coding-progress-meta">{commit.author} | {new Date(commit.date).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
