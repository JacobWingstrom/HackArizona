import React, { useEffect, useState } from 'react';
import { getProfile } from '../api';

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#0d1c2e', border: '1px solid #1f2d45', borderRadius: 10,
      padding: '14px 16px', flex: '1 1 140px',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#6b7a99', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function ProfileScreen({ currentUser, setView, onLogout }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const memberSince = stats?.created_at
    ? new Date(stats.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const healthyPct = stats?.total_checkins > 0
    ? Math.round((stats.healthy_checkins / stats.total_checkins) * 100)
    : null;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => setView('checkin')}
          style={{
            background: 'none', border: '1px solid #1f2d45', borderRadius: 8,
            color: '#6b7a99', fontSize: '0.85rem', padding: '6px 12px', cursor: 'pointer', width: 'auto',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>My Profile</h2>
      </div>

      {/* Avatar + identity */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#00d4aa22',
          border: '2px solid #00d4aa44', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#00d4aa',
          flexShrink: 0,
        }}>
          {currentUser?.username?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{currentUser?.username}</div>
          {memberSince && (
            <div style={{ color: '#6b7a99', fontSize: '0.78rem', marginTop: 2 }}>
              Member since {memberSince}
            </div>
          )}
          {stats?.home_county && (
            <div style={{ color: '#6b7a99', fontSize: '0.78rem' }}>
              📍 {stats.home_county} County, AZ
            </div>
          )}
        </div>
        <button
          onClick={onLogout}
          style={{
            marginLeft: 'auto', background: 'none', border: '1px solid #1f2d45',
            borderRadius: 6, color: '#6b7a99', fontSize: '0.75rem',
            padding: '5px 10px', cursor: 'pointer', flexShrink: 0, width: 'auto',
          }}
        >
          Sign out
        </button>
      </div>

      {loading ? (
        <div className="text-muted" style={{ textAlign: 'center', padding: 32 }}>Loading stats...</div>
      ) : (
        <>
          {/* Streak stats */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatCard
              label="Current Streak"
              value={`🔥 ${stats?.streak ?? 0}`}
              sub="consecutive days"
              color="#ffa502"
            />
            <StatCard
              label="Best Streak"
              value={`${stats?.best_streak ?? 0} days`}
              sub="personal record"
              color="#ffd32a"
            />
          </div>

          {/* Check-in stats */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatCard
              label="Total Check-ins"
              value={stats?.total_checkins ?? 0}
              sub="all time"
              color="#00d4aa"
            />
            <StatCard
              label="Healthy Days"
              value={stats?.healthy_checkins ?? 0}
              sub={healthyPct != null ? `${healthyPct}% of check-ins` : undefined}
              color="#2ed573"
            />
            <StatCard
              label="Sick Reports"
              value={stats?.sick_checkins ?? 0}
              sub="submitted to community"
              color="#ff6b81"
            />
          </div>

          {/* Community stats */}
          <div className="card">
            <div className="section-title">Community</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{stats?.friend_count ?? 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#6b7a99' }}>friends</div>
              </div>
              {stats?.friend_count > 0 && (
                <div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>#{stats?.leaderboard_rank ?? '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7a99' }}>leaderboard rank</div>
                </div>
              )}
              {stats?.last_checkin && (
                <div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{stats.last_checkin}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7a99' }}>last check-in</div>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard shortcut */}
          <button
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => setView('leaderboard')}
          >
            🏆 View Friends Leaderboard
          </button>
        </>
      )}
    </div>
  );
}
