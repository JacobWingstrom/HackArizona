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
          <div className="logo">
            <span className="logo-dot">●</span>
            CommunityPulse
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setView('usmap')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
              title="US Symptom Map"
            >
              🗺️
            </button>
            {currentUser ? (
              <>
                <button
                  onClick={() => setView('leaderboard')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                  title="Friends & Leaderboard"
                >
                  🏆
                </button>
                <button
                  onClick={() => setView('profile')}
                  style={{
                    background: 'none', border: '1px solid #00d4aa44', borderRadius: 6,
                    color: '#00d4aa', fontSize: '0.8rem', fontWeight: 600,
                    padding: '4px 10px', cursor: 'pointer', width: 'auto',
                  }}
                >
                  {currentUser.username}
                </button>
              </>
            ) : (
              <button
                onClick={() => setView('auth')}
                style={{
                  background: 'none', border: '1px solid #1f2d45', borderRadius: 6,
                  color: '#6b7a99', fontSize: '0.75rem', padding: '4px 10px', cursor: 'pointer',
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
        <div className="tagline">Arizona One Health Surveillance</div>
      </header>

      <main className="app-main">
        {view === 'auth' && (
          <AuthScreen
            onAuth={handleAuth}
            onSkip={() => setView('checkin')}
          />
        )}
        {view === 'checkin' && (
          <CheckIn setView={setView} currentUser={currentUser} />
        )}
        {view === 'form' && (
          <SymptomForm
            setView={setView}
            setResults={setResults}
            setFormData={setFormData}
          />
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
          <WellnessMode
            setView={setView}
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
          />
        )}
        {view === 'usmap' && (
          <USMapScreen setView={setView} />
        )}
        {view === 'leaderboard' && (
          <LeaderboardScreen currentUser={currentUser} setView={setView} />
        )}
        {view === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            setView={setView}
            onLogout={handleLogout}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>CommunityPulse is not a medical provider. Data is anonymous and used only for community health insights.</p>
      </footer>
    </div>
  );
}

export default App;
