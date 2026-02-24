import { useRef, useState } from 'react';
import { useLocale } from '../../i18n';
import { useModelConfig } from './useModelConfig';
import type { ModelConfig } from './useModelConfig';

const OPENAI_MODELS = [
  // GPT-4.1 系列
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  // GPT-4o 系列
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-05-13',
  'chatgpt-4o-latest',
  // GPT-4 系列
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-4',
  'gpt-4-0613',
  // GPT-3.5 系列
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-1106',
  // o 系列 (reasoning)
  'o4-mini',
  'o4-mini-2025-04-16',
  'o3',
  'o3-2025-04-16',
  'o3-mini',
  'o3-mini-2025-01-31',
  'o1',
  'o1-2024-12-17',
  'o1-mini',
  'o1-mini-2024-09-12',
  'o1-preview',
  // Codex
  'codex-mini-latest',
  // 第三方兼容常用
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek-coder',
  'qwen-turbo',
  'qwen-plus',
  'qwen-max',
  'glm-4',
  'glm-4-flash',
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'yi-large',
  'yi-medium',
];

const ANTHROPIC_MODELS = [
  // Claude 4.5 / 4.6 系列
  'claude-sonnet-4-5-20250514',
  'claude-sonnet-4-5-latest',
  'claude-opus-4-6-20250715',
  'claude-opus-4-6-latest',
  // Claude 4 系列
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-latest',
  'claude-opus-4-20250514',
  'claude-opus-4-latest',
  // Claude 3.7 系列
  'claude-3-7-sonnet-20250219',
  'claude-3-7-sonnet-latest',
  // Claude 3.5 系列
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-20241022',
  'claude-3-5-haiku-latest',
  // Claude 3 系列
  'claude-3-opus-20240229',
  'claude-3-opus-latest',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

function ModelComboBox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))
    : options;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setFilter(v);
    if (!open) setOpen(true);
  };

  const handleSelect = (m: string) => {
    onChange(m);
    setFilter('');
    setOpen(false);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Only close if focus leaves the wrapper entirely
    if (wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget as Node)) {
      setOpen(false);
      setFilter('');
    }
  };

  const isCustom = value.trim() !== '' && !options.includes(value);

  return (
    <div className="model-combo-box" ref={wrapperRef} onBlur={handleBlur}>
      <div className="model-combo-input-wrap">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="model-combo-input"
        />
        <button
          type="button"
          className="model-combo-toggle"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
          aria-label="Toggle model list"
        >
          {open ? '\u25B2' : '\u25BC'}
        </button>
      </div>
      {isCustom && <span className="model-combo-custom-hint">custom</span>}
      {open && filtered.length > 0 && (
        <ul className="model-combo-dropdown">
          {filtered.map((m) => (
            <li
              key={m}
              className={`model-combo-option ${m === value ? 'selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m); }}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const OHMYGPT_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-opus-4',
  'claude-sonnet-4',
  'claude-3-7-sonnet',
  'deepseek-chat',
  'deepseek-reasoner',
];

function ProviderCard({
  label,
  providerKey,
  info,
  isActive,
  onSave,
  saving,
  t,
}: {
  label: string;
  providerKey: 'openai' | 'anthropic' | 'ohmygpt';
  info: ModelConfig['openai'];
  isActive: boolean;
  onSave: (patch: Record<string, string>) => void;
  saving: boolean;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const [model, setModel] = useState(info.model);
  const [baseUrl, setBaseUrl] = useState(info.baseUrl);
  const [apiKey, setApiKey] = useState('');

  const modelField = providerKey === 'openai' ? 'openaiModel' : providerKey === 'ohmygpt' ? 'ohmygptModel' : 'anthropicModel';
  const baseUrlField = providerKey === 'openai' ? 'openaiBaseUrl' : providerKey === 'ohmygpt' ? 'ohmygptBaseUrl' : 'anthropicBaseUrl';
  const apiKeyField = providerKey === 'openai' ? 'openaiApiKey' : providerKey === 'ohmygpt' ? 'ohmygptApiKey' : 'anthropicApiKey';
  const modelOptions = providerKey === 'openai' ? OPENAI_MODELS : providerKey === 'ohmygpt' ? OHMYGPT_MODELS : ANTHROPIC_MODELS;

  const handleSave = () => {
    const patch: Record<string, string> = {};
    if (model !== info.model) patch[modelField] = model;
    if (baseUrl !== info.baseUrl) patch[baseUrlField] = baseUrl;
    if (apiKey.trim()) patch[apiKeyField] = apiKey.trim();
    if (Object.keys(patch).length > 0) {
      onSave(patch);
      setApiKey('');
    }
  };

  return (
    <div className={`model-provider-card ${isActive ? 'active' : ''}`}>
      <div className="model-provider-header">
        <span className="model-provider-label">{label}</span>
        {isActive && <span className="model-provider-badge">Active</span>}
      </div>
      <div className="model-provider-fields">
        <label className="model-field">
          <span>{t.settings.modelName}</span>
          <ModelComboBox
            value={model}
            onChange={setModel}
            options={modelOptions}
            placeholder={providerKey === 'openai' ? 'e.g. gpt-4o' : providerKey === 'ohmygpt' ? 'e.g. gpt-4o 或 claude-opus-4' : 'e.g. claude-sonnet-4-20250514'}
          />
        </label>
        <label className="model-field">
          <span>{t.settings.baseUrl}</span>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="model-field">
          <span>
            {t.settings.apiKey}{' '}
            <span className={`key-status ${info.hasKey ? 'configured' : 'missing'}`}>
              ({info.hasKey ? t.settings.apiKeyConfigured : t.settings.apiKeyNotConfigured})
            </span>
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t.settings.apiKeyPlaceholder}
          />
        </label>
      </div>
      <button className="model-save-btn" onClick={handleSave} disabled={saving}>
        {saving ? t.settings.saving : t.settings.saveConfig}
      </button>
    </div>
  );
}

export default function ModelConfigSection() {
  const { t } = useLocale();
  const {
    config, loading, saving, saved, error,
    persisting, persisted, persistError,
    saveConfig, persistConfig, syncFromClaudeCode,
    claudeCodeFound, claudeCodeStatus, claudeCodeError,
  } = useModelConfig();

  if (loading) {
    return (
      <div className="settings-section">
        <h3>{t.settings.modelConfig}</h3>
        <p className="loading-text">{t.settings.loadingConfig}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="settings-section">
        <h3>{t.settings.modelConfig}</h3>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  const handleProviderSwitch = (provider: 'openai' | 'anthropic' | 'ohmygpt') => {
    if (provider !== config.provider) {
      saveConfig({ provider });
    }
  };

  return (
    <div className="settings-section model-config-section">
      <h3>{t.settings.modelConfig}</h3>
      <p className="section-desc">{t.settings.modelConfigDesc}</p>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="success-text">{t.settings.saved}</p>}
      {persistError && <p className="error-text">{persistError}</p>}
      {persisted && <p className="success-text">{t.settings.persistedToEnv}</p>}

      <div className="claude-code-sync-bar">
        <div className="claude-code-sync-info">
          <span className="claude-code-sync-icon">💾</span>
          <div>
            <span className="claude-code-sync-title">{t.settings.persistConfig}</span>
            <span className="claude-code-sync-desc">{t.settings.modelConfigRuntimeNotice}</span>
          </div>
        </div>
        <button
          className="claude-code-sync-btn"
          onClick={() => void persistConfig()}
          disabled={persisting}
        >
          {persisting ? t.settings.persistingConfig : t.settings.persistConfig}
        </button>
      </div>

      {/* Claude Code Sync */}
      <div className="claude-code-sync-bar">
        <div className="claude-code-sync-info">
          <span className="claude-code-sync-icon">⚡</span>
          <div>
            <span className="claude-code-sync-title">{t.settings.claudeCodeSync}</span>
            <span className="claude-code-sync-desc">{t.settings.claudeCodeSyncDesc}</span>
          </div>
          {claudeCodeFound && claudeCodeStatus === 'idle' && (
            <span className="claude-code-badge detected">{t.settings.claudeCodeDetected}</span>
          )}
          {claudeCodeStatus === 'synced' && (
            <span className="claude-code-badge synced">{t.settings.claudeCodeSynced}</span>
          )}
          {claudeCodeStatus === 'not_found' && (
            <span className="claude-code-badge not-found">{t.settings.claudeCodeNotFound}</span>
          )}
          {claudeCodeError && claudeCodeStatus === 'error' && (
            <span className="claude-code-badge error">{claudeCodeError}</span>
          )}
        </div>
        <button
          className="claude-code-sync-btn"
          onClick={() => void syncFromClaudeCode()}
          disabled={claudeCodeStatus === 'syncing'}
        >
          {claudeCodeStatus === 'syncing' ? t.settings.claudeCodeSyncing : t.settings.claudeCodeSync}
        </button>
      </div>

      <div className="provider-switch">
        <span className="provider-switch-label">{t.settings.activeProvider}:</span>
        <div className="provider-switch-btns">
          <button
            className={`provider-btn ${config.provider === 'openai' ? 'active' : ''}`}
            onClick={() => handleProviderSwitch('openai')}
          >
            OpenAI
          </button>
          <button
            className={`provider-btn ${config.provider === 'anthropic' ? 'active' : ''}`}
            onClick={() => handleProviderSwitch('anthropic')}
          >
            Anthropic
          </button>
          <button
            className={`provider-btn ${config.provider === 'ohmygpt' ? 'active' : ''}`}
            onClick={() => handleProviderSwitch('ohmygpt')}
          >
            OhMyGPT
          </button>
        </div>
      </div>

      <div className="model-providers-grid">
        <ProviderCard
          label="OpenAI / Compatible"
          providerKey="openai"
          info={config.openai}
          isActive={config.provider === 'openai'}
          onSave={saveConfig}
          saving={saving}
          t={t}
        />
        <ProviderCard
          label="Anthropic (Claude)"
          providerKey="anthropic"
          info={config.anthropic}
          isActive={config.provider === 'anthropic'}
          onSave={saveConfig}
          saving={saving}
          t={t}
        />
        <ProviderCard
          label="OhMyGPT 中转"
          providerKey="ohmygpt"
          info={config.ohmygpt}
          isActive={config.provider === 'ohmygpt'}
          onSave={saveConfig}
          saving={saving}
          t={t}
        />
      </div>
    </div>
  );
}
