import React from 'react';
import { Network, Cpu, Search } from 'lucide-react';

export default function AgentWorkflows({ activeAgent, activeWorkflow }) {
  // Check which agents are involved in the current workflow
  const getWorkflowAgents = () => {
    switch (activeWorkflow) {
      case 'upload':
        return ['Coordinator', 'Processing'];
      case 'search':
      case 'chat':
        return ['Coordinator', 'Search'];
      default:
        return [];
    }
  };

  const workflowAgents = getWorkflowAgents();

  const agents = [
    { 
      name: 'Coordinator', 
      role: 'Intent Router', 
      icon: <Network size={22} />, 
      desc: 'Orchestrates requests & routes by intent' 
    },
    { 
      name: 'Processing', 
      role: 'Ingestion Engine', 
      icon: <Cpu size={22} />, 
      desc: 'Parses text, summarizes, extracts metadata' 
    },
    { 
      name: 'Search', 
      role: 'RAG Retrieval & QA', 
      icon: <Search size={22} />, 
      desc: 'Searches Qdrant and answers queries' 
    }
  ];

  return (
    <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '1.25rem' }}>
        <Network size={20} color="var(--primary)" />
        Active 3-Agent Pipeline Visualizer
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Animated Connector Path */}
        <div className="workflow-panel" style={{ background: 'rgba(255, 255, 255, 0.01)', borderRadius: '12px' }}>
          {/* Base connector line */}
          <div className="workflow-connectors">
            <div 
              className="workflow-connector-progress" 
              style={{ 
                width: activeWorkflow ? '100%' : '0%',
                transition: 'width 1.5s ease-in-out'
              }} 
            />
          </div>

          {agents.map((agent) => {
            const isWorking = activeAgent === agent.name;
            const isWorkflowParticipant = workflowAgents.includes(agent.name);
            
            let statusClass = '';
            if (isWorking) {
              statusClass = 'active working';
            } else if (isWorkflowParticipant) {
              statusClass = 'success';
            }

            return (
              <div key={agent.name} className={`agent-node ${statusClass}`}>
                <div className="agent-avatar">
                  {agent.icon}
                </div>
                <div className="agent-name">{agent.name}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.1rem' }}>
                  {agent.role}
                </div>
              </div>
            );
          })}
        </div>

        {/* Console status description */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border-glass)',
          borderRadius: '8px',
          padding: '0.85rem 1.25rem',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)'
        }}>
          {activeWorkflow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-warning" style={{ animation: 'pulse-border 1s infinite alternate' }}>
                Executing
              </span>
              <span>
                Workflow: <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>{activeWorkflow}</strong>
                {activeAgent && (
                  <span>
                    {' '}→ Active Agent:{' '}
                    <strong style={{ color: 'var(--primary)' }}>{activeAgent} Agent</strong>
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              System Idle. Trigger a workflow (Upload, Search, or Chat) to watch the coordinator route the request depending on intent.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
