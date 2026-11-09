'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, hasToken, supabase, rememberGame } from '@/lib/client';
import DeckSwatch from '@/components/DeckSwatch';

export default function GamePage() {
  const { code: rawCode } = useParams();
  const code = String(rawCode).toUpperCase();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [fatal, setFatal] = useState('');
  const [toast, setToast] = useState('');
  const [live, setLive] = useState(true);
  const tokenRef = useRef(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!tokenRef.current || inflight.current) return;
    inflight.current = true;
    try {
      const s = await api(`/api/games/${code}/state`, { token: tokenRef.current });
      setState(s);
      setFatal('');
      rememberGame(code, s.me.name);
    } catch (e) {
      if (e.code === 'NOT_A_PLAYER' || e.code === 'GAME_NOT_FOUND') setFatal(e.message);
    } finally {
      inflight.current = false;
    }
  }, [code]);

  // Identify this device and load the game.
  useEffect(() => {
    if (!hasToken(code)) {
      router.replace(`/join?code=${code}`);
      return;
    }
    tokenRef.current = getToken(code);
    refresh();
  }, [code, refresh, router]);

  // Live updates: listen for "changed" broadcasts, and re-check every few
  // seconds as a safety net (and whenever the tab comes back into view).
  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel(`game-${code}`)
      .on('broadcast', { event: 'changed' }, () => refresh())
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') refresh();
      });
    const timer = setInterval(refresh, 4000);
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      sb.removeChannel(channel);
    };
  }, [code, refresh]);

  const act = useCallback(
    async (action, extra = {}) => {
      try {
        const s = await api(`/api/games/${code}/${action}`, { token: tokenRef.current, ...extra });
        setState(s);
        return true;
      } catch (e) {
        setToast(e.message);
        setTimeout(() => setToast(''), 3500);
        refresh();
        return false;
      }
    },
    [code, refresh]
  );

  if (fatal) {
    return (
      <main className="page narrow stack center" style={{ paddingTop: '12vh' }}>
        <h2>Can&apos;t open this game</h2>
        <p className="muted">{fatal}</p>
        <Link className="btn primary block" href={`/join?code=${code}`}>Join or rejoin game {code}</Link>
        <Link className="btn ghost block" href="/">Home</Link>
      </main>
    );
  }
  if (!state) {
    return <main className="page narrow center muted" style={{ paddingTop: '20vh' }}>Loading game {code}…</main>;
  }

  return (
    <>
      {state.status === 'lobby' ? (
        <Lobby state={state} act={act} live={live} />
      ) : (
        <Gameplay state={state} act={act} live={live} />
      )}
      {toast && (
        <div className="toast">
          <p className="error" style={{ background: '#2a1512' }}>{toast}</p>
        </div>
      )}
    </>
  );
}

/* ------------------------------ Lobby ------------------------------ */

function Lobby({ state, act, live }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join?code=${state.code}` : '';
  const isHost = state.me.isHost;

  async function share() {
    const text = `Join my Shasn campaign game! Code: ${state.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Campaign Companion', text, url: joinUrl });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${joinUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <main className="page narrow stack">
      <div className="spread">
        <Link href="/" className="muted small">← Home</Link>
        <span className={`conn ${live ? '' : 'off'}`}>{live ? 'Live' : 'Reconnecting…'}</span>
      </div>

      <section className="panel center stack">
        <p className="eyebrow">Game code</p>
        <div className="code-badge">{state.code}</div>
        <p className="muted small">Friends open this site, tap “Join a Game” and enter this code.</p>
        <button className="btn block" onClick={share}>{copied ? 'Copied!' : 'Share invite'}</button>
      </section>

      <section className="panel">
        <div className="row" style={{ gap: 14 }}>
          <DeckSwatch deck={state.deck} large />
          <div>
            <p className="eyebrow">Campaign deck</p>
            <h2 style={{ marginTop: 4 }}>{state.deck.name}</h2>
            <p className="muted small" style={{ marginTop: 4 }}>{state.deck.description}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2>Players</h2>
          <span className="muted">{state.players.length} / {state.maxPlayers} joined</span>
        </div>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={`player-item ${p.id === state.me.id ? 'me' : ''}`}>
              <span className="seat">{p.seat}</span>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
                {p.isHost && <span className="tag">Host</span>}
                {p.id === state.me.id && <span className="tag you">You</span>}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, state.maxPlayers - state.players.length) }).map((_, i) => (
            <li key={`empty-${i}`} className="player-item muted" style={{ opacity: 0.5 }}>
              <span className="seat">{state.players.length + i + 1}</span>
              <span>Waiting for player…</span>
            </li>
          ))}
        </ul>
        <p className="muted small" style={{ marginTop: 12 }}>
          Turn order is the host first, then everyone in the order they joined.
        </p>
      </section>

      {isHost ? (
        <button
          className="btn primary big block"
          disabled={busy || state.players.length < 2}
          onClick={async () => {
            setBusy(true);
            await act('start');
            setBusy(false);
          }}
        >
          {state.players.length < 2 ? 'Waiting for at least 2 players' : busy ? 'Starting…' : 'Start Game'}
        </button>
      ) : (
        <p className="notice center">Waiting for the host to start the game…</p>
      )}
    </main>
  );
}

/* ----------------------------- Gameplay ---------------------------- */

function Gameplay({ state, act, live }) {
  const [tab, setTab] = useState('question');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const playerById = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const active = playerById[state.activePlayerId];
  const isMyTurn = state.activePlayerId === state.me.id;
  const answered = !!state.result;
  const canAnswer = isMyTurn && !answered && !pending && !!state.question;

  useEffect(() => {
    setPending(null);
    setConfirmRedraw(false);
  }, [state.questionSeq, state.question?.id, answered]);

  async function choose(choice) {
    if (!canAnswer) return;
    setPending(choice);
    const ok = await act('answer', { questionId: state.question.id, choice });
    if (!ok) setPending(null);
  }

  async function hostAction(action) {
    setBusy(true);
    await act(action);
    setBusy(false);
  }

  return (
    <main className="page">
      <header className="stack" style={{ marginBottom: 14 }}>
        <div className="spread">
          <div>
            <p className="eyebrow">{state.deck.name}</p>
            <p className="muted small">Game {state.code} · Question {state.questionSeq}</p>
          </div>
          <span className={`conn ${live ? '' : 'off'}`}>{live ? 'Live' : 'Reconnecting…'}</span>
        </div>
        <TurnStrip players={state.players} activeId={state.activePlayerId} meId={state.me.id} />
      </header>

      <div className="tabs">
        <button className={`btn sm ${tab === 'question' ? 'selected' : ''}`} onClick={() => setTab('question')}>Campaign Question</button>
        <button className={`btn sm ${tab === 'collections' ? 'selected' : ''}`} onClick={() => setTab('collections')}>Ideology Collections</button>
      </div>

      <div className="game-grid">
        {/* Section A: Campaign Question */}
        <section className="tab-panel stack" style={{ display: tab === 'question' ? 'block' : 'none' }}>
          <div className={`turn-banner ${isMyTurn && !answered ? 'mine' : ''}`}>
            {answered ? (
              <span>
                <strong>{playerById[state.result.answererId]?.name}</strong> answered{' '}
                <strong>{state.result.choice === 'yes' ? 'YES' : 'NO'}</strong>
              </span>
            ) : isMyTurn ? (
              <span className="display" style={{ fontSize: '1.05rem' }}>Your turn — choose an answer</span>
            ) : (
              <span>
                Waiting for <strong>{active?.name}</strong> to answer…
              </span>
            )}
          </div>

          {state.reshuffles > 0 && state.questionSeq > 1 && (
            <p className="muted small center">Deck reshuffled {state.reshuffles}×</p>
          )}

          {state.question ? (
            <QuestionCard
              key={`${state.questionSeq}-${state.question.id}`}
              question={state.question}
              result={state.result}
              canAnswer={canAnswer}
              pending={pending}
              onChoose={choose}
            />
          ) : (
            <p className="notice">No question available. The deck may be empty.</p>
          )}

          {answered ? (
            <IdeologyCard key={`r-${state.questionSeq}`} result={state.result} playerById={playerById} meId={state.me.id} />
          ) : (
            <div className="hidden-card">
              <div className="display">?</div>
              <p className="small">The ideology stays sealed until {isMyTurn ? 'you answer' : `${active?.name} answers`}.</p>
            </div>
          )}

          {state.me.isHost && (
            <div className="host-bar">
              {answered ? (
                <button className="btn primary big block" disabled={busy} onClick={() => hostAction('next')}>
                  {busy ? 'Loading…' : `Next Question → ${nextPlayerName(state)}`}
                </button>
              ) : confirmRedraw ? (
                <div className="notice stack">
                  <p>Discard this card and draw a new one for {active?.name}? (Use this for the “pay 4 resources” redraw or to skip a sensitive card.)</p>
                  <div className="row">
                    <button className="btn danger" disabled={busy} onClick={() => hostAction('redraw')}>Yes, redraw</button>
                    <button className="btn ghost" onClick={() => setConfirmRedraw(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn ghost sm" onClick={() => setConfirmRedraw(true)}>Redraw this card</button>
              )}
              <p className="muted small center">You are the host — only you can move the game forward.</p>
            </div>
          )}
          {!state.me.isHost && answered && (
            <p className="muted small center" style={{ marginTop: 12 }}>Waiting for the host to draw the next question…</p>
          )}
        </section>

        {/* Section B: Ideology Collection */}
        <section className="tab-panel stack" style={{ display: tab === 'collections' ? 'block' : 'none' }}>
          <Collections state={state} />
        </section>
      </div>
    </main>
  );
}

function nextPlayerName(state) {
  const n = state.players.length;
  const activeSeat = state.players.find((p) => p.id === state.activePlayerId)?.seat || 1;
  const nextSeat = (activeSeat % n) + 1;
  return state.players.find((p) => p.seat === nextSeat)?.name || '';
}

function TurnStrip({ players, activeId, meId }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeId]);
  return (
    <div className="turn-strip" ref={ref} aria-label="Turn order">
      {players.map((p, i) => (
        <span key={p.id} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <span className={`turn-chip ${p.id === activeId ? 'active' : ''}`}>
            <span className="seat">{p.seat}</span>
            {p.name}
            {p.id === meId ? ' (you)' : ''}
            {p.isHost ? ' ★' : ''}
          </span>
          {i < players.length - 1 && <span className="turn-arrow">›</span>}
        </span>
      ))}
      <span className="turn-arrow" title="Back to the first player">↺</span>
    </div>
  );
}

function QuestionCard({ question, result, canAnswer, pending, onChoose }) {
  const chosen = result?.choice || null;
  const color = result?.card?.ideology_color;
  const opt = (key, label) => {
    const isChosen = chosen === key;
    const cls = ['answer', canAnswer ? 'can' : '', isChosen ? 'chosen' : '', chosen && !isChosen ? 'not-chosen' : '', pending === key ? 'pending' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <button
        className={cls}
        disabled={!canAnswer}
        aria-disabled={!canAnswer}
        onClick={() => onChoose(key)}
        style={isChosen ? { '--ideo': color } : undefined}
      >
        <span className="a-key">{key === 'yes' ? 'YES' : 'NO'}</span>
        {label && label.toLowerCase() !== key && <span className="a-label">{label}</span>}
      </button>
    );
  };
  return (
    <article className="q-card">
      <div className="q-meta">
        <span>Campaign Question</span>
        {question.number ? <span>No. {question.number}</span> : null}
      </div>
      <p className="q-text">{question.text}</p>
      <div className="answers">
        {opt('yes', question.yesLabel)}
        {opt('no', question.noLabel)}
      </div>
    </article>
  );
}

function IdeologyCard({ result, playerById, meId }) {
  const c = result.card || {};
  const recipient = playerById[result.recipientId];
  const answerer = playerById[result.answererId];
  return (
    <div className="reveal-wrap">
      <div className="ideo-card" style={{ '--ideo': c.ideology_color }}>
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Ideology revealed</p>
        <div className="ideo-symbol" style={{ marginTop: 10 }}>{c.ideology_symbol}</div>
        <div className="ideo-name">{c.ideology_name}</div>
        {c.ideology_description && <p className="small" style={{ opacity: 0.85 }}>{c.ideology_description}</p>}
        {c.card_text && <p className="ideo-text">“{c.card_text}”</p>}
        {c.resources && <span className="ideo-res">Collect on the board: {c.resources}</span>}
        <p className="ideo-award">
          Awarded to <strong>{recipient?.id === meId ? 'you' : recipient?.name}</strong>
          {recipient?.id !== answerer?.id && <> (answered by {answerer?.name})</>}
        </p>
      </div>
    </div>
  );
}

function Collections({ state }) {
  const [flashId, setFlashId] = useState(null);
  const lastSeq = useRef(null);
  useEffect(() => {
    const key = state.result ? `${state.questionSeq}` : null;
    if (key && lastSeq.current !== null && lastSeq.current !== key) {
      setFlashId(state.result.recipientId);
      const t = setTimeout(() => setFlashId(null), 1700);
      lastSeq.current = key;
      return () => clearTimeout(t);
    }
    lastSeq.current = key ?? lastSeq.current ?? '';
  }, [state.result, state.questionSeq]);

  const types = state.ideologies;
  const playerById = Object.fromEntries(state.players.map((p) => [p.id, p]));
  return (
    <>
      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>Ideology Collections</h2>
        <div className="coll-list">
          {state.players.map((p) => {
            const counts = state.collections[p.id] || {};
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            const owned = types.filter((t) => counts[t.id]);
            return (
              <div key={p.id} className={`coll ${p.id === state.me.id ? 'me' : ''} ${flashId === p.id ? 'flash' : ''}`}>
                <div className="coll-head">
                  <span className="seat">{p.seat}</span>
                  <strong>{p.name}{p.id === state.me.id ? ' (you)' : ''}</strong>
                  {p.id === state.activePlayerId && <span className="tag">Turn</span>}
                  <span className="coll-total">{total} card{total === 1 ? '' : 's'}</span>
                </div>
                {owned.length ? (
                  <div className="chips">
                    {owned.map((t) => (
                      <span key={t.id} className="chip" style={{ '--ideo': t.color }} title={t.name}>
                        <span className="sym">{t.symbol}</span>
                        {t.name.replace(/^The /, '')}: <b>{counts[t.id]}</b>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No ideology cards yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {state.history.length > 0 && (
        <div className="panel">
          <h3 style={{ marginBottom: 10 }}>Recent answers</h3>
          <ul className="history">
            {state.history.map((h) => (
              <li key={h.seq}>
                <span className="dot" style={{ '--ideo': h.ideologyColor }} />
                <span>
                  <strong style={{ color: 'var(--text)' }}>Q{h.seq}</strong> · {playerById[h.answererId]?.name} said{' '}
                  {h.choice.toUpperCase()} → {h.ideologyName}
                  {h.recipientId !== h.answererId && <> to {playerById[h.recipientId]?.name}</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
