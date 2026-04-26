import React, { useState, useEffect, useRef } from 'react';
import { getCountyDetail, getAIResult } from '../api';
import EpidemicForecast from './EpidemicForecast';

const RISK_COLOR = { low: '#059669', medium: '#D97706', high: '#EA580C', severe: '#DC2626' };
const RISK_BG    = { low: '#F0FDF4', medium: '#FFFBEB', high: '#FFF7ED', severe: '#FEF2F2' };

function SymptomBar({ name, count, pct, max }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.77rem', marginBottom: 3 }}>
        <span style={{ color: '#374151' }}>{name}</span>
        <span style={{ color: '#6B7280' }}>{count} · {(pct * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${(count / max) * 100}%`,
          background: 'linear-gradient(90deg, #EA580C, #DC2626)',
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB',
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ color, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, titleColor = '#1F2937', children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ color: titleColor, fontSize: '0.73rem', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EpiCurve({ daily30d }) {
  const [hovered, setHovered] = useState(null);

  if (!daily30d?.length) return null;

  const W = 320, H = 100, PAD = { top: 8, right: 8, bottom: 22, left: 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Fill gaps — ensure all 30 days are represented
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const byDate = {};
  daily30d.forEach(r => { byDate[r.date] = r; });
  const filled = days.map(date => byDate[date] || { date, sick: 0, total: 0 });

  const maxSick = Math.max(...filled.map(d => d.sick), 1);
  const barW = innerW / 30;

  const isFlat = maxSick <= 2 && filled.every(d => Math.abs(d.sick - (filled[0]?.sick ?? 0)) <= 1);

  if (isFlat) {
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ color: '#1F2937', fontSize: '0.73rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          📊 Epidemiological Curve · 30-Day Case History
        </div>
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>📉</span>
          <div>
            <div style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>Low Activity — Stable Baseline</div>
            <div style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 2 }}>
              Fewer than 3 sick reports/day over 30 days. No outbreak signal detected.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const yTicks = [0, Math.round(maxSick / 2), maxSick].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ color: '#1F2937', fontSize: '0.73rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        📊 Epidemiological Curve · 30-Day Case History
      </div>
      <div style={{ color: '#6B7280', fontSize: '0.66rem', marginBottom: 10 }}>
        Daily self-reported sick cases — shape reveals outbreak phase
      </div>

      <div style={{ position: 'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
          {/* Y-axis ticks */}
          {yTicks.map(v => {
            const y = PAD.top + innerH - (v / maxSick) * innerH;
            return (
              <g key={v}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="#F3F4F6" strokeWidth="0.5" strokeDasharray="3,3" />
                <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="#9CA3AF" fontSize="7">{v}</text>
              </g>
            );
          })}

          {/* Bars */}
          {filled.map((d, i) => {
            const x = PAD.left + i * barW;
            const barH = (d.sick / maxSick) * innerH;
            const y = PAD.top + innerH - barH;
            const progress = i / 29; // 0 = oldest, 1 = today
            // Color: blue (old) → red (recent)
            const r = Math.round(44 + progress * (220 - 44));
            const g = Math.round(193 + progress * (38 - 193));
            const b = Math.round(253 + progress * (38 - 253));
            const fill = `rgb(${r},${g},${b})`;
            return (
              <rect
                key={d.date}
                x={x + 0.5}
                y={barH > 0 ? y : PAD.top + innerH - 1}
                width={Math.max(barW - 1, 1)}
                height={Math.max(barH, 1)}
                fill={fill}
                fillOpacity={hovered === i ? 1 : 0.85}
                rx={1}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'default' }}
              />
            );
          })}

          {/* X-axis labels: 30d ago / 2w ago / 1w ago / Today */}
          {[0, 8, 15, 22, 29].map(i => {
            const x = PAD.left + i * barW + barW / 2;
            const label = i === 0 ? '30d ago' : i === 8 ? '3w' : i === 15 ? '2w' : i === 22 ? '1w' : 'Today';
            return (
              <text key={i} x={x} y={H - 3} textAnchor="middle" fill="#9CA3AF" fontSize="7">{label}</text>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered !== null && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: `${((hovered + 0.5) / 30) * 100}%`,
            transform: 'translateX(-50%)',
            background: '#1F2937',
            color: '#F9FAFB',
            fontSize: '0.65rem',
            padding: '4px 8px',
            borderRadius: 6,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}>
            {filled[hovered].date}<br />
            {filled[hovered].sick} sick · {filled[hovered].total} total
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, background: 'rgb(44,193,253)', borderRadius: 2 }} />
          <span style={{ color: '#9CA3AF', fontSize: '0.62rem' }}>30 days ago</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, background: 'rgb(220,38,38)', borderRadius: 2 }} />
          <span style={{ color: '#9CA3AF', fontSize: '0.62rem' }}>Today</span>
        </div>
      </div>
    </div>
  );
}

export default function CountyDetailPanel({ fips, onClose }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [aiPending, setAiPending] = useState(false);
  const pollRef = useRef(null);

  // Load county data (returns instantly with rule-based AI + ai_job_id)
  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    setError(null);
    setData(null);
    setAiPending(false);
    if (pollRef.current) clearInterval(pollRef.current);

    getCountyDetail(fips)
      .then(d => {
        setData(d);
        // Start polling for Gemma result if a job was issued
        if (d.ai_job_id) {
          setAiPending(true);
          pollRef.current = setInterval(async () => {
            try {
              const res = await getAIResult(d.ai_job_id);
              if (res.status === 'done') {
                clearInterval(pollRef.current);
                setAiPending(false);
                setData(prev => ({
                  ...prev,
                  ai_analysis: res.result?.ai_analysis ?? prev.ai_analysis,
                  weather:     res.result?.weather     ?? prev.weather,
                  fluview:     res.result?.fluview     ?? prev.fluview,
                }));
              } else if (res.status === 'error' || res.status === 'not_found') {
                clearInterval(pollRef.current);
                setAiPending(false);
              }
            } catch (_) {
              clearInterval(pollRef.current);
              setAiPending(false);
            }
          }, 2000);
        }
      })
      .catch(() => setError('Could not load county data.'))
      .finally(() => setLoading(false));

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fips]); // eslint-disable-line react-hooks/exhaustive-deps

  const ai   = data?.ai_analysis;
  const risk = ai?.risk_level;
  const rColor = risk ? RISK_COLOR[risk] : '#6B7280';
  const rBg    = risk ? RISK_BG[risk]    : '#FFFFFF';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        width: '100%', maxWidth: 450, height: '100vh',
        background: '#FFFFFF', borderLeft: '1px solid #E5E7EB',
        zIndex: 1000, overflowY: 'auto',
        boxShadow: '-10px 0 40px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#FFFFFF', borderBottom: '1px solid #E5E7EB',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ color: '#1F2937', fontWeight: 700, fontSize: '1.05rem' }}>
              {data?.county?.county ?? '…'} County
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.76rem', marginTop: 2 }}>
              {data?.county?.state} · Pop.&nbsp;
              {(data?.county?.pop ?? 0).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #E5E7EB', borderRadius: 6,
              color: '#6B7280', fontSize: '1rem', padding: '3px 9px',
              cursor: 'pointer', lineHeight: 1, flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#6B7280', fontSize: '0.85rem' }}>
            <div style={{ fontSize: '1.8rem' }}>🔍</div>
            <div>Analyzing county data…</div>
            <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Fetching reports · travel · weather · CDC FluView</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 28, color: '#DC2626', textAlign: 'center' }}>{error}</div>
        )}

        {data && !loading && (
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

            {/* ── AI Risk Assessment ────────────────────────────────────── */}
            <div style={{ background: rBg, border: `1px solid ${rColor}55`, borderRadius: 12, padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{
                  background: rColor, color: '#000', fontWeight: 700,
                  fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20,
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {risk ?? '—'} Community Risk
                </div>
                <div style={{ color: '#6B7280', fontSize: '0.7rem' }}>
                  Confidence: {ai?.confidence ?? '—'}
                </div>
                {aiPending && (
                  <div style={{ color: '#D97706', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#D97706', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    AI analyzing…
                  </div>
                )}
              </div>
              <p style={{ color: '#374151', fontSize: '0.84rem', margin: 0, lineHeight: 1.55 }}>
                {ai?.summary}
              </p>
            </div>

            {/* ── Quick Stats ──────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatTile label="7-Day Reports"   value={data.stats.total}                                                          color="#2A9D8F" />
              <StatTile label="Sick Rate"        value={`${(data.stats.sick_rate * 100).toFixed(0)}%`}                            color="#DC2626" />
              <StatTile label="Sick / Healthy"   value={`${data.stats.sick} / ${data.stats.healthy}`}                            color="#EA580C" />
              <StatTile
                label="Week Trend"
                value={`${data.stats.trend_pct >= 0 ? '+' : ''}${data.stats.trend_pct}%`}
                color={data.stats.trend_pct > 15 ? '#DC2626' : data.stats.trend_pct < -10 ? '#059669' : '#D97706'}
              />
              {data.household_sar?.pct != null && (
                <StatTile
                  label="Household SAR"
                  value={`${data.household_sar.pct}%`}
                  color={data.household_sar.pct > 40 ? '#DC2626' : data.household_sar.pct > 20 ? '#D97706' : '#059669'}
                />
              )}
              {data.household_sar?.pct != null && (
                <StatTile
                  label="Secondary Cases"
                  value={`${data.household_sar.secondary_cases} / ${data.household_sar.exposed_contacts}`}
                  color="#6B7280"
                />
              )}
            </div>
            {data.household_sar?.pct != null && (
              <div style={{ color: '#6B7280', fontSize: '0.65rem', marginTop: -6 }}>
                Household Secondary Attack Rate — % of household contacts infected. Based on {data.household_sar.reports_with_data} multi-person household reports.
              </div>
            )}

            {/* ── One Health: Animal Signal ────────────────────────────── */}
            {data.animal_health && (
              <div style={{
                background: data.animal_health.zoonotic_signal ? '#FFFBEB' : '#F9FAFB',
                border: `1px solid ${data.animal_health.zoonotic_signal ? '#D97706' : '#E5E7EB'}44`,
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{ color: data.animal_health.zoonotic_signal ? '#D97706' : '#9CA3AF', fontSize: '0.73rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  🐾 One Health: Animal Signal
                </div>
                {data.animal_health.zoonotic_signal ? (
                  <>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#D97706', fontSize: '1.3rem', fontWeight: 700 }}>{data.animal_health.animal_contact_reports}</div>
                        <div style={{ color: '#6B7280', fontSize: '0.65rem' }}>animal contact reports</div>
                      </div>
                      <div style={{ width: 1, background: '#E5E7EB' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: data.animal_health.sick_animals_reported > 0 ? '#DC2626' : '#9CA3AF', fontSize: '1.3rem', fontWeight: 700 }}>{data.animal_health.sick_animals_reported}</div>
                        <div style={{ color: '#6B7280', fontSize: '0.65rem' }}>sick animals reported</div>
                      </div>
                    </div>
                    <div style={{ color: '#374151', fontSize: '0.76rem', lineHeight: 1.45 }}>
                      {data.animal_health.sick_animals_reported > 0
                        ? 'Potential zoonotic signal detected. Consider veterinary surveillance and reporting to animal health authorities.'
                        : 'Human-animal contact reported in this county. Monitor for zoonotic transmission patterns.'}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>
                    No animal exposure signals detected in recent reports.
                  </div>
                )}
                <div style={{ color: '#9CA3AF', fontSize: '0.62rem', marginTop: 8 }}>
                  One Health triad: human ↔ animal ↔ environment surveillance
                </div>
              </div>
            )}

            {/* ── Epidemiological Curve ────────────────────────────────── */}
            <EpiCurve daily30d={data.stats?.daily_30d} />

            {/* ── Epidemic Outbreak Forecast ───────────────────────────── */}
            <div>
              <div style={{ color: '#DC2626', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                ⚠ Epidemic Outbreak Forecast
              </div>
              <EpidemicForecast
                fips={fips}
                county={data.county?.county}
                state={data.county?.state}
              />
            </div>

            {/* ── 14-Day Outlook ───────────────────────────────────────── */}
            {ai?.trend_assessment && (
              <Section title="14-Day Outlook" titleColor="#D97706">
                <p style={{ color: '#374151', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                  {ai.trend_assessment}
                </p>
              </Section>
            )}

            {/* ── Symptom Breakdown ────────────────────────────────────── */}
            {data.symptoms?.length > 0 && (
              <Section title="Reported Symptoms (past 7 days)" titleColor="#1F2937">
                {data.symptoms.map(s => (
                  <SymptomBar
                    key={s.name}
                    name={s.name}
                    count={s.count}
                    pct={s.pct}
                    max={data.symptoms[0].count}
                  />
                ))}
              </Section>
            )}

            {/* ── Key Drivers ──────────────────────────────────────────── */}
            {ai?.key_drivers?.length > 0 && (
              <Section title="Key Risk Drivers" titleColor="#EA580C">
                {ai.key_drivers.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ color: '#EA580C', fontSize: '0.72rem', marginTop: 2, flexShrink: 0 }}>▶</span>
                    <span style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>{d}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* ── Recommendations ──────────────────────────────────────── */}
            {ai?.recommendations?.length > 0 && (
              <Section title="Recommendations" titleColor="#059669">
                {ai.recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ color: '#059669', fontSize: '0.72rem', marginTop: 2, flexShrink: 0 }}>✓</span>
                    <span style={{ color: '#374151', fontSize: '0.8rem', lineHeight: 1.45 }}>{r}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* ── One Health Risk Factors ──────────────────────────────── */}
            {Object.values(data.risk_factors ?? {}).some(v => v > 0) && (
              <Section title="One Health Exposure Factors" titleColor="#1F2937">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'recent_travel',    label: 'Recent Travel' },
                    { key: 'event_attendance', label: 'Large Events' },
                    { key: 'animal_contact',   label: 'Animal Contact' },
                    { key: 'water_concerns',   label: 'Water Concerns' },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <span style={{ color: '#6B7280', fontSize: '0.74rem' }}>{label}</span>
                      <span style={{
                        color: (data.risk_factors[key] ?? 0) > 0 ? '#D97706' : '#9CA3AF',
                        fontSize: '0.82rem', fontWeight: 600,
                      }}>
                        {data.risk_factors[key] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Travel Inflow ────────────────────────────────────────── */}
            {data.travel?.sources?.length > 0 ? (
              <Section title="✈  Inbound Travel Illness Risk" titleColor="#D97706">
                <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 10 }}>
                  Counties with direct airline routes and active illness reports
                </div>
                {data.travel.sources.slice(0, 7).map(src => (
                  <div key={src.fips} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 0', borderBottom: '1px solid #F3F4F6',
                  }}>
                    <div>
                      <div style={{ color: '#374151', fontSize: '0.78rem' }}>
                        {src.county}, {src.state}
                      </div>
                      <div style={{ color: '#9CA3AF', fontSize: '0.68rem' }}>
                        {src.via_airport} → {src.to_airport} · {src.routes} route{src.routes !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600 }}>
                        {src.sick} sick
                      </div>
                      <div style={{ height: 4, width: 60, background: '#F3F4F6', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${src.weight * 100}%`, background: '#D97706', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                ))}
                {ai?.travel_risk_note && (
                  <p style={{ color: '#6B7280', fontSize: '0.72rem', margin: '10px 0 0', fontStyle: 'italic', lineHeight: 1.4 }}>
                    {ai.travel_risk_note}
                  </p>
                )}
                <div style={{ color: '#9CA3AF', fontSize: '0.65rem', marginTop: 8 }}>
                  Source: OpenFlights (ODbL) · {data.travel.sources.length} source counties
                </div>
              </Section>
            ) : (
              <Section title="✈  Inbound Travel Illness Risk" titleColor="#D97706">
                <div style={{ color: '#6B7280', fontSize: '0.78rem' }}>
                  No active illness signals detected in counties with direct flights to this area.
                </div>
              </Section>
            )}

            {/* ── Neighboring County Spread ─────────────────────────── */}
            {data.neighbor_spread && data.neighbor_spread !== 'No elevated illness in other AZ counties' && (
              <Section title="Neighboring County Spread" titleColor="#D97706">
                <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: 8, lineHeight: 1.4 }}>
                  Elevated illness in surrounding counties signals potential geographic spread toward this area.
                </div>
                {data.neighbor_spread.split('\n').map((line, i) => (
                  <div key={i} style={{ color: '#374151', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 4 }}>
                    {line}
                  </div>
                ))}
              </Section>
            )}

            {/* ── Weather ──────────────────────────────────────────────── */}
            <Section title="Current Conditions" titleColor="#1F2937">
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#2A9D8F', fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                    {data.weather?.temp !== 'N/A' ? `${data.weather.temp}°` : '—'}
                  </div>
                  <div style={{ color: '#9CA3AF', fontSize: '0.68rem', marginTop: 2 }}>Fahrenheit</div>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid #E5E7EB', paddingLeft: 16 }}>
                  <div style={{ color: '#374151', fontSize: '0.82rem', textTransform: 'capitalize' }}>
                    {data.weather?.conditions ?? '—'}
                  </div>
                  {data.weather?.humidity != null && (
                    <div style={{ color: '#6B7280', fontSize: '0.72rem', marginTop: 4 }}>
                      Humidity: {data.weather.humidity}%
                    </div>
                  )}
                  {data.weather?.feels_like != null && data.weather.feels_like !== 'N/A' && (
                    <div style={{ color: '#6B7280', fontSize: '0.72rem' }}>
                      Feels like: {data.weather.feels_like}°F
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* ── External Surveillance ────────────────────────────────── */}
            <Section title="External Surveillance" titleColor="#2A9D8F">
              <div style={{ color: '#6B7280', fontSize: '0.68rem', marginBottom: 10 }}>
                Authoritative data sources — always included to prevent participation bias
              </div>
              {[
                { label: 'CDC FluView', value: data.fluview },
              ].map(({ label, value }) => value && (
                <div key={label} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ color: '#2C5282', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ color: '#374151', fontSize: '0.76rem', lineHeight: 1.45 }}>
                    {value}
                  </div>
                </div>
              ))}
            </Section>

            {/* ── Age Distribution ─────────────────────────────────────── */}
            {data.age_groups && Object.keys(data.age_groups).length > 0 && (
              <Section title="Age Distribution" titleColor="#1F2937">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(data.age_groups).map(([group, count]) => (
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

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div style={{ color: '#9CA3AF', fontSize: '0.67rem', textAlign: 'center', lineHeight: 1.5 }}>
              {ai?.confidence_note}
              <br />
              Not medical advice · Data: CommunityPulse self-reports, CDC FluView, Epicore, BEACON, OpenFlights, OpenWeatherMap, US Census
            </div>

          </div>
        )}
      </div>
    </>
  );
}

export { EpiCurve };
