import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingDragGeometry } from './ranking-drag-geometry.js';

function fixture() {
  let reads = 0;
  const track = { scrollLeft: 0, scrollTop: 0, bounds: { left: 20, top: 30, width: 400, height: 100 },
    getBoundingClientRect() { return this.bounds; } };
  const cards = [0, 1, 2].map(i => ({ x: i * 100, y: 0,
    style: { getPropertyValue: () => '1' },
    getBoundingClientRect() { reads++;
      const left = track.bounds.left + this.x - track.scrollLeft;
      const top = track.bounds.top + this.y - track.scrollTop;
      return { left, right: left + 80, top, bottom: top + 100 };
    } }));
  return { track, cards, reads: () => reads };
}

test('stationary gesture measures cards once, translates both page and track scroll', () => {
  const f = fixture(), cache = createRankingDragGeometry();
  cache.read(f.track, f.cards);
  for (let i = 0; i < 30; i++) cache.read(f.track, f.cards);
  assert.equal(f.reads(), 3);
  f.track.bounds.top -= 200; f.track.bounds.left += 10;
  f.track.scrollLeft = 70; f.track.scrollTop = 5;
  assert.deepEqual(cache.read(f.track, f.cards)[1].rect, { left: 60, right: 140, top: -175, bottom: -75 });
  assert.equal(f.reads(), 3);
});

test('track resize, reordered cards and explicit invalidation remeasure', () => {
  const f = fixture(), cache = createRankingDragGeometry();
  cache.read(f.track, f.cards);
  f.track.bounds.width = 200;
  cache.read(f.track, f.cards);
  cache.read(f.track, [...f.cards].reverse());
  cache.invalidate(f.track);
  cache.read(f.track, f.cards);
  assert.equal(f.reads(), 12);
  cache.reset(); cache.read(f.track, f.cards);
  assert.equal(f.reads(), 15);
});

test('card resize observation invalidates same-size track and resets subscriptions per gesture', () => {
  let changed, disconnects = 0;
  const watched = new Set();
  class Observer {
    constructor(callback) { changed = callback; }
    observe(node) { watched.add(node); }
    disconnect() { disconnects++; watched.clear(); }
  }
  const f = fixture(), cache = createRankingDragGeometry(Observer);
  cache.read(f.track, f.cards);
  assert.equal(watched.size, 4);
  f.cards[1].x = 110; changed();
  assert.equal(cache.read(f.track, f.cards)[1].rect.left, 130);
  assert.equal(f.reads(), 6);
  cache.reset(); assert.equal(disconnects, 1); assert.equal(watched.size, 0);
});
