import React, { useEffect, useState } from 'react';
import { getLeaderboard, addFriend, removeFriend, getFriends } from '../api';

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardScreen({ currentUser, setView }) {
  const [board, setBoard] = useState([]);
  const [friends, setFriends] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('leaderboard');

  const load = async () => {
    setLoading(true);
    try {
      const [lb, fl] = await Promise.all([getLeaderboard(), getFriends()]);
      setBoard(lb);
      setFriends(fl);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddMsg('');
    setAddError('');
    try {
      const r = await addFriend(addInput.trim());
      setAddMsg(r.message);
      setAddInput('');
      load();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add friend');
    }
  };

  const handleRemove = async (username) => {
    try {
      await removeFriend(username);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setView('checkin')}
          style={{
            background: 'none', border: '1px solid #1f2d45', borderRadius: 8,
            color: '#6b7a99', fontSize: '0.85rem', padding: '6px 12px',
            cursor: 'pointer', width: 'auto',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Friends & Leaderboard</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', marginBottom: 20, border: '1px solid #1f2d45' }}>
        {[['leaderboard', '🏆 Leaderboard'], ['friends', '👥 Friends']].map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
              background: tab === t ? '#00d4aa' : 'transparent',
              color: tab === t ? '#0a0f1a' : '#6b7a99',
              fontWeight: tab === t ? 700 : 400,
              fontSize: '0.9rem',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted" style={{ textAlign: 'center', padding: 32 }}>Loading...</div>
      ) : tab === 'leaderboard' ? (
        <div>
          {board.length <= 1 ? (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>👥</div>
              <p className="text-muted">Add friends to see the leaderboard!</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                onClick={() => setTab('friends')}
              >
                Add Friends
              </button>
            </div>
          ) : (
            <div>
              {board.map((u) => (
                <div
                  key={u.id}
                  className="card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    marginBottom: 8,
                    border: u.is_me ? '1px solid #00d4aa44' : '1px solid #1f2d45',
                    background: u.is_me ? '#00d4aa0a' : undefined,
                  }}
                >
                  <div style={{ fontSize: '1.4rem', width: 32, textAlign: 'center' }}>
                    {RANK_MEDALS[u.rank] || `#${u.rank}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: u.is_me ? '#00d4aa' : 'var(--text)' }}>
                      {u.username}{u.is_me && ' (you)'}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {u.last_checkin ? `Last check-in: ${u.last_checkin}` : 'No check-ins yet'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: u.streak > 0 ? '#ffa502' : '#6b7a99' }}>
                      🔥 {u.streak}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>day streak</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Add friend form */}
          <div className="card">
            <div className="section-title">Add a Friend</div>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={addInput}
                  onChange={e => setAddInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#0a0f1a',
                    border: '1px solid #1f2d45',
                    borderRadius: 8,
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    minWidth: 0,
                  }}
                />
                <button
                  className="btn btn-primary"
                  type="submit"
                  style={{ width: 'auto', flexShrink: 0, padding: '10px 20px' }}
                >
                  Add
                </button>
              </div>
              {addMsg && (
                <div style={{ color: '#00d4aa', fontSize: '0.82rem', marginTop: 8 }}>
                  ✓ {addMsg}
                </div>
              )}
              {addError && (
                <div style={{ color: '#ff4757', fontSize: '0.82rem', marginTop: 8 }}>
                  {addError}
                </div>
              )}
            </form>
          </div>

          {/* Friends list */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="section-title">Your Friends ({friends.length})</div>
            {friends.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                No friends yet. Add someone by username above.
              </p>
            ) : (
              <div>
                {friends.map((f, i) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: i < friends.length - 1 ? '1px solid #1f2d45' : 'none',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#1f2d45', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem',
                      color: '#00d4aa', flexShrink: 0,
                    }}>
                      {f.username[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.username}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        🔥 {f.streak}-day streak
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(f.username)}
                      style={{
                        background: 'none',
                        border: '1px solid #1f2d45',
                        borderRadius: 6,
                        color: '#6b7a99',
                        fontSize: '0.75rem',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
