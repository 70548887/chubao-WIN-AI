import { useLocale } from '../i18n';

interface SidebarProps {
  activeTab: 'chat' | 'dashboard' | 'automation' | 'settings';
  onTabChange: (tab: 'chat' | 'dashboard' | 'automation' | 'settings') => void;
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
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <span className="icon">⚙️</span>
          <span className="label">{t.sidebar.settings}</span>
        </button>
      </div>

      <div className="sidebar-footer">
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
