import React, { useState, useEffect, useRef } from 'react';

const CACHE_KEY = 'cp_county_list';
const CACHE_TTL = 24 * 60 * 60 * 1000;

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts < CACHE_TTL ? data : null;
  } catch {
    return null;
  }
}

export default function CountyPicker({ value, onChange }) {
  const [counties, setCounties] = useState([]);
  const [query, setQuery] = useState(value ? `${value.county}, ${value.state}` : '');
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const cached = loadCached();
    if (cached) { setCounties(cached); return; }
    fetch('/api/counties')
      .then(r => r.json())
      .then(data => {
        setCounties(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) { setFiltered([]); return; }
    const q = query.toLowerCase();
    setFiltered(
      counties
        .filter(c =>
          c.county.toLowerCase().startsWith(q) ||
          `${c.county}, ${c.state}`.toLowerCase().includes(q) ||
          c.state.toLowerCase() === q
        )
        .slice(0, 20)
    );
  }, [query, counties]);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function select(county) {
    setQuery(`${county.county}, ${county.state}`);
    setOpen(false);
    onChange(county);
  }

  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    onChange(null);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className="form-input"
        type="text"
        placeholder="Search county — e.g. Lewis and Clark, MT"
        value={query}
        onChange={handleChange}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
          maxHeight: 220,
          overflowY: 'auto',
          zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}>
          {filtered.map(c => (
            <div
              key={c.fips}
              onMouseDown={() => select(c)}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F0F4F8'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: '#1F2937', fontSize: '0.85rem' }}>{c.county}</span>
              <span style={{ color: '#2C5282', fontSize: '0.78rem', fontWeight: 600 }}>{c.state}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
