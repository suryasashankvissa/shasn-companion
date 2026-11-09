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
      .select('id,number,text,yes_label,no_label')
      .eq('id', game.current_question_id)
      .maybeSingle();
    if (q) question = { id: q.id, number: q.number, text: q.text, yesLabel: q.yes_label, noLabel: q.no_label };
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

  // Collections are calculated from the answer history, so they can't drift.
  const collections = {};
  for (const p of players || []) collections[p.id] = {};
  const extraTypes = new Map();
  for (const t of turns || []) {
    const s = t.snapshot || {};
    const key = s.ideology_id || s.ideology_name;
    const bucket = collections[t.recipient_id];
    if (!bucket) continue;
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
