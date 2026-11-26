import React from 'react';

function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPresetRange(preset) {
  const now = new Date();
  const today = fmtISO(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = fmtISO(y);
    return { from: ys, to: ys };
  }
  if (preset === 'week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    start.setDate(start.getDate() - diff);
    return { from: fmtISO(start), to: today };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmtISO(start), to: today };
  }
  return { from: '', to: '' };
}

const PRESETS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
];

export default function DateRangeBar({ preset, from, to, onChange, children }) {
  const handlePreset = (key) => {
    if (key === 'custom') {
      onChange({ preset: 'custom', from: from || fmtISO(new Date()), to: to || fmtISO(new Date()) });
    } else {
      const r = getPresetRange(key);
      onChange({ preset: key, from: r.from, to: r.to });
    }
  };

  return (
    <div className="ent-date-bar">
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginRight: 4 }}>Period:</span>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`ent-preset-btn ${preset === p.key ? 'active' : ''}`}
          onClick={() => handlePreset(p.key)}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={from}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to })}
            aria-label="From date"
            style={{ padding: '4px 8px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--line)' }}
          />
          <span className="muted" style={{ fontSize: 12 }}>to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange({ preset: 'custom', from, to: e.target.value })}
            aria-label="To date"
            style={{ padding: '4px 8px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--line)' }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
