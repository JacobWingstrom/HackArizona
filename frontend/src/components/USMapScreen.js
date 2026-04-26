import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ComposableMap, Geographies, Geography, ZoomableGroup, useMapContext,
} from 'react-simple-maps';
import { getUSMap, getTravelFlow } from '../api';
import CountyDetailPanel from './CountyDetailPanel';

const COUNTIES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const STATES_URL   = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

function getRiskColor(sick, total) {
  if (total === 0) return '#F1F5F9';
  const rate = sick / total;
  if (sick === 0)  return '#D1FAE5';
  if (rate < 0.25) return '#A7F3D0';
  if (rate < 0.5)  return '#FDE68A';
  if (rate < 0.75) return '#FDBA74';
  return '#FCA5A5';
}

function getRiskLabel(sick, total) {
  if (total === 0) return 'No reports';
  const rate = sick / total;
  if (sick === 0)  return 'All healthy';
  if (rate < 0.25) return 'Low risk';
  if (rate < 0.5)  return 'Moderate';
  if (rate < 0.75) return 'High risk';
  return 'Severe';
}

// ── Arc layer — must render inside <ComposableMap> to access projection ───────
function FlowArcs({ sources, target }) {
  const { projection } = useMapContext();
  if (!sources?.length || !target) return null;

  const tCoords = projection([target.lon, target.lat]);
  if (!tCoords) return null;
  const [tx, ty] = tCoords;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Arrowhead marker definition */}
      <defs>
        <marker
          id="flow-arrow"
          markerWidth="6" markerHeight="6"
          refX="5" refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L6,3 z" fill="#D97706" fillOpacity="0.8" />
        </marker>
      </defs>

      {sources.map((src) => {
        const sCoords = projection([src.lon, src.lat]);
        if (!sCoords) return null;
        const [sx, sy] = sCoords;

        // Quadratic bezier: control point perpendicular to midpoint, scaled by distance
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = dist * 0.35;
        // Perpendicular direction (rotate 90°)
        const nx = -dy / dist;
        const ny =  dx / dist;
        const mx = (sx + tx) / 2 + nx * curvature;
        const my = (sy + ty) / 2 + ny * curvature;

        const opacity  = 0.25 + src.weight * 0.65;
        const width    = 0.4  + src.weight * 2.2;

        return (
          <path
            key={src.fips}
            d={`M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`}
            fill="none"
            stroke="#D97706"
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeLinecap="round"
            markerEnd="url(#flow-arrow)"
          />
        );
      })}

      {/* Pulse ring on target county */}
      <circle cx={tx} cy={ty} r={6} fill="none" stroke="#D97706" strokeWidth={1.5} strokeOpacity={0.9} />
      <circle cx={tx} cy={ty} r={3} fill="#D97706" fillOpacity={0.9} />
    </g>
  );
}

export default function USMapScreen({ setView }) {
  const [fipsMap,   setFipsMap]   = useState({});
  const [tooltip,   setTooltip]   = useState(null);
  const [mousePos,  setMousePos]  = useState({ x: 0, y: 0 });
  const [loading,   setLoading]   = useState(true);
  const [zoom,      setZoom]      = useState(1);
  const [center,    setCenter]    = useState([-96, 38]);
  const [flowData,  setFlowData]  = useState(null);   // { target, sources }
  const [flowLoading, setFlowLoading] = useState(false);
  const [detailFips, setDetailFips] = useState(null); // county clicked → open panel

  const flowCache = useRef({});
  const hoverTimer = useRef(null);
  const clearTimer = useRef(null);
  const activeFips  = useRef(null);

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

  const fetchFlow = useCallback(async (fips) => {
    if (flowCache.current[fips]) {
      setFlowData(flowCache.current[fips]);
      return;
    }
    setFlowLoading(true);
    try {
      const data = await getTravelFlow(fips);
      flowCache.current[fips] = data;
      // Only update if still hovering this county
      if (activeFips.current === fips) setFlowData(data);
    } catch (e) {
      // keep whatever was showing
    }
    setFlowLoading(false);
  }, []);

  const handleCountyEnter = useCallback((data) => {
    // Cancel any pending clear
    clearTimeout(clearTimer.current);
    activeFips.current = data?.fips ?? null;
    setTooltip(data);
    // Don't wipe flowData here — keep previous arcs until new ones load
    // Debounce: only fetch after cursor rests on county for 150ms
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (data?.fips) fetchFlow(data.fips);
    }, 150);
  }, [fetchFlow]);

  const handleCountyClick = useCallback((data) => {
    if (data?.fips) setDetailFips(data.fips);
  }, []);

  // Only called when leaving the whole map container
  const handleMapLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    clearTimer.current = setTimeout(() => {
      activeFips.current = null;
      setTooltip(null);
      setFlowData(null);
    }, 80);
  }, []);

  const allCounties  = Object.values(fipsMap);
  const totalReports = allCounties.reduce((s, c) => s + c.total, 0);
  const totalSick    = allCounties.reduce((s, c) => s + c.sick,  0);
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
            background: 'none', border: '1px solid #E5E7EB', borderRadius: 6,
            color: '#6B7280', fontSize: '0.8rem', padding: '4px 10px',
            cursor: 'pointer', width: 'auto',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, color: '#1F2937', fontSize: '1.2rem', fontWeight: 700 }}>
          US Symptom Map
        </h2>
      </div>
      <p style={{ color: '#6B7280', fontSize: '0.82rem', margin: '0 0 20px' }}>
        Hover a county to see travel-driven illness inflow · Click for full AI risk analysis
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Reports',      value: totalReports.toLocaleString() },
          { label: 'Sick Reports',       value: totalSick.toLocaleString() },
          { label: 'Counties Reporting', value: countiesCount },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10,
            padding: '10px 18px', flex: 1, minWidth: 120,
          }}>
            <div style={{ color: '#2A9D8F', fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
            <div style={{ color: '#6B7280', fontSize: '0.75rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div
        style={{
          background: '#F7F9FB', borderRadius: 14, border: '1px solid #E5E7EB',
          padding: 8, position: 'relative', overflow: 'hidden',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMapLeave}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#6B7280', padding: 80 }}>Loading…</div>
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
                      const isTarget = flowData?.target?.fips === geo.id;
                      const fill = data ? getRiskColor(data.sick, data.total) : '#F1F5F9';
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={fill}
                          stroke={isTarget ? '#D97706' : '#F7F9FB'}
                          strokeWidth={isTarget ? 1.5 / zoom : 0.2 / zoom}
                          style={{
                            default: { outline: 'none', cursor: data ? 'pointer' : 'default' },
                            hover:   { outline: 'none', fill: data ? fill : '#F1F5F9', cursor: data ? 'pointer' : 'default' },
                            pressed: { outline: 'none' },
                          }}
                          onMouseEnter={() => data && handleCountyEnter(data)}
                          onClick={() => data && handleCountyClick(data)}
                        />
                      );
                    })
                  }
                </Geographies>

                {/* State borders */}
                <Geographies geography={STATES_URL}>
                  {({ geographies }) =>
                    geographies.map(geo => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="none"
                        stroke="#CBD5E1"
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

                {/* Travel flow arcs — rendered last so they appear on top */}
                {flowData?.sources?.length > 0 && (
                  <FlowArcs
                    sources={flowData.sources}
                    target={flowData.target}
                  />
                )}
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
                    background: '#FFFFFF', border: '1px solid #E5E7EB',
                    color: '#1F2937', fontSize: label === '⟳' ? '0.9rem' : '1.1rem',
                    fontWeight: 700, cursor: 'pointer', lineHeight: 1, width: 'auto',
                    minWidth: 32,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Flow loading indicator */}
            {flowLoading && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                background: '#FFFFFF', border: '1px solid #E5E7EB',
                borderRadius: 6, padding: '4px 10px',
                color: '#D97706', fontSize: '0.75rem',
              }}>
                Loading travel flow…
              </div>
            )}
          </>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: mousePos.x + 14,
            top:  mousePos.y - 10,
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            padding: '10px 14px',
            minWidth: 200,
            pointerEvents: 'none',
            zIndex: 10,
            transform: mousePos.x > 700 ? 'translateX(-110%)' : 'none',
          }}>
            <div style={{ color: '#1F2937', fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>
              {tooltip.county} County
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.76rem', marginBottom: 6 }}>
              {tooltip.state} · Pop. {(tooltip.pop || 0).toLocaleString()}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.8rem' }}>
              Sick: <span style={{ color: '#DC2626' }}>{tooltip.sick}</span>
              &nbsp;&nbsp;Healthy: <span style={{ color: '#059669' }}>{tooltip.healthy}</span>
            </div>
            <div style={{
              marginTop: 4, fontSize: '0.74rem', fontWeight: 600,
              color: '#374151',
            }}>
              {getRiskLabel(tooltip.sick, tooltip.total)}
            </div>

            {/* Travel inflow panel */}
            {flowData?.sources?.length > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
                <div style={{ color: '#D97706', fontSize: '0.72rem', fontWeight: 700, marginBottom: 4 }}>
                  ✈ Inbound flights carrying illness risk
                </div>
                {flowData.sources.slice(0, 5).map(src => (
                  <div key={src.fips} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.72rem', color: '#6B7280', marginBottom: 3,
                  }}>
                    <span>
                      <span style={{ color: '#374151' }}>{src.county}, {src.state}</span>
                      <span style={{ color: '#9CA3AF', marginLeft: 4 }}>
                        {src.via_airport}→{src.to_airport}
                      </span>
                    </span>
                    <span style={{ color: '#DC2626', marginLeft: 8, flexShrink: 0 }}>
                      {src.sick} sick
                    </span>
                  </div>
                ))}
                <div style={{ color: '#9CA3AF', fontSize: '0.65rem', marginTop: 4 }}>
                  Source: OpenFlights · {flowData.sources.length} routes
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click hint */}
      <p style={{ color: '#9CA3AF', fontSize: '0.72rem', margin: '6px 0 14px', textAlign: 'center' }}>
        Click any county for a detailed AI risk analysis
      </p>

      {/* County detail panel */}
      {detailFips && (
        <CountyDetailPanel
          fips={detailFips}
          onClose={() => setDetailFips(null)}
        />
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: 600 }}>Risk:</span>
        {[
          { color: '#F1F5F9', label: 'No data' },
          { color: '#A7F3D0', label: 'Low' },
          { color: '#FDE68A', label: 'Moderate' },
          { color: '#FDBA74', label: 'High' },
          { color: '#FCA5A5', label: 'Severe' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: color, border: '1px solid #E5E7EB' }} />
            <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="28" height="10">
            <line x1="0" y1="5" x2="22" y2="5" stroke="#D97706" strokeWidth="2" strokeOpacity="0.8" />
            <polygon points="22,2 28,5 22,8" fill="#D97706" fillOpacity="0.8" />
          </svg>
          <span style={{ color: '#6B7280', fontSize: '0.75rem' }}>Travel inflow</span>
        </div>
      </div>
    </div>
  );
}
