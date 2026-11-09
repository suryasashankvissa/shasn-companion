// End-to-end rules test: simulates several players hitting the running app
// at the same time. Run with the app running:
//   BASE_URL=http://localhost:3000 npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const tok = () => randomBytes(24).toString('hex');

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
const state = (code, token) => call(`/api/games/${code}/state`, { token });

async function newGame(n = 4) {
  const { decks } = await call('/api/decks');
  assert.ok(decks.length > 0, 'needs at least one published deck (run seed.sql)');
  const players = [{ name: 'Host', token: tok() }];
  const created = await call('/api/games', { name: 'Host', maxPlayers: n, deckId: decks[0].id, token: players[0].token });
  assert.ok(created.code, JSON.stringify(created));
  for (let i = 1; i < n; i++) {
    const p = { name: `P${i + 1}`, token: tok() };
    const r = await call(`/api/games/${created.code}/join`, p);
    assert.ok(r.playerId, JSON.stringify(r));
    players.push(p);
  }
  return { code: created.code, players };
}

test('joining: bad code, duplicate name, full game, started game', async () => {
  assert.equal((await call('/api/games/ZZZZZ/join', { name: 'X', token: tok() })).code, 'GAME_NOT_FOUND');
  const { code, players } = await newGame(3);
  assert.equal((await call(`/api/games/${code}/join`, { name: 'host', token: tok() })).code, 'NAME_TAKEN');
  assert.equal((await call(`/api/games/${code}/join`, { name: 'Extra', token: tok() })).code, 'GAME_FULL');
  // non-host cannot start
  assert.equal((await call(`/api/games/${code}/start`, { token: players[1].token })).code, 'HOST_ONLY');
  assert.equal((await call(`/api/games/${code}/start`, { token: players[0].token })).status, 'playing');
  assert.equal((await call(`/api/games/${code}/join`, { name: 'Late', token: tok() })).code, 'GAME_STARTED');
});

test('rotation, permissions, hidden outcome, collections, host-only progression', async () => {
  const { code, players } = await newGame(4);
  await call(`/api/games/${code}/start`, { token: players[0].token });

  const expectedOrder = ['Host', 'P2', 'P3', 'P4', 'Host', 'P2'];
  const tally = {};
  for (let turn = 0; turn < expectedOrder.length; turn++) {
    const s = await state(code, players[0].token);
    const active = s.players.find((p) => p.id === s.activePlayerId);
    assert.equal(active.name, expectedOrder[turn], `turn ${turn + 1} active player`);
    assert.equal(s.result, null, 'outcome must be hidden before answering');
    assert.ok(!JSON.stringify(s.question).includes('ideology'), 'question payload must not leak ideology');

    const activeP = players.find((p) => p.name === active.name);
    const others = players.filter((p) => p !== activeP);

    // Another player cannot answer
    assert.equal((await call(`/api/games/${code}/answer`, { token: others[0].token, questionId: s.question.id, choice: 'yes' })).code, 'NOT_YOUR_TURN');
    // Host cannot advance before an answer
    assert.equal((await call(`/api/games/${code}/next`, { token: players[0].token })).code, 'NOT_ANSWERED_YET');

    // Active player double-taps both answers at once: exactly one wins
    const choice = turn % 2 ? 'no' : 'yes';
    const [a, b] = await Promise.all([
      call(`/api/games/${code}/answer`, { token: activeP.token, questionId: s.question.id, choice }),
      call(`/api/games/${code}/answer`, { token: activeP.token, questionId: s.question.id, choice: choice === 'yes' ? 'no' : 'yes' }),
    ]);
    const ok = [a, b].filter((r) => r.status === 'playing');
    assert.equal(ok.length, 1, 'exactly one answer accepted');
    assert.ok([a, b].some((r) => r.code === 'ALREADY_ANSWERED'));

    // Everyone sees the same revealed result
    const views = await Promise.all(players.map((p) => state(code, p.token)));
    const r0 = views[0].result;
    assert.ok(r0 && r0.card.ideology_name, 'result revealed');
    for (const v of views) assert.deepEqual(v.result, r0);
    assert.equal(r0.answererId, active.id);
    assert.equal(r0.recipientId, active.id, 'standard rule: answerer keeps the card');

    tally[active.id] = tally[active.id] || {};
    const key = r0.card.ideology_id;
    tally[active.id][key] = (tally[active.id][key] || 0) + 1;
    assert.deepEqual(views[2].collections[active.id], tally[active.id], 'collection visible to everyone & correct');

    // Non-host cannot advance
    assert.equal((await call(`/api/games/${code}/next`, { token: players[1].token })).code, 'HOST_ONLY');
    assert.equal((await call(`/api/games/${code}/next`, { token: players[0].token })).status, 'playing');
  }
});

test('reconnection: same device restores state; rejoin by name keeps seat without duplicates', async () => {
  const { code, players } = await newGame(3);
  await call(`/api/games/${code}/start`, { token: players[0].token });
  const before = await state(code, players[2].token);
  assert.equal(before.me.name, 'P3');

  // "Refresh": same token → same player
  const again = await state(code, players[2].token);
  assert.equal(again.me.id, before.me.id);

  // New device / cleared browser: reclaim by name
  const newTok = tok();
  const r = await call(`/api/games/${code}/join`, { name: 'p3', token: newTok, reclaim: true });
  assert.equal(r.reclaimed, true);
  const s = await state(code, newTok);
  assert.equal(s.me.id, before.me.id);
  assert.equal(s.me.seat, 3);
  assert.equal(s.players.length, 3, 'no duplicate player');
  // Old token no longer works
  assert.equal((await state(code, players[2].token)).code, 'NOT_A_PLAYER');
});

test('host redraw: only before answering, same player keeps the turn', async () => {
  const { code, players } = await newGame(2);
  await call(`/api/games/${code}/start`, { token: players[0].token });
  const s1 = await state(code, players[0].token);
  assert.equal((await call(`/api/games/${code}/redraw`, { token: players[1].token })).code, 'HOST_ONLY');
  const s2 = await call(`/api/games/${code}/redraw`, { token: players[0].token });
  assert.equal(s2.activePlayerId, s1.activePlayerId);
  assert.equal(s2.questionSeq, s1.questionSeq);
  // Stale question id is rejected
  assert.equal((await call(`/api/games/${code}/answer`, { token: players[0].token, questionId: s1.question.id, choice: 'yes' })).code === 'QUESTION_CHANGED' || s1.question.id === s2.question.id, true);
  await call(`/api/games/${code}/answer`, { token: players[0].token, questionId: s2.question.id, choice: 'yes' });
  assert.equal((await call(`/api/games/${code}/redraw`, { token: players[0].token })).code, 'ALREADY_ANSWERED');
});

test('deck reshuffles instead of running out', async () => {
  const { code, players } = await newGame(2);
  await call(`/api/games/${code}/start`, { token: players[0].token });
  const { decks } = await call('/api/decks');
  const n = decks[0].questionCount + 2;
  for (let i = 0; i < n; i++) {
    const s = await state(code, players[0].token);
    const activeP = players.find((p) => s.players.find((x) => x.id === s.activePlayerId).name === p.name);
    await call(`/api/games/${code}/answer`, { token: activeP.token, questionId: s.question.id, choice: 'yes' });
    const nx = await call(`/api/games/${code}/next`, { token: players[0].token });
    assert.equal(nx.status, 'playing');
  }
  const s = await state(code, players[0].token);
  assert.ok(s.reshuffles >= 1);
});

test('admin protection: anonymous users cannot write decks', async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return; // needs env vars
  const h = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const ins = await fetch(`${url}/rest/v1/decks`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'hack' }) });
  assert.ok(ins.status === 401 || ins.status === 403, `insert blocked (got ${ins.status})`);
  const read = await fetch(`${url}/rest/v1/games?select=*`, { headers: h });
  const rows = read.ok ? await read.json() : [];
  assert.equal(rows.length, 0, 'games table not readable');
  const q = await fetch(`${url}/rest/v1/questions?select=*`, { headers: h });
  const qrows = q.ok ? await q.json() : [];
  assert.equal(qrows.length, 0, 'hidden outcomes not readable by players');
  const rpc = await fetch(`${url}/rest/v1/rpc/next_question`, { method: 'POST', headers: h, body: JSON.stringify({ p_code: 'X', p_token_hash: 'x' }) });
  assert.ok(rpc.status >= 400, 'game functions not callable directly');
});
