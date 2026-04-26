import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E7EB',
        borderRadius: 8, padding: '8px 12px', fontSize: 13,
      }}>
        <div style={{ color: '#6B7280', marginBottom: 2 }}>{shortDate(label)}</div>
        <div style={{ color: '#2A9D8F', fontWeight: 700 }}>{payload[0].value} reports</div>
      </div>
    );
  }
  return null;
};

export default function ForecastChart({ chartData, forecast, trendPct }) {
  if (!chartData || chartData.length === 0) return null;

  const allZero = chartData.every(d => d.count === 0);

  const data = chartData.map(d => ({ ...d, label: shortDate(d.date) }));
  const avg = Math.round(data.reduce((s, d) => s + d.count, 0) / data.length);

  const trendColor = forecast === 'growing' ? '#DC2626' : forecast === 'declining' ? '#059669' : '#D97706';
  const trendLabel = forecast === 'growing' ? '↑ Growing' : forecast === 'declining' ? '↓ Declining' : '→ Stable';

  if (allZero) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div className="section-title">7-Day Report Trend</div>
        <div className="text-muted" style={{ marginTop: 8, fontSize: '0.9rem' }}>
          No community reports yet in your county.<br />
          <span style={{ color: '#2A9D8F', fontWeight: 600 }}>You're helping build this dataset — thank you.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>7-Day Report Trend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {trendPct !== undefined && (
            <span style={{ fontSize: '0.8rem', color: trendColor, fontWeight: 700 }}>
              {trendPct > 0 ? '+' : ''}{trendPct}% vs last week
            </span>
          )}
          <span style={{
            padding: '3px 10px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
            background: trendColor + '22', color: trendColor,
          }}>
            {trendLabel}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={avg} stroke="#E5E7EB" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="count"
            stroke={trendColor}
            strokeWidth={2.5}
            dot={{ fill: trendColor, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="text-muted mt-8" style={{ fontSize: '0.75rem' }}>
        Community reports in your county over the past 7 days.{avg > 0 ? ` Average: ${avg}/day.` : ''}
      </div>
    </div>
  );
}
