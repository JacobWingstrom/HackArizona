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
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '32px 0' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(44,82,130,0.08)',
          border: '1px solid rgba(44,82,130,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem', marginBottom: 16,
        }}>
          🔐
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: 6, color: '#1F2937' }}>
          {tab === 'login' ? 'Welcome back' : 'Join CommunityPulse'}
        </h2>
        <p style={{ color: '#6B7280', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Track your streak, add friends, and help protect your community.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 20,
        border: '1px solid #E5E7EB',
        background: '#F7F9FB',
        padding: 3,
        gap: 3,
      }}>
        {[
          { key: 'login', label: 'Sign In' },
          { key: 'register', label: 'Register' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setError(''); }}
            style={{
              flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
              borderRadius: 6,
              background: tab === key ? '#2C5282' : 'transparent',
              color: tab === key ? '#FFFFFF' : '#6B7280',
              fontWeight: tab === key ? 600 : 400,
              fontSize: '0.87rem',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-body)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {tab === 'register' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
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
        <div className="form-group" style={{ marginBottom: 0 }}>
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
        <div className="form-group" style={{ marginBottom: 0 }}>
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
          <div style={{
            color: '#DC2626', fontSize: '0.82rem',
            background: '#FEF2F2', border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>Loading…</span>
            : tab === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <button
          onClick={onSkip}
          style={{
            background: 'none', border: 'none', color: '#9CA3AF',
            fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-mono)',
            transition: 'color 0.13s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#6B7280'}
          onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
        >
          Continue without an account →
        </button>
      </div>
    </div>
  );
}
