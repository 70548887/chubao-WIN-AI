import { useState, useCallback } from 'react';
import { useSettings, type SettingItem, type SettingCategory } from '../hooks/useSettings';
import { FileUpload } from './FileUpload';

function SettingControl({
  setting,
  onChange,
}: {
  setting: SettingItem;
  onChange: (value: any) => void;
}) {
  switch (setting.type) {
    case 'boolean':
      return (
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={setting.value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      );
    case 'select':
      return (
        <select
          value={setting.value}
          onChange={(e) => onChange(e.target.value)}
          className="setting-select"
        >
          {setting.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          type="number"
          value={setting.value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="setting-input"
          step={setting.id === 'temperature' ? 0.1 : 1}
          min={setting.id === 'temperature' ? 0 : undefined}
          max={setting.id === 'temperature' ? 1 : undefined}
        />
      );
    case 'string':
      return (
        <input
          type="text"
          value={setting.value}
          onChange={(e) => onChange(e.target.value)}
          className="setting-input"
          placeholder={setting.defaultValue}
        />
      );
    default:
      return null;
  }
}

function SettingRow({
  setting,
  categoryId,
  onUpdate,
  onReset,
}: {
  setting: SettingItem;
  categoryId: string;
  onUpdate: (categoryId: string, settingId: string, value: any) => void;
  onReset: (categoryId: string, settingId: string) => void;
}) {
  const isModified = setting.value !== setting.defaultValue;

  return (
    <div className={`setting-row ${isModified ? 'modified' : ''}`}>
      <div className="setting-info">
        <div className="setting-name">
          {setting.name}
          {isModified && <span className="modified-badge">已修改</span>}
        </div>
        <div className="setting-description">{setting.description}</div>
      </div>
      <div className="setting-control">
        <SettingControl setting={setting} onChange={(v) => onUpdate(categoryId, setting.id, v)} />
        {isModified && (
          <button
            className="reset-btn"
            onClick={() => onReset(categoryId, setting.id)}
            title="恢复默认值"
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsPanelNew() {
  const {
    categories,
    filteredCategories,
    searchQuery,
    setSearchQuery,
    updateSetting,
    resetSetting,
    resetCategory,
    resetAll,
    exportSettings,
    importSettings,
  } = useSettings();

  const [activeCategory, setActiveCategory] = useState<string>('general');
  const [showImport, setShowImport] = useState(false);

  const handleImport = useCallback(
    async (files: any[]) => {
      if (files.length > 0) {
        const success = await importSettings(files[0].file);
        if (success) {
          alert('设置导入成功');
          setShowImport(false);
        } else {
          alert('设置导入失败，请检查文件格式');
        }
      }
    },
    [importSettings]
  );

  const currentCategory = categories.find((c) => c.id === activeCategory);

  return (
    <div className="settings-panel-new">
      {/* 左侧分类导航 */}
      <div className="settings-sidebar">
        <div className="settings-search">
          <input
            type="text"
            placeholder="搜索设置..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <nav className="settings-nav">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`nav-item ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span className="nav-icon">{cat.icon}</span>
              <span className="nav-label">{cat.name}</span>
            </button>
          ))}
        </nav>

        <div className="settings-actions">
          <button className="action-btn" onClick={exportSettings}>
            📥 导出设置
          </button>
          <button className="action-btn" onClick={() => setShowImport(!showImport)}>
            📤 导入设置
          </button>
          <button className="action-btn danger" onClick={resetAll}>
            🔄 重置所有
          </button>
        </div>
      </div>

      {/* 右侧设置内容 */}
      <div className="settings-content">
        {showImport ? (
          <div className="import-section">
            <h3>导入设置</h3>
            <FileUpload
              onUpload={handleImport}
              accept={['.json']}
              multiple={false}
              maxSize={1024 * 1024}
            />
            <button className="back-btn" onClick={() => setShowImport(false)}>
              返回设置
            </button>
          </div>
        ) : searchQuery ? (
          <div className="search-results">
            <h3>搜索结果</h3>
            {filteredCategories.length === 0 ? (
              <div className="no-results">未找到匹配的设置</div>
            ) : (
              filteredCategories.map((cat) => (
                <div key={cat.id} className="category-section">
                  <h4>
                    {cat.icon} {cat.name}
                  </h4>
                  {cat.settings.map((setting) => (
                    <SettingRow
                      key={setting.id}
                      setting={setting}
                      categoryId={cat.id}
                      onUpdate={updateSetting}
                      onReset={resetSetting}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        ) : currentCategory ? (
          <div className="category-settings">
            <div className="category-header">
              <h2>
                {currentCategory.icon} {currentCategory.name}
              </h2>
              <button
                className="reset-category-btn"
                onClick={() => resetCategory(currentCategory.id)}
              >
                重置分类
              </button>
            </div>
            <div className="settings-list">
              {currentCategory.settings.map((setting) => (
                <SettingRow
                  key={setting.id}
                  setting={setting}
                  categoryId={currentCategory.id}
                  onUpdate={updateSetting}
                  onReset={resetSetting}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
