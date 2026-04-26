import React, { useState, useEffect } from 'react';
import CheckIn from './components/CheckIn';
import SymptomForm from './components/SymptomForm';
import ResultsDashboard from './components/ResultsDashboard';
import WellnessMode from './components/WellnessMode';
import AuthScreen from './components/AuthScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import ProfileScreen from './components/ProfileScreen';
import USMapScreen from './components/USMapScreen';
import './index.css';

function NavBtn({ onClick, title, children, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(44,82,130,0.08)' : 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: 7,
        color: active ? '#2C5282' : '#6B7280',
        fontSize: '1rem',
        transition: 'color 0.13s, background 0.13s',
        padding: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = '#2C5282';
        e.currentTarget.style.background = 'rgba(44,82,130,0.07)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = active ? '#2C5282' : '#6B7280';
        e.currentTarget.style.background = active ? 'rgba(44,82,130,0.08)' : 'none';
      }}
    >
      {children}
    </button>
  );
}

function App() {
  const [view, setView] = useState('checkin');
  const [results, setResults] = useState(null);
  const [formData, setFormData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('cp_user');
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)); } catch (e) {}
    }
  }, []);

  const handleAuth = (user) => {
    setCurrentUser(user);
    setView('checkin');
  };

  const handleLogout = () => {
    localStorage.removeItem('cp_token');
    localStorage.removeItem('cp_user');
    setCurrentUser(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          {/* Logo */}
          <button
            onClick={() => setView('checkin')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
          >
            <div className="logo">
              <div className="logo-dot" />
              <span style={{ color: '#1F2937' }}>Community<span style={{ color: '#2A9D8F' }}>Pulse</span></span>
            </div>
            <div style={{ fontSize: '0.58rem', color: '#9CA3AF', fontFamily: 'var(--font-mono)', letterSpacing: '0.6px', marginLeft: 16 }}>
              ONE HEALTH SURVEILLANCE
            </div>
          </button>

          {/* Right nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <NavBtn onClick={() => setView('usmap')} title="US Symptom Map" active={view === 'usmap'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                <line x1="9" y1="3" x2="9" y2="18"/>
                <line x1="15" y1="6" x2="15" y2="21"/>
              </svg>
            </NavBtn>

            {currentUser && (
              <NavBtn onClick={() => setView('leaderboard')} title="Leaderboard" active={view === 'leaderboard'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 20 18 10"/>
                  <polyline points="12 20 12 4"/>
                  <polyline points="6 20 6 14"/>
                </svg>
              </NavBtn>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: '#E5E7EB', margin: '0 4px' }} />

            {currentUser ? (
              <button
                onClick={() => setView('profile')}
                style={{
                  background: view === 'profile' ? 'rgba(44,82,130,0.08)' : 'transparent',
                  border: `1px solid ${view === 'profile' ? 'rgba(44,82,130,0.35)' : '#E5E7EB'}`,
                  borderRadius: 7,
                  color: '#2C5282',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  padding: '5px 11px',
                  cursor: 'pointer',
                  width: 'auto',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.2px',
                  transition: 'all 0.13s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{
                  width: 17, height: 17, borderRadius: '50%',
                  background: 'rgba(44,82,130,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700, color: '#2C5282',
                }}>
                  {currentUser.username?.[0]?.toUpperCase()}
                </span>
                {currentUser.username}
              </button>
            ) : (
              <button
                onClick={() => setView('auth')}
                style={{
                  background: 'none',
                  border: '1px solid #E5E7EB',
                  borderRadius: 7,
                  color: '#6B7280',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  width: 'auto',
                  transition: 'all 0.13s',
                  fontFamily: 'var(--font-mono)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2C5282'; e.currentTarget.style.color = '#2C5282'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6B7280'; }}
              >
                Sign in →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {view === 'auth' && (
          <AuthScreen onAuth={handleAuth} onSkip={() => setView('checkin')} />
        )}
        {view === 'checkin' && (
          <CheckIn setView={setView} currentUser={currentUser} />
        )}
        {view === 'form' && (
          <SymptomForm setView={setView} setResults={setResults} setFormData={setFormData} />
        )}
        {view === 'results' && (
          <ResultsDashboard
            results={results}
            formData={formData}
            setView={setView}
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
          />
        )}
        {view === 'wellness' && (
          <WellnessMode setView={setView} currentUser={currentUser} setCurrentUser={setCurrentUser} />
        )}
        {view === 'usmap' && <USMapScreen setView={setView} />}
        {view === 'leaderboard' && (
          <LeaderboardScreen currentUser={currentUser} setView={setView} />
        )}
        {view === 'profile' && (
          <ProfileScreen currentUser={currentUser} setView={setView} onLogout={handleLogout} />
        )}
      </main>

      <footer className="app-footer">
        CommunityPulse is not a medical provider. Data is anonymous and used only for community health insights.
      </footer>
    </div>
  );
}

export default App;
