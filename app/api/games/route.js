import { rpc, hashToken, errorResponse, readJson, AppError } from '@/lib/server';

export const dynamic = 'force-dynamic';

// Create a new game. The creator becomes the host (seat 1).
export async function POST(request) {
  try {
    const body = await readJson(request);
    const maxPlayers = Number(body.maxPlayers);
    if (!Number.isInteger(maxPlayers)) throw new AppError('BAD_PLAYER_COUNT');
    const rows = await rpc('create_game', {
      p_deck_id: String(body.deckId || ''),
      p_max_players: maxPlayers,
      p_host_name: String(body.name || ''),
      p_token_hash: hashToken(body.token),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Response.json({ code: row.game_code, playerId: row.player_id });
  } catch (e) {
    if (String(e.message).includes('invalid input syntax for type uuid')) return errorResponse(new AppError('DECK_NOT_AVAILABLE'));
    return errorResponse(e);
  }
}
