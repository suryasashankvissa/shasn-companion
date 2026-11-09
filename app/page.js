'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { lastGame } from '@/lib/client';

export default function Home() {
  const [resume, setResume] = useState(null);
  useEffect(() => setResume(lastGame()), []);

  return (
    <main className="page narrow">
      <section className="hero">
        <img src="/logo.png" alt="SHASN — What will you stand for?" className="logo-hero" />
        <p className="eyebrow">Campaign Companion</p>
        <p className="muted" style={{ marginTop: 12 }}>
          Draw campaign questions, reveal ideologies and track every player&apos;s collection — while you play on the
          real board.
        </p>
      </section>

      <div className="stack">
        <Link href="/create" className="btn primary big block">
          Create a Game
        </Link>
        <Link href="/join" className="btn big block">
          Join a Game
        </Link>
        {resume && (
          <Link href={`/game/${resume.code}`} className="btn ghost block">
            Return to game {resume.code} as {resume.name}
          </Link>
        )}
      </div>

      <p className="center muted small" style={{ marginTop: 48 }}>
        Unofficial fan-made companion. Not affiliated with the publishers of Shasn.
      </p>
    </main>
  );
}
