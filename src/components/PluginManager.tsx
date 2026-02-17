import { useState, useEffect } from 'react';
import { getPluginManager } from '../core/plugin/PluginManager';
import type { PluginInstance, PluginStatus } from '../core/plugin/types';

export function PluginManagerPanel() {
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);
  const [filter, setFilter] = useState<PluginStatus | 'all'>('all');

  const pluginManager = getPluginManager();

  useEffect(() => {
    if (!pluginManager) return;

    const updatePlugins = () => {
      setPlugins(pluginManager.getAll());
    };

    updatePlugins();

    // 监听插件事件
    const unsubscribers = [
      pluginManager.on('plugin:registered', updatePlugins),
      pluginManager.on('plugin:activated', updatePlugins),
      pluginManager.on('plugin:deactivated', updatePlugins),
      pluginManager.on('plugin:error', updatePlugins),
      pluginManager.on('plugin:unregistered', updatePlugins),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [pluginManager]);

  const filteredPlugins =
    filter === 'all'
      ? plugins
      : plugins.filter((p) => p.status === filter);

  const handleToggle = async (id: string, currentStatus: PluginStatus) => {
    if (!pluginManager) return;

    try {
      if (currentStatus === 'active') {
        await pluginManager.deactivate(id);
      } else {
        await pluginManager.activate(id);
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  };

  const getStatusBadge = (status: PluginStatus) => {
    const badges = {
      inactive: { text: '未激活', color: 'var(--text-secondary)' },
      loading: { text: '加载中', color: 'var(--warning)' },
      active: { text: '运行中', color: 'var(--success)' },
      error: { text: '错误', color: 'var(--error)' },
      disabled: { text: '已禁用', color: 'var(--text-secondary)' },
    };
    const badge = badges[status];
    return (
      <span className="status-badge" style={{ color: badge.color }}>
        {badge.text}
      </span>
    );
  };

  return (
    <div className="plugin-manager">
      <div className="plugin-header">
        <h3>🔌 插件管理</h3>
        <div className="plugin-filters">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            全部 ({plugins.length})
          </button>
          <button
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            运行中 ({plugins.filter((p) => p.status === 'active').length})
          </button>
          <button
            className={filter === 'error' ? 'active' : ''}
            onClick={() => setFilter('error')}
          >
            错误 ({plugins.filter((p) => p.status === 'error').length})
          </button>
        </div>
      </div>

      {filteredPlugins.length === 0 ? (
        <div className="empty-state">
          <p>暂无插件</p>
        </div>
      ) : (
        <div className="plugin-list">
          {filteredPlugins.map((plugin) => (
            <div key={plugin.manifest.id} className="plugin-card">
              <div className="plugin-info">
                {plugin.manifest.icon && (
                  <img
                    src={plugin.manifest.icon}
                    alt={plugin.manifest.name}
                    className="plugin-icon"
                  />
                )}
                <div className="plugin-details">
                  <div className="plugin-name">
                    {plugin.manifest.name}
                    <span className="plugin-version">v{plugin.manifest.version}</span>
                  </div>
                  <div className="plugin-description">
                    {plugin.manifest.description}
                  </div>
                  <div className="plugin-author">by {plugin.manifest.author}</div>
                </div>
              </div>

              <div className="plugin-actions">
                {getStatusBadge(plugin.status)}
                <button
                  className={
                    plugin.status === 'active'
                      ? 'btn-danger-small'
                      : 'btn-primary-small'
                  }
                  onClick={() => handleToggle(plugin.manifest.id, plugin.status)}
                  disabled={plugin.status === 'loading'}
                >
                  {plugin.status === 'active' ? '停用' : '启用'}
                </button>
              </div>

              {plugin.error && (
                <div className="plugin-error">
                  <strong>错误:</strong> {plugin.error}
                </div>
              )}

              {plugin.manifest.dependencies && (
                <div className="plugin-dependencies">
                  <strong>依赖:</strong> {plugin.manifest.dependencies.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
