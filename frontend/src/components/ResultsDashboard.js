import React, { useEffect, useState, useRef } from 'react';
import ForecastChart from './ForecastChart';
import NotifyButton from './NotifyButton';
import AIExplainer from './AIExplainer';
import { getCountyDetail, getAIResult } from '../api';

const RISK_COLOR  = { low: '#059669', medium: '#D97706', high: '#EA580C', critical: '#DC2626', severe: '#DC2626' };
const RISK_BG     = { low: '#F0FDF4', medium: '#FFFBEB', high: '#FFF7ED', critical: '#FEF2F2', severe: '#FEF2F2' };
const PRIORITY_COLOR = { urgent: '#DC2626', high: '#EA580C', moderate: '#D97706', low: '#059669' };

function GemmaBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
      border: '1px solid #4285f455',
      borderRadius: 20, padding: '2px 8px',
      fontSize: '0.62rem', fontWeight: 700,
      color: '#1E40AF', letterSpacing: 0.3,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4285f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Gemma 4
    </div>
  );
}

function Section({ title, titleColor = '#374151', badge, children, style }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB',
      borderRadius: 12, padding: '16px 18px', ...style,
    }}>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            color: titleColor, fontSize: '0.7rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>
            {title}
          </div>
          {badge}
        </div>
      )}
      {children}
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
  const pollRef = useRef(null);
  const server_streak = results?.server_streak ?? null;

  useEffect(() => {
    if (server_streak != null && currentUser && setCurrentUser) {
      setCurrentUser(u => ({ ...u, streak: server_streak }));
      localStorage.setItem('cp_streak', server_streak);
    }
  }, [server_streak]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Streak */}
      {streak > 0 && (
        <div className="streak-badge" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
          🔥 {streak}-day streak
        </div>
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
        <Section title="What You Should Do" titleColor="#059669">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6B7280', fontSize: '0.82rem' }}>
            <div style={{ width: 14, height: 14, border: '2px solid #2A9D8F', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
            <span>Gemma 4 is analyzing your symptoms…</span>
            <GemmaBadge />
          </div>
        </Section>
      )}
      {recommendations.length > 0 && (
        <Section
          title="What You Should Do"
          titleColor="#059669"
          badge={<GemmaBadge />}
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
        <Section title="How to Help Yourself" titleColor="#2A9D8F">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6B7280', fontSize: '0.82rem' }}>
            <div style={{ width: 14, height: 14, border: '2px solid #2A9D8F', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
            <span>Generating personalized self-care tips…</span>
            <GemmaBadge />
          </div>
        </Section>
      )}
      {self_care_tips.length > 0 && (
        <Section title="How to Help Yourself" titleColor="#2A9D8F" badge={<GemmaBadge />}>
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
        <Section title="Signals Detected" titleColor="#EA580C">
          {risk_factors_flagged.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ color: '#EA580C', fontSize: '0.72rem', marginTop: 2, flexShrink: 0 }}>▶</span>
              <span style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>{f}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Trend Chart ──────────────────────────────────────────────── */}
      <ForecastChart chartData={chart_data} forecast={forecast} trendPct={trend_pct} />

      {/* ── Audio ────────────────────────────────────────────────────── */}
      {audio_url && (
        <Section title="Listen to Your Assessment" titleColor="#6B7280">
          <audio controls autoPlay src={audio_url} style={{ width: '100%' }}>
            Your browser does not support the audio element.
          </audio>
        </Section>
      )}

      {/* ══ COUNTY CONTEXT (from county-detail API) ══════════════════ */}
      {cd && (
        <>
          {/* County AI summary */}
          {cdAi?.summary && (
            <Section title={`${cd.county?.county} County Overview`} titleColor="#2A9D8F">
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <StatTile label="7-Day Reports"  value={cd.stats?.total ?? '—'}                                                          color="#2A9D8F" />
            <StatTile label="Sick Rate"       value={cd.stats ? `${(cd.stats.sick_rate * 100).toFixed(0)}%` : '—'}                  color="#DC2626" />
            <StatTile label="Week Trend"
              value={cd.stats ? `${cd.stats.trend_pct >= 0 ? '+' : ''}${cd.stats.trend_pct}%` : '—'}
              color={cd.stats?.trend_pct > 15 ? '#DC2626' : cd.stats?.trend_pct < -10 ? '#059669' : '#D97706'}
            />
          </div>

          {/* Top symptoms in county */}
          {cd.symptoms?.length > 0 && (
            <Section title="Top Symptoms in Your County (7 days)" titleColor="#1F2937">
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
            <Section title="County Risk Drivers" titleColor="#EA580C">
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
            <Section title="County-Level Guidance" titleColor="#059669">
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
            <Section title="One Health Exposure Factors (County)" titleColor="#1F2937">
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

          {/* Neighboring county spread */}
          {cd.neighbor_spread && !cd.neighbor_spread.startsWith('No elevated') && (
            <Section title="Neighboring County Activity" titleColor="#D97706">
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
            <Section title="✈  Inbound Travel Illness Risk" titleColor="#D97706">
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
      <Section title="Environmental &amp; Surveillance" titleColor="#2A9D8F">
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
        <Section title="Neighboring County Activity" titleColor="#D97706">
          {neighbor_spread.split('\n').map((line, i) => (
            <div key={i} style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 3 }}>
              {line}
            </div>
          ))}
        </Section>
      )}

      {/* Wellness tip */}
      {wellness_tip && (
        <Section title="Wellness Tip" titleColor="#059669">
          <p style={{ color: '#374151', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>{wellness_tip}</p>
        </Section>
      )}

      {/* ── WHO Alerts ───────────────────────────────────────────────── */}
      {who_alerts.length > 0 && (
        <Section title="🌐 WHO Disease Outbreak News" titleColor="#EA580C">
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
        <Section title="📡 OutbreaksNearMe · Global Signals" titleColor="#D97706">
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
        <Section title="Age Distribution (County)" titleColor="#1F2937">
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
