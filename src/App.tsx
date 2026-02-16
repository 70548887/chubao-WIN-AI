import { useState } from 'react';
import Chat from './components/Chat';
import CodingDashboard from './components/CodingDashboard';
import AutomationPanel from './components/AutomationPanel';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import SkillsPanel from './components/SkillsPanel';

type ActiveTab = 'chat' | 'dashboard' | 'automation' | 'skills' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'dashboard' && <CodingDashboard />}
        {activeTab === 'automation' && <AutomationPanel />}
        {activeTab === 'skills' && <SkillsPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

export default App;
