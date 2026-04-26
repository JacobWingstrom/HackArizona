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

const RISK_COLOR = { low: '#059669', medium: '#D97706', high: '#EA580C', critical: '#DC2626' };
const RISK_LABEL = { low: 'LOW', medium: 'MODERATE', high: 'HIGH', critical: 'CRITICAL' };

// ── County Update Brief ──────────────────────────────────────────────────────

function CountyUpdateBrief({ update, onDismiss }) {
  const changed = update.prevRisk !== update.currentRisk;
  const trendDir = update.currentTrend > update.prevTrend ? 'up' : 'down';
  const trendDelta = Math.abs(update.currentTrend - update.prevTrend);

  return (
    <div style={{
      background: '#EFF6FF', border: '1.5px solid #BFDBFE',
      borderRadius: 12, padding: '14px 16px', marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ color: '#1E40AF', fontWeight: 700, fontSize: '0.82rem' }}>
          📍 {update.county} County Update · {update.daysSince} day{update.daysSince !== 1 ? 's' : ''} since your last check-in
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '0.9rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {changed && (
          <div style={{ fontSize: '0.78rem', color: '#374151' }}>
            Community risk:
            {' '}<span style={{ color: RISK_COLOR[update.prevRisk] || '#6B7280', fontWeight: 700 }}>{RISK_LABEL[update.prevRisk] || update.prevRisk}</span>
            {' '}→{' '}
            <span style={{ color: RISK_COLOR[update.currentRisk] || '#6B7280', fontWeight: 700 }}>{RISK_LABEL[update.currentRisk] || update.currentRisk}</span>
          </div>
        )}
        {trendDelta >= 10 && (
          <div style={{ fontSize: '0.78rem', color: '#374151' }}>
            Reports {trendDir} <span style={{ fontWeight: 700, color: trendDir === 'up' ? '#DC2626' : '#059669' }}>+{trendDelta}%</span>
          </div>
        )}
        {!changed && trendDelta < 10 && (
          <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>No significant changes since your last visit.</div>
        )}
      </div>
      <div style={{ color: '#6B7280', fontSize: '0.68rem', marginTop: 6 }}>
        Check in today to see your updated personal risk assessment
      </div>
    </div>
  );
}

// ── Onboarding Modal ─────────────────────────────────────────────────────────

const PERSONAS = [
  { id: 'student',  label: 'Student',        icon: '🎓', desc: 'Campus & school health' },
  { id: 'parent',   label: 'Parent',         icon: '👨‍👩‍👧', desc: 'Family & school outbreaks' },
  { id: 'elderly',  label: 'Senior',         icon: '🏥', desc: 'Higher-risk monitoring' },
  { id: 'adult',    label: 'General Public', icon: '👤', desc: 'Community surveillance' },
];

function OnboardingModal({ onComplete }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 18, padding: '28px 24px',
        maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌡️</div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1F2937', marginBottom: 6 }}>
            Welcome to CommunityPulse
          </div>
          <div style={{ color: '#6B7280', fontSize: '0.82rem', lineHeight: 1.5 }}>
            Who are you? We'll personalize your health alerts and outbreak guidance.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {PERSONAS.map(p => (
            <button
              key={p.id}
              onClick={() => onComplete(p.id)}
              style={{
                background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 12,
                padding: '14px 10px', cursor: 'pointer', textAlign: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#2C5282';
                e.currentTarget.style.background = 'rgba(44,82,130,0.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.background = '#F9FAFB';
              }}
            >
              <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{p.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1F2937', marginBottom: 2 }}>{p.label}</div>
              <div style={{ color: '#9CA3AF', fontSize: '0.67rem' }}>{p.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => onComplete('adult')}
          style={{
            width: '100%', background: 'none', border: 'none',
            color: '#9CA3AF', fontSize: '0.74rem', cursor: 'pointer',
            padding: '6px', textDecoration: 'underline',
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Recovery Banner ──────────────────────────────────────────────────────────

function RecoveryBanner({ data, onRespond, onDismiss }) {
  const symptoms = (data.symptoms || []).slice(0, 3).join(', ').replace(/_/g, ' ') || 'illness';
  const location = data.county ? `${data.county}${data.state ? ', ' + data.state : ''}` : 'your area';

  return (
    <div style={{
      background: '#FFFBEB', border: '2px solid #D97706',
      borderRadius: 14, padding: '16px 18px', marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '1.1rem' }}>🔔</span>
          <div>
            <div style={{ color: '#D97706', fontWeight: 700, fontSize: '0.85rem' }}>
              Welcome back — {data.daysSince} day{data.daysSince !== 1 ? 's' : ''} ago you reported {symptoms}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 1 }}>
              in {location} · How are you feeling now?
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '1rem', cursor: 'pointer', padding: 2, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onRespond('better')}
          style={{
            flex: 1, background: '#F0FDF4', border: '1.5px solid #059669',
            borderRadius: 8, padding: '9px 6px', cursor: 'pointer',
            color: '#059669', fontWeight: 700, fontSize: '0.78rem',
          }}
        >
          ✅ Better
        </button>
        <button
          onClick={() => onRespond('still_sick')}
          style={{
            flex: 1, background: '#FEF2F2', border: '1.5px solid #EA580C',
            borderRadius: 8, padding: '9px 6px', cursor: 'pointer',
            color: '#EA580C', fontWeight: 700, fontSize: '0.78rem',
          }}
        >
          🤒 Still Sick
        </button>
        <button
          onClick={() => onRespond('worse')}
          style={{
            flex: 1, background: '#FEF2F2', border: '1.5px solid #DC2626',
            borderRadius: 8, padding: '9px 6px', cursor: 'pointer',
            color: '#DC2626', fontWeight: 700, fontSize: '0.78rem',
          }}
        >
          🆘 Worse
        </button>
      </div>

      <div style={{ color: '#9CA3AF', fontSize: '0.64rem', marginTop: 8 }}>
        Your recovery data helps track illness duration and community recovery curves
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CheckIn({ setView, currentUser }) {
  const [streak, setStreak]           = useState(0);
  const [demoActive, setDemoActive]   = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [scenario, setScenario]       = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recoveryData, setRecoveryData]     = useState(null);
  const [countyUpdate, setCountyUpdate]     = useState(null);

  useEffect(() => {
    setStreak(getStreak());
    axios.get('/api/demo/status').then(r => setDemoActive(r.data.demo_active)).catch(() => {});

    // First-visit onboarding
    if (!localStorage.getItem('cp_onboarded')) {
      setShowOnboarding(true);
    }

    // Recovery check-in (2–10 days after a sick report)
    try {
      const raw = localStorage.getItem('cp_last_sick');
      if (raw) {
        const d = JSON.parse(raw);
        const daysSince = (Date.now() - new Date(d.date).getTime()) / 86400000;
        if (daysSince >= 2 && daysSince <= 10) {
          setRecoveryData({ ...d, daysSince: Math.round(daysSince) });
        } else if (daysSince > 10) {
          localStorage.removeItem('cp_last_sick');
        }
      }
    } catch (_) {}

    // "What changed" county update brief (after ≥1 day away)
    try {
      const snap = JSON.parse(localStorage.getItem('cp_last_county_snapshot') || 'null');
      if (snap?.fips) {
        const daysSince = (Date.now() - new Date(snap.date).getTime()) / 86400000;
        if (daysSince >= 1) {
          axios.get(`/api/county-detail/${snap.fips}`)
            .then(r => {
              const currentTrend = r.data.stats?.trend_pct ?? 0;
              const currentRisk = r.data.ai_analysis?.risk_level ?? snap.riskLevel;
              const trendDelta = Math.abs(currentTrend - (snap.trendPct ?? 0));
              if (currentRisk !== snap.riskLevel || trendDelta >= 10) {
                setCountyUpdate({
                  county: snap.county, state: snap.state,
                  prevRisk: snap.riskLevel, currentRisk,
                  prevTrend: snap.trendPct ?? 0, currentTrend,
                  daysSince: Math.round(daysSince),
                });
              }
            })
            .catch(() => {});
        }
      }
    } catch (_) {}
  }, []);

  const completeOnboarding = (ageGroup) => {
    localStorage.setItem('cp_age_group', ageGroup);
    localStorage.setItem('cp_onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleRecovery = (status) => {
    localStorage.removeItem('cp_last_sick');
    setRecoveryData(null);
    if (status === 'better') {
      const today = new Date().toDateString();
      localStorage.setItem('cp_last_checkin', today);
      const s = parseInt(localStorage.getItem('cp_streak') || '0');
      localStorage.setItem('cp_streak', s + 1);
      setStreak(s + 1);
      setView('wellness');
    } else {
      setView('form');
    }
  };

  const loadScenario = async (type) => {
    setDemoLoading(true);
    try {
      if (demoActive) await axios.post('/api/demo/clear');
      if (type === 'new_england') {
        await axios.post('/api/demo/seed-new-england');
      } else if (type === 'southern_az') {
        await axios.post('/api/demo/seed-southern-az');
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

      {/* ── Onboarding Modal ─────────────────────────────────────── */}
      {showOnboarding && <OnboardingModal onComplete={completeOnboarding} />}

      {/* ── Recovery Banner ──────────────────────────────────────── */}
      {recoveryData && !showOnboarding && (
        <RecoveryBanner
          data={recoveryData}
          onRespond={handleRecovery}
          onDismiss={() => setRecoveryData(null)}
        />
      )}

      {/* ── County Update Brief ───────────────────────────────────── */}
      {countyUpdate && !recoveryData && !showOnboarding && (
        <CountyUpdateBrief
          update={countyUpdate}
          onDismiss={() => setCountyUpdate(null)}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="checkin-hero">
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
          <ScenarioBtn
            active={scenario === 'southern_az'}
            activeColor="#D97706"
            activeBg="rgba(217,119,6,0.07)"
            activeBorder="rgba(217,119,6,0.4)"
            label="🌵 Southern AZ Border"
            disabled={demoLoading}
            onClick={() => loadScenario('southern_az')}
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
