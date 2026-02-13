interface SidebarProps {
  activeTab: 'chat' | 'automation' | 'settings';
  onTabChange: (tab: 'chat' | 'automation' | 'settings') => void;
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
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
          <span className="label">对话</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'automation' ? 'active' : ''}`}
          onClick={() => onTabChange('automation')}
        >
          <span className="icon">🖥️</span>
          <span className="label">自动化</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <span className="icon">⚙️</span>
          <span className="label">设置</span>
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="status">
          <span className="status-dot online"></span>
          <span>服务运行中</span>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
