// A gesture-local snapshot in track coordinates. Page/track scrolling changes
// only the origin; resizing, card reflow and explicit layout changes invalidate it.
export function createRankingDragGeometry(ResizeObserverClass) {
  let records = new WeakMap();
  const observer = typeof ResizeObserverClass === 'function'
    ? new ResizeObserverClass(() => { records = new WeakMap(); }) : null;
  const observed = new Set();
  function reset() {
    records = new WeakMap();
    observer?.disconnect();
    observed.clear();
  }
  return {
    reset,
    invalidate(track) { records.delete(track); },
    read(track, cards) {
      const bounds = track.getBoundingClientRect();
      const x = bounds.left - (track.scrollLeft || 0);
      const y = bounds.top - (track.scrollTop || 0);
      let record = records.get(track);
      if (!record || record.width !== bounds.width || record.height !== bounds.height
        || record.cards.length !== cards.length || cards.some((card, i) => card !== record.cards[i])) {
        record = {
          width: bounds.width, height: bounds.height, cards: [...cards],
          entries: cards.map(card => {
            const rect = card.getBoundingClientRect();
            return { card, row: Number(card.style.getPropertyValue('grid-row')),
              left: rect.left - x, right: rect.right - x,
              top: rect.top - y, bottom: rect.bottom - y };
          })
        };
        records.set(track, record);
        for (const node of [track, ...cards]) {
          if (observer && !observed.has(node)) { observer.observe(node); observed.add(node); }
        }
      }
      return record.entries.map(entry => ({ card: entry.card, row: entry.row,
        rect: { left: entry.left + x, right: entry.right + x,
          top: entry.top + y, bottom: entry.bottom + y } }));
    }
  };
}
