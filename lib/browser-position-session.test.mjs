import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceScrollSession } from './workspace-scroll-session.js';
import { createDetailBrowserSession } from './detail-browser-session.js';

function scrollFixture() {
  const calls = [];
  let selection = { top: 350, left: 2 }, ranking = { top: 450, left: 3, tiers: { S: 90 }, poolLeft: 25 };
  const session = createWorkspaceScrollSession({
    selection: { capture() { calls.push('capture-selection'); return selection; }, restore(p) { calls.push(['selection', p]); } },
    ranking: { capture() { calls.push('capture-ranking'); return ranking; }, restore(p) { calls.push(['ranking', p]); } }
  });
  return { session, calls, setSelection(p) { selection = p; }, setRanking(p) { ranking = p; } };
}
test('construction and initial capture do not call views; first restore uses original zero shape', () => {
  const f = scrollFixture(); f.session.capture(); assert.deepEqual(f.calls, []);
  f.session.restore('selection'); assert.deepEqual(f.calls.at(-1), ['selection', { top: 0, left: 0 }]);
  f.session.restore('ranking'); assert.deepEqual(f.calls.at(-1), ['ranking', { top: 0, left: 0, tiers: {}, poolLeft: 0 }]);
});
test('selection and ranking snapshots stay independent across workspace switches', () => {
  const f = scrollFixture(); f.session.restore('selection'); f.session.capture();
  f.session.restore('ranking'); f.session.capture(); f.session.restore('selection');
  assert.deepEqual(f.calls.at(-1), ['selection', { top: 350, left: 2 }]);
  f.session.restore('ranking'); assert.deepEqual(f.calls.at(-1), ['ranking', { top: 450, left: 3, tiers: { S: 90 }, poolLeft: 25 }]);
});
test('candidate filtering explicitly captures ranking; missing lazy view retains last snapshot', () => {
  const f = scrollFixture(); f.session.captureRanking(); f.setRanking(undefined); f.session.captureRanking();
  f.session.restore('ranking'); assert.equal(f.calls.at(-1)[1].tiers.S, 90);
});
test('directory skip preserves existing behavior without applying a workspace scroll', () => {
  const f = scrollFixture(); f.session.restore('ranking', { skip: true }); assert.deepEqual(f.calls, []);
  f.session.capture(); assert.deepEqual(f.calls, ['capture-ranking']);
});
test('company import resets ranking only, work import resets both and forgets rendered mode', () => {
  const f = scrollFixture(); f.session.restore('selection'); f.session.capture(); f.session.captureRanking();
  f.session.resetRanking(); f.session.restore('selection'); assert.equal(f.calls.at(-1)[1].top, 350);
  f.session.restore('ranking'); assert.equal(f.calls.at(-1)[1].top, 0);
  f.session.reset(); const n = f.calls.length; f.session.capture(); assert.equal(f.calls.length, n);
  f.session.restore('selection'); assert.equal(f.calls.at(-1)[1].top, 0);
  f.session.restore('ranking'); assert.deepEqual(f.calls.at(-1)[1].tiers, {});
});
function detailFixture() {
  class Element {
    isConnected = true;
    focuses = [];
    focus(options) { this.focuses.push(options); }
  }
  const listeners = new Map(), classes = new Set(), scrolls = [];
  const original = { position: 'relative', top: '4px', left: '5px', right: '6px', width: '95%', paddingRight: '7px' };
  const opener = new Element(), inside = new Element();
  const documentRef = { body: { style: { ...original } }, activeElement: opener,
    documentElement: { clientWidth: 980, classList: { add: c => classes.add(c), remove: c => classes.delete(c) } } };
  const windowRef = { HTMLElement: Element, scrollY: 680, innerWidth: 1000, scrollTo: (...p) => scrolls.push(p) };
  const dialog = { open: false, contains: node => node === inside,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const session = createDetailBrowserSession({ dialog, documentRef, windowRef });
  return { session, dialog, documentRef, windowRef, opener, inside, original, classes, scrolls, listeners,
    toggle(open) { dialog.open = open; listeners.get('toggle')?.(); } };
}
test('lock preserves all six inline styles and compensates the scrollbar, unlock restores once', () => {
  const f = detailFixture(); f.session.lock();
  assert.equal(f.classes.has('work-details-open'), true);
  assert.deepEqual(f.documentRef.body.style, { position: 'fixed', top: '-680px', left: '0', right: '0', width: '100%', paddingRight: '20px' });
  f.session.unlock(); assert.deepEqual(f.documentRef.body.style, f.original);
  assert.deepEqual(f.scrolls, [[0, 680]]); assert.equal(f.classes.size, 0);
  f.session.unlock(); assert.equal(f.scrolls.length, 1);
});
test('repeated open/toggle does not overwrite original scroll with fixed-body zero', () => {
  const f = detailFixture(); f.session.lock(); f.windowRef.scrollY = 0; f.toggle(true); f.session.lock(); f.toggle(false);
  assert.deepEqual(f.scrolls, [[0, 680]]);
  f.windowRef.scrollY = 240; f.toggle(true); f.toggle(false); assert.deepEqual(f.scrolls.at(-1), [0, 240]);
});
test('zero scroll is a valid lock and mobile zero-width scrollbars do not add padding', () => {
  const f = detailFixture(); f.windowRef.scrollY = 0; f.windowRef.innerWidth = 390; f.documentRef.documentElement.clientWidth = 390;
  f.session.lock(); assert.equal(f.documentRef.body.style.paddingRight, ''); f.session.unlock(); assert.deepEqual(f.scrolls, [[0, 0]]);
});
test('focus capture keeps version-shelf opener and restores without scrolling', () => {
  const f = detailFixture(); f.session.captureFocus(); f.documentRef.activeElement = f.inside;
  f.session.captureFocus({ preserve: true }); const restore = f.session.takeFocusRestore();
  assert.deepEqual(f.opener.focuses, []); restore(); assert.deepEqual(f.opener.focuses, [{ preventScroll: true }]);
  f.session.takeFocusRestore()(); assert.equal(f.opener.focuses.length, 1);
});
test('non-element, in-dialog and detached openers do not steal focus', () => {
  for (const kind of ['non-element', 'inside', 'detached']) {
    const f = detailFixture();
    if (kind === 'non-element') f.documentRef.activeElement = {};
    if (kind === 'inside') f.documentRef.activeElement = f.inside;
    f.session.captureFocus(); f.opener.isConnected = false; f.session.takeFocusRestore()();
    assert.deepEqual(f.opener.focuses, []); assert.deepEqual(f.inside.focuses, []);
  }
});
test('navigation can consume but skip return focus; later close cannot restore a stale opener', () => {
  const f = detailFixture(); f.session.captureFocus(); f.session.takeFocusRestore(); f.session.takeFocusRestore()();
  assert.deepEqual(f.opener.focuses, []);
});
test('toggle reads actual open state, so queued old toggle cannot unlock a reopened dialog; dispose cleans lock and listener', () => {
  const f = detailFixture(); f.session.captureFocus(); f.toggle(true); f.listeners.get('toggle')();
  assert.equal(f.documentRef.body.style.position, 'fixed');
  f.session.dispose(); f.session.dispose(); assert.equal(f.listeners.size, 0);
  assert.deepEqual(f.documentRef.body.style, f.original); assert.deepEqual(f.scrolls, [[0, 680]]);
  f.session.takeFocusRestore()(); assert.deepEqual(f.opener.focuses, []);
});
