import { rpc, hashToken, errorResponse, readJson, notifyGame, normCode, AppError } from '@/lib/server';
import { loadGameState } from '@/lib/gameState';

export const dynamic = 'force-dynamic';

// All in-game actions. Every rule (whose turn, host-only, one answer per
// question) is enforced inside the database functions, not here.
export async function POST(request, { params }) {
  try {
    const { code: rawCode, action } = await params;
    const code = normCode(rawCode);
    const body = await readJson(request);
    const tokenHash = hashToken(body.token);

    switch (action) {
      case 'state':
        return Response.json(await loadGameState(code, tokenHash));

      case 'join': {
        const rows = await rpc('join_game', {
          p_code: code,
          p_name: String(body.name || ''),
          p_token_hash: tokenHash,
          p_reclaim: body.reclaim === true,
        });
        const row = Array.isArray(rows) ? rows[0] : rows;
        await notifyGame(code);
        return Response.json({ playerId: row.player_id, reclaimed: row.reclaimed });
      }

      case 'start':
        await rpc('start_game', { p_code: code, p_token_hash: tokenHash });
        break;

      case 'answer':
        await rpc('answer_question', {
          p_code: code,
          p_token_hash: tokenHash,
          p_question_id: String(body.questionId || ''),
          p_choice: String(body.choice || ''),
        });
        break;

      case 'next':
        await rpc('next_question', { p_code: code, p_token_hash: tokenHash });
        break;

      case 'redraw':
        await rpc('redraw_question', { p_code: code, p_token_hash: tokenHash });
        break;

      case 'end':
        await rpc('end_game', { p_code: code, p_token_hash: tokenHash, p_winner: String(body.winnerId || '') });
        break;

      case 'jumla':
        await rpc('jumla', {
          p_code: code,
          p_token_hash: tokenHash,
          p_action: String(body.jumlaAction || ''),
          p_ideology: body.ideologyId ? String(body.ideologyId) : null,
        });
        break;

      default:
        throw new AppError('BAD_REQUEST', 404);
    }

    await notifyGame(code);
    return Response.json(await loadGameState(code, tokenHash));
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('invalid input syntax for type uuid')) return errorResponse(new AppError('QUESTION_CHANGED'));
    if (msg.includes('turns_game_id_seq_key')) return errorResponse(new AppError('ALREADY_ANSWERED'));
    if (msg.includes('Could not find the function') || msg.includes('does not exist')) return errorResponse(new AppError('NEEDS_DB_UPDATE'));
    if (msg.includes('players_unique_name') || msg.includes('players_game_id_seat_key')) return errorResponse(new AppError('NAME_TAKEN'));
    return errorResponse(e);
  }
}
