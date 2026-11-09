'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, newToken, saveToken, rememberGame } from '@/lib/client';
import DeckSwatch from '@/components/DeckSwatch';

export default function CreateGame() {
  const router = useRouter();
  const [decks, setDecks] = useState(null);
  const [name, setName] = useState('');
  const [players, setPlayers] = useState(4);
  const [deckId, setDeckId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/decks')
      .then((d) => {
        setDecks(d.decks);
        if (d.decks.length) setDeckId(d.decks[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your name.');
    if (!deckId) return setError('Please choose a campaign deck.');
    setBusy(true);
    try {
      const token = newToken();
      const res = await api('/api/games', { name: name.trim(), maxPlayers: players, deckId, token });
      saveToken(res.code, token);
      rememberGame(res.code, name.trim());
      router.push(`/game/${res.code}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <Link href="/" className="muted small">← Back</Link>
      <h1 style={{ margin: '14px 0 18px' }}>Create a Game</h1>
      <form className="panel stack" onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Asha" autoFocus />
        </label>

        <div className="field">
          <span className="muted small" style={{ display: 'block', marginBottom: 6 }}>Number of players</span>
          <div className="stepper">
            {[2, 3, 4, 5, 6].map((n) => (
              <button type="button" key={n} className={`btn ${players === n ? 'selected' : ''}`} onClick={() => setPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="muted small" style={{ display: 'block', marginBottom: 6 }}>Campaign deck</span>
          {decks === null && !error && <p className="muted">Loading decks…</p>}
          {decks && decks.length === 0 && <p className="notice">No published decks yet. Ask an admin to publish one.</p>}
          <div className="deck-grid">
            {decks?.map((d) => (
              <button
                type="button"
                key={d.id}
                className={`deck-option ${deckId === d.id ? 'selected' : ''}`}
                onClick={() => setDeckId(d.id)}
              >
                <DeckSwatch deck={d} />
                <div>
                  <strong>{d.name}</strong>
                  <p className="muted small">{d.description}</p>
                  <p className="muted small">{d.questionCount} questions</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn primary big block" disabled={busy || !decks?.length}>
          {busy ? 'Creating…' : 'Create Game'}
        </button>
      </form>
    </main>
  );
}

