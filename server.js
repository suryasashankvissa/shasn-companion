// Server-only helpers. This file uses the SECRET service key and must never
// be imported by a browser component.
import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _db;
export function db() {
  if (!URL || !SERVICE_KEY) {
    throw new AppError('NOT_CONFIGURED', 503);
  }
  if (!_db) {
    _db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _db;
}

export function hashToken(token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) {
    throw new AppError('BAD_TOKEN');
  }
  return createHash('sha256').update(token).digest('hex');
}

export class AppError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = {
  GAME_NOT_FOUND: 'No game found with that code. Check the code and try again.',
  NAME_REQUIRED: 'Please enter your name.',
  NAME_TOO_LONG: 'Names can be at most 24 characters.',
  NAME_TAKEN: 'Someone in this game already uses that name.',
  GAME_STARTED: 'This game has already started. Only existing players can rejoin.',
  GAME_FULL: 'This game is full.',
  BAD_PLAYER_COUNT: 'Choose between 2 and 8 players.',
  DECK_NOT_AVAILABLE: 'That campaign deck is not available.',
  DECK_EMPTY: 'This campaign deck has no complete questions yet.',
  NOT_A_PLAYER: 'You are not a player in this game.',
  HOST_ONLY: 'Only the host can do that.',
  NEED_MORE_PLAYERS: 'At least 2 players are needed to start.',
  NOT_YOUR_TURN: "It's not your turn.",
  ALREADY_ANSWERED: 'This question has already been answered.',
  QUESTION_CHANGED: 'The question has changed. Please look again.',
  NOT_ANSWERED_YET: 'The active player has not answered yet.',
  GAME_NOT_PLAYING: 'The game is not in progress.',
  BAD_CHOICE: 'Please choose Yes or No.',
  BAD_TOKEN: 'Your device identity is invalid. Please rejoin the game.',
  BAD_REQUEST: 'Something about that request was wrong.',
  NOT_CONFIGURED: 'The app is not connected to its database yet (Supabase keys missing).',
};

export function errorResponse(err) {
  let code = err?.code && MESSAGES[err.code] ? err.code : null;
  if (!code) {
    const text = String(err?.message || '');
    code = Object.keys(MESSAGES).find((k) => text.includes(k)) || null;
  }
  if (!code) {
    console.error(err);
    return Response.json({ error: 'Something went wrong. Please try again.', code: 'UNKNOWN' }, { status: 500 });
  }
  const status = err?.status && err.status !== 400 ? err.status : code === 'GAME_NOT_FOUND' ? 404 : code === 'HOST_ONLY' || code === 'NOT_YOUR_TURN' || code === 'NOT_A_PLAYER' ? 403 : 400;
  return Response.json({ error: MESSAGES[code], code }, { status });
}

export async function rpc(fn, args) {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// Tell every phone in a game "something changed — fetch the latest state".
// Uses Supabase Realtime broadcast over plain HTTPS.
export async function notifyGame(code) {
  try {
    await fetch(`${URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        // New-style secret keys (sb_secret_...) are not JWTs, so only legacy keys go in Authorization.
        ...(SERVICE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: `game-${code}`, event: 'changed', payload: { at: Date.now() }, private: false }],
      }),
    });
  } catch (e) {
    // Not fatal: phones also re-check every few seconds.
    console.error('broadcast failed', e);
  }
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new AppError('BAD_REQUEST');
  }
}

export function normCode(code) {
  return String(code || '').trim().toUpperCase();
}
