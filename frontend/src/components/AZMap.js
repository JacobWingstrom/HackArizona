import React, { useEffect, useState } from 'react';
import { getCommunityRisk } from '../api';

const RISK_COLORS = {
  high:   '#DC2626',
  medium: '#D97706',
  low:    '#059669',
};

// Simplified AZ county paths (SVG viewBox 0 0 500 400)
const COUNTY_PATHS = {
  Mohave:     'M 30 30 L 100 30 L 110 120 L 80 160 L 30 160 Z',
  Coconino:   'M 100 30 L 290 30 L 290 140 L 110 120 Z',
  Navajo:     'M 290 30 L 390 30 L 390 160 L 290 140 Z',
  Apache:     'M 390 30 L 470 30 L 470 160 L 390 160 Z',
  Yavapai:    'M 80 160 L 200 120 L 220 220 L 100 240 Z',
  Maricopa:   'M 100 240 L 220 220 L 230 310 L 120 320 Z',
  Pinal:      'M 220 220 L 300 220 L 300 310 L 230 310 Z',
  Gila:       'M 200 120 L 290 140 L 300 220 L 220 220 Z',
  Graham:     'M 300 220 L 390 160 L 400 250 L 300 310 Z',
  Greenlee:   'M 390 160 L 470 160 L 470 250 L 400 250 Z',
  'La Paz':   'M 30 160 L 80 160 L 100 240 L 50 280 L 30 280 Z',
  Pima:       'M 120 320 L 300 310 L 300 380 L 120 380 Z',
  'Santa Cruz':'M 120 380 L 220 380 L 220 400 L 120 400 Z',
  Cochise:    'M 300 310 L 470 250 L 470 400 L 300 400 Z',
};

const COUNTY_LABELS = {
  Mohave:     [60, 95],
  Coconino:   [195, 85],
  Navajo:     [340, 95],
  Apache:     [428, 95],
  Yavapai:    [150, 195],
  Maricopa:   [162, 272],
  Pinal:      [260, 265],
  Gila:       [250, 180],
  Graham:     [350, 235],
  Greenlee:   [430, 205],
  'La Paz':   [55, 225],
  Pima:       [210, 348],
  'Santa Cruz':[170, 392],
  Cochise:    [385, 348],
};

export default function AZMap() {
  const [riskData, setRiskData] = useState({});
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCommunityRisk()
      .then(data => {
        const map = {};
        data.forEach(d => { map[d.county] = d; });
        setRiskData(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted" style={{ fontSize: '0.85rem', padding: '16px 0' }}>Loading community map...</div>;

  const hInfo = hovered ? riskData[hovered] : null;

  return (
    <div className="card">
      <div className="section-title">Arizona Community Risk Map</div>

      {hovered && hInfo && (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
          fontSize: '0.85rem',
        }}>
          <strong>{hovered} County</strong> —{' '}
          <span style={{ color: RISK_COLORS[hInfo.risk_level] || '#6B7280' }}>
            {hInfo.risk_level?.toUpperCase()} RISK
          </span>
          {' '}· {hInfo.report_count} reports in 72h
          {hInfo.is_cluster && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠️ CLUSTER</span>}
        </div>
      )}

      <div className="az-map-container">
        <svg viewBox="0 0 500 410" xmlns="http://www.w3.org/2000/svg">
          {Object.entries(COUNTY_PATHS).map(([county, path]) => {
            const info = riskData[county];
            const fill = info ? RISK_COLORS[info.risk_level] : '#E5E7EB';
            const label = COUNTY_LABELS[county];
            return (
              <g key={county}>
                <path
                  d={path}
                  fill={fill}
                  fillOpacity={hovered === county ? 0.9 : 0.5}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  className="county-path"
                  onMouseEnter={() => setHovered(county)}
                  onMouseLeave={() => setHovered(null)}
                />
                {label && (
                  <text
                    x={label[0]} y={label[1]}
                    textAnchor="middle"
                    fill="#374151"
                    fontSize={county.length > 7 ? 7 : 9}
                    fontWeight="600"
                    style={{ pointerEvents: 'none' }}
                  >
                    {county}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.75rem' }}>
        {['high', 'medium', 'low'].map(level => (
          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: RISK_COLORS[level] }} />
            <span className="text-muted" style={{ textTransform: 'capitalize' }}>{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
