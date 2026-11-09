'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AdminGate from '@/components/AdminGate';
import { supabase } from '@/lib/client';

export default function IdeologiesPage() {
  return (
    <AdminGate>
      <Ideologies />
    </AdminGate>
  );
}

function Ideologies() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('ideology_types').select('*').order('sort');
    if (error) setError(error.message);
    setRows(data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function update(i, field, value) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, [field]: value, _dirty: true } : x)));
  }

  async function save() {
    setError('');
    setMsg('');
    for (const r of rows) {
      if (!r.name.trim()) return setError('Every ideology needs a name.');
    }
    for (const r of rows.filter((r) => r._dirty || r._new)) {
      const payload = { name: r.name.trim(), color: r.color, symbol: r.symbol || '◆', description: r.description || '', sort: Number(r.sort) || 0 };
      const q = r._new ? supabase().from('ideology_types').insert(payload) : supabase().from('ideology_types').update(payload).eq('id', r.id);
      const { error } = await q;
      if (error) return setError(error.message.includes('duplicate') ? `Two ideologies can't share the name “${r.name}”.` : error.message);
    }
    setMsg('Saved.');
    load();
  }

  async function remove(r) {
    if (r._new) return setRows((rs) => rs.filter((x) => x !== r));
    if (!confirm(`Delete “${r.name}”? Questions using it will need a new ideology before they can be played.`)) return;
    const { error } = await supabase().from('ideology_types').delete().eq('id', r.id);
    if (error) return setError(error.message);
    load();
  }

  return (
    <main className="page stack">
      <Link href="/admin" className="muted small">← All decks</Link>
      <h1>Ideology Types</h1>
      <p className="muted">
        These are shared by every deck. Each answer on a question awards one of these. Rename, recolour or add new ones
        at any time.
      </p>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="simple">
          <thead>
            <tr><th>Symbol</th><th>Name</th><th>Colour</th><th>Short description</th><th>Order</th><th /></tr>
          </thead>
          <tbody>
            {rows?.map((r, i) => (
              <tr key={r.id || `new-${i}`}>
                <td style={{ width: 70 }}><input value={r.symbol} maxLength={3} onChange={(e) => update(i, 'symbol', e.target.value)} /></td>
                <td><input value={r.name} onChange={(e) => update(i, 'name', e.target.value)} /></td>
                <td><input type="color" value={r.color} onChange={(e) => update(i, 'color', e.target.value)} /></td>
                <td><input value={r.description} onChange={(e) => update(i, 'description', e.target.value)} /></td>
                <td style={{ width: 80 }}><input type="number" value={r.sort} onChange={(e) => update(i, 'sort', e.target.value)} /></td>
                <td><button className="btn sm danger" onClick={() => remove(r)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn"
            onClick={() => setRows((r) => [...r, { name: '', color: '#6b7a99', symbol: '◆', description: '', sort: (r.length + 1), _new: true }])}
          >
            + Add ideology
          </button>
          <button className="btn primary" onClick={save}>Save changes</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      </div>
    </main>
  );
}
