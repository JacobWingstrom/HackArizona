import React, { useEffect, useState } from 'react';
import { submitCheckin } from '../api';

function updateStreak() {
  const today = new Date().toDateString();
  const last = localStorage.getItem('cp_last_checkin');
  let streak = parseInt(localStorage.getItem('cp_streak') || '0');
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last === today) return streak;
  streak = last === yesterday ? streak + 1 : 1;
  localStorage.setItem('cp_streak', streak);
  localStorage.setItem('cp_last_checkin', today);
  return streak;
}

const CAMPAIGNS = {
  child: {
    icon: '🏫',
    headline: 'Keep your school safe',
    pitch: 'Share CommunityPulse with your school nurse or PTA. When more families check in, we can detect classroom outbreaks days earlier.',
    cta: 'Share with your school',
    tips: [
      'Remind kids to wash hands before meals and after recess',
      'Keep absences logged — patterns matter for outbreak detection',
      'Report symptoms early, even mild ones',
    ],
  },
  elderly: {
    icon: '🤝',
    headline: 'Your community thanks you',
    pitch: 'Seniors are among the most valuable contributors to CommunityPulse. Your consistent check-ins build the baseline that protects everyone.',
    cta: 'Invite a neighbor',
    tips: [
      'A daily check-in takes less than 60 seconds',
      'Share CommunityPulse with your doctor or senior center',
      'Even "feeling fine" reports help us establish healthy baselines',
    ],
  },
  student: {
    icon: '🎓',
    headline: 'Campus Pulse — help protect your campus',
    pitch: 'Your campus has hundreds of people in close contact. One check-in per day can help detect outbreaks in dorms or dining halls before they spread.',
    cta: 'Share with your dorm',
    tips: [
      'Dorms, dining halls, and gyms are high-transmission zones',
      'Report symptoms before you miss class — early data helps us help you',
      'Share with your RA or student health center',
    ],
  },
  adult: {
    icon: '💼',
    headline: 'Help keep your community healthy',
    pitch: 'Workplace outbreaks account for 30% of community spread. Your healthy check-ins help establish the baseline that makes outbreaks visible.',
    cta: 'Share with coworkers',
    tips: [
      'Wash hands frequently — especially after public transit',
      'Stay home if symptoms appear, even mild ones',
      'Share CommunityPulse with your workplace health coordinator',
    ],
  },
};

function Card({ children, style }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB',
      borderRadius: 10, padding: '16px 18px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ color = '#2A9D8F', children }) {
  return (
    <div style={{ color, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default function WellnessMode({ setView, currentUser, setCurrentUser, preloadedData }) {
  const [streak, setStreak]       = useState(0);
  const [checkinData, setCheckinData] = useState(preloadedData || null);
  const [loading, setLoading]     = useState(!preloadedData);
  const ageGroup = localStorage.getItem('cp_age_group') || 'adult';
  const campaign = CAMPAIGNS[ageGroup] || CAMPAIGNS.adult;

  useEffect(() => {
    const localStreak = updateStreak();
    setStreak(localStreak);

    // If data was already submitted by SymptomForm, skip the extra fetch
    if (preloadedData) {
      if (preloadedData.server_streak != null && currentUser && setCurrentUser) {
        setStreak(preloadedData.server_streak);
        setCurrentUser(u => ({ ...u, streak: preloadedData.server_streak }));
        localStorage.setItem('cp_streak', preloadedData.server_streak);
      }
      return;
    }

    const countyRaw = localStorage.getItem('cp_county');
    let countyData = {};
    try { countyData = JSON.parse(countyRaw || 'null') || {}; } catch {}

    submitCheckin({
      feeling: 'healthy',
      symptoms: [],
      age_group: ageGroup,
      household_members: 1,
      sick_household_members: 0,
      ...countyData,
    })
      .then((res) => {
        setCheckinData(res);
        setLoading(false);
        if (res.server_streak != null && currentUser && setCurrentUser) {
          setStreak(res.server_streak);
          setCurrentUser(u => ({ ...u, streak: res.server_streak }));
          localStorage.setItem('cp_streak', res.server_streak);
        }
      })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line

  const cluster    = checkinData?.cluster || {};
  const weather    = checkinData?.weather;
  const who        = checkinData?.who_alerts || [];
  const outbreaks  = checkinData?.outbreaks_near_me || [];
  const county     = checkinData?.county || '';
  const state      = checkinData?.state || '';
  const riskLevel  = cluster.is_cluster ? 'elevated' : cluster.report_count > 5 ? 'moderate' : 'low';
  const riskColor  = riskLevel === 'elevated' ? '#EA580C' : riskLevel === 'moderate' ? '#D97706' : '#059669';

  const shareText = `I just checked in on CommunityPulse — a community health surveillance app tracking illness in real time. Join me at communitypulse.health`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520, margin: '0 auto', padding: '8px 0 32px' }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #F0FDF4, #ECFDF5)',
        border: '1px solid rgba(5,150,105,0.2)',
        borderRadius: 14, padding: '24px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.8rem', marginBottom: 6 }}>✨</div>
        <h2 style={{ color: '#059669', margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          You're in the clear!
        </h2>
        <p style={{ color: '#374151', margin: '0 0 16px', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Check-in recorded. Every healthy report strengthens our outbreak baseline for {county}{state ? `, ${state}` : ''}.
        </p>

        {streak > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#FFFBEB', border: '1px solid rgba(217,119,6,0.25)',
            borderRadius: 20, padding: '8px 18px',
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔥</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#D97706', fontWeight: 800, fontSize: '1.1rem', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{streak}-day streak</div>
              <div style={{ color: '#6B7280', fontSize: '0.68rem' }}>Keep checking in daily!</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Community Risk Around You ─────────────────────────────────── */}
      {!loading && (
        <Card>
          <SectionTitle>Community Risk Near You</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: riskColor, flexShrink: 0,
              boxShadow: `0 0 8px ${riskColor}88`,
            }} />
            <div>
              <div style={{ color: '#1F2937', fontSize: '0.9rem', fontWeight: 600 }}>
                {riskLevel === 'elevated' ? 'Elevated illness detected nearby' :
                 riskLevel === 'moderate' ? 'Moderate activity in your county' :
                 'Low illness activity in your area'}
              </div>
              <div style={{ color: '#6B7280', fontSize: '0.74rem', marginTop: 2 }}>
                {cluster.report_count > 0
                  ? `${cluster.report_count} reports in past 72h · trend ${cluster.trend_pct >= 0 ? '+' : ''}${cluster.trend_pct}%`
                  : 'No significant illness reports nearby'}
              </div>
            </div>
          </div>
          {checkinData?.wellness_tip && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: '#FFFFFF', borderRadius: 8, borderLeft: `3px solid ${riskColor}`,
            }}>
              <div style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>
                💡 {checkinData.wellness_tip}
              </div>
            </div>
          )}
          {weather && weather.temp !== 'N/A' && (
            <div style={{ marginTop: 10, color: '#6B7280', fontSize: '0.74rem' }}>
              📍 {weather.temp}°F · {weather.conditions}
              {weather.humidity != null ? ` · ${weather.humidity}% humidity` : ''}
            </div>
          )}
        </Card>
      )}

      {/* ── WHO Global Alerts ─────────────────────────────────────────── */}
      {who.length > 0 && (
        <Card>
          <SectionTitle color="#EA580C">🌐 WHO Disease Outbreak News</SectionTitle>
          <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
            Active alerts from the World Health Organization
          </div>
          {who.slice(0, 3).map((alert, i) => (
            <div key={i} style={{
              paddingBottom: i < who.length - 1 ? 9 : 0,
              marginBottom: i < who.length - 1 ? 9 : 0,
              borderBottom: i < who.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{ color: '#1F2937', fontSize: '0.8rem', lineHeight: 1.4 }}>{alert.title}</div>
              {alert.date && (
                <div style={{ color: '#9CA3AF', fontSize: '0.67rem', marginTop: 2 }}>{alert.date}</div>
              )}
            </div>
          ))}
          <div style={{ color: '#9CA3AF', fontSize: '0.63rem', marginTop: 10 }}>
            Source: WHO Disease Outbreak News (who.int)
          </div>
        </Card>
      )}

      {/* ── OutbreaksNearMe ───────────────────────────────────────────── */}
      {outbreaks.length > 0 && (
        <Card>
          <SectionTitle color="#D97706">📡 OutbreaksNearMe · Global Signals</SectionTitle>
          <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
            ProMED verified outbreak reports · same data powering outbreaksnearme.org
          </div>
          {outbreaks.slice(0, 3).map((ob, i) => (
            <div key={i} style={{
              paddingBottom: i < outbreaks.length - 1 ? 9 : 0,
              marginBottom: i < outbreaks.length - 1 ? 9 : 0,
              borderBottom: i < outbreaks.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.4 }}>{ob.title}</div>
              {ob.date && (
                <div style={{ color: '#9CA3AF', fontSize: '0.65rem', marginTop: 2 }}>{ob.date}</div>
              )}
            </div>
          ))}
          <div style={{ color: '#9CA3AF', fontSize: '0.63rem', marginTop: 10 }}>
            Source: ProMED / outbreaksnearme.org
          </div>
        </Card>
      )}

      {/* ── Community Risk Factors ───────────────────────────────────── */}
      {checkinData?.risk_factors_flagged?.length > 0 &&
       checkinData.risk_factors_flagged[0] !== 'No high-signal risk factors detected' && (
        <Card>
          <SectionTitle color="#EA580C">⚠ Community Risk Signals</SectionTitle>
          <div style={{ color: '#6B7280', fontSize: '0.72rem', marginBottom: 10, lineHeight: 1.4 }}>
            Active signals detected in {county}{state ? `, ${state}` : ''} — even if you feel healthy, be aware
          </div>
          {checkinData.risk_factors_flagged.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < checkinData.risk_factors_flagged.length - 1 ? 7 : 0 }}>
              <span style={{ color: '#EA580C', fontSize: '0.7rem', marginTop: 3, flexShrink: 0 }}>▶</span>
              <span style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.45 }}>{f}</span>
            </div>
          ))}
        </Card>
      )}

      {/* ── Campaign Card ─────────────────────────────────────────────── */}
      <Card style={{ border: '1px solid rgba(42,157,143,0.2)', background: 'linear-gradient(135deg, #F7FDFC, #EDFAF8)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: '2rem', flexShrink: 0 }}>{campaign.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#2A9D8F', fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
              {campaign.headline}
            </div>
            <div style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.5, marginBottom: 12 }}>
              {campaign.pitch}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
              {campaign.tips.map((tip, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                  <span style={{ color: '#2A9D8F', fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>✓</span>
                  <span style={{ color: '#6B7280', fontSize: '0.77rem', lineHeight: 1.4 }}>{tip}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'CommunityPulse', text: shareText });
                } else {
                  navigator.clipboard?.writeText(shareText);
                  alert('Link copied to clipboard!');
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #2A9D8F, #21867A)',
                border: 'none', borderRadius: 8, color: '#000',
                fontSize: '0.78rem', fontWeight: 700, padding: '8px 16px',
                cursor: 'pointer', width: '100%',
              }}
            >
              {campaign.cta} →
            </button>
          </div>
        </div>
      </Card>

      {/* ── Prevention Tips ──────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Stay Healthy — Prevention Checklist</SectionTitle>
        {[
          { icon: '🧼', tip: 'Wash hands for 20 seconds, especially before eating and after transit' },
          { icon: '💧', tip: 'Stay hydrated — dehydration weakens your immune response' },
          { icon: '😴', tip: 'Sleep 7–9 hours — your immune system consolidates during deep sleep' },
          { icon: '🌬️', tip: 'Ventilate shared spaces — open windows reduce airborne transmission' },
          { icon: '📱', tip: 'Check in daily, even when healthy — your data protects your community' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 4 ? 9 : 0 }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
            <span style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>{item.tip}</span>
          </div>
        ))}
      </Card>

      <button className="btn btn-secondary" onClick={() => setView('checkin')}>
        ← Back to Home
      </button>
    </div>
  );
}
