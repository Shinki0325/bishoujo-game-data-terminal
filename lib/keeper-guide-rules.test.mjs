import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveKeeperGuide } from './keeper-guide-rules.js';

const ready = {
  ready: true,
  restored: true,
  workspace: 'ranking',
  rankingSubject: 'work'
};

test('manual help overview is available without auto tips, ready state, or busy state', () => {
  const result = resolveKeeperGuide({
    id: 'helpOverview',
    ready: false,
    busy: true,
    helpArticleId: 'companies.overview',
    suppressPortrait: true
  }, { autoTips: false });

  assert.equal(result.id, 'helpOverview');
  assert.equal(result.contentVersion, 1);
  assert.equal(result.showEnhancement, true);
  assert.equal(result.showPortrait, false);
  assert.equal(result.helpArticleId, 'companies.overview');
  assert.equal(result.actionId, 'open-help-overview');
});

test('illustrations switch hides only the guide portrait, not the guide text', () => {
  const result = resolveKeeperGuide({ id: 'helpOverview', helpArticleId: 'works.overview' }, { illustrations: false });
  assert.equal(result.showEnhancement, true);
  assert.equal(result.showPortrait, false);
  assert.equal(result.helpArticleId, 'works.overview');
});

test('automatic guides require both ready and restored and avoid blocked states', () => {
  for (const snapshot of [
    { id: 'compareActive', ready: false, restored: true, selectedCount: 0 },
    { id: 'compareActive', ready: true, restored: false, selectedCount: 0 },
    { id: 'compareActive', ...ready, selectedCount: 0, status: 'loading' },
    { id: 'compareActive', ...ready, selectedCount: 0, loadState: 'loading' },
    { id: 'compareActive', ...ready, selectedCount: 0, busy: true },
    { id: 'compareActive', ...ready, selectedCount: 0, live: true },
    { id: 'compareActive', ...ready, selectedCount: 0, liveMode: 'live' },
    { id: 'compareActive', ...ready, selectedCount: 0, topOverlay: true },
    { id: 'compareActive', ...ready, selectedCount: 0, topOverlay: 'open' }
  ]) assert.equal(resolveKeeperGuide(snapshot), null);
});

test('compare uses its independent collection count for zero, one, and enough selections', () => {
  const zero = resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true, selectedCount: 0 }, {});
  const one = resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true, selectedCount: 1 }, {});
  const customMinimum = resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true, selectedCount: 0, compareMin: 3 }, {});
  const enough = resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true, selectedCount: 2 }, {});
  assert.equal(zero.showEnhancement, true);
  assert.match(zero.summary, /还需选择 2 部/);
  assert.match(one.summary, /再从作品卡加入 1 部/);
  assert.match(customMinimum.title, /先选 3 部/);
  assert.match(customMinimum.summary, /还需选择 3 部/);
  assert.equal(enough, null);
  assert.equal(resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: false, selectedCount: 0 }), null);
});

test('invalid or missing counts fail closed instead of treating them as zero', () => {
  assert.equal(resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true }), null);
  assert.equal(resolveKeeperGuide({ id: 'compareActive', ...ready, compareActive: true, selectedCount: '0' }), null);
  assert.equal(resolveKeeperGuide({ id: 'tier.start', ...ready, candidateTotal: 0 }), null);
  assert.equal(resolveKeeperGuide({ id: 'tier.start', ...ready, candidateTotal: '0', rankedTotal: 0 }), null);
});

test('compareWorkIds wins over a similarly named work-selection count', () => {
  const result = resolveKeeperGuide({
    id: 'compareActive', ...ready, compareActive: true,
    selectedCount: 2, compareWorkIds: ['w1']
  });
  assert.equal(result.showEnhancement, true);
  assert.match(result.summary, /1 部/);
});

test('empty work ranking returns tier.start and ignores company ranking', () => {
  const result = resolveKeeperGuide({ id: 'tier.start', ...ready, candidateTotal: 0, rankedTotal: 0 });
  assert.equal(result.id, 'tier.start');
  assert.equal(result.showEnhancement, true);
  assert.equal(result.showPortrait, true);
  assert.equal(result.helpArticleId, 'tier.overview');
  assert.equal(resolveKeeperGuide({ id: 'tier.start', ...ready, rankingSubject: 'company', candidateTotal: 0, rankedTotal: 0 }), null);
  assert.equal(resolveKeeperGuide({ id: 'tier.start', ...ready, workspace: 'companies', candidateTotal: 0, rankedTotal: 0 }), null);
});

test('candidate work ranking returns a text-only first-drag guide', () => {
  const result = resolveKeeperGuide({ id: 'tier.start', ...ready, candidateTotal: 4, rankedTotal: 0 }, {});
  assert.equal(result.id, 'tier.firstDrag');
  assert.equal(result.showEnhancement, true);
  assert.equal(result.showPortrait, false);
  assert.equal(result.expression, 'none');
  assert.equal(result.actionId, null);
  assert.equal(resolveKeeperGuide({ id: 'tier.start', ...ready, candidateTotal: 4, rankedTotal: 1 }), null);
});

test('explicit unfiltered candidateTotal is authoritative over selected ids', () => {
  const result = resolveKeeperGuide({
    id: 'tier.start', ...ready, selectedWorkIds: ['w1', 'w2'], candidateTotal: 0, rankedTotal: 0
  });
  assert.equal(result.id, 'tier.start');
});

test('marks apply to the emitted scene id after a start scene transitions to first drag', () => {
  const result = resolveKeeperGuide({
    id: 'tier.start', ...ready, candidateTotal: 2, rankedTotal: 0
  }, { dismissed: { 'tier.firstDrag': 1 } });
  assert.equal(result.id, 'tier.firstDrag');
  assert.equal(result.showEnhancement, false);
});

test('automatic guides retain a base scene after auto tips are disabled or marked', () => {
  const snapshot = { id: 'tier.start', ...ready, candidateTotal: 0, rankedTotal: 0 };
  for (const prefs of [
    { autoTips: false },
    { dismissed: { 'tier.start': 1 } },
    { completed: { 'tier.start': 1 } }
  ]) {
    const result = resolveKeeperGuide(snapshot, prefs);
    assert.equal(result.id, 'tier.start');
    assert.equal(result.showEnhancement, false);
    assert.equal(result.showPortrait, false);
  }
  assert.equal(resolveKeeperGuide(snapshot, { completed: { 'tier.start': 2 } }).showEnhancement, true);
});

test('feature flag off and unknown ids fail closed', () => {
  assert.equal(resolveKeeperGuide({ id: 'helpOverview', featureEnabled: false }), null);
  assert.equal(resolveKeeperGuide({ id: 'helpOverview', featureFlags: { keeperGuide: false } }), null);
  assert.equal(resolveKeeperGuide({ id: 'not-a-guide', ready: true, restored: true }), null);
  assert.deepEqual(resolveKeeperGuide({ id: 'help.overview', featureEnabled: true }), resolveKeeperGuide({ id: 'helpOverview', featureEnabled: true }));
});
