import { useEffect, useState } from 'react';
import { useLocale } from '../i18n';
import { useSkills, type SkillInfo, type ConfigSkill } from './useSkills';

/* ── provider 统计栏 ── */
const PROVIDERS = [
  { key: 'claude',   label: 'Claude',   color: '#e67e22' },
  { key: 'codex',    label: 'Codex',    color: '#2ecc71' },
  { key: 'gemini',   label: 'Gemini',   color: '#3498db' },
  { key: 'opencode', label: 'OpenCode', color: '#9b59b6' },
] as const;

function countByTag(skills: SkillInfo[]) {
  const counts: Record<string, number> = {};
  for (const p of PROVIDERS) counts[p.key] = 0;
  skills.forEach(s => {
    for (const p of PROVIDERS) {
      if (s.tags?.some(t => t.toLowerCase().includes(p.key))) counts[p.key]++;
    }
  });
  return counts;
}

/* ====================================================================== */
export default function SkillsPanel() {
  const { t } = useLocale();
  const sk = t.skills;
  const {
    skillsData, configSkills, loading, installing, error,
    installResult, loadSkills, loadConfigSkills, installSkill,
  } = useSkills();

  const [installPath, setInstallPath] = useState('');
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    void loadSkills();
    void loadConfigSkills();
  }, [loadSkills, loadConfigSkills]);

  const handleInstall = async () => {
    if (!installPath.trim()) return;
    await installSkill(installPath.trim());
    setInstallPath('');
    setShowInstallForm(false);
  };

  const skills = skillsData?.skills ?? [];
  const counts = countByTag(skills);

  const filteredSkills = searchQuery.trim()
    ? skills.filter(s => {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q)
          || s.description?.toLowerCase().includes(q)
          || s.id.toLowerCase().includes(q);
      })
    : skills;

  return (
    <div className="panel skills-panel">
      {/* ── 顶部状态栏 ── */}
      <div className="skills-count-bar">
        <span className="skills-count-badge">
          {sk.installed} · {skills.length}
        </span>
        <div className="skills-provider-counts">
          {PROVIDERS.map(p => (
            <span key={p.key} className="skills-provider-tag" style={{ '--provider-color': p.color } as React.CSSProperties}>
              <span className="provider-label">{p.label}:</span>
              <span className="provider-num">{counts[p.key]}</span>
            </span>
          ))}
        </div>
        <button
          className="skills-btn-icon"
          onClick={() => void loadSkills()}
          disabled={loading}
          title={loading ? sk.refreshing : sk.refreshSkills}
        >
          <span className={loading ? 'spin' : ''}>&#x21bb;</span>
        </button>
      </div>

      {error && <div className="skills-error">{error}</div>}

      {/* ── 操作按钮行 ── */}
      <div className="skills-actions">
        <button className="skills-action-btn" onClick={() => setShowInstallForm(!showInstallForm)}>
          <span className="action-icon">&#x1F4E6;</span> {sk.installFromZip}
        </button>
        <button className="skills-action-btn" onClick={() => void loadSkills()}>
          <span className="action-icon">&#x1F4C2;</span> {sk.importExisting}
        </button>
        <button className="skills-action-btn accent" onClick={() => void loadSkills()}>
          <span className="action-icon">&#x2728;</span> {sk.discoverSkills}
        </button>
      </div>

      {/* ── 安装表单（折叠） ── */}
      {showInstallForm && (
        <div className="skills-install-form">
          <label>{sk.installPathLabel}</label>
          <div className="skills-install-row">
            <input
              type="text"
              value={installPath}
              onChange={e => setInstallPath(e.target.value)}
              placeholder={sk.installPathPlaceholder}
              onKeyDown={e => e.key === 'Enter' && void handleInstall()}
            />
            <button onClick={() => void handleInstall()} disabled={installing || !installPath.trim()}>
              {installing ? sk.installing : sk.installSkill}
            </button>
          </div>
          {installResult && (
            <div className="skills-install-result">
              <span className="result-ok">&#x2714;</span> {sk.installSuccess}
              <span className="result-detail">
                {installResult.skill.name} v{installResult.skill.version}
                {installResult.loadedTools.length > 0 && ` — ${sk.totalTools}: ${installResult.loadedTools.join(', ')}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 搜索框 ── */}
      {skills.length > 0 && (
        <div className="skills-search">
          <span className="search-icon">&#x1F50D;</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={sk.searchPlaceholder}
          />
        </div>
      )}

      {/* ── 主内容区 ── */}
      <div className="skills-content">
        {!skillsData && loading && (
          <div className="skills-empty">
            <div className="empty-spinner">&#x21bb;</div>
            <p>{sk.loading}</p>
          </div>
        )}

        {skillsData && skills.length === 0 && !loading && (
          <div className="skills-empty">
            <div className="empty-icon">&#x2728;</div>
            <h3>{sk.noInstalled}</h3>
            <p>{sk.noInstalledDescription}</p>
          </div>
        )}

        {/* ── 已安装技能列表 ── */}
        {filteredSkills.length > 0 && (
          <div className="skills-list">
            {filteredSkills.map((skill, i) => (
              <SkillListItem key={skill.id} skill={skill} sk={sk} isLast={i === filteredSkills.length - 1} />
            ))}
          </div>
        )}

        {searchQuery && filteredSkills.length === 0 && skills.length > 0 && (
          <div className="skills-empty">
            <h3>{sk.noResults}</h3>
            <p>{sk.emptyDescription}</p>
          </div>
        )}

        {/* ── 警告 ── */}
        {skillsData && skillsData.warnings.length > 0 && (
          <div className="skills-warnings">
            <h4>{sk.warnings}</h4>
            {skillsData.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        {/* ── 配置技能卡片 ── */}
        {configSkills && configSkills.length > 0 && (
          <div className="skills-config-section">
            <h3>{sk.configSkills}</h3>
            <div className="skills-config-grid">
              {configSkills.map(cs => (
                <ConfigSkillCard key={cs.id} cs={cs} sk={sk} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 已安装技能行 ── */
function SkillListItem({ skill, sk, isLast }: { skill: SkillInfo; sk: ReturnType<typeof useLocale>['t']['skills']; isLast: boolean }) {
  const sourceLabel = skill.source === 'local' ? sk.local : skill.source;
  return (
    <div className={`skill-list-item${isLast ? '' : ' bordered'}`}>
      <div className="skill-item-main">
        <div className="skill-item-header">
          <span className="skill-item-name">{skill.name}</span>
          <span className="skill-item-source">{sourceLabel}</span>
          {skill.tags?.length > 0 && (
            <div className="skill-item-tags">
              {skill.tags.map(tag => <span key={tag} className="skill-tag">{tag}</span>)}
            </div>
          )}
        </div>
        {skill.description && <p className="skill-item-desc">{skill.description}</p>}
      </div>
      <div className="skill-item-status">
        <span className={`status-dot ${skill.enabled ? 'on' : 'off'}`} />
        <span className="status-text">{skill.enabled ? sk.skillEnabled : sk.skillDisabled}</span>
      </div>
    </div>
  );
}

/* ── 配置技能卡片 ── */
function ConfigSkillCard({ cs, sk }: { cs: ConfigSkill; sk: ReturnType<typeof useLocale>['t']['skills'] }) {
  const autoFeatures = Object.entries(cs.automation).filter(([, v]) => v === true).map(([k]) => k);
  return (
    <div className={`skills-config-card ${cs.enabled ? 'enabled' : 'disabled'}`}>
      <div className="config-card-header">
        <strong>{cs.id}</strong>
        <span className={`config-card-status ${cs.enabled ? 'on' : 'off'}`}>
          {cs.enabled ? sk.skillEnabled : sk.skillDisabled}
        </span>
      </div>
      {cs.capabilities.length > 0 && (
        <div className="config-card-row">
          <span className="config-label">{sk.capabilitiesLabel}</span>
          <span className="config-value">{cs.capabilities.join(', ')}</span>
        </div>
      )}
      {autoFeatures.length > 0 && (
        <div className="config-card-row">
          <span className="config-label">{sk.automationLabel}</span>
          <span className="config-value">{autoFeatures.join(', ')}</span>
        </div>
      )}
    </div>
  );
}
