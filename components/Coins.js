// Resource coins (drawn as small SVGs so they stay sharp on every screen).
const COINS = {
  funds: { label: 'Campaign Funds', color: '#7cb342', dark: '#4f7a22' },
  clout: { label: 'Street Clout', color: '#d9503f', dark: '#9c2f23' },
  media: { label: 'Media Attention', color: '#3f51b5', dark: '#27337f' },
  trust: { label: 'Public Trust', color: '#f2b705', dark: '#b58500' },
};

function Glyph({ kind }) {
  const p = { fill: 'none', stroke: '#fff', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.92 };
  if (kind === 'funds')
    return <g {...p}><path d="M12 4h12l5 6-11 15L7 10z" /><path d="M7 10h22M14 10l4 15 4-15M18 4v6" /></g>;
  if (kind === 'clout')
    return <g {...p}><path d="M11 17v-5a2 2 0 014 0v-2a2 2 0 014 0v1a2 2 0 014 0v8c0 5-3 8-8 8-4 0-7-3-7-6v-2z" /><path d="M8 6l2 3M28 6l-2 3M18 3v3" /></g>;
  if (kind === 'media')
    return <g {...p}><path d="M5 18c4-6 8-8 13-8s9 2 13 8c-4 6-8 8-13 8S9 24 5 18z" /><circle cx="18" cy="18" r="4" /></g>;
  return <g {...p}><path d="M18 5l3.9 8 8.7 1.2-6.3 6.1 1.5 8.7L18 24.9l-7.8 4.1 1.5-8.7-6.3-6.1 8.7-1.2z" /></g>;
}

export function Coin({ kind, size = 24 }) {
  const c = COINS[kind];
  if (!c) return null;
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 36 36" role="img" aria-label={c.label}>
      <title>{c.label}</title>
      <circle cx="18" cy="19.5" r="16" fill={c.dark} />
      <circle cx="18" cy="17.5" r="16" fill={c.color} />
      <circle cx="18" cy="17.5" r="12.5" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
      <Glyph kind={kind} />
    </svg>
  );
}

// "2 Funds, 1 Media" -> [{kind:'funds', n:2}, {kind:'media', n:1}]; anything unreadable is kept as text.
export function parseResources(text) {
  const out = [];
  const rest = [];
  for (const part of String(text || '').split(/[,;+&]/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)?\s*(?:x\s*)?(?:campaign\s+|street\s+|media\s+|public\s+)?(funds?|clout|media|trust)\b/i);
    if (m) out.push({ kind: m[2].toLowerCase().replace(/^funds?$/, 'funds'), n: Number(m[1] || 1) });
    else rest.push(s);
  }
  return { coins: out, rest: rest.join(', ') };
}

// Coins are drawn one per resource, like on the printed cards (2 Funds = two green coins).
export function Resources({ text, size = 26 }) {
  const { coins, rest } = parseResources(text);
  if (!coins.length && !rest) return null;
  const many = coins.reduce((a, c) => a + c.n, 0) > 8;
  return (
    <span className="res" aria-label={coins.map((c) => `${c.n} ${COINS[c.kind].label}`).join(', ')}>
      {coins.map((c, i) =>
        many ? (
          <span key={i} className="res-item"><b>{c.n}×</b><Coin kind={c.kind} size={size} /></span>
        ) : (
          Array.from({ length: c.n }, (_, j) => <Coin key={`${i}-${j}`} kind={c.kind} size={size} />)
        )
      )}
      {rest && <span className="res-text">{rest}</span>}
    </span>
  );
}

// A copy of the physical ideology card.
export function CardFace({ card, number, small }) {
  const c = card || {};
  return (
    <div className={`pcard ${small ? 'small' : ''}`} style={{ '--ideo': c.ideology_color }}>
      <div className="pcard-q">{number ? <span className="pcard-no">{number}</span> : null}{c.question}</div>
      <div className="pcard-body">
        <p>{c.card_text || c.ideology_description || ''}</p>
        <Resources text={c.resources} size={small ? 22 : 28} />
      </div>
      <div className="pcard-foot"><span>{c.ideology_symbol}</span> {c.ideology_name}</div>
    </div>
  );
}
