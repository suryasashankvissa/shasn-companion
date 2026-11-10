'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AdminGate from '@/components/AdminGate';
import DeckSwatch from '@/components/DeckSwatch';
import { supabase } from '@/lib/client';

export default function DeckEditorPage() {
  return (
    <AdminGate>
      <DeckEditor />
    </AdminGate>
  );
}

const QUESTION_FIELDS = [
  'number', 'text', 'sensitive',
  'yes_label', 'yes_ideology_id', 'yes_card_text', 'yes_resources', 'yes_recipient',
  'no_label', 'no_ideology_id', 'no_card_text', 'no_resources', 'no_recipient',
];

const RECIPIENTS = [
  { value: 'answerer', label: 'The player who answered (standard rule)' },
  { value: 'next', label: 'The next player in turn order' },
  { value: 'previous', label: 'The previous player in turn order' },
];

function isComplete(q) {
  return q.text.trim() && q.yes_ideology_id && q.no_ideology_id;
}

function DeckEditor() {
  const { id } = useParams();
  const router = useRouter();
  const [deck, setDeck] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [ideologies, setIdeologies] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sb = supabase();
    const [d, q, i] = await Promise.all([
      sb.from('decks').select('*').eq('id', id).maybeSingle(),
      sb.from('questions').select('*').eq('deck_id', id).order('number').order('created_at'),
      sb.from('ideology_types').select('id,name,color,symbol').order('sort'),
    ]);
    if (d.error || !d.data) return setError(d.error?.message || 'Deck not found.');
    setDeck(d.data);
    setQuestions(q.data || []);
    setIdeologies(i.data || []);
    setRemoved([]);
    setDirty(false);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setDeckField(field, value) {
    setDeck((d) => ({ ...d, [field]: value }));
    setDirty(true);
  }
  function setQ(idx, field, value) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, [field]: value, _dirty: true } : q)));
    setDirty(true);
  }
  function addQuestion() {
    const maxNo = questions.reduce((m, q) => Math.max(m, Number(q.number) || 0), 0);
    setQuestions((qs) => [
      ...qs,
      {
        _key: crypto.randomUUID(), _new: true, number: maxNo + 1, text: '', sensitive: false,
        yes_label: 'Yes', yes_ideology_id: '', yes_card_text: '', yes_resources: '', yes_recipient: 'answerer',
        no_label: 'No', no_ideology_id: '', no_card_text: '', no_resources: '', no_recipient: 'answerer',
      },
    ]);
    setDirty(true);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  }
  function removeQuestion(idx) {
    const q = questions[idx];
    if ((q.text || '').trim() && !confirm('Delete this question?')) return;
    if (!q._new) setRemoved((r) => [...r, q.id]);
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function save(newStatus) {
    setError('');
    setMsg('');
    const status = newStatus || deck.status;
    if (!deck.name.trim()) return setError('The deck needs a name.');
    if (status === 'published') {
      const complete = questions.filter(isComplete).length;
      if (complete === 0) return setError('Add at least one complete question (text plus an ideology for Yes and No) before publishing.');
      const incomplete = questions.length - complete;
      if (incomplete > 0 && !confirm(`${incomplete} question(s) are incomplete and will be skipped during games. Publish anyway?`)) return;
    }
    setBusy(true);
    const sb = supabase();
    try {
      const { error: de } = await sb
        .from('decks')
        .update({
          name: deck.name.trim(),
          description: deck.description,
          cover_color: deck.cover_color,
          cover_image_url: deck.cover_image_url.trim(),
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (de) throw de;
      if (removed.length) {
        const { error } = await sb.from('questions').delete().in('id', removed);
        if (error) throw error;
      }
      for (const q of questions.filter((q) => q._new || q._dirty)) {
        const payload = { deck_id: id };
        for (const f of QUESTION_FIELDS) payload[f] = q[f];
        payload.number = Number(payload.number) || 0;
        payload.yes_ideology_id = payload.yes_ideology_id || null;
        payload.no_ideology_id = payload.no_ideology_id || null;
        const { error } = q._new
          ? await sb.from('questions').insert(payload)
          : await sb.from('questions').update(payload).eq('id', q.id);
        if (error) throw error;
      }
      await load();
      setMsg(status === 'published' ? 'Saved and published — available for new games.' : 'Draft saved.');
    } catch (e) {
      setError(e.message || String(e));
    }
    setBusy(false);
  }

  async function deleteDeck() {
    if (!confirm(`Permanently delete “${deck.name}” and all its questions? Games using it will also be removed.`)) return;
    const { error } = await supabase().from('decks').delete().eq('id', id);
    if (error) return setError(error.message);
    router.push('/admin');
  }

  if (!deck) return <main className="page muted">{error || 'Loading…'}</main>;

  const completeCount = questions.filter(isComplete).length;

  return (
    <main className="page stack">
      <Link href="/admin" className="muted small">← All decks</Link>

      <section className="panel stack">
        <div className="spread">
          <h1 style={{ fontSize: '1.6rem' }}>Edit deck</h1>
          <span className={`status-pill ${deck.status}`}>{deck.status}</span>
        </div>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <DeckSwatch deck={{ name: deck.name, coverColor: deck.cover_color, coverImageUrl: deck.cover_image_url }} large />
          <div className="stack" style={{ flex: 1, minWidth: 220 }}>
            <label className="field"><span>Deck name</span><input value={deck.name} onChange={(e) => setDeckField('name', e.target.value)} /></label>
            <label className="field"><span>Description</span><textarea value={deck.description} onChange={(e) => setDeckField('description', e.target.value)} /></label>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field"><span>Theme colour</span><input type="color" value={deck.cover_color} onChange={(e) => setDeckField('cover_color', e.target.value)} /></label>
              <label className="field" style={{ flex: 1, minWidth: 200 }}>
                <span>Cover image web address (optional)</span>
                <input value={deck.cover_image_url} placeholder="https://…" onChange={(e) => setDeckField('cover_image_url', e.target.value)} />
              </label>
            </div>
          </div>
        </div>
      </section>

      <div className="spread">
        <h2>Questions ({questions.length})</h2>
        <span className="muted small">{completeCount} complete · only complete questions are used in games</span>
      </div>

      {ideologies.length === 0 && (
        <p className="notice">No ideology types exist yet. <Link href="/admin/ideologies">Create some first</Link>.</p>
      )}

      {questions.map((q, idx) => (
        <article key={q.id || q._key} className={`admin-q stack ${isComplete(q) ? '' : 'incomplete'}`}>
          <div className="spread">
            <label className="row small muted">
              Card no.
              <input type="number" style={{ width: 90 }} value={q.number} onChange={(e) => setQ(idx, 'number', e.target.value)} />
            </label>
            <button className="btn sm danger" onClick={() => removeQuestion(idx)}>Delete</button>
          </div>
          <label className="row small">
            <input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={!!q.sensitive} onChange={(e) => setQ(idx, 'sensitive', e.target.checked)} />
            Sensitive topic (shows the red !! badge)
          </label>
          <label className="field">
            <span>Question text</span>
            <textarea value={q.text} onChange={(e) => setQ(idx, 'text', e.target.value)} placeholder="e.g. Should the government…?" />
          </label>
          <div className="grid-2">
            {['yes', 'no'].map((side) => (
              <div key={side} className="outcome stack">
                <h3>{side === 'yes' ? 'YES outcome' : 'NO outcome'}</h3>
                <label className="field">
                  <span>Answer text shown on the button (optional)</span>
                  <input value={q[`${side}_label`]} onChange={(e) => setQ(idx, `${side}_label`, e.target.value)} />
                </label>
                <label className="field">
                  <span>Ideology awarded</span>
                  <select value={q[`${side}_ideology_id`] || ''} onChange={(e) => setQ(idx, `${side}_ideology_id`, e.target.value)}>
                    <option value="">— choose —</option>
                    {ideologies.map((i) => (
                      <option key={i.id} value={i.id}>{i.symbol} {i.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Answer text read aloud, e.g. “Yes. Democracy is not a game.” (optional)</span>
                  <textarea value={q[`${side}_card_text`]} onChange={(e) => setQ(idx, `${side}_card_text`, e.target.value)} />
                </label>
                <label className="field">
                  <span>Resources to collect on the board (optional)</span>
                  <input value={q[`${side}_resources`]} placeholder="e.g. 2 Funds, 1 Media" onChange={(e) => setQ(idx, `${side}_resources`, e.target.value)} />
                </label>
                <label className="field">
                  <span>Who receives this card</span>
                  <select value={q[`${side}_recipient`]} onChange={(e) => setQ(idx, `${side}_recipient`, e.target.value)}>
                    {RECIPIENTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </article>
      ))}

      <button className="btn block" onClick={addQuestion}>+ Add question</button>

      <div className="panel stack" style={{ position: 'sticky', bottom: 10, zIndex: 5 }}>
        {error && <p className="error">{error}</p>}
        {msg && !dirty && <p className="notice">{msg}</p>}
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => save('draft')}>
            {deck.status === 'published' ? 'Save & unpublish (draft)' : 'Save draft'}
          </button>
          <button className="btn primary" disabled={busy} onClick={() => save('published')}>
            {deck.status === 'published' ? 'Save changes (stays published)' : 'Save & publish'}
          </button>
          {dirty && <span className="muted small">Unsaved changes</span>}
          <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={deleteDeck}>Delete deck</button>
        </div>
      </div>
    </main>
  );
}
