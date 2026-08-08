import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Navbar from './components/Navbar';
import AgentWorkflows from './components/AgentWorkflows';
import Dashboard from './components/Dashboard';
import SearchChat from './components/SearchChat';

import { LayoutDashboard, Search } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [activeView, setActiveView] = useState('dashboard');
  
  // Real-time Agent pipeline animation states
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);

  // Synchronize localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [token, user]);

  const handleAuthSuccess = (token, user) => {
    setToken(token);
    setUser(user);
    setActiveView('dashboard');
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setActiveView('dashboard');
  };

  const triggerAgentAction = (workflowName, agentName) => {
    setActiveWorkflow(workflowName);
    setActiveAgent(agentName);
  };

  // If not authenticated, show login page
  if (!token || !user) {
    return <Login onAuthSuccess={handleAuthSuccess} />;
  }

  // Determine which panel to show based on activeView
  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard token={token} user={user} triggerAgentAction={triggerAgentAction} onLogout={handleLogout} />;
      case 'search-chat':
        return <SearchChat token={token} triggerAgentAction={triggerAgentAction} onLogout={handleLogout} />;
      default:
        return <Dashboard token={token} user={user} triggerAgentAction={triggerAgentAction} onLogout={handleLogout} />;
    }
  };

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Sidebar Navigation Options */}
          <nav style={{ marginTop: '2rem' }}>
            <div 
              className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              <LayoutDashboard size={20} />
              Dashboard
            </div>
            
            <div 
              className={`nav-item ${activeView === 'search-chat' ? 'active' : ''}`}
              onClick={() => setActiveView('search-chat')}
            >
              <Search size={20} />
              Semantic Search
            </div>
          </nav>
        </div>

        {/* Sidebar Footer Details */}
        <div style={{ padding: '0 0.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Apex Multi-Agent Engine v1.0.0
          </p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            Local Simulation Mode Active
          </p>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
        <Navbar user={user} onLogout={handleLogout} />

        <div className="main-content">
          {/* Real-time Agent workflow nodes visualization */}
          <AgentWorkflows activeAgent={activeAgent} activeWorkflow={activeWorkflow} />

          {/* Active Panel View Content */}
          <div style={{ marginTop: '1.5rem' }}>
            {renderActiveView()}
          </div>
        </div>
      </main>
    </div>
  );
}
