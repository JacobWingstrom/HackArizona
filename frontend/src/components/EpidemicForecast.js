import React, { useState, useEffect, useRef } from 'react';
import { getOutbreakPrediction, getAIResult } from '../api';

const LEVEL_COLOR = {
  low:      '#059669',
  moderate: '#D97706',
  high:     '#EA580C',
  critical: '#DC2626',
};
const LEVEL_BG = {
  low:      '#F0FDF4',
  moderate: '#FFFBEB',
  high:     '#FFF7ED',
  critical: '#FEF2F2',
};
const TRAJ_ICON = {
  declining:    { icon: '↘', color: '#059669', label: 'Declining' },
  stable:       { icon: '→', color: '#D97706', label: 'Stable'   },
  growing:      { icon: '↗', color: '#EA580C', label: 'Growing'  },
  accelerating: { icon: '⬆', color: '#DC2626', label: 'Accelerating' },
};

function RiskGauge({ value, color, label, sub }) {
  const pct = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 36;
  const offset = circumference * (1 - pct / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="36" fill="none" stroke="#F3F4F6" strokeWidth="8" />
        <circle
          cx="45" cy="45" r="36" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="45" y="42" textAnchor="middle" fill={color} fontSize="14" fontWeight="800">{value}</text>
        <text x="45" y="55" textAnchor="middle" fill="#9CA3AF" fontSize="8">/ 100</text>
      </svg>
      <div style={{ color: '#1F2937', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' }}>{label}</div>
      {sub && <div style={{ color: '#6B7280', fontSize: '0.65rem', textAlign: 'center' }}>{sub}</div>}
    </div>
  );
}

function ReproductionBadge({ re }) {
  const unknown = re == null;
  const color = unknown ? '#9CA3AF' : re >= 2 ? '#DC2626' : re >= 1.5 ? '#EA580C' : re >= 1.0 ? '#D97706' : '#059669';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: '#FFFFFF', border: `1px solid ${color}44`,
      borderRadius: 10, padding: '12px 18px', flex: 1,
    }}>
      <div style={{ color, fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
        {unknown ? '?' : re.toFixed(2)}
      </div>
      <div style={{ color: '#1F2937', fontSize: '0.72rem', fontWeight: 700, marginTop: 4 }}>Rₑ estimate</div>
      <div style={{ color: '#6B7280', fontSize: '0.65rem', marginTop: 2, textAlign: 'center' }}>
        {unknown
          ? 'Need more data'
          : re >= 1 ? `Each case infects ~${re.toFixed(1)} others` : 'Outbreak fading'}
      </div>
    </div>
  );
}

function SIRChart({ sir, rEffective }) {
  if (!sir?.curve?.length) return null;

  const W = 320, H = 140, PAD = { top: 12, right: 12, bottom: 28, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const curve = sir.curve;
  const maxI  = Math.max(...curve.map(d => d.I), 1);
  const maxS  = Math.max(...curve.map(d => d.S), 1);
  const maxR  = Math.max(...curve.map(d => d.R), 1);
  const yMax  = Math.max(maxI, maxR) * 1.05;
  const days  = curve.length - 1;

  const xOf = (day) => PAD.left + (day / days) * innerW;
  const yOf = (val) => PAD.top  + innerH - (val / yMax) * innerH;

  const pathFor = (key) =>
    curve.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(d.day)} ${yOf(d[key])}`).join(' ');

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    val: yMax * f,
    y:   yOf(yMax * f),
    label: yMax * f >= 1e6 ? `${(yMax * f / 1e6).toFixed(1)}M`
         : yMax * f >= 1e3 ? `${Math.round(yMax * f / 1e3)}k`
         : Math.round(yMax * f),
  }));

  // X-axis ticks: 0, 15, 30, 45, 60
  const xTicks = [0, 15, 30, 45, 60].filter(d => d <= days);

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ color: '#1F2937', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            SIR Epidemic Simulation · 60-Day Projection
          </div>
          <div style={{ color: '#6B7280', fontSize: '0.65rem', marginTop: 2 }}>
            Rₑ = {rEffective?.toFixed(2)} · γ = 0.20 (5-day infectious period) · 20% prior immunity assumed
          </div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Grid lines */}
        {yTicks.map(t => (
          <g key={t.val}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
              stroke="#F3F4F6" strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={PAD.left - 4} y={t.y + 3} textAnchor="end"
              fill="#9CA3AF" fontSize="7">{t.label}</text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map(d => (
          <g key={d}>
            <line x1={xOf(d)} y1={PAD.top + innerH} x2={xOf(d)} y2={PAD.top + innerH + 4}
              stroke="#9CA3AF" strokeWidth="0.5" />
            <text x={xOf(d)} y={H - 4} textAnchor="middle" fill="#9CA3AF" fontSize="7">
              Day {d}
            </text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
          stroke="#E5E7EB" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH}
          stroke="#E5E7EB" strokeWidth="1" />

        {/* Peak marker */}
        {sir.peak_day > 0 && sir.peak_day <= days && (
          <>
            <line x1={xOf(sir.peak_day)} y1={PAD.top} x2={xOf(sir.peak_day)} y2={PAD.top + innerH}
              stroke="#DC2626" strokeWidth="0.8" strokeDasharray="4,3" strokeOpacity="0.6" />
            <text x={xOf(sir.peak_day) + 3} y={PAD.top + 9} fill="#DC2626" fontSize="7">
              Peak d{sir.peak_day}
            </text>
          </>
        )}

        {/* R curve (blue) */}
        <path d={pathFor('R')} fill="none" stroke="#2C5282" strokeWidth="1.5" strokeOpacity="0.7" />
        {/* S curve (green) */}
        <path d={pathFor('S')} fill="none" stroke="#059669" strokeWidth="1.5" strokeOpacity="0.7" />
        {/* I curve (red) — on top */}
        <path d={pathFor('I')} fill="none" stroke="#DC2626" strokeWidth="2" />

        {/* Herd immunity threshold line */}
        {sir.herd_immunity_threshold_pct && (
          <>
            <line
              x1={PAD.left} y1={yOf(sir.parameters?.N * (sir.herd_immunity_threshold_pct / 100))}
              x2={W - PAD.right} y2={yOf(sir.parameters?.N * (sir.herd_immunity_threshold_pct / 100))}
              stroke="#D97706" strokeWidth="0.8" strokeDasharray="5,3" strokeOpacity="0.5"
            />
          </>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { color: '#DC2626', label: 'Infectious (I)' },
          { color: '#059669', label: 'Susceptible (S)' },
          { color: '#2C5282', label: 'Recovered (R)' },
          { color: '#D97706', label: 'Herd immunity threshold', dashed: true },
        ].map(({ color, label, dashed }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4"
                stroke={color} strokeWidth={label === 'Infectious (I)' ? 2 : 1.5}
                strokeDasharray={dashed ? '4,2' : undefined} strokeOpacity="0.85" />
            </svg>
            <span style={{ color: '#6B7280', fontSize: '0.63rem' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        {[
          { label: 'Peak Infections',     value: sir.peak_infected >= 1000 ? `${(sir.peak_infected/1000).toFixed(1)}k` : sir.peak_infected, color: '#DC2626' },
          { label: 'Peak Day',            value: `Day ${sir.peak_day}`, color: '#D97706' },
          { label: 'Herd Immunity At',    value: sir.herd_immunity_threshold_pct ? `${sir.herd_immunity_threshold_pct}%` : 'N/A', color: '#2C5282' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#FFFFFF', border: '1px solid #E5E7EB',
            borderRadius: 8, padding: '8px 10px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: '1.05rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
            <div style={{ color: '#9CA3AF', fontSize: '0.62rem', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Explanatory blurb */}
      <div style={{
        marginTop: 14, padding: '12px 14px',
        background: '#FFFFFF', borderRadius: 8, borderLeft: '3px solid #3a6ea8',
      }}>
        <div style={{ color: '#2C5282', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          How to read this model
        </div>
        <p style={{ color: '#6B7280', fontSize: '0.74rem', lineHeight: 1.55, margin: 0 }}>
          This is a <strong style={{ color: '#374151' }}>SIR (Susceptible–Infectious–Recovered)</strong> compartmental
          model — the standard mathematical framework used by the CDC and WHO to project epidemic trajectories.
          The population is divided into three groups: people who <strong style={{ color: '#059669' }}>can catch the disease (S)</strong>,
          people who are <strong style={{ color: '#DC2626' }}>currently infectious (I)</strong>, and people who
          have <strong style={{ color: '#2C5282' }}>recovered or are immune (R)</strong>.
        </p>
        <p style={{ color: '#6B7280', fontSize: '0.74rem', lineHeight: 1.55, margin: '8px 0 0' }}>
          The key number is <strong style={{ color: '#374151' }}>Rₑ (effective reproduction number)</strong> — how
          many people each infectious person infects on average. When Rₑ &gt; 1, the outbreak grows. When Rₑ &lt; 1, it fades.
          The <strong style={{ color: '#D97706' }}>dashed orange line</strong> marks the herd immunity threshold — the
          point at which enough people are immune that each new case infects fewer than one additional person, and the
          outbreak naturally declines.
        </p>
        <p style={{ color: '#9CA3AF', fontSize: '0.68rem', lineHeight: 1.45, margin: '8px 0 0' }}>
          Rₑ is estimated from week-over-week self-report growth, then validated against travel inflow, neighboring
          county spread, and Gemma 4's multi-source analysis. 20% prior immunity is assumed. This is a projection,
          not a guarantee — behavior changes, interventions, and data gaps all affect actual outcomes.
        </p>
      </div>
    </div>
  );
}

export default function EpidemicForecast({ fips, county, state }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [aiData,  setAiData]  = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!fips) return;
    setLoading(true);
    setError(null);
    setData(null);
    setAiData(null);
    if (pollRef.current) clearInterval(pollRef.current);

    getOutbreakPrediction(fips)
      .then(d => {
        setData(d);
        setLoading(false);
        if (d.ai_job_id) {
          pollRef.current = setInterval(async () => {
            try {
              const r = await getAIResult(d.ai_job_id);
              if (r.status === 'done') {
                setAiData(r.result);
                clearInterval(pollRef.current);
              } else if (r.status === 'error') {
                clearInterval(pollRef.current);
              }
            } catch (_) {}
          }, 3000);
        }
      })
      .catch(() => { setError('Prediction unavailable'); setLoading(false); });

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fips]);

  if (loading) return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px',
      display: 'flex', alignItems: 'center', gap: 12, color: '#6B7280', fontSize: '0.82rem',
    }}>
      <div style={{ width: 16, height: 16, border: '2px solid #EA580C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
      Computing epidemic forecast…
    </div>
  );

  if (error || !data) return null;

  const merged = aiData ? { ...data, ...aiData } : data;
  const aiPending = data.ai_pending && !aiData;

  const level = merged.epidemic_risk_level || 'low';
  const lColor = LEVEL_COLOR[level] || '#6B7280';
  const lBg    = LEVEL_BG[level]   || '#FFFFFF';
  const traj   = TRAJ_ICON[merged.trajectory] || TRAJ_ICON.stable;

  const Spinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: '0.79rem', padding: '8px 0' }}>
      <div style={{ width: 12, height: 12, border: '2px solid #4285f4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
      Gemma 4 is analyzing…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header banner ─────────────────────────────────────── */}
      <div style={{
        background: lBg, border: `1px solid ${lColor}55`,
        borderRadius: 14, padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{
            background: lColor, color: '#000', fontWeight: 800,
            fontSize: '0.68rem', padding: '3px 12px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {level} outbreak growth
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            color: traj.color, fontSize: '0.8rem', fontWeight: 700,
          }}>
            <span style={{ fontSize: '1rem' }}>{traj.icon}</span>
            {traj.label}
          </div>
          <div style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            border: '1px solid #4285f455', borderRadius: 20, padding: '2px 8px',
            fontSize: '0.62rem', fontWeight: 700, color: '#1E40AF',
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4285f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Gemma 4
          </div>
        </div>
        {aiPending
          ? <Spinner />
          : <p style={{ color: '#374151', fontSize: '0.84rem', margin: 0, lineHeight: 1.55 }}>
              {merged.forecast_narrative}
            </p>
        }
      </div>

      {/* ── Low-data warning ──────────────────────────────────── */}
      {!data.stats?.sufficient_data && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #3a3a2a',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ color: '#D97706', fontSize: '0.72rem', fontWeight: 700, marginBottom: 3 }}>
              Limited Community Data
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.71rem', lineHeight: 1.5 }}>
              {data.stats?.total_7d ?? 0} self-reports this week
              {data.pop ? ` (${data.stats?.reporting_rate_per_million ?? '?'} per million residents)` : ''}.
              Rₑ and outbreak probability cannot be accurately estimated with fewer than 6 reports in back-to-back weeks.
              Encourage more community check-ins to improve accuracy.
            </div>
          </div>
        </div>
      )}

      {/* ── Gauges row ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-around',
        background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px' }}>
        <RiskGauge
          value={merged.outbreak_probability}
          color={lColor}
          label="Outbreak Probability"
          sub={data.stats?.sufficient_data
            ? `${data.stats.trend_pct >= 0 ? '+' : ''}${data.stats.trend_pct}% trend`
            : 'low data volume'}
        />
        <div style={{ width: 1, background: '#E5E7EB' }} />
        <ReproductionBadge re={merged.r_effective} />
        <div style={{ width: 1, background: '#E5E7EB' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
          <div style={{
            color: merged.doubling_days ? '#EA580C' : '#059669',
            fontSize: '1.8rem', fontWeight: 800, lineHeight: 1,
          }}>
            {merged.doubling_days ?? '—'}
          </div>
          <div style={{ color: '#1F2937', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' }}>
            {merged.doubling_days ? 'Days to double' : 'Not doubling'}
          </div>
          <div style={{ color: '#6B7280', fontSize: '0.65rem', textAlign: 'center' }}>
            {merged.doubling_days ? 'at current growth rate' : 'outbreak fading or stable'}
          </div>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: '7-Day Reports', value: data.stats?.total_7d ?? '—', color: '#2A9D8F' },
          { label: 'Week Trend',    value: data.stats?.trend_pct != null ? `${data.stats.trend_pct >= 0 ? '+' : ''}${data.stats.trend_pct}%` : '—',
            color: data.stats?.trend_pct > 15 ? '#DC2626' : data.stats?.trend_pct < -10 ? '#059669' : '#D97706' },
          { label: 'Travel Sources', value: data.travel_sources ?? 0, color: '#D97706' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#FFFFFF', border: '1px solid #E5E7EB',
            borderRadius: 10, padding: '10px 12px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: '1.2rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
            <div style={{ color: '#6B7280', fontSize: '0.65rem', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── SIR Curve — only shown when Rₑ meaningfully differs from 1 ── */}
      {(() => {
        const re = merged.r_effective;
        const sufficient = data.stats?.sufficient_data;
        const hasSignal = sufficient && re != null && (re > 1.05 || re < 0.95);
        if (hasSignal) return <SIRChart sir={data.sir} rEffective={re} />;
        return (
          <div style={{
            background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12,
            padding: '16px 18px', color: '#9CA3AF', fontSize: '0.78rem', lineHeight: 1.5,
          }}>
            <span style={{ color: '#D97706', fontWeight: 700, marginRight: 6 }}>○</span>
            Transmission model unavailable — not enough local reports to estimate Rₑ reliably.
            The simulation requires growth or decline signal across two consecutive weeks.
            Check back as more community members report.
          </div>
        );
      })()}

      {/* ── Key factors ───────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ color: '#EA580C', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          Key Epidemic Drivers
        </div>
        {aiPending ? <Spinner /> : (
          <>
            {merged.key_factors?.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ color: '#EA580C', fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>▶</span>
                <span style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
            <div style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 6 }}>
              Primary driver: <span style={{ color: '#D97706', fontWeight: 600 }}>{(merged.primary_driver || '').replace(/_/g, ' ')}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Public health actions ─────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ color: '#059669', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          Recommended Public Health Actions
        </div>
        {aiPending ? <Spinner /> : (
          merged.public_health_actions?.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ color: '#059669', fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>✓</span>
              <span style={{ color: '#374151', fontSize: '0.79rem', lineHeight: 1.4 }}>{a}</span>
            </div>
          ))
        )}
      </div>

      {/* ── Confidence ────────────────────────────────────────── */}
      <div style={{ color: '#9CA3AF', fontSize: '0.67rem', textAlign: 'center', lineHeight: 1.5 }}>
        Confidence: <span style={{ color: '#6B7280' }}>{merged.confidence}</span>
        {merged.confidence_note && ` · ${merged.confidence_note}`}
        <br />Population: {(data.pop || 0).toLocaleString()} · Rₑ estimated using 5-day generation interval
      </div>
    </div>
  );
}
