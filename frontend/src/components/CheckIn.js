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
  const [demoActive, setDemoActive]   = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [scenario, setScenario]       = useState(null); // 'national' | 'new_england'

  useEffect(() => {
    setStreak(getStreak());
    axios.get('/api/demo/status').then(r => setDemoActive(r.data.demo_active)).catch(() => {});
  }, []);

  const loadScenario = async (type) => {
    setDemoLoading(true);
    try {
      if (demoActive) await axios.post('/api/demo/clear');
      if (type === 'new_england') {
        await axios.post('/api/demo/seed-new-england');
      } else {
        await axios.post('/api/demo/seed');
      }
      setDemoActive(true);
      setScenario(type);
    } catch (e) {
      console.error('Demo load failed', e);
    }
    setDemoLoading(false);
  };

  const handleClear = async () => {
    setDemoLoading(true);
    try {
      await axios.post('/api/demo/clear');
      setDemoActive(false);
      setScenario(null);
    } catch (e) {
      console.error('Demo clear failed', e);
    }
    setDemoLoading(false);
  };

  return (
    <div className="checkin-screen">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="checkin-hero">
        {/* Decorative EKG line */}
        <svg
          viewBox="0 0 320 28"
          style={{ width: '100%', maxWidth: 300, height: 28, margin: '0 auto 18px', display: 'block', opacity: 0.18 }}
          aria-hidden="true"
        >
          <polyline
            points="0,14 40,14 55,14 65,3 75,25 85,1 95,22 105,14 160,14 175,14 185,9 195,19 205,14 260,14 320,14"
            fill="none"
            stroke="#2C5282"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        <h1>How are you feeling <span>today?</span></h1>
        <p>Your daily check-in helps detect outbreaks before they spread.</p>

        {streak > 0 && (
          <div className="streak-badge">
            🔥 {streak}-day streak — keep it up!
          </div>
        )}
      </div>

      {/* ── Leaderboard shortcut ─────────────────────────────── */}
      {currentUser && (
        <div
          onClick={() => setView('leaderboard')}
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(44,82,130,0.4)';
            e.currentTarget.style.background = 'rgba(44,82,130,0.03)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(44,82,130,0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#E5E7EB';
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
          }}>
            🏆
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#1F2937' }}>Friends Leaderboard</div>
            <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
              streak: 🔥 {currentUser.streak || streak} days
            </div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      )}

      {/* ── Check-in buttons ─────────────────────────────────── */}
      <div className="checkin-buttons">
        <button className="checkin-btn sick" onClick={() => setView('form')}>
          <span className="checkin-btn-icon">🤒</span>
          <div className="checkin-btn-title">I'm not feeling well</div>
          <div className="checkin-btn-sub">Report symptoms and check your community risk level</div>
        </button>

        <button className="checkin-btn" onClick={() => setView('wellness')}>
          <span className="checkin-btn-icon">💪</span>
          <div className="checkin-btn-title">I'm feeling great today</div>
          <div className="checkin-btn-sub">Log your wellness and help build community health data</div>
        </button>
      </div>

      {/* ── Demo scenario loader ─────────────────────────────── */}
      <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid #E5E7EB' }}>
        <div style={{
          fontSize: '0.6rem', color: '#9CA3AF', marginBottom: 10,
          textTransform: 'uppercase', letterSpacing: 1.3,
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          Demo Scenarios
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <ScenarioBtn
            active={scenario === 'national'}
            activeColor="#2C5282"
            activeBg="rgba(44,82,130,0.07)"
            activeBorder="rgba(44,82,130,0.3)"
            label="🗺 National Baseline"
            disabled={demoLoading}
            onClick={() => loadScenario('national')}
          />
          <ScenarioBtn
            active={scenario === 'new_england'}
            activeColor="#DC2626"
            activeBg="rgba(220,38,38,0.07)"
            activeBorder="rgba(220,38,38,0.3)"
            label="🔴 New England Outbreak"
            disabled={demoLoading}
            onClick={() => loadScenario('new_england')}
          />
          {demoActive && (
            <ScenarioBtn
              active={false}
              activeColor="#DC2626"
              activeBg="none"
              activeBorder="rgba(220,38,38,0.25)"
              label="🗑 Clear"
              disabled={demoLoading}
              onClick={handleClear}
              danger
            />
          )}
        </div>

        {demoLoading && (
          <div style={{ marginTop: 10, fontSize: '0.7rem', color: '#6B7280', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
            Loading scenario…
          </div>
        )}
        {demoActive && !demoLoading && (
          <div style={{ marginTop: 8, fontSize: '0.68rem', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.3px' }}>
            {scenario === 'new_england'
              ? <span style={{ color: '#DC2626' }}>● New England outbreak active</span>
              : <span style={{ color: '#2C5282' }}>● National baseline active</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioBtn({ active, activeColor, activeBg, activeBorder, label, disabled, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? activeBg : 'none',
        border: `1px solid ${active ? activeBorder : danger ? 'rgba(220,38,38,0.25)' : '#E5E7EB'}`,
        borderRadius: 6,
        padding: '6px 13px',
        color: active ? activeColor : danger ? '#DC2626' : '#6B7280',
        fontSize: '0.72rem',
        cursor: 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.13s',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.2px',
      }}
    >
      {label}
    </button>
  );
}
