'use client';
// Browser-side helpers: device identity, API calls and live updates.
import { createClient } from '@supabase/supabase-js';

let _sb;
export function supabase() {
  if (!_sb) {
    _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return _sb;
}

// A secret key per game, stored on this device. It's how the app recognises
// you after a refresh without any login.
function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getToken(code) {
  const key = `shasn:token:${code.toUpperCase()}`;
  let t = localStorage.getItem(key);
  if (!t) {
    t = randomToken();
    localStorage.setItem(key, t);
  }
  return t;
}

export function hasToken(code) {
  return !!localStorage.getItem(`shasn:token:${code.toUpperCase()}`);
}

export function forgetToken(code) {
  localStorage.removeItem(`shasn:token:${code.toUpperCase()}`);
}

export function newToken() {
  return randomToken();
}

export function saveToken(code, token) {
  localStorage.setItem(`shasn:token:${code.toUpperCase()}`, token);
}

export function rememberGame(code, name) {
  try {
    localStorage.setItem('shasn:lastGame', JSON.stringify({ code: code.toUpperCase(), name, at: Date.now() }));
  } catch {}
}

export function lastGame() {
  try {
    const v = JSON.parse(localStorage.getItem('shasn:lastGame') || 'null');
    if (v && Date.now() - v.at < 1000 * 60 * 60 * 24 * 2) return v;
  } catch {}
  return null;
}

export async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.code = data.code;
    throw err;
  }
  return data;
}
