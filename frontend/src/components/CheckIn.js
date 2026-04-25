import React, { useEffect, useState } from 'react';
import axios from 'axios';

function getStreak() {
  const today = new Date().toDateString();
  const last = localStorage.getItem('cp_last_checkin');
  const streak = parseInt(localStorage.getItem('cp_streak') || '0');
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last === today) return streak;
  if (last === yesterday) return streak;
  return 0;
}

export default function CheckIn({ setView, currentUser }) {
  const [streak, setStreak] = useState(0);
  const [demoActive, setDemoActive] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    setStreak(getStreak());
    axios.get('/api/demo/status').then(r => setDemoActive(r.data.demo_active)).catch(() => {});
  }, []);

  const handleDemoToggle = async () => {
    setDemoLoading(true);
    try {
      if (demoActive) {
        await axios.post('/api/demo/clear');
        setDemoActive(false);
      } else {
        await axios.post('/api/demo/seed');
        setDemoActive(true);
      }
    } catch (e) {
      console.error('Demo toggle failed', e);
    }
    setDemoLoading(false);
  };

  return (
    <div className="checkin-screen">
      <div className="checkin-hero">
        <h1>How are you feeling <span>today?</span></h1>
        <p>Your daily check-in helps detect outbreaks before they spread.</p>
        {streak > 0 && (
          <div className="streak-badge">
            🔥 {streak}-day streak — keep it up!
          </div>
        )}
      </div>

      {/* Leaderboard shortcut for logged-in users */}
      {currentUser && (
        <div
          onClick={() => setView('leaderboard')}
          style={{
            background: '#0d1c2e', border: '1px solid #1f2d45', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🏆</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Friends Leaderboard</div>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              Your streak: 🔥 {currentUser.streak || streak} days
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#6b7a99' }}>›</span>
        </div>
      )}

      <div className="checkin-buttons">
        <button className="checkin-btn sick" onClick={() => setView('form')}>
          <div className="checkin-btn-icon">🤒</div>
          <div className="checkin-btn-title">I'm not feeling well</div>
          <div className="checkin-btn-sub">Report symptoms and check your community risk</div>
        </button>

        <button className="checkin-btn" onClick={() => setView('wellness')}>
          <div className="checkin-btn-icon">💪</div>
          <div className="checkin-btn-title">I'm feeling great today</div>
          <div className="checkin-btn-sub">Log your wellness and help build community data</div>
        </button>
      </div>

      {/* Demo mode toggle — for showing the app with realistic community data */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <button
          onClick={handleDemoToggle}
          disabled={demoLoading}
          style={{
            background: 'none',
            border: `1px solid ${demoActive ? '#ff4757' : '#1f2d45'}`,
            borderRadius: 8,
            padding: '8px 16px',
            color: demoActive ? '#ff4757' : '#6b7a99',
            fontSize: '0.75rem',
            cursor: 'pointer',
            opacity: demoLoading ? 0.5 : 1,
          }}
        >
          {demoLoading ? '...' : demoActive ? '🗑 Clear Demo Data' : '🎭 Load Demo Data'}
        </button>
        {demoActive && (
          <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#ffa502' }}>
            Demo mode active — showing simulated community reports
          </div>
        )}
      </div>
    </div>
  );
}
