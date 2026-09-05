import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSelectionContext } from './ui-selection-context.js';

function fixture() {
  const doc = { activeElement: null };
  const item = () => ({ hidden: false, ownerDocument: doc, contains(node) { return node === this; } });
  const summary = item(); const actions = [item(), item()];
  const root = { ...item(), dataset: {}, querySelector: () => summary, contains: node => [summary, ...actions].includes(node) };
  const fallback = { focus: () => { doc.activeElement = fallback; } };
  return { root, summary, resultActions: actions, focusFallback: fallback, doc };
}
test('empty work selection keeps acquisition tools but hides result actions', () => {
  const f = fixture(); syncSelectionContext({ ...f, mode: true, count: 0, keepEmptyTools: true });
  assert.equal(f.root.hidden, false); assert.equal(f.root.dataset.empty, 'true');
  assert.equal(f.summary.hidden, true); assert.ok(f.resultActions.every(a => a.hidden));
});
test('company zero and browse modes stay quiet; a nonempty set shows contextual actions', () => {
  const f = fixture(); syncSelectionContext({ ...f, mode: true, count: 0 }); assert.equal(f.root.hidden, true);
  syncSelectionContext({ ...f, mode: true, count: 2 }); assert.equal(f.root.hidden, false); assert.equal(f.summary.hidden, false);
  assert.ok(f.resultActions.every(a => !a.hidden));
  syncSelectionContext({ ...f, mode: false, count: 2 }); assert.equal(f.root.hidden, true);
});
test('hiding a focused selection result restores focus without modifying selection data', () => {
  const f = fixture(); f.doc.activeElement = f.resultActions[0];
  syncSelectionContext({ ...f, mode: true, count: 0, keepEmptyTools: true });
  assert.equal(f.doc.activeElement, f.focusFallback);
});
