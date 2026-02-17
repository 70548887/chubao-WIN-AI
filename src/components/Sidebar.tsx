import { useLocale } from '../i18n';
import { NotificationCenter } from './NotificationCenter';

interface SidebarProps {
  activeTab: 'chat' | 'dashboard' | 'automation' | 'skills' | 'settings' | 'plugins' | 'platforms';
  onTabChange: (tab: 'chat' | 'dashboard' | 'automation' | 'skills' | 'settings' | 'plugins' | 'platforms') => void;
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t, locale, setLocale } = useLocale();

  return (
    <nav className="sidebar">
      <div className="logo">
        <span className="logo-icon">🤖</span>
        <span className="logo-text">Chubao</span>
      </div>

      <div className="nav-items">
        <button
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => onTabChange('chat')}
        >
          <span className="icon">💬</span>
          <span className="label">{t.sidebar.chat}</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
        >
          <span className="icon">📊</span>
          <span className="label">{t.sidebar.dashboard}</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'automation' ? 'active' : ''}`}
          onClick={() => onTabChange('automation')}
        >
          <span className="icon">🖥️</span>
          <span className="label">{t.sidebar.automation}</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => onTabChange('skills')}
        >
          <span className="icon">🧩</span>
          <span className="label">{t.sidebar.skills}</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <span className="icon">⚙️</span>
          <span className="label">{t.sidebar.settings}</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'plugins' ? 'active' : ''}`}
          onClick={() => onTabChange('plugins')}
        >
          <span className="icon">🔌</span>
          <span className="label">插件</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'platforms' ? 'active' : ''}`}
          onClick={() => onTabChange('platforms')}
        >
          <span className="icon">📱</span>
          <span className="label">平台</span>
        </button>
      </div>

      <div className="sidebar-footer">
        <NotificationCenter />
        <button
          className="locale-toggle"
          onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
        >
          {locale === 'zh-CN' ? 'EN' : '中文'}
        </button>
        <div className="status">
          <span className="status-dot online"></span>
          <span>{t.sidebar.serviceRunning}</span>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
