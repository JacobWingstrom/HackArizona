import React, { useState } from 'react';
import { register, login } from '../api';
import CountyPicker from './CountyPicker';

function PrivacyDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: '#F0FDF4', border: '1px solid #BBF7D0',
      borderRadius: 10, overflow: 'hidden', marginTop: 4,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.95rem' }}>🔒</span>
          <span style={{ color: '#065F46', fontSize: '0.78rem', fontWeight: 700 }}>
            What we collect &amp; how your data is used
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #BBF7D0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {[
            {
              icon: '📍',
              title: 'County-level location only',
              body: 'We never collect your GPS coordinates or street address — only the county you select. You can change it any time.',
            },
            {
              icon: '👤',
              title: 'Your reports stay yours',
              body: 'No individual report is ever shown to another user. Everything displayed publicly — epi curves, cluster signals, trend percentages — is aggregated across all reports in your county before display.',
            },
            {
              icon: '🤖',
              title: 'What goes to AI',
              body: 'GPT-4o receives only anonymized symptom lists, county FIPS codes, and exposure flags — never your name, email, or account ID. The epidemic forecast model (Gemma 4) runs entirely on our local server and your data never reaches any third-party provider for that step.',
            },
            {
              icon: '🚫',
              title: 'We never sell your data',
              body: 'CommunityPulse does not sell, share, or monetize your health data. It is used solely to generate your risk assessment and improve community outbreak detection.',
            },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.95rem', flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ color: '#065F46', fontSize: '0.76rem', fontWeight: 700, marginBottom: 2 }}>{item.title}</div>
                <div style={{ color: '#374151', fontSize: '0.72rem', lineHeight: 1.5 }}>{item.body}</div>
              </div>
            </div>
          ))}

          <div style={{
            background: '#FFFFFF', border: '1px solid #BBF7D0',
            borderRadius: 7, padding: '8px 12px',
            color: '#6B7280', fontSize: '0.68rem', lineHeight: 1.5,
          }}>
            CommunityPulse is a surveillance tool, not a medical service. Always consult a licensed healthcare provider for diagnosis and treatment.
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthScreen({ onAuth, onSkip }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCounty, setSelectedCounty] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (tab === 'register') {
        result = await register(username, email, password, selectedCounty?.county, selectedCounty?.fips);
      } else {
        result = await login(email, password);
      }
      localStorage.setItem('cp_token', result.token);
      localStorage.setItem('cp_user', JSON.stringify(result.user));
      // Pre-populate the check-in form county from home county
      if (result.user?.home_county_fips && !localStorage.getItem('cp_county')) {
        localStorage.setItem('cp_county', JSON.stringify({
          fips: result.user.home_county_fips,
          county: result.user.home_county,
          state: '',
        }));
      }
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
          <label className="form-label">{tab === 'login' ? 'Email or Username' : 'Email'}</label>
          <input
            className="form-input"
            type={tab === 'login' ? 'text' : 'email'}
            placeholder={tab === 'login' ? 'you@example.com or az_sentinel' : 'you@example.com'}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        {tab === 'register' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Your County <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
            <CountyPicker value={selectedCounty} onChange={setSelectedCounty} />
          </div>
        )}
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

      {tab === 'register' && <PrivacyDisclosure />}

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
