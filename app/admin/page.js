'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AdminGate from '@/components/AdminGate';
import DeckSwatch from '@/components/DeckSwatch';
import { supabase } from '@/lib/client';

export default function AdminHome() {
  return (
    <AdminGate>
      <Dashboard />
    </AdminGate>
  );
}

function Dashboard() {
  const router = useRouter();
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('decks')
      .select('id,name,description,cover_color,cover_image_url,status,updated_at,questions(count)')
      .order('updated_at', { ascending: false });
    if (error) setError(error.message);
    setDecks(data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function createDeck() {
    const { data, error } = await supabase()
      .from('decks')
      .insert({ name: 'Untitled campaign', description: '', status: 'draft' })
      .select('id')
      .single();
    if (error) return setError(error.message);
    router.push(`/admin/deck/${data.id}`);
  }

  return (
    <main className="page stack">
      <div className="spread">
        <h1>Campaign Decks</h1>
        <div className="row">
          <Link href="/admin/ideologies" className="btn">Ideology types</Link>
          <Link href="/admin/import" className="btn">Import from file</Link>
          <button className="btn primary" onClick={createDeck}>+ New deck</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {decks === null && <p className="muted">Loading…</p>}
      {decks?.length === 0 && <p className="notice">No decks yet. Create your first one.</p>}
      <div className="deck-grid">
        {decks?.map((d) => (
          <Link key={d.id} href={`/admin/deck/${d.id}`} className="deck-option" style={{ textDecoration: 'none' }}>
            <DeckSwatch deck={{ name: d.name, coverColor: d.cover_color, coverImageUrl: d.cover_image_url }} />
            <div style={{ flex: 1 }}>
              <div className="spread">
                <strong>{d.name}</strong>
                <span className={`status-pill ${d.status}`}>{d.status}</span>
              </div>
              <p className="muted small">{d.description || 'No description'}</p>
              <p className="muted small">{d.questions?.[0]?.count ?? 0} questions</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
