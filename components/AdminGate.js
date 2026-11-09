'use client';
// Wraps every admin page: shows a login form until an approved admin signs in.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/client';

export default function AdminGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(null);
      return;
    }
    supabase()
      .rpc('is_admin')
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (session === undefined) return <main className="page narrow muted center">Loading…</main>;
  if (!session) return <Login />;
  if (isAdmin === null) return <main className="page narrow muted center">Checking permissions…</main>;
  if (!isAdmin) {
    return (
      <main className="page narrow stack center" style={{ paddingTop: '12vh' }}>
        <h2>Not an administrator</h2>
        <p className="muted">
          You are signed in as {session.user.email}, but this email is not on the administrator list.
        </p>
        <button className="btn block" onClick={() => supabase().auth.signOut()}>Sign out</button>
      </main>
    );
  }
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="spread">
          <Link href="/admin" className="eyebrow" style={{ textDecoration: 'none' }}>Campaign Admin</Link>
          <span className="row small muted">
            {session.user.email}
            <button className="btn sm ghost" onClick={() => supabase().auth.signOut()}>Sign out</button>
          </span>
        </div>
      </div>
      {children}
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    setBusy(false);
  }

  return (
    <main className="page narrow">
      <Link href="/" className="muted small">← Home</Link>
      <h1 style={{ margin: '14px 0 18px' }}>Admin Sign In</h1>
      <form className="panel stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Admin access is for managing campaign decks only. Players never need to sign in.</p>
      </form>
    </main>
  );
}
