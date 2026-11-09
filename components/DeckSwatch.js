export default function DeckSwatch({ deck, large }) {
  const style = deck.coverImageUrl
    ? { backgroundImage: `url(${deck.coverImageUrl})` }
    : { background: `linear-gradient(160deg, ${deck.coverColor || '#1d2b4a'}, #0b0f1a)` };
  if (large) Object.assign(style, { width: 64, height: 84, fontSize: '1.6rem' });
  return (
    <div className="deck-swatch" style={style}>
      {!deck.coverImageUrl && (deck.name || '?').slice(0, 1)}
    </div>
  );
}
