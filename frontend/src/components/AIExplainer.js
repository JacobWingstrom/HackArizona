import React, { useState } from 'react';

const DATA_SOURCES = [
  {
    name: 'Self-Reports',
    icon: '👥',
    color: '#2A9D8F',
    what: 'Symptoms, exposures, and severity flags reported by you and your neighbors in real time.',
    why: 'Traditional surveillance waits for clinical diagnosis — we detect signals days earlier.',
  },
  {
    name: 'CDC FluView',
    icon: '🏛️',
    color: '#2C5282',
    what: 'Influenza-like illness (ILI) rates published weekly by the CDC for every HHS region.',
    why: 'Authoritative baseline that prevents participation bias in our self-report data.',
  },
  {
    name: 'Epicore / EpiHack',
    icon: '🔬',
    color: '#6b4ea8',
    what: 'Verified outbreak events from the EpiHack Arizona surveillance network.',
    why: 'Validated outbreak signals we can cross-reference with community reports.',
  },
  {
    name: 'BEACON',
    icon: '📡',
    color: '#a84e4e',
    what: 'Biosurveillance signals from PHI Research Lab covering US outbreak activity.',
    why: 'Detects emerging signals before they appear in clinical surveillance systems.',
  },
  {
    name: 'WHO Outbreak News',
    icon: '🌐',
    color: '#EA580C',
    what: 'Disease Outbreak News published by the World Health Organization.',
    why: 'Global context — travel-connected outbreaks can reach Arizona within days.',
  },
  {
    name: 'OutbreaksNearMe',
    icon: '🗺️',
    color: '#D97706',
    what: 'ProMED verified outbreak reports, the same data source powering outbreaksnearme.org.',
    why: 'Independent validation layer — if two systems agree, confidence rises.',
  },
  {
    name: 'OpenFlights Travel',
    icon: '✈️',
    color: '#4a9eff',
    what: '1,251 US airports · 5,450 domestic routes · mapped to 3,221 counties.',
    why: 'Sick travelers are the primary vector for inter-county disease spread.',
  },
  {
    name: 'OpenWeatherMap',
    icon: '🌤️',
    color: '#059669',
    what: 'Real-time temperature, humidity, and conditions for your exact location.',
    why: 'Cold/dry air dries mucous membranes. Heat stress weakens immunity. Both increase risk.',
  },
  {
    name: 'US Census (CenPop2020)',
    icon: '📊',
    color: '#6B7280',
    what: 'County population centroids and demographics for all 3,221 US counties.',
    why: 'Population-weighted risk normalizes small counties against dense metros.',
  },
];

const AI_STEPS = [
  {
    step: '1',
    label: 'Your report is anonymized',
    detail: 'Name, account, and device identifiers are stripped. Only symptoms, age group, and county-level location are used.',
  },
  {
    step: '2',
    label: 'Community context is assembled',
    detail: 'We pull the last 72h of reports from your county, current CDC/Epicore/BEACON signals, WHO alerts, and travel inflow data.',
  },
  {
    step: '3',
    label: 'Gemma 4 analyzes the full picture',
    detail: 'Google\'s open-weight Gemma 4 model runs locally on our server via Ollama. Your health data never leaves the network. The model applies the One Health framework — human + animal + environmental signals.',
  },
  {
    step: '4',
    label: 'Risk is scored across four dimensions',
    detail: 'Internal spread (county trend), geographic spread (neighboring counties + travel), environmental risk (weather amplification), and One Health exposure pathways (tick bite → vector-borne, flooding → waterborne, etc.).',
  },
  {
    step: '5',
    label: 'You get personalized guidance',
    detail: 'Recommendations and self-care tips are tailored to your specific symptoms, exposures, and local conditions — not generic advice.',
  },
];

export default function AIExplainer({ explanation, reportCount, county, whoAlerts, outbreaksNearMe }) {
  const [open, setOpen]         = useState(false);
  const [activeTab, setActiveTab] = useState('how');

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.9rem' }}>🔍</span>
          <span style={{ color: '#374151', fontSize: '0.82rem', fontWeight: 600 }}>
            How does the AI work? · Data sources explained
          </span>
        </div>
        <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #E5E7EB' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB' }}>
            {[
              { id: 'how',     label: 'How It Works' },
              { id: 'sources', label: 'Data Sources' },
              { id: 'limits',  label: 'Limitations' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 0', fontSize: '0.72rem', fontWeight: 600,
                  color: activeTab === tab.id ? '#2A9D8F' : '#9CA3AF',
                  borderBottom: activeTab === tab.id ? '2px solid #2A9D8F' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px 18px' }}>

            {/* ── How It Works tab ─────────────────────────────── */}
            {activeTab === 'how' && (
              <div>
                <div style={{ color: '#6B7280', fontSize: '0.75rem', marginBottom: 14, lineHeight: 1.5 }}>
                  CommunityPulse combines participatory surveillance with external data sources and a local Gemma 4 AI model to generate risk assessments.
                </div>
                {AI_STEPS.map((s) => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#FFFFFF', border: '1px solid rgba(42,157,143,0.3)',
                      color: '#2A9D8F', fontSize: '0.68rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {s.step}
                    </div>
                    <div>
                      <div style={{ color: '#1F2937', fontSize: '0.8rem', fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ color: '#6B7280', fontSize: '0.74rem', lineHeight: 1.45 }}>{s.detail}</div>
                    </div>
                  </div>
                ))}
                {explanation && (
                  <div style={{
                    marginTop: 14, padding: '10px 12px',
                    background: '#FFFFFF', borderRadius: 8, borderLeft: '3px solid #2A9D8F',
                  }}>
                    <div style={{ color: '#2C5282', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                      Gemma 4 reasoning for this assessment
                    </div>
                    <div style={{ color: '#374151', fontSize: '0.76rem', lineHeight: 1.45 }}>{explanation}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Data Sources tab ─────────────────────────────── */}
            {activeTab === 'sources' && (
              <div>
                <div style={{ color: '#6B7280', fontSize: '0.75rem', marginBottom: 14 }}>
                  {reportCount || 0} community reports from {county || 'your'} County fed into this assessment, alongside {DATA_SOURCES.length} external data sources.
                </div>
                {DATA_SOURCES.map((src) => (
                  <div key={src.name} style={{
                    display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start',
                    paddingBottom: 12, borderBottom: '1px solid #F3F4F6',
                  }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{src.icon}</span>
                    <div>
                      <div style={{ color: src.color, fontSize: '0.76rem', fontWeight: 700, marginBottom: 2 }}>{src.name}</div>
                      <div style={{ color: '#374151', fontSize: '0.74rem', lineHeight: 1.4, marginBottom: 3 }}>{src.what}</div>
                      <div style={{ color: '#9CA3AF', fontSize: '0.68rem', lineHeight: 1.4, fontStyle: 'italic' }}>Why: {src.why}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Limitations tab ──────────────────────────────── */}
            {activeTab === 'limits' && (
              <div>
                {[
                  {
                    icon: '📉',
                    title: 'Self-reporting bias',
                    body: 'Sicker people are more likely to report. Healthy baselines require consistent daily check-ins from all users — including when feeling well.',
                  },
                  {
                    icon: '📍',
                    title: 'Geographic resolution',
                    body: 'Risk is assessed at county level. Dense urban counties may mask neighborhood-level clusters. ZIP-code resolution requires more users.',
                  },
                  {
                    icon: '🤖',
                    title: 'Gemma 4 is a language model, not a doctor',
                    body: 'The AI uses patterns in text to generate risk assessments. It cannot diagnose illness. It may occasionally produce confident-sounding but incorrect outputs.',
                  },
                  {
                    icon: '⏱️',
                    title: 'Data freshness',
                    body: 'CDC FluView updates weekly. Epicore and BEACON may lag by 24–72 hours. Self-report data is real-time, but sample sizes in rural areas may be small.',
                  },
                  {
                    icon: '🔒',
                    title: 'Privacy',
                    body: 'All data is anonymized and aggregated. No individual report can be re-identified. Gemma runs locally — health data never leaves the server.',
                  },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <div style={{ color: '#1F2937', fontSize: '0.78rem', fontWeight: 600, marginBottom: 3 }}>{item.title}</div>
                      <div style={{ color: '#6B7280', fontSize: '0.74rem', lineHeight: 1.45 }}>{item.body}</div>
                    </div>
                  </div>
                ))}
                <div style={{
                  marginTop: 8, padding: '10px 12px',
                  background: '#FEF2F2', border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 8,
                }}>
                  <div style={{ color: '#DC2626', fontSize: '0.76rem', fontWeight: 600, lineHeight: 1.5 }}>
                    CommunityPulse is a surveillance tool, not a medical service. Always consult a licensed healthcare provider for diagnosis and treatment decisions.
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
