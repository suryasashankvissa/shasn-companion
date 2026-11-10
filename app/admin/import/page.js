'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminGate from '@/components/AdminGate';
import { supabase } from '@/lib/client';

export default function ImportPage() {
  return (
    <AdminGate>
      <Importer />
    </AdminGate>
  );
}

const COLUMNS = [
  'number', 'question', 'sensitive',
  'yes_ideology', 'yes_card_text', 'yes_resources', 'yes_recipient',
  'no_ideology', 'no_card_text', 'no_resources', 'no_recipient',
];
const RECIPIENTS = ['answerer', 'next', 'previous'];

// Small CSV reader: handles quotes, commas inside quotes, line breaks inside quotes,
// and semicolon-separated files (some Excel setups save that way).
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function Importer() {
  const router = useRouter();
  const [ideologies, setIdeologies] = useState([]);
  const [name, setName] = useState('');
  const [rows, setRows] = useState(null);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase().from('ideology_types').select('id,name').order('sort').then(({ data }) => setIdeologies(data || []));
  }, []);

  function downloadTemplate() {
    const names = ideologies.map((i) => i.name);
    const a = names[0] || 'IdeologyA';
    const b = names[1] || a;
    const lines = [
      COLUMNS.join(','),
      `1,"Should the city build a new park?",no,${a},"The park opens to cheers.","2 Funds",answerer,${b},"Citizens grumble.","",answerer`,
    ];
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'shasn-deck-template.csv';
    link.click();
  }

  async function onFile(e) {
    setError(''); setRows(null); setProblems([]);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!name) setName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    const table = parseCsv(await file.text());
    if (table.length < 2) return setError('The file needs a header row and at least one question.');
    const header = table[0].map((h) => h.trim().toLowerCase());
    const missing = ['question', 'yes_ideology', 'no_ideology'].filter((c) => !header.includes(c));
    if (missing.length) return setError(`The first row must contain these column names: ${missing.join(', ')}. Download the template to see the layout.`);
    const idx = (c) => header.indexOf(c);
    const byName = new Map(ideologies.map((i) => [i.name.trim().toLowerCase(), i.id]));
    const found = [];
    const probs = [];
    table.slice(1).forEach((r, n) => {
      const get = (c) => (idx(c) >= 0 ? (r[idx(c)] || '').trim() : '');
      const line = n + 2;
      const text = get('question');
      if (!text) return probs.push(`Row ${line}: the question is empty.`);
      const out = { number: Number(get('number')) || n + 1, text, sensitive: /^(1|yes|true|y|sensitive)$/i.test(get('sensitive')) };
      for (const side of ['yes', 'no']) {
        const ideo = get(`${side}_ideology`);
        const id = byName.get(ideo.toLowerCase());
        if (!id) probs.push(`Row ${line}: ${side.toUpperCase()} ideology “${ideo || '(empty)'}” is not one of: ${ideologies.map((i) => i.name).join(', ')}.`);
        const rec = (get(`${side}_recipient`) || 'answerer').toLowerCase();
        if (!RECIPIENTS.includes(rec)) probs.push(`Row ${line}: ${side}_recipient must be answerer, next or previous (got “${rec}”).`);
        out[`${side}_ideology_id`] = id;
        out[`${side}_card_text`] = get(`${side}_card_text`);
        out[`${side}_resources`] = get(`${side}_resources`);
        out[`${side}_recipient`] = rec;
      }
      found.push(out);
    });
    setRows(found);
    setProblems(probs);
  }

  async function create() {
    if (!name.trim()) return setError('Give the deck a name.');
    setBusy(true); setError('');
    const sb = supabase();
    const { data: deck, error: de } = await sb.from('decks').insert({ name: name.trim(), description: '', status: 'draft' }).select('id').single();
    if (de) { setBusy(false); return setError(de.message); }
    const { error: qe } = await sb.from('questions').insert(rows.map((q) => ({ ...q, deck_id: deck.id })));
    if (qe) {
      await sb.from('decks').delete().eq('id', deck.id);
      setBusy(false);
      return setError(qe.message);
    }
    router.push(`/admin/deck/${deck.id}`);
  }

  return (
    <main className="page stack">
      <Link href="/admin" className="muted small">← All decks</Link>
      <section className="panel stack">
        <h1 style={{ fontSize: '1.6rem' }}>Import a deck from a spreadsheet</h1>
        <p className="muted">
          Fill in a spreadsheet (Excel, Numbers or Google Sheets), save or export it as <strong>CSV</strong>, and upload it here.
          It is created as a <strong>draft</strong>, so nothing reaches players until you open it and press Publish.
        </p>
        <div className="row"><button className="btn" onClick={downloadTemplate}>Download template (CSV)</button></div>
        <p className="muted small">
          Columns: {COLUMNS.join(', ')}. Ideology must match an existing ideology type name exactly (see Ideology types).
          Recipient is answerer (default), next or previous. Sensitive is yes or no (yes shows the red !! badge). Card text and resources are optional.
        </p>
        <label className="field"><span>Deck name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={onFile} /></label>
      </section>

      {error && <p className="error">{error}</p>}
      {problems.length > 0 && (
        <section className="panel stack">
          <h2>Please fix these in your file and upload it again</h2>
          <ul>{problems.slice(0, 30).map((p, i) => <li key={i} className="error small">{p}</li>)}</ul>
          {problems.length > 30 && <p className="muted small">…and {problems.length - 30} more.</p>}
        </section>
      )}
      {rows && problems.length === 0 && (
        <section className="panel stack">
          <p className="notice">{rows.length} question(s) are ready to import.</p>
          <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Importing…' : 'Create draft deck'}</button>
        </section>
      )}
    </main>
  );
}
