'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, newToken, saveToken, rememberGame } from '@/lib/client';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get('code') || '').toUpperCase());
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function join(reclaim) {
    setError('');
    setErrorCode('');
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError('Enter the game code your host shared.');
    if (!name.trim()) return setError('Please enter your name.');
    setBusy(true);
    try {
      const token = newToken();
      await api(`/api/games/${c}/join`, { name: name.trim(), token, reclaim });
      saveToken(c, token);
      rememberGame(c, name.trim());
      router.push(`/game/${c}`);
    } catch (e) {
      setError(e.message);
      setErrorCode(e.code || '');
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <Link href="/" className="muted small">← Back</Link>
      <h1 style={{ margin: '14px 0 18px' }}>Join a Game</h1>
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          join(false);
        }}
      >
        <label className="field">
          <span>Game code</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            placeholder="ABCDE"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Ravi" />
        </label>
        {error && <p className="error">{error}</p>}
        {(errorCode === 'NAME_TAKEN' || errorCode === 'GAME_STARTED') && (
          <div className="notice stack">
            <p>
              Already in this game on another device or lost your connection? You can take back your seat using the
              same name you joined with.
            </p>
            <button type="button" className="btn block" disabled={busy} onClick={() => join(true)}>
              Rejoin as “{name.trim()}”
            </button>
          </div>
        )}
        <button className="btn primary big block" disabled={busy}>
          {busy ? 'Joining…' : 'Join Game'}
        </button>
      </form>
    </main>
  );
}

export default function JoinGame() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
