import 'server-only';
import { db, AppError } from './server';

// Builds everything one player's screen needs. Hidden outcomes are NEVER
// included until the active player has answered.
export async function loadGameState(code, tokenHash) {
  const sb = db();
  const { data: game, error } = await sb.from('games').select('*').eq('code', code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!game) throw new AppError('GAME_NOT_FOUND', 404);

  const [{ data: players }, { data: deck }, { data: turns }, { data: ideologies }] = await Promise.all([
    sb.from('players').select('id,name,seat,is_host,token_hash').eq('game_id', game.id).order('seat'),
    sb.from('decks').select('id,name,description,cover_color,cover_image_url').eq('id', game.deck_id).maybeSingle(),
    sb.from('turns').select('seq,question_id,answerer_id,recipient_id,choice,snapshot').eq('game_id', game.id).order('seq'),
    sb.from('ideology_types').select('id,name,color,symbol,sort').order('sort'),
  ]);

  const me = (players || []).find((p) => p.token_hash === tokenHash);
  if (!me) throw new AppError('NOT_A_PLAYER', 403);

  let question = null;
  let result = null;
  if (game.status === 'playing' && game.current_question_id) {
    const { data: q } = await sb
      .from('questions')
      .select('*')
      .eq('id', game.current_question_id)
      .maybeSingle();
    // Answer texts are read aloud before choosing; the ideology (colour, name) and resources stay secret.
    if (q)
      question = {
        id: q.id, number: q.number, text: q.text, yesLabel: q.yes_label, noLabel: q.no_label,
        yesText: q.yes_card_text || '', noText: q.no_card_text || '', sensitive: !!q.sensitive,
      };
    const t = (turns || []).find((t) => t.seq === game.question_seq);
    if (t) {
      result = {
        choice: t.choice,
        answererId: t.answerer_id,
        recipientId: t.recipient_id,
        card: t.snapshot,
      };
    }
  }

  // Which past questions were marked sensitive (for the red badge on stored cards).
  const qids = [...new Set((turns || []).map((t) => t.question_id).filter(Boolean))];
  const sensitive = new Set();
  if (qids.length) {
    const { data: qs } = await sb.from('questions').select('*').in('id', qids);
    for (const q of qs || []) if (q.sensitive) sensitive.add(q.id);
  }
  if (result) result.card = { ...result.card, sensitive: sensitive.has(game.current_question_id) };

  // Collections are calculated from the answer history, so they can't drift.
  const collections = {};
  const cards = {};
  for (const p of players || []) { collections[p.id] = {}; cards[p.id] = []; }
  const extraTypes = new Map();
  for (const t of turns || []) {
    const s = t.snapshot || {};
    const key = s.ideology_id || s.ideology_name;
    const bucket = collections[t.recipient_id];
    if (!bucket) continue;
    // Cards stay hidden until the answer is revealed (answered turns only exist once answered).
    cards[t.recipient_id].push({ seq: t.seq, choice: t.choice, key, card: { ...s, sensitive: sensitive.has(t.question_id) } });
    bucket[key] = (bucket[key] || 0) + 1;
    if (!(ideologies || []).some((i) => i.id === key) && !extraTypes.has(key)) {
      extraTypes.set(key, { id: key, name: s.ideology_name, color: s.ideology_color, symbol: s.ideology_symbol, sort: 999 });
    }
  }

  const activePlayer = (players || []).find((p) => p.seat === game.active_seat) || null;

  return {
    code: game.code,
    status: game.status,
    maxPlayers: game.max_players,
    questionSeq: game.question_seq,
    reshuffles: Math.max(0, game.reshuffles || 0),
    deck: deck
      ? { name: deck.name, description: deck.description, coverColor: deck.cover_color, coverImageUrl: deck.cover_image_url }
      : { name: 'Unknown deck', description: '' },
    players: (players || []).map((p) => ({ id: p.id, name: p.name, seat: p.seat, isHost: p.is_host })),
    me: { id: me.id, name: me.name, seat: me.seat, isHost: me.is_host },
    activePlayerId: activePlayer?.id || null,
    question,
    result,
    ideologies: [...(ideologies || []), ...extraTypes.values()],
    collections,
    cards,
    winnerId: game.winner_id || null,
    history: (turns || [])
      .slice(-12)
      .reverse()
      .map((t) => ({
        seq: t.seq,
        answererId: t.answerer_id,
        recipientId: t.recipient_id,
        choice: t.choice,
        ideologyName: t.snapshot?.ideology_name,
        ideologyColor: t.snapshot?.ideology_color,
        question: t.snapshot?.question,
      })),
  };
}
