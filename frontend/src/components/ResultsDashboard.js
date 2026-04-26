import React, { useEffect, useState, useRef } from 'react';
import ForecastChart from './ForecastChart';
import NotifyButton from './NotifyButton';
import AIExplainer from './AIExplainer';
import { getCountyDetail, getAIResult } from '../api';
import { EpiCurve } from './CountyDetailPanel';
import EpidemicForecast from './EpidemicForecast';
import HealthChatbot from './HealthChatbot';

const RISK_COLOR  = { low: '#059669', medium: '#D97706', high: '#EA580C', critical: '#DC2626', severe: '#DC2626' };
const RISK_BG     = { low: '#F0FDF4', medium: '#FFFBEB', high: '#FFF7ED', critical: '#FEF2F2', severe: '#FEF2F2' };
const PRIORITY_COLOR = { urgent: '#DC2626', high: '#EA580C', moderate: '#D97706', low: '#059669' };


function OpenAIBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
      border: '1px solid rgba(16,163,127,0.35)',
      borderRadius: 20, padding: '2px 8px',
      fontSize: '0.62rem', fontWeight: 700,
      color: '#065F46', letterSpacing: 0.3,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="#10A37F"/>
      </svg>
      OpenAI
    </div>
  );
}

function Section({ title, titleColor = '#374151', badge, children, style, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
      ...(collapsible ? { overflow: 'hidden' } : { padding: '16px 18px' }),
      ...style,
    }}>
      {title && (
        <div
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? open : undefined}
          onClick={collapsible ? () => setOpen(o => !o) : undefined}
          onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            ...(collapsible
              ? { padding: '13px 18px', cursor: 'pointer', borderBottom: open ? '1px solid #E5E7EB' : 'none', userSelect: 'none' }
              : { marginBottom: 12 }),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ color: titleColor, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {title}
            </div>
            {badge}
          </div>
          {collapsible && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0, marginLeft: 8 }} aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          )}
        </div>
      )}
      {collapsible
        ? <div style={{ padding: '14px 18px', display: open ? 'block' : 'none' }}>{children}</div>
        : children
      }
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB',
      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ color, fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#6B7280', fontSize: '0.68rem', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function ClusterVerdictCard({ formData, cluster, riskLevel, cd, whoAlerts }) {
  const { trend_pct = 0, report_count = 0, forecast = 'stable' } = cluster;
  const cdTrend = cd?.stats?.trend_pct ?? 0;
  const effectiveTrend = cdTrend !== 0 ? cdTrend : trend_pct;

  const userSymptoms = (formData?.symptoms || []).map(s => s.toLowerCase().replace(/_/g, ' ').trim());
  const countyTopSx = (cd?.symptoms || []).slice(0, 5).map(s => s.name.toLowerCase().replace(/_/g, ' ').trim());
  const matched = userSymptoms.filter(us => countyTopSx.some(cs => cs.includes(us) || us.includes(cs)));
  const matchPct = userSymptoms.length > 0 ? Math.round((matched.length / userSymptoms.length) * 100) : 0;

  const isHigh = riskLevel === 'high' || riskLevel === 'critical';
  let verdict;
  if (effectiveTrend >= 20 && report_count >= 5 && matchPct >= 40 && isHigh) verdict = 'active';
  else if (effectiveTrend >= 10 && report_count >= 3) verdict = 'emerging';
  else if (effectiveTrend > 0 || report_count >= 2 || forecast === 'growing') verdict = 'elevated';
  else verdict = 'clear';

  const V = {
    active:   { bg: '#FEF2F2', border: '#DC2626', icon: '🚨', title: 'Active Cluster Signal Detected', subtitle: 'Your symptoms match a pattern of emerging community illness in your county. This is consistent with an active local outbreak.', cta: true },
    emerging: { bg: '#FFF7ED', border: '#EA580C', icon: '⚠️', title: 'Emerging Community Signal', subtitle: 'Reports in your county are rising and your symptoms may be part of a developing outbreak pattern.', cta: true },
    elevated: { bg: '#FFFBEB', border: '#D97706', icon: '📊', title: 'Elevated County Activity', subtitle: 'Your county is showing above-normal illness reports this week. Your data contributes to early detection.', cta: false },
    clear:    { bg: '#F0FDF4', border: '#059669', icon: '✅', title: 'No Active Cluster Detected', subtitle: 'Your county is within normal seasonal illness ranges. Your report helps confirm this community baseline.', cta: false },
  }[verdict];

  const bullets = [];
  if (matched.length > 0 && countyTopSx.length > 0)
    bullets.push(`Your ${matched.slice(0, 3).join(', ')} match the top symptoms in ${cd?.county?.county ?? 'your'} County`);
  if (effectiveTrend > 0)
    bullets.push(`County illness reports are up ${Math.abs(effectiveTrend)}% from last week`);
  else if (effectiveTrend < 0)
    bullets.push(`County reports down ${Math.abs(effectiveTrend)}% — trend improving`);
  if (report_count > 0)
    bullets.push(`${report_count} similar reports submitted in the past 72 hours`);
  if ((whoAlerts || []).length > 0)
    bullets.push(`WHO has ${whoAlerts.length} active disease alert${whoAlerts.length > 1 ? 's' : ''} relevant to your region`);
  if ((cd?.travel?.sources?.length ?? 0) > 0)
    bullets.push(`${cd.travel.sources.length} inbound-flight counties reporting active illness`);

  return (
    <div style={{ background: V.bg, border: `2px solid ${V.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{V.icon}</span>
        <div>
          <div style={{ color: V.border, fontWeight: 800, fontSize: '0.9rem', letterSpacing: 0.2 }}>{V.title}</div>
          <div style={{ color: '#6B7280', fontSize: '0.67rem', marginTop: 2 }}>Community Outbreak Analysis · AI-synthesized from self-reports, CDC FluView, WHO &amp; travel data</div>
        </div>
      </div>
      <p style={{ color: '#374151', fontSize: '0.84rem', margin: '0 0 10px', lineHeight: 1.55 }}>{V.subtitle}</p>
      {bullets.length > 0 && (
        <div style={{ borderTop: `1px solid ${V.border}33`, paddingTop: 10, marginBottom: V.cta ? 10 : 0 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < bullets.length - 1 ? 5 : 0 }}>
              <span style={{ color: V.border, fontSize: '0.66rem', marginTop: 3, flexShrink: 0 }}>▶</span>
              <span style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>
      )}
      {V.cta && (
        <div style={{ background: `${V.border}11`, border: `1px solid ${V.border}33`, borderRadius: 8, padding: '9px 12px', fontSize: '0.78rem', color: V.border, fontWeight: 600 }}>
          Consider alerting close contacts — use "Alert Your Network" below
        </div>
      )}
      {!cd && <div style={{ color: '#9CA3AF', fontSize: '0.66rem', marginTop: 8 }}>Fetching county data for full synthesis…</div>}
    </div>
  );
}

function SymptomBar({ name, count, pct, max }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 3 }}>
        <span style={{ color: '#374151', textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
        <span style={{ color: '#6B7280' }}>{count} · {(pct * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(count / max) * 100}%`,
          background: 'linear-gradient(90deg, #EA580C, #DC2626)',
          borderRadius: 3, transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default function ResultsDashboard({ results, formData, setView, currentUser, setCurrentUser }) {
  const [countyDetail, setCountyDetail] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [audioRevealed, setAudioRevealed] = useState(false);
  const pollRef = useRef(null);
  const server_streak = results?.server_streak ?? null;

  useEffect(() => {
    if (server_streak != null && currentUser && setCurrentUser) {
      setCurrentUser(u => ({ ...u, streak: server_streak }));
      localStorage.setItem('cp_streak', server_streak);
    }
  }, [server_streak]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save state for recovery tracking + "what changed" return brief
  useEffect(() => {
    const fips = results?.fips || formData?.fips;
    const snap = {
      date: new Date().toISOString(),
      fips,
      county: results?.county || formData?.county,
      state: results?.state || formData?.state,
      riskLevel: results?.risk_level,
      trendPct: results?.cluster?.trend_pct ?? 0,
    };
    if (fips) localStorage.setItem('cp_last_county_snapshot', JSON.stringify(snap));
    if (results?.risk_level && results.risk_level !== 'low') {
      localStorage.setItem('cp_last_sick', JSON.stringify({
        ...snap,
        symptoms: formData?.symptoms || [],
      }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for Gemma AI result
  useEffect(() => {
    const jobId = results?.ai_job_id;
    if (!jobId || !results?.ai_pending) return;
    const poll = async () => {
      try {
        const r = await getAIResult(jobId);
        if (r.status === 'done' && r.result) {
          setAiData(r.result);
          clearInterval(pollRef.current);
        }
      } catch (e) { /* keep polling */ }
    };
    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [results?.ai_job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch county detail for richer context
  useEffect(() => {
    const fips = results?.fips || formData?.fips;
    if (!fips) return;
    getCountyDetail(fips).then(setCountyDetail).catch(() => {});
  }, [results?.fips, formData?.fips]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!results) return null;

  // Merge aiData (Gemma result) on top of fast results once available
  const merged = aiData ? { ...results, ...aiData } : results;

  const {
    risk_level = 'low',
    recommendation,
    recommendations = [],
    notify_others,
    notify_message,
    ai_explanation,
    risk_factors_flagged = [],
    self_care_tips = [],
    wellness_tip,
    confidence,
    cluster = {},
    county,
    state,
    audio_url,
    audio_error,
    weather,
    fluview,
    neighbor_spread,
    who_alerts = [],
    outbreaks_near_me = [],
  } = merged;

  const { report_count = 0, trend_pct = 0, forecast = 'stable', chart_data = [] } = cluster;
  const streak = (server_streak != null && currentUser)
    ? server_streak
    : parseInt(localStorage.getItem('cp_streak') || '0');

  const rColor = RISK_COLOR[risk_level] || '#6B7280';
  const rBg    = RISK_BG[risk_level]    || '#FFFFFF';
  const locationStr = `${county || ''}${state ? ', ' + state : ''}`;

  const cd = countyDetail;
  const cdAi = cd?.ai_analysis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Streak + Audio row */}
      {(streak > 0 || audio_url || merged.ai_pending) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {streak > 0 ? (
            <div className="streak-badge" style={{ display: 'inline-flex' }}>
              🔥 {streak}-day streak
            </div>
          ) : <div />}

          {/* Audio button — right side */}
          {audio_url ? (
            audioRevealed ? (
              <audio controls autoPlay src={audio_url} style={{ height: 32, maxWidth: 220, borderRadius: 8 }}>
                Your browser does not support audio playback.
              </audio>
            ) : (
              <button
                onClick={() => setAudioRevealed(true)}
                aria-label="Play audio summary"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'linear-gradient(135deg, #F0FDFA, #CCFBF1)',
                  border: '1.5px solid #5EEAD4', borderRadius: 20,
                  padding: '6px 12px 6px 8px', cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(42,157,143,0.2)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div aria-hidden="true" style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#2A9D8F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="9" height="10" viewBox="0 0 13 14" fill="white">
                    <path d="M1 1l11 6-11 6V1z"/>
                  </svg>
                </div>
                <span style={{ color: '#0F766E', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  Play Summary
                </span>
              </button>
            )
          ) : merged.ai_pending ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9CA3AF', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ width: 11, height: 11, border: '2px solid #2A9D8F', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
              audio…
            </div>
          ) : null}
        </div>
      )}

      {/* ── Cluster Verdict ─────────────────────────────────────────── */}
      <ClusterVerdictCard
        formData={formData}
        cluster={cluster}
        riskLevel={risk_level}
        cd={cd}
        whoAlerts={who_alerts}
      />

      {/* ── Chatbot Button ──────────────────────────────────────────── */}
      <button
        onClick={() => setChatOpen(true)}
        aria-label="Open public health assistant chat"
        style={{
          width: '100%', background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
          border: '1.5px solid #BFDBFE', borderRadius: 12, padding: '14px 18px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          textAlign: 'left', marginBottom: 4,
          transition: 'box-shadow 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = '#93C5FD'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
      >
        <span aria-hidden="true" style={{ fontSize: '1.3rem', flexShrink: 0 }}>💬</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#1E40AF', fontWeight: 700, fontSize: '0.88rem' }}>Want more info?</div>
          <div style={{ color: '#6B7280', fontSize: '0.74rem', marginTop: 1 }}>
            Ask a public health assistant about prevention, what to do next, and community resources
          </div>
        </div>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {chatOpen && (
        <HealthChatbot
          onClose={() => setChatOpen(false)}
          formData={formData}
          results={results}
        />
      )}

      {/* ── Risk Banner ─────────────────────────────────────────────── */}
      <div style={{
        background: rBg, border: `1px solid ${rColor}55`,
        borderRadius: 14, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{
            background: rColor, color: '#000', fontWeight: 800,
            fontSize: '0.7rem', padding: '4px 12px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {risk_level === 'critical' ? '🚨 CRITICAL' : risk_level === 'high' ? '🚨 HIGH RISK' : risk_level === 'medium' ? '⚠️ MEDIUM RISK' : '✅ LOW RISK'}
          </div>
          {confidence && (
            <div style={{ color: '#6B7280', fontSize: '0.7rem' }}>
              {confidence} confidence
            </div>
          )}
        </div>

        <p style={{ color: '#374151', fontSize: '0.88rem', margin: '0 0 12px', lineHeight: 1.55 }}>
          {recommendation}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#6B7280', fontSize: '0.78rem' }}>
            📍 {locationStr || 'your county'}
          </span>
          <span style={{ color: '#9CA3AF' }}>·</span>
          <span style={{ color: '#6B7280', fontSize: '0.78rem' }}>
            {report_count > 0
              ? `${report_count} similar reports in past 72h`
              : 'First reporter — your data starts the picture'}
          </span>
          {report_count >= 3 && (
            <>
              <span style={{ color: '#9CA3AF' }}>·</span>
              <span style={{
                color: forecast === 'growing' ? '#DC2626' : forecast === 'declining' ? '#059669' : '#D97706',
                fontSize: '0.75rem', fontWeight: 600,
              }}>
                {forecast === 'growing' ? '↑' : forecast === 'declining' ? '↓' : '→'} {forecast}
                {trend_pct !== 0 && ` (${trend_pct > 0 ? '+' : ''}${trend_pct}%)`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Notify ──────────────────────────────────────────────────── */}
      {notify_others && report_count >= 2 && (
        <NotifyButton message={notify_message} county={county} />
      )}

      {/* ── Personalized Recommendations ────────────────────────────── */}
      {merged.ai_pending && !aiData && (
        <Section title="What You Should Do" titleColor="#059669" collapsible defaultOpen={true}>
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6B7280', fontSize: '0.82rem' }}>
            <div aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid #2A9D8F', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
            <span>OpenAI is analyzing your symptoms…</span>
            <OpenAIBadge />
          </div>
        </Section>
      )}
      {recommendations.length > 0 && (
        <Section
          title="What You Should Do"
          titleColor="#059669"
          badge={<OpenAIBadge />}
          collapsible defaultOpen={true}
        >
          {recommendations.map((rec, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              paddingBottom: i < recommendations.length - 1 ? 10 : 0,
              marginBottom: i < recommendations.length - 1 ? 10 : 0,
              borderBottom: i < recommendations.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{
                background: PRIORITY_COLOR[rec.priority] + '22',
                border: `1px solid ${PRIORITY_COLOR[rec.priority]}55`,
                color: PRIORITY_COLOR[rec.priority],
                fontSize: '0.6rem', fontWeight: 700,
                padding: '2px 7px', borderRadius: 10,
                textTransform: 'uppercase', letterSpacing: 0.5,
                whiteSpace: 'nowrap', marginTop: 1, flexShrink: 0,
              }}>
                {rec.priority}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#1F2937', fontSize: '0.84rem', lineHeight: 1.4, marginBottom: 2 }}>
                  {rec.action}
                </div>
                {rec.reason && (
                  <div style={{ color: '#6B7280', fontSize: '0.72rem', lineHeight: 1.35 }}>
                    {rec.reason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* ── Self-Care Tips ───────────────────────────────────────────── */}
      {merged.ai_pending && !aiData && (
        <Section title="How to Help Yourself" titleColor="#2A9D8F" collapsible defaultOpen={true}>
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6B7280', fontSize: '0.82rem' }}>
            <div aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid #2A9D8F', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
            <span>Generating personalized self-care tips…</span>
            <OpenAIBadge />
          </div>
        </Section>
      )}
      {self_care_tips.length > 0 && (
        <Section title="How to Help Yourself" titleColor="#2A9D8F" badge={<OpenAIBadge />} collapsible defaultOpen={true}>
          {self_care_tips.map((item, i) => {
            const CATEGORY_ICON = {
              'symptom relief': '💊', hydration: '💧', rest: '😴',
              monitoring: '🌡️', prevention: '🛡️', environment: '🌤️',
              nutrition: '🥗', 'when to seek care': '🏥',
            };
            const icon = CATEGORY_ICON[item.category] || '✦';
            return (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                paddingBottom: i < self_care_tips.length - 1 ? 10 : 0,
                marginBottom: i < self_care_tips.length - 1 ? 10 : 0,
                borderBottom: i < self_care_tips.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#1F2937', fontSize: '0.84rem', lineHeight: 1.45 }}>
                    {item.tip}
                  </div>
                  <div style={{
                    color: '#2C5282', fontSize: '0.65rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3,
                  }}>
                    {item.category}
                  </div>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* ── Risk Factors Flagged ─────────────────────────────────────── */}
      {risk_factors_flagged.length > 0 && risk_factors_flagged[0] !== 'No high-signal risk factors detected' && (
        <Section title="Signals Detected" titleColor="#EA580C" collapsible defaultOpen={false}>
          {risk_factors_flagged.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ color: '#EA580C', fontSize: '0.72rem', marginTop: 2, flexShrink: 0 }}>▶</span>
              <span style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>{f}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Trend Chart ──────────────────────────────────────────────── */}
      <Section title="Community Trend" titleColor="#1F2937" collapsible defaultOpen={false}>
        <ForecastChart chartData={chart_data} forecast={forecast} trendPct={trend_pct} />
      </Section>


      {/* ══ COUNTY CONTEXT (from county-detail API) ══════════════════ */}
      {cd && (
        <>
          {/* County AI summary */}
          {cdAi?.summary && (
            <Section title={`${cd.county?.county} County Overview`} titleColor="#2A9D8F" collapsible defaultOpen={true}>
              <p style={{ color: '#374151', fontSize: '0.83rem', margin: 0, lineHeight: 1.55 }}>
                {cdAi.summary}
              </p>
              {cdAi?.trend_assessment && (
                <p style={{ color: '#6B7280', fontSize: '0.78rem', margin: '10px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
                  {cdAi.trend_assessment}
                </p>
              )}
            </Section>
          )}

          {/* County quick stats */}
          <Section title="County Stats" titleColor="#2A9D8F" collapsible defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <StatTile label="7-Day Reports"  value={cd.stats?.total ?? '—'}                                                          color="#2A9D8F" />
              <StatTile label="Sick Rate"       value={cd.stats ? `${(cd.stats.sick_rate * 100).toFixed(0)}%` : '—'}                  color="#DC2626" />
              <StatTile label="Week Trend"
                value={cd.stats ? `${cd.stats.trend_pct >= 0 ? '+' : ''}${cd.stats.trend_pct}%` : '—'}
                color={cd.stats?.trend_pct > 15 ? '#DC2626' : cd.stats?.trend_pct < -10 ? '#059669' : '#D97706'}
              />
            </div>
          </Section>

          {/* Epi Curve */}
          <Section title="30-Day Epi Curve" titleColor="#1F2937" collapsible defaultOpen={false}>
            <EpiCurve daily30d={cd.stats?.daily_30d} />
          </Section>

          {/* SIR Outbreak Forecast */}
          <Section title={`⚠ Epidemic Outbreak Forecast — ${cd.county?.county || ''} County`} titleColor="#DC2626" collapsible defaultOpen={false}>
            <EpidemicForecast
              fips={cd.county?.fips || results?.fips || formData?.fips}
              county={cd.county?.county}
              state={cd.county?.state}
            />
          </Section>

          {/* Top symptoms in county */}
          {cd.symptoms?.length > 0 && (
            <Section title="Top Symptoms in Your County (7 days)" titleColor="#1F2937" collapsible defaultOpen={false}>
              {cd.symptoms.slice(0, 6).map(s => (
                <SymptomBar
                  key={s.name} name={s.name}
                  count={s.count} pct={s.pct}
                  max={cd.symptoms[0].count}
                />
              ))}
            </Section>
          )}

          {/* County key drivers */}
          {cdAi?.key_drivers?.length > 0 && (
            <Section title="County Risk Drivers" titleColor="#EA580C" collapsible defaultOpen={false}>
              {cdAi.key_drivers.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
                  <span style={{ color: '#EA580C', fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>▶</span>
                  <span style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.4 }}>{d}</span>
                </div>
              ))}
            </Section>
          )}

          {/* County recommendations */}
          {cdAi?.recommendations?.length > 0 && (
            <Section title="County-Level Guidance" titleColor="#059669" collapsible defaultOpen={false}>
              {cdAi.recommendations.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
                  <span style={{ color: '#059669', fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>✓</span>
                  <span style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.4 }}>{r}</span>
                </div>
              ))}
            </Section>
          )}

          {/* One Health exposure factors */}
          {cd.risk_factors && Object.values(cd.risk_factors).some(v => v > 0) && (
            <Section title="One Health Exposure Factors (County)" titleColor="#1F2937" collapsible defaultOpen={false}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { key: 'recent_travel',             label: 'Recent Travel' },
                  { key: 'event_attendance',          label: 'Mass Events' },
                  { key: 'animal_contact',            label: 'Animal Contact' },
                  { key: 'tick_insect_bite',          label: 'Tick/Insect Bite' },
                  { key: 'contact_sick_individual',   label: 'Sick Contact' },
                  { key: 'water_concerns',            label: 'Water Concerns' },
                  { key: 'sought_healthcare',         label: 'Sought Healthcare' },
                  { key: 'flooding',                  label: 'Flooding' },
                ].map(({ key, label }) => {
                  const val = cd.risk_factors[key] ?? 0;
                  if (val === 0) return null;
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ color: '#6B7280', fontSize: '0.73rem' }}>{label}</span>
                      <span style={{ color: '#D97706', fontSize: '0.8rem', fontWeight: 600 }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* One Health: Animal Signal */}
          {cd.animal_health?.zoonotic_signal && (
            <Section title="🐾 One Health: Animal Signal" titleColor="#D97706" collapsible defaultOpen={false}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#D97706', fontSize: '1.3rem', fontWeight: 700 }}>{cd.animal_health.animal_contact_reports}</div>
                  <div style={{ color: '#6B7280', fontSize: '0.65rem' }}>animal contact reports</div>
                </div>
                <div style={{ width: 1, background: '#E5E7EB' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: cd.animal_health.sick_animals_reported > 0 ? '#DC2626' : '#9CA3AF', fontSize: '1.3rem', fontWeight: 700 }}>{cd.animal_health.sick_animals_reported}</div>
                  <div style={{ color: '#6B7280', fontSize: '0.65rem' }}>sick animals reported</div>
                </div>
              </div>
              <div style={{ color: '#374151', fontSize: '0.76rem', lineHeight: 1.45 }}>
                {cd.animal_health.sick_animals_reported > 0
                  ? 'Potential zoonotic signal. Consider veterinary surveillance and reporting to animal health authorities.'
                  : 'Human-animal contact reported. Monitor for zoonotic transmission patterns.'}
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '0.62rem', marginTop: 8 }}>One Health triad: human ↔ animal ↔ environment</div>
            </Section>
          )}

          {/* Neighboring county spread */}
          {cd.neighbor_spread && !cd.neighbor_spread.startsWith('No elevated') && (
            <Section title="Neighboring County Activity" titleColor="#D97706" collapsible defaultOpen={false}>
              <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 8, lineHeight: 1.4 }}>
                Elevated illness in surrounding counties signals geographic spread risk.
              </div>
              {cd.neighbor_spread.split('\n').map((line, i) => (
                <div key={i} style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 3 }}>
                  {line}
                </div>
              ))}
            </Section>
          )}

          {/* Inbound travel risk */}
          {cd.travel?.sources?.length > 0 && (
            <Section title="✈  Inbound Travel Illness Risk" titleColor="#D97706" collapsible defaultOpen={false}>
              <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
                Counties with direct flights reporting active illness
              </div>
              {cd.travel.sources.slice(0, 5).map(src => (
                <div key={src.fips} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid #F3F4F6',
                }}>
                  <div>
                    <div style={{ color: '#374151', fontSize: '0.78rem' }}>{src.county}, {src.state}</div>
                    <div style={{ color: '#9CA3AF', fontSize: '0.67rem' }}>
                      {src.via_airport} → {src.to_airport} · {src.routes} route{src.routes !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                    {src.sick} sick
                  </div>
                </div>
              ))}
              {cd.travel.sources.length > 5 && (
                <div style={{ color: '#9CA3AF', fontSize: '0.68rem', marginTop: 6 }}>
                  +{cd.travel.sources.length - 5} more source counties
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {/* ── Environmental & Surveillance ─────────────────────────────── */}
      <Section title="Environmental &amp; Surveillance" titleColor="#2A9D8F" collapsible defaultOpen={false}>
        {/* Weather row */}
        {weather && weather.temp !== 'N/A' && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F3F4F6' }}>
            <div>
              <div style={{ color: '#2A9D8F', fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>
                {weather.temp}°
              </div>
              <div style={{ color: '#9CA3AF', fontSize: '0.65rem', marginTop: 1 }}>Fahrenheit</div>
            </div>
            <div style={{ flex: 1, borderLeft: '1px solid #E5E7EB', paddingLeft: 14 }}>
              <div style={{ color: '#374151', fontSize: '0.82rem', textTransform: 'capitalize' }}>
                {weather.conditions}
              </div>
              {weather.humidity != null && (
                <div style={{ color: '#6B7280', fontSize: '0.72rem', marginTop: 3 }}>
                  Humidity: {weather.humidity}% · Feels like: {weather.feels_like}°F
                </div>
              )}
            </div>
          </div>
        )}

        {/* Authoritative sources */}
        {[
          { label: 'CDC FluView', value: fluview || cd?.fluview },
        ].map(({ label, value }) => value && (
          <div key={label} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ color: '#2C5282', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ color: '#374151', fontSize: '0.76rem', lineHeight: 1.45 }}>
              {value}
            </div>
          </div>
        ))}
      </Section>

      {/* Neighbor spread (from checkin) when county detail not loaded */}
      {!cd && neighbor_spread && !neighbor_spread.startsWith('No elevated') && (
        <Section title="Neighboring County Activity" titleColor="#D97706" collapsible defaultOpen={false}>
          {neighbor_spread.split('\n').map((line, i) => (
            <div key={i} style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 3 }}>
              {line}
            </div>
          ))}
        </Section>
      )}

      {/* Wellness tip */}
      {wellness_tip && (
        <Section title="Wellness Tip" titleColor="#059669" collapsible defaultOpen={false}>
          <p style={{ color: '#374151', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>{wellness_tip}</p>
        </Section>
      )}

      {/* ── WHO Alerts ───────────────────────────────────────────────── */}
      {who_alerts.length > 0 && (
        <Section title="🌐 WHO Disease Outbreak News" titleColor="#EA580C" collapsible defaultOpen={false}>
          <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
            Active alerts from the World Health Organization relevant to your risk context
          </div>
          {who_alerts.slice(0, 3).map((alert, i) => (
            <div key={i} style={{
              paddingBottom: i < who_alerts.length - 1 ? 9 : 0,
              marginBottom: i < who_alerts.length - 1 ? 9 : 0,
              borderBottom: i < who_alerts.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{ color: '#1F2937', fontSize: '0.8rem', lineHeight: 1.4 }}>{alert.title}</div>
              {alert.date && <div style={{ color: '#9CA3AF', fontSize: '0.67rem', marginTop: 2 }}>{alert.date}</div>}
            </div>
          ))}
          <div style={{ color: '#9CA3AF', fontSize: '0.63rem', marginTop: 8 }}>Source: WHO Disease Outbreak News (who.int)</div>
        </Section>
      )}

      {/* ── OutbreaksNearMe ───────────────────────────────────────────── */}
      {outbreaks_near_me.length > 0 && (
        <Section title="📡 OutbreaksNearMe · Global Signals" titleColor="#D97706" collapsible defaultOpen={false}>
          <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
            ProMED verified outbreak reports · same data powering outbreaksnearme.org
          </div>
          {outbreaks_near_me.slice(0, 3).map((ob, i) => (
            <div key={i} style={{
              paddingBottom: i < outbreaks_near_me.length - 1 ? 9 : 0,
              marginBottom: i < outbreaks_near_me.length - 1 ? 9 : 0,
              borderBottom: i < outbreaks_near_me.length - 1 ? '1px solid #F3F4F6' : 'none',
            }}>
              <div style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.4 }}>{ob.title}</div>
              {ob.date && <div style={{ color: '#9CA3AF', fontSize: '0.65rem', marginTop: 2 }}>{ob.date}</div>}
            </div>
          ))}
          <div style={{ color: '#9CA3AF', fontSize: '0.63rem', marginTop: 8 }}>Source: ProMED / outbreaksnearme.org</div>
        </Section>
      )}

      {/* ── AI Explainer (accordion) ─────────────────────────────────── */}
      <AIExplainer
        explanation={ai_explanation}
        reportCount={report_count}
        county={county}
        whoAlerts={who_alerts}
        outbreaksNearMe={outbreaks_near_me}
      />

      {/* ── Age distribution (from county detail) ───────────────────── */}
      {cd?.age_groups && Object.keys(cd.age_groups).length > 0 && (
        <Section title="Age Distribution (County)" titleColor="#1F2937" collapsible defaultOpen={false}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(cd.age_groups).map(([group, count]) => (
              <div key={group} style={{
                background: '#FFFBEB', border: '1px solid #E5E7EB',
                borderRadius: 8, padding: '8px 14px', textAlign: 'center',
              }}>
                <div style={{ color: '#2A9D8F', fontWeight: 700, fontSize: '1.1rem' }}>{count}</div>
                <div style={{ color: '#6B7280', fontSize: '0.68rem', textTransform: 'capitalize', marginTop: 2 }}>{group}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <button className="btn btn-secondary" onClick={() => setView('checkin')}>
        ← Back to Home
      </button>

      <div style={{ color: '#9CA3AF', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
        Data: CommunityPulse self-reports, CDC FluView, Epicore, BEACON, OpenFlights, OpenWeatherMap, US Census
      </div>
    </div>
  );
}
