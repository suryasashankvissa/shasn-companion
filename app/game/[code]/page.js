'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, hasToken, supabase, rememberGame } from '@/lib/client';
import DeckSwatch from '@/components/DeckSwatch';
import { CardFace, PCard, Coin } from '@/components/Coins';
import { POWERS, powerKey, playerPowers, passiveBonus, milestones, effectiveCounts } from '@/lib/powers';

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
      ) : state.status === 'finished' ? (
        <Finished state={state} />
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

      <UnlockAlarm state={state} />
      <JumlaRequestBanner state={state} act={act} />

      <div className="tabs">
        <button className={`btn sm ${tab === 'question' ? 'selected' : ''}`} onClick={() => setTab('question')}>Campaign Question</button>
        <button className={`btn sm ${tab === 'collections' ? 'selected' : ''}`} onClick={() => setTab('collections')}>Collections &amp; Powers</button>
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

          {answered && <TurnResources state={state} />}

          {answered ? (
            <p className="ideo-award">
              Awarded to <strong>{playerById[state.result.recipientId]?.id === state.me.id ? 'you' : playerById[state.result.recipientId]?.name}</strong>
              {state.result.recipientId !== state.result.answererId && <> (answered by {playerById[state.result.answererId]?.name})</>}
            </p>
          ) : (
            <p className="hidden-hint">The ideology stays sealed until {isMyTurn ? 'you answer' : `${active?.name} answers`}.</p>
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
              <EndGame state={state} act={act} busy={busy} />
              <p className="muted small center">You are the host — only you can move the game forward.</p>
            </div>
          )}
          {!state.me.isHost && answered && (
            <p className="muted small center" style={{ marginTop: 12 }}>Waiting for the host to draw the next question…</p>
          )}
        </section>

        {/* Section B: Ideology Collection */}
        <section className="tab-panel stack" style={{ display: tab === 'collections' ? 'block' : 'none' }}>
          <JumlaPanel state={state} act={act} />
          <Collections state={state} />
          <PowersGuide />
        </section>
      </div>
    </main>
  );
}

function EndGame({ state, act, busy }) {
  const [step, setStep] = useState(0); // 0 button, 1 pick winner
  const [winner, setWinner] = useState(null);
  const [working, setWorking] = useState(false);
  if (step === 0) {
    return <button className="btn ghost sm" onClick={() => setStep(1)}>End this game</button>;
  }
  return (
    <div className="notice stack">
      <h3>Who won?</h3>
      <p className="small">The real win happens on the board. Pick the winner and everyone will see the celebration.</p>
      <div className="winner-grid">
        {state.players.map((p) => (
          <button key={p.id} className={`btn ${winner === p.id ? 'primary' : ''}`} onClick={() => setWinner(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className="btn primary"
          disabled={!winner || working || busy}
          onClick={async () => {
            setWorking(true);
            const ok = await act('end', { winnerId: winner });
            if (!ok) setWorking(false);
          }}
        >
          {working ? 'Ending…' : 'Confirm winner'}
        </button>
        <button className="btn ghost" onClick={() => { setStep(0); setWinner(null); }}>Cancel</button>
      </div>
    </div>
  );
}

function Finished({ state }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const youWon = winner?.id === state.me.id;
  const canvasRef = useRef(null);
  const [tab, setTab] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let w = (cv.width = window.innerWidth);
    let h = (cv.height = window.innerHeight);
    const colors = ['#e2483a', '#2f43b4', '#e9ae22', '#6fae3a', '#f4ecd8'];
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * w, y: -20 - Math.random() * h * 0.6,
      vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 4,
      s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        if (b.y > h + 20 && t - t0 < 7000) { b.y = -20; b.x = Math.random() * w; }
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 3, b.s, b.s * 0.6); ctx.restore();
      }
      if (t - t0 < 9000) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main className="page narrow stack center">
      <canvas ref={canvasRef} className="confetti" aria-hidden="true" />
      <img src="/logo.png" alt="SHASN" className="logo-sm" />
      <p className="eyebrow">Game over</p>
      <h1 className="win-title">{youWon ? 'You won!' : `${winner?.name || 'Someone'} won!`}</h1>
      <p className="display" style={{ fontSize: '1.2rem' }}>
        🎉 Congratulations{youWon ? '!' : `, ${winner?.name}!`} 🎉
      </p>
      <p className="muted">A well-earned victory on the board. Thanks for playing SHASN.</p>
      <button className="btn" onClick={() => setTab((t) => !t)}>{tab ? 'Hide final collections' : 'See final collections'}</button>
      {tab && <div style={{ textAlign: 'left' }}><Collections state={state} /></div>}
      <Link href="/" className="btn primary block">Back to home</Link>
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

// One card for the whole turn: the question and both answers (read aloud) first; once answered, the
// chosen answer, its coins and the ideology band are revealed on the very same card.
function QuestionCard({ question, result, canAnswer, pending, onChoose }) {
  const strip = (t, k) => String(t || '').replace(new RegExp(`^\\s*${k}\\s*[.:\\-–—]\\s*`, 'i'), '');
  if (result) {
    const c = result.card || {};
    return (
      <PCard
        flip
        question={question.text}
        number={question.number}
        sensitive={question.sensitive}
        ideology={{ name: c.ideology_name, color: c.ideology_color, symbol: c.ideology_symbol }}
        coins={c.resources}
      >
        <p className="pc-text">{c.card_text || c.label || (result.choice === 'yes' ? 'Yes.' : 'No.')}</p>
      </PCard>
    );
  }
  const opt = (key, label, text) => (
    <button
      className={`pc-opt ${canAnswer ? 'can' : ''} ${pending === key ? 'pending' : ''}`}
      disabled={!canAnswer}
      aria-disabled={!canAnswer}
      onClick={() => onChoose(key)}
    >
      <span className="a-key">{key === 'yes' ? 'YES' : 'NO'}</span>
      <span className="a-text">{strip(text, key) || (label && label.toLowerCase() !== key ? label : '')}</span>
    </button>
  );
  return (
    <PCard question={question.text} number={question.number} sensitive={question.sensitive}>
      <div className="pc-answers">
        {opt('yes', question.yesLabel, question.yesText)}
        {opt('no', question.noLabel, question.noText)}
      </div>
    </PCard>
  );
}

function Collections({ state }) {
  const [flashId, setFlashId] = useState(null);
  const [open, setOpen] = useState({}); // "playerId|ideologyKey" -> true
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
            const counts = effectiveCounts(state, p.id);
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            const jumlaHere = state.jumla?.holderId === p.id ? state.jumla.ideologyId : null;
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
                  <>
                    <div className="chips">
                      {owned.map((t) => {
                        const k = `${p.id}|${t.id}`;
                        return (
                          <button
                            key={t.id}
                            className={`chip ${open[k] ? 'open' : ''}`}
                            style={{ '--ideo': t.color }}
                            aria-expanded={!!open[k]}
                            onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
                          >
                            <span className="sym">{t.symbol}</span>
                            {t.name.replace(/^The /, '')}: <b>{counts[t.id]}</b>
                            {jumlaHere === t.id && <span className="jumla-mini" title="Includes the Jumla card">J</span>}
                            <span className="chev">{open[k] ? '▴' : '▾'}</span>
                          </button>
                        );
                      })}
                    </div>
                    {owned.filter((t) => open[`${p.id}|${t.id}`]).map((t) => (
                      <div key={t.id} className="card-rail" style={{ '--ideo': t.color }}>
                        {(state.cards?.[p.id] || []).filter((c) => c.key === t.id).map((c) => (
                          <CardFace key={c.seq} card={c.card} number={null} small />
                        ))}
                        {jumlaHere === t.id && <JumlaCard small ideology={t} />}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="muted small">No ideology cards yet.</p>
                )}
                <UnlockedPowers state={state} playerId={p.id} />
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

/* ------------------------ Ideologue powers ------------------------ */

const LEVEL_LABEL = { 3: 'Level 3', 5: 'Level 5' };

// Resources the player collects this turn: the card's printed coins plus passive Ideologue bonuses.
function TurnResources({ state }) {
  const r = state.result;
  if (!r) return null;
  const name = (id) => (id === state.me.id ? 'You' : state.players.find((p) => p.id === id)?.name || '');
  const bonus = passiveBonus(state, r.answererId);
  const printed = r.card?.resources || '';
  const same = r.recipientId === r.answererId;
  const bonusTotal = bonus.reduce((a, b) => a + b.n, 0);
  if (!printed && !bonusTotal) return null;
  return (
    <div className="turn-res panel">
      <h3>Resources to take from the reserve</h3>
      {printed && (
        <div className="tr-row">
          <span className="tr-label">{same ? `${name(r.answererId)} · from the card` : `${name(r.recipientId)} · from the card`}</span>
          <ResourceLine text={printed} />
        </div>
      )}
      {bonusTotal > 0 && (
        <div className="tr-row">
          <span className="tr-label">{name(r.answererId)} · passive powers</span>
          <span className="tr-coins">
            {bonus.map((b) => (
              <span key={b.kind} className="tr-item">{b.n}× <Coin kind={b.kind} size={22} /> <small>{b.name}</small></span>
            ))}
          </span>
        </div>
      )}
      {same && (
        <p className="tr-total">
          Total for {name(r.answererId) === 'You' ? 'you' : name(r.answererId)}: <b>{totalLine(printed, bonus)}</b>
        </p>
      )}
      <p className="muted small">Passive power: +1 resource of an Ideologue&apos;s type for every 2 of their cards held (this card included).</p>
    </div>
  );
}

function parseCoins(text) {
  const out = {};
  for (const part of String(text || '').split(/[,;+&]/)) {
    const m = part.trim().match(/^(\d+)?\s*(?:x\s*)?(?:campaign\s+|street\s+|media\s+|public\s+)?(funds?|clout|media|trust)\b/i);
    if (m) {
      const k = m[2].toLowerCase().replace(/^funds?$/, 'funds');
      out[k] = (out[k] || 0) + Number(m[1] || 1);
    }
  }
  return out;
}
const RES_NAMES = { funds: 'Funds', clout: 'Clout', media: 'Media', trust: 'Trust' };
function totalLine(printed, bonus) {
  const t = parseCoins(printed);
  for (const b of bonus) t[b.kind] = (t[b.kind] || 0) + b.n;
  const parts = Object.keys(RES_NAMES).filter((k) => t[k]).map((k) => `${t[k]} ${RES_NAMES[k]}`);
  return parts.join(' + ') || '—';
}
function ResourceLine({ text }) {
  const t = parseCoins(text);
  const keys = Object.keys(RES_NAMES).filter((k) => t[k]);
  if (!keys.length) return <span className="tr-coins">{text}</span>;
  return (
    <span className="tr-coins">
      {keys.map((k) => (
        <span key={k} className="tr-item">{t[k]}× <Coin kind={k} size={22} /> <small>{RES_NAMES[k]}</small></span>
      ))}
    </span>
  );
}

// Badges under each player in the collections: what they have unlocked (and, for you, what's next).
function UnlockedPowers({ state, playerId }) {
  const list = playerPowers(state, playerId).filter((x) => x.power);
  const on = list.filter((x) => x.passive || x.level3);
  const mine = playerId === state.me.id;
  const next = mine
    ? list
        .map((x) => (x.count < 3 ? { x, need: 3 - x.count, lvl: 3 } : x.count < 5 ? { x, need: 5 - x.count, lvl: 5 } : null))
        .filter((n) => n && n.x.count > 0)
    : [];
  if (!on.length && !next.length) return null;
  return (
    <div className="powers">
      {on.map((x) => (
        <div key={x.type.id} className="pw" style={{ '--ideo': x.type.color }}>
          <span className="pw-name">{x.type.name.replace(/^The /, '')}</span>
          {x.passive > 0 && (
            <span className="pw-tag">Passive +{x.passive} <Coin kind={x.power.resource} size={16} /> / turn</span>
          )}
          {x.level3 && <PowerTag lvl={3} p={x.power.l3} />}
          {x.level5 && <PowerTag lvl={5} p={x.power.l5} />}
        </div>
      ))}
      {next.map(({ x, need, lvl }) => (
        <p key={x.type.id} className="pw-next">
          {need} more {x.type.name.replace(/^The /, '')} card{need === 1 ? '' : 's'} unlocks {LEVEL_LABEL[lvl]}: {x.power[`l${lvl}`].name}
        </p>
      ))}
    </div>
  );
}

function PowerTag({ lvl, p }) {
  const [open, setOpen] = useState(false);
  return (
    <button className={`pw-tag lvl ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      L{lvl} · {p.name}
      {open && <span className="pw-desc">{p.text}</span>}
    </button>
  );
}

// The full reference table from the rulebook.
function PowersGuide() {
  const rows = Object.entries(POWERS);
  return (
    <details className="panel guide">
      <summary><h3 style={{ display: 'inline' }}>Ideologue powers guide</h3></summary>
      <p className="muted small" style={{ margin: '8px 0 12px' }}>
        Powers stay active as long as you hold enough cards, can be used in the same turn they unlock, and stack with each other.
        The Jumla card counts as one extra card of the Ideologue it sits under.
      </p>
      <div className="guide-grid">
        {rows.map(([k, p]) => (
          <div key={k} className="guide-col">
            <h4>The {k[0].toUpperCase() + k.slice(1)}</h4>
            <p><b>Passive</b> · 1 <Coin kind={p.resource} size={16} /> {p.resourceName} for every 2 cards</p>
            <p><b>Level 3 · {p.l3.name}</b><br />{p.l3.text}</p>
            <p><b>Level 5 · {p.l5.name}</b><br />{p.l5.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

// Pops up on every phone the moment any player reaches 3 or 5 cards of an Ideologue.
function UnlockAlarm({ state }) {
  const seen = useRef(null);
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    const now = milestones(state);
    if (seen.current) {
      const fresh = [...now].filter((m) => !seen.current.has(m));
      if (fresh.length) {
        const items = fresh.map((m) => {
          const [pid, tid, lvl] = m.split('|');
          const t = state.ideologies.find((i) => i.id === tid);
          const p = POWERS[powerKey(t)];
          return {
            id: m,
            who: pid === state.me.id ? 'You' : state.players.find((x) => x.id === pid)?.name,
            mine: pid === state.me.id,
            ideo: t,
            lvl: Number(lvl),
            power: p?.[`l${lvl}`],
          };
        });
        setAlerts((a) => [...a, ...items]);
        try { navigator.vibrate?.([120, 60, 120]); } catch {}
        chime();
      }
    }
    seen.current = now;
  }, [state]);
  if (!alerts.length) return null;
  const a = alerts[0];
  return (
    <div className="unlock-overlay" role="alertdialog" aria-live="assertive" onClick={() => setAlerts((x) => x.slice(1))}>
      <div className="unlock-box" style={{ '--ideo': a.ideo?.color }} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Power unlocked</p>
        <h2>{a.ideo?.name} · {LEVEL_LABEL[a.lvl]}</h2>
        <p className="unlock-who">{a.mine ? 'You have' : `${a.who} has`} {a.lvl} {a.ideo?.name.replace(/^The /, '')} cards</p>
        {a.power && (
          <>
            <h3>{a.power.name}</h3>
            <p>{a.power.text}</p>
          </>
        )}
        <button className="btn primary block" onClick={() => setAlerts((x) => x.slice(1))}>
          {alerts.length > 1 ? `Got it (${alerts.length - 1} more)` : 'Got it'}
        </button>
      </div>
    </div>
  );
}

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'triangle';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {}
}

/* ---------------------------- Jumla card --------------------------- */

const JUMLA_QUOTE = "You're not telling lies. You're just telling the people what they want to hear.";
const JUMLA_TEXT =
  'This is an extra Ideology Card of your choice. Opponents can take this card by paying you as many resources as the Ideologue level this card is on. At the end of your turn, you may place this card under a different Ideologue.';

function JumlaCard({ ideology, small }) {
  return (
    <div className={`jcard ${small ? 'small' : ''}`} style={{ '--ideo': ideology?.color || '#8a8f98' }}>
      <div className="j-plaque">Jumla</div>
      <p className="j-quote">{JUMLA_QUOTE}</p>
      {!small && <p className="j-text">{JUMLA_TEXT}</p>}
      <div className="j-band">{ideology ? `Under ${ideology.name}` : 'Not placed yet'}</div>
    </div>
  );
}

// Ideologues the Jumla card can sit under (the four base ones, plus any custom types).
function IdeologyPicker({ state, value, onPick, exclude }) {
  return (
    <div className="ideo-pick">
      {state.ideologies.filter((t) => t.id !== exclude).map((t) => (
        <button key={t.id} className={`chip ${value === t.id ? 'open' : ''}`} style={{ '--ideo': t.color }} onClick={() => onPick(t.id)}>
          <span className="sym">{t.symbol}</span>
          {t.name.replace(/^The /, '')}
        </button>
      ))}
    </div>
  );
}

function JumlaPanel({ state, act }) {
  const j = state.jumla || {};
  const [mode, setMode] = useState(null); // 'claim' | 'move' | 'request' | 'discard'
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const name = (id) => state.players.find((p) => p.id === id)?.name || '';
  const ideo = (id) => state.ideologies.find((t) => t.id === id);
  const meId = state.me.id;
  const isMyTurn = state.activePlayerId === meId;

  async function run(jumlaAction, ideologyId) {
    setBusy(true);
    const ok = await act('jumla', { jumlaAction, ideologyId });
    setBusy(false);
    if (ok) { setMode(null); setPick(null); }
  }

  if (!j.enabled) {
    return (
      <div className="panel jumla-panel">
        <h3>Jumla card</h3>
        <p className="muted small">The Jumla card needs a one-time database update (supabase/migration-powers-jumla.sql).</p>
      </div>
    );
  }

  const holder = j.holderId;
  const under = ideo(j.ideologyId);
  const price = holder ? (effectiveCounts(state, holder)[j.ideologyId] || 1) : 0;
  const chooser = (label, action, exclude) => (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small">{label}</p>
      <IdeologyPicker state={state} value={pick} onPick={setPick} exclude={exclude} />
      <div className="row">
        <button className="btn primary" disabled={!pick || busy} onClick={() => run(action, pick)}>Confirm</button>
        <button className="btn ghost" onClick={() => { setMode(null); setPick(null); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="panel jumla-panel stack">
      <div className="spread">
        <h3>Jumla card</h3>
        {holder && <span className="tag">{holder === meId ? 'You hold it' : `Held by ${name(holder)}`}</span>}
      </div>

      {!holder && (
        mode === 'claim'
          ? chooser('Which Ideologue do you want to place it under? It counts as one extra card there.', 'claim')
          : (
            <>
              <p className="muted small">Drew the Jumla card from the Conspiracy deck? Add it to your collection here.</p>
              <button className="btn" onClick={() => setMode('claim')}>I got the Jumla card</button>
            </>
          )
      )}

      {holder && <JumlaCard ideology={under} />}

      {holder && (
        <p className="small center">
          Sits under <b>{under?.name}</b> at level <b>{price}</b>, so taking it costs <b>{price} resource{price === 1 ? '' : 's'}</b> paid to {holder === meId ? 'you' : name(holder)}.
        </p>
      )}

      {holder === meId && !j.buyerId && (
        mode === 'move' ? chooser('Move it under which Ideologue?', 'move', j.ideologyId)
        : mode === 'discard' ? (
          <div className="notice stack">
            <p>Return the Jumla card to the box? It will leave your collection.</p>
            <div className="row">
              <button className="btn danger" disabled={busy} onClick={() => run('discard')}>Yes, discard</button>
              <button className="btn ghost" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn sm" disabled={!isMyTurn} onClick={() => setMode('move')}>Move to another Ideologue</button>
            <button className="btn ghost sm" onClick={() => setMode('discard')}>Discard</button>
            {!isMyTurn && <span className="muted small">You can move it at the end of your turn.</span>}
          </div>
        )
      )}

      {holder && holder !== meId && !j.buyerId && (
        mode === 'request'
          ? chooser(`If ${name(holder)} agrees, you pay them ${price} resource${price === 1 ? '' : 's'}. Where will you place it?`, 'request')
          : <button className="btn" onClick={() => setMode('request')}>Ask to take it ({price} resource{price === 1 ? '' : 's'})</button>
      )}

      {j.buyerId === meId && (
        <div className="notice stack">
          <p>Waiting for {name(holder)} to agree. Hand over <b>{j.price} resource{j.price === 1 ? '' : 's'}</b> on the table; they accept once they have them.</p>
          <button className="btn ghost sm" disabled={busy} onClick={() => run('cancel')}>Withdraw request</button>
        </div>
      )}
      {j.buyerId && j.buyerId !== meId && holder !== meId && (
        <p className="muted small">{name(j.buyerId)} has asked {name(holder)} for the Jumla card.</p>
      )}
    </div>
  );
}

// Shown at the top for the holder whenever someone asks for the card: both players must agree.
function JumlaRequestBanner({ state, act }) {
  const j = state.jumla || {};
  const [busy, setBusy] = useState(false);
  if (!j.buyerId || j.holderId !== state.me.id) return null;
  const buyer = state.players.find((p) => p.id === j.buyerId)?.name;
  const to = state.ideologies.find((t) => t.id === j.buyerIdeologyId)?.name;
  const go = async (a) => { setBusy(true); await act('jumla', { jumlaAction: a }); setBusy(false); };
  return (
    <div className="jumla-req">
      <p>
        <b>{buyer}</b> wants your Jumla card (to place under {to}) for <b>{j.price} resource{j.price === 1 ? '' : 's'}</b>.
        Accept only once you have received them.
      </p>
      <div className="row">
        <button className="btn primary sm" disabled={busy} onClick={() => go('accept')}>Accept — I got paid</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => go('decline')}>Decline</button>
      </div>
    </div>
  );
}
