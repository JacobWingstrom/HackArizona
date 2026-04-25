import React from 'react';
import ForecastChart from './ForecastChart';
import NotifyButton from './NotifyButton';
import AIExplainer from './AIExplainer';

const RISK_TITLES = {
  low: 'Low Risk',
  medium: 'Elevated Risk',
  high: 'High Risk — Cluster Detected',
};

export default function ResultsDashboard({ results, formData, setView, currentUser, setCurrentUser }) {
  if (!results) return null;

  const {
    risk_level = 'low',
    recommendation,
    notify_others,
    notify_message,
    ai_explanation,
    cluster = {},
    county,
    audio_url,
    weather,
    server_streak,
  } = results;

  const { report_count = 0, trend_pct = 0, forecast = 'stable', chart_data = [], is_cluster } = cluster;

  // Use server streak if logged in, else localStorage
  let streak;
  if (server_streak != null && currentUser) {
    streak = server_streak;
    if (setCurrentUser) setCurrentUser(u => ({ ...u, streak: server_streak }));
    localStorage.setItem('cp_streak', server_streak);
  } else {
    streak = parseInt(localStorage.getItem('cp_streak') || '0');
  }

  return (
    <div>
      {/* Streak */}
      {streak > 0 && (
        <div className="streak-badge mb-16" style={{ display: 'inline-flex' }}>
          🔥 {streak}-day streak
        </div>
      )}

      {/* Risk Banner */}
      <div className={`risk-banner ${risk_level}`}>
        <div className="risk-level-label">
          {risk_level === 'low' ? '✅ LOW RISK' : risk_level === 'medium' ? '⚠️ MEDIUM RISK' : '🚨 HIGH RISK'}
        </div>
        <div className="risk-title">{RISK_TITLES[risk_level] || 'Risk Assessment'}</div>

        <div className="cluster-row">
          <span className="cluster-count">{report_count}</span>
          <span className="cluster-label">
            {report_count === 0
              ? `You're one of the first reporters in ${county || 'your'} County — your data helps build the picture`
              : `similar reports in ${county || 'your'} County in the past 72 hours`}
          </span>
        </div>

        {report_count >= 3 && (
          <div>
            <span className={`trend-pill ${forecast}`}>
              {forecast === 'growing' ? '↑' : forecast === 'declining' ? '↓' : '→'} {forecast}
              {trend_pct !== 0 && ` (${trend_pct > 0 ? '+' : ''}${trend_pct}%)`}
            </span>
          </div>
        )}
      </div>

      {/* Weather context */}
      {weather && weather.temp !== 'N/A' && (
        <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
          📍 {county} County · 🌡️ {weather.temp}°F, {weather.conditions}
        </div>
      )}

      {/* Notify if cluster — require at least 2 community reports so we don't trigger on a single self-report */}
      {notify_others && report_count >= 2 && (
        <NotifyButton message={notify_message} county={county} />
      )}

      {/* Forecast Chart */}
      <ForecastChart
        chartData={chart_data}
        forecast={forecast}
        trendPct={trend_pct}
      />

      {/* Recommendation */}
      <div className="card">
        <div className="section-title">AI Recommendation</div>
        <p className="recommendation-text">{recommendation}</p>

        {/* Audio */}
        {audio_url && (
          <div className="audio-player">
            <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 4 }}>
              🔊 Listen to your recommendation
            </div>
            <audio controls autoPlay src={audio_url}>
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>

      {/* AI Explainer */}
      <div className="mb-16">
        <AIExplainer
          explanation={ai_explanation}
          reportCount={report_count}
          county={county}
        />
      </div>

      {/* Actions */}
      <button className="btn btn-secondary" onClick={() => setView('checkin')}>
        ← Back to Home
      </button>
    </div>
  );
}
