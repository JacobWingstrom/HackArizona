import React, { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { getUSMap } from '../api';

const COUNTIES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const STATES_URL   = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

function getRiskColor(sick, total) {
  if (total === 0) return '#111e33';
  const rate = sick / total;
  if (sick === 0)   return '#1a7a4a';
  if (rate < 0.25)  return '#2ed573';
  if (rate < 0.5)   return '#ffa502';
  if (rate < 0.75)  return '#ff6b35';
  return '#ff4757';
}

function getRiskLabel(sick, total) {
  if (total === 0) return 'No reports';
  const rate = sick / total;
  if (sick === 0)   return 'All healthy';
  if (rate < 0.25)  return 'Low risk';
  if (rate < 0.5)   return 'Moderate';
  if (rate < 0.75)  return 'High risk';
  return 'Severe';
}

export default function USMapScreen({ setView }) {
  const [fipsMap, setFipsMap]   = useState({});
  const [tooltip, setTooltip]   = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [loading, setLoading]   = useState(true);
  const [zoom, setZoom]         = useState(1);
  const [center, setCenter]     = useState([-96, 38]);

  useEffect(() => {
    getUSMap()
      .then(data => {
        const map = {};
        data.forEach(d => { if (d.fips) map[d.fips] = d; });
        setFipsMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allCounties   = Object.values(fipsMap);
  const totalReports  = allCounties.reduce((s, c) => s + c.total,   0);
  const totalSick     = allCounties.reduce((s, c) => s + c.sick,    0);
  const countiesCount = allCounties.length;

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          onClick={() => setView('checkin')}
          style={{
            background: 'none', border: '1px solid #1f2d45', borderRadius: 6,
            color: '#6b7a99', fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, color: '#e8eef8', fontSize: '1.2rem', fontWeight: 700 }}>
          US Symptom Map
        </h2>
      </div>
      <p style={{ color: '#6b7a99', fontSize: '0.82rem', margin: '0 0 20px' }}>
        Counties colored by illness risk — hover for details
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Reports',      value: totalReports },
          { label: 'Sick Reports',       value: totalSick },
          { label: 'Counties Reporting', value: countiesCount },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: '#0f1e35', border: '1px solid #1f2d45', borderRadius: 10,
            padding: '10px 18px', flex: 1, minWidth: 120,
          }}>
            <div style={{ color: '#00d4aa', fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#6b7a99', fontSize: '0.75rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Map container */}
      <div
        style={{
          background: '#0a1628', borderRadius: 14, border: '1px solid #1f2d45',
          padding: 8, position: 'relative', overflow: 'hidden',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#6b7a99', padding: 80 }}>Loading…</div>
        ) : (
          <>
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            style={{ width: '100%', height: 'auto' }}
          >
            <ZoomableGroup
              zoom={zoom}
              center={center}
              onMoveEnd={({ zoom: z, coordinates }) => {
                setZoom(z);
                setCenter(coordinates);
              }}
            >
              {/* County fills */}
              <Geographies geography={COUNTIES_URL}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const data = fipsMap[geo.id];
                    const fill = data ? getRiskColor(data.sick, data.total) : '#111e33';
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#0a1628"
                        strokeWidth={0.2 / zoom}
                        style={{
                          default: { outline: 'none' },
                          hover:   { outline: 'none', fill: data ? fill : '#1a2a40', cursor: data ? 'pointer' : 'default' },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={() => data && setTooltip(data)}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })
                }
              </Geographies>

              {/* State borders on top */}
              <Geographies geography={STATES_URL}>
                {({ geographies }) =>
                  geographies.map(geo => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="none"
                      stroke="#1e3a5f"
                      strokeWidth={0.8 / zoom}
                      style={{
                        default: { outline: 'none' },
                        hover:   { outline: 'none' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  ))
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {[
              { label: '+', action: () => setZoom(z => Math.min(z * 1.5, 16)) },
              { label: '⟳', action: () => { setZoom(1); setCenter([-96, 38]); } },
              { label: '−', action: () => setZoom(z => Math.max(z / 1.5, 1)) },
            ].map(({ label, action }) => (
              <button
                key={label}
                onClick={action}
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: '#162033', border: '1px solid #1f2d45',
                  color: '#e8eef8', fontSize: label === '⟳' ? '0.9rem' : '1.1rem',
                  fontWeight: 700, cursor: 'pointer', lineHeight: 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          </>
        )}

        {/* Floating tooltip that follows the cursor */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: mousePos.x + 14,
            top:  mousePos.y - 10,
            background: '#162033',
            border: '1px solid #1f2d45',
            borderRadius: 10,
            padding: '10px 14px',
            minWidth: 170,
            pointerEvents: 'none',
            zIndex: 10,
            // keep tooltip inside the box
            transform: mousePos.x > 700 ? 'translateX(-110%)' : 'none',
          }}>
            <div style={{ color: '#e8eef8', fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>
              {tooltip.county} County
            </div>
            <div style={{ color: '#6b7a99', fontSize: '0.76rem', marginBottom: 6 }}>
              {tooltip.state} &nbsp;·&nbsp; Pop. {(tooltip.pop || 0).toLocaleString()}
            </div>
            <div style={{ color: '#6b7a99', fontSize: '0.8rem' }}>
              Reports: <span style={{ color: '#e8eef8' }}>{tooltip.total}</span>
            </div>
            <div style={{ color: '#6b7a99', fontSize: '0.8rem' }}>
              Sick: <span style={{ color: '#ff6b6b' }}>{tooltip.sick}</span>
            </div>
            <div style={{ color: '#6b7a99', fontSize: '0.8rem' }}>
              Healthy: <span style={{ color: '#2ed573' }}>{tooltip.healthy}</span>
            </div>
            <div style={{
              marginTop: 6, fontSize: '0.74rem', fontWeight: 600,
              color: getRiskColor(tooltip.sick, tooltip.total),
            }}>
              {getRiskLabel(tooltip.sick, tooltip.total)}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#6b7a99', fontSize: '0.75rem', fontWeight: 600 }}>Risk level:</span>
        {[
          { color: '#111e33', label: 'No data' },
          { color: '#2ed573', label: 'Low' },
          { color: '#ffa502', label: 'Moderate' },
          { color: '#ff6b35', label: 'High' },
          { color: '#ff4757', label: 'Severe' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 2,
              background: color, border: '1px solid #1f2d45',
            }} />
            <span style={{ color: '#6b7a99', fontSize: '0.75rem' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
