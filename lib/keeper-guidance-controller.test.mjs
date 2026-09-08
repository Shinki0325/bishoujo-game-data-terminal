import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeeperGuidanceController, projectKeeperGuidance, projectBangumiGuidance } from './keeper-guidance-controller.js';
import { createKeeperPreferences } from './keeper-guide-preferences.js';
import { createKeeperGuidanceView } from '../views/keeper-guidance-view.js';

const flags = { enabled: true, p1: true, portraits: true };
const base = () => ({
  ready: true, restored: true, busy: false, live: false, dialogOpen: false,
  importBusy: false, importAvailable: true, importDialogOpen: false, otherDialog: false,
  compareMode: false, compareIds: [], compareMinimum: 2, rankingSubject: 'work',
  model: { state: { workspaceMode: 'ranking', selectedWorkIds: [] }, rankedCount: 0, unrankedCount: 0 }
});
const prefs = () => createKeeperPreferences({ storage: null });

test('empty ranking retains base instructions and import availability independently of enhancement', () => {
  const s = base(), p = prefs();
  assert.equal(projectKeeperGuidance(s, p.get(), flags).rankingGuide.id, 'tier.start');
  p.dismiss('tier.start');
  assert.equal(projectKeeperGuidance(s, p.get(), flags).rankingGuide.enhanced, false);
  const off = projectKeeperGuidance(s, p.get(), { enabled: false });
  assert.equal(off.rankingGuide.id, 'tier.start'); assert.equal(off.rankingGuide.showPortrait, false);
  assert.equal(off.secondaryActionDisabled, false);
  for (const delta of [{ importBusy: true }, { importAvailable: false }]) {
    assert.equal(projectKeeperGuidance({ ...s, ...delta }, p.get(), flags).secondaryActionDisabled, true);
  }
});
test('comparison zero/one/two and completed state use existing rules', () => {
  const s = { ...base(), compareMode: true }, p = prefs();
  const zero = projectKeeperGuidance(s, p.get(), flags);
  assert.equal(zero.compareBarHidden, false); assert.match(zero.compare.title, /先选 2 部/);
  assert.match(projectKeeperGuidance({ ...s, compareIds: ['1'] }, p.get(), flags).compare.title, /再选 1 部/);
  assert.equal(projectKeeperGuidance({ ...s, compareIds: ['1', '2'] }, p.get(), flags).compare, null);
  p.complete('compareActive');
  assert.equal(projectKeeperGuidance(s, p.get(), flags).compare.enhanced, false);
  assert.equal(projectKeeperGuidance(base(), p.get(), flags).compareBarHidden, true);
});
test('first-drag guidance is restricted to unranked works, never company ranking', () => {
  const s = base(), p = prefs(); s.model.unrankedCount = 1; s.model.state.selectedWorkIds = ['1'];
  assert.equal(projectKeeperGuidance(s, p.get(), flags).rankingGuide.id, 'tier.firstDrag');
  p.complete('tier.firstDrag');
  assert.equal(projectKeeperGuidance(s, p.get(), flags).rankingGuide.enhanced, false);
  assert.equal(projectKeeperGuidance({ ...s, rankingSubject: 'company' }, p.get(), flags).rankingGuide, null);
  s.model.rankedCount = 1;
  assert.equal(projectKeeperGuidance(s, p.get(), flags).rankingGuide, null);
});
test('busy, live, dialog and unready states suppress automatic guide projection', () => {
  for (const delta of [{ busy: true }, { live: true }, { dialogOpen: true }, { ready: false }, { restored: false }]) {
    const out = projectKeeperGuidance({ ...base(), compareMode: true, ...delta }, prefs().get(), flags);
    assert.equal(out.compare, null); assert.equal(out.rankingGuide, null);
  }
});
test('Bangumi input/result/loading/error and other overlay are separate from background guides', () => {
  const s = { ...base(), importDialogOpen: true, dialogOpen: true, importPhase: 'input' }, p = prefs();
  assert.equal(projectBangumiGuidance(s, p.get(), flags).input.id, 'bangumi.input');
  assert.equal(projectBangumiGuidance(s, p.get(), flags).result, null);
  assert.equal(projectBangumiGuidance({ ...s, importPhase: 'result' }, p.get(), flags).result.id, 'bangumi.result');
  for (const delta of [{ importPhase: 'loading' }, { importPhase: 'error' }, { otherDialog: true }, { busy: true }, { live: true }]) {
    assert.deepEqual(projectBangumiGuidance({ ...s, ...delta }, p.get(), flags), { input: null, result: null });
  }
  assert.equal(projectBangumiGuidance(s, p.get(), { p1: false }).input, null);
});
test('illustration and automatic tip preferences remain independent and reset preserves switches', () => {
  const p = prefs(); p.setPreference('illustrations', false);
  assert.equal(projectKeeperGuidance(base(), p.get(), flags).rankingGuide.showPortrait, false);
  assert.equal(projectKeeperGuidance(base(), p.get(), flags).rankingGuide.enhanced, true);
  p.setPreference('autoTips', false); p.reset();
  assert.equal(projectKeeperGuidance(base(), p.get(), flags).rankingGuide.enhanced, false);
});
function fixture() {
  const preferences = prefs(), renders = [], imports = [], state = base();
  let callbacks, reads = 0, disconnected = 0, focused = 0;
  const controller = createKeeperGuidanceController({ preferences, features: flags,
    readWorkbench() { reads++; return state; },
    view: {
      readSurface: () => ({}), render: s => renders.push(s), renderImport: s => imports.push(s),
      connect(c) { callbacks = c; return () => disconnected++; }, restoreImportFocus() { focused++; }
    }
  });
  return { controller, preferences, state, renders, imports, get callbacks() { return callbacks; },
    get reads() { return reads; }, get disconnected() { return disconnected; }, get focused() { return focused; } };
}
test('construction and early browser/preference callbacks do not access uninitialized application ports', () => {
  const f = fixture();
  f.callbacks.onChange(); f.controller.renderImport(); f.controller.render(); f.preferences.dismiss('tier.start');
  assert.equal(f.reads, 0); assert.equal(f.renders.length, 0);
  f.controller.restore(); assert.equal(f.renders.length, 1); assert.equal(f.renders[0].rankingGuide.enhanced, false);
});
test('drag defers general rendering, then projects latest state and preferences once at drag end', () => {
  const f = fixture(); f.controller.restore(); f.callbacks.onDragStart();
  f.state.compareMode = true; f.preferences.dismiss('compareActive'); f.callbacks.onChange(); f.controller.render();
  assert.equal(f.renders.length, 1);
  f.callbacks.onDragEnd(); assert.equal(f.renders.length, 2); assert.equal(f.renders.at(-1).compare.enhanced, false);
  f.callbacks.onDragEnd(); assert.equal(f.renders.length, 2);
});
test('import phase changes are private, projected on demand and still render during drag', () => {
  const f = fixture(); f.controller.restore(); f.state.importDialogOpen = true;
  f.controller.setImportPhase('result'); f.callbacks.onDragStart(); f.controller.renderImport();
  assert.equal(f.imports.at(-1).result.id, 'bangumi.result'); assert.equal(f.renders.length, 1);
});
test('completion and dismissal use supplied shared preferences, including external reset notifications', () => {
  const f = fixture(); f.controller.restore(); f.controller.complete('tier.firstDrag'); f.controller.dismiss('tier.start', 1);
  assert.equal(f.preferences.get().completed['tier.firstDrag'], 1);
  assert.equal(f.renders.at(-1).rankingGuide.enhanced, false);
  f.preferences.reset(); assert.equal(f.renders.at(-1).rankingGuide.enhanced, true);
});
test('only import opened from empty ranking requests one deferred focus restoration', () => {
  const f = fixture(); f.controller.openImport(false); f.controller.closeImport(); assert.equal(f.focused, 0);
  f.controller.openImport(true); f.controller.closeImport(); f.controller.closeImport(); assert.equal(f.focused, 1);
});
test('dispose is idempotent and removes both subscriptions; stale notifications are harmless', () => {
  const f = fixture(); f.controller.restore(); f.controller.dispose(); f.controller.dispose();
  f.preferences.reset(); f.callbacks.onChange(); f.callbacks.onDragEnd(); f.controller.restore(); f.controller.renderImport();
  assert.equal(f.disconnected, 1); assert.equal(f.renders.length, 1); assert.equal(f.imports.length, 1);
});
test('browser bridge ignores guide descendant classes, watches body/dialog changes and cleans up', () => {
  const listeners = new Map();
  const documentRef = {
    body: {},
    addEventListener(name, callback, capture) { assert.equal(capture, true); listeners.set(name, callback); },
    removeEventListener(name, callback, capture) {
      assert.equal(capture, true); assert.equal(listeners.get(name), callback); listeners.delete(name);
    },
    dispatchEvent(event) { listeners.get(event.type)?.(event); }
  };
  let notify, observeArgs, disconnected = 0, changes = 0, starts = 0, ends = 0;
  const windowRef = { MutationObserver: class {
    constructor(callback) { notify = callback; } observe(...args) { observeArgs = args; } disconnect() { disconnected++; }
  }, clearTimeout() {} };
  const view = createKeeperGuidanceView({ elements: {}, documentRef, windowRef });
  const cleanup = view.connect({ onChange: () => changes++, onDragStart: () => starts++, onDragEnd: () => ends++ });
  assert.equal(observeArgs[0], documentRef.body); assert.deepEqual(observeArgs[1].attributeFilter, ['open', 'class']);
  notify([{ attributeName: 'class', target: {} }]); assert.equal(changes, 0);
  notify([{ attributeName: 'class', target: documentRef.body }]);
  notify([{ attributeName: 'open', target: { tagName: 'DIALOG' } }]); assert.equal(changes, 2);
  documentRef.dispatchEvent(new Event('dragstart')); documentRef.dispatchEvent(new Event('dragend'));
  assert.equal(starts, 1); assert.equal(ends, 1); cleanup();
  documentRef.dispatchEvent(new Event('dragstart')); assert.equal(starts, 1); assert.equal(disconnected, 1);
});

test('drop ends suppression after dispatch even if source is removed; stale drop cannot end a later drag', () => {
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
      emit(name, event = {}) { listeners.get(name)?.(event); },
      count: () => listeners.size
    };
  };
  const doc = target(); doc.body = {};
  const source = target(), next = target(), timers = new Map(); let nextTimer = 0, busy = false;
  const view = createKeeperGuidanceView({ elements: {}, documentRef: doc, windowRef: {
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); }
  } });
  const cleanup = view.connect({ onChange() {}, onDragStart() { busy = true; }, onDragEnd() { busy = false; } });
  const flush = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  doc.emit('dragstart', { target: source }); doc.emit('drop');
  assert.equal(busy, true); flush(); assert.equal(busy, false); assert.equal(source.count(), 0);
  doc.emit('dragstart', { target: source }); doc.emit('drop'); doc.emit('dragstart', { target: next });
  flush(); assert.equal(busy, true); assert.equal(source.count(), 0);
  next.emit('dragend'); assert.equal(busy, false); assert.equal(next.count(), 0);
  doc.emit('dragstart', { target: source }); doc.emit('drop'); cleanup();
  assert.equal(doc.count(), 0); assert.equal(source.count(), 0); assert.equal(timers.size, 0);
});
