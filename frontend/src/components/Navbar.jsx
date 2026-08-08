import React from 'react';
import { LogOut, User, Shield, Network } from 'lucide-react';

export default function Navbar({ user, onLogout }) {
  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 2rem',
      background: 'rgba(15, 23, 42, 0.4)',
      borderBottom: '1px solid var(--border-glass)',
      backdropFilter: 'blur(8px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      marginBottom: '2rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
          padding: '0.5rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 10px var(--primary-glow)'
        }}>
          <Network size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0, background: 'linear-gradient(95deg, #ffffff 0%, var(--text-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AetherDoc
          </h2>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Multi-Agent DMS
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* User Info & Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.4rem 1rem', borderRadius: '20px', border: '1px solid var(--border-glass)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            width: '28px',
            height: '28px',
            borderRadius: '50%'
          }}>
            <User size={14} color="var(--text-secondary)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</span>
            <span style={{ 
              fontSize: '0.7rem', 
              color: '#3b82f6', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center',
              gap: '0.15rem'
            }}>
              <Shield size={10} />
              Session Active
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button 
          className="btn btn-secondary" 
          onClick={onLogout}
          style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '20px' }}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
