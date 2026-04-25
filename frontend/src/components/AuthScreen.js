import React, { useState } from 'react';
import { register, login } from '../api';

export default function AuthScreen({ onAuth, onSkip }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (tab === 'register') {
        result = await register(username, email, password);
      } else {
        result = await login(email, password);
      }
      localStorage.setItem('cp_token', result.token);
      localStorage.setItem('cp_user', JSON.stringify(result.user));
      onAuth(result.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '24px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔐</div>
        <h2 style={{ margin: 0 }}>
          {tab === 'login' ? 'Sign in to CommunityPulse' : 'Create your account'}
        </h2>
        <p className="text-muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>
          Track your streak, add friends, and compete on the leaderboard.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', marginBottom: 20, border: '1px solid #1f2d45' }}>
        {['login', 'register'].map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(''); }}
            style={{
              flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
              background: tab === t ? '#00d4aa' : 'transparent',
              color: tab === t ? '#0a0f1a' : '#6b7a99',
              fontWeight: tab === t ? 700 : 400,
              fontSize: '0.9rem',
            }}
          >
            {t === 'login' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        {tab === 'register' && (
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. jacob_az"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            placeholder={tab === 'register' ? 'At least 6 characters' : ''}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div style={{ color: '#ff4757', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>
        )}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Loading...' : tab === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button
          onClick={onSkip}
          style={{ background: 'none', border: 'none', color: '#6b7a99', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Continue without an account →
        </button>
      </div>
    </div>
  );
}
