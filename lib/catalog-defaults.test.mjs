import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState, DEFAULT_FILTER_STATE, exportState, importState, loadState, LEGACY_V4_STATE_SCHEMA_VERSION } from './state.js';
import { filterWorks } from './filter-engine.js';
import { createAppController } from './app-controller.js';

const authority = { sampleId: 'defaults-test', workIds: ['1', '2', '3'], filterIds: ['platform-pc', 'platform-console', 'pov-205'], attributeGroupByFilterId: { 'platform-pc': 'platform', 'platform-console': 'platform' } };
const works = [
  { workId: '1', title: 'PC', brandId: 'brand', median: 80, voteCount: 100, releaseDate: '2000-01-01', filterIds: ['platform-pc'], platformFilterId: 'platform-pc', isNukige: false },
  { workId: '2', title: 'Console', brandId: 'brand', median: 80, voteCount: 100, releaseDate: '2000-01-01', filterIds: ['platform-console'], platformFilterId: 'platform-console', isNukige: false },
  { workId: '3', title: 'Nukige', brandId: 'brand', median: 80, voteCount: 100, releaseDate: '2000-01-01', filterIds: ['platform-pc', 'pov-205'], platformFilterId: 'platform-pc', isNukige: true }
].map(work => ({ ...work, rawFilterIds: [...work.filterIds], rawGenre: '', genreFilterIds: [] }));
const ids = state => filterWorks(works, state, authority.filterIds).map(w => w.workId);

test('fresh catalog has no automatic platform or nukige exclusions', () => {
  const state = loadState({ getItem: () => null }, authority);
  assert.deepEqual(state.filterState.attributeSelections.platform, []);
  assert.deepEqual(state.filterState.excludedFilterIds, []);
  assert.equal(state.filterState.excludeNukige, false);
  assert.deepEqual(ids(state.filterState), ['1', '2', '3']);
  assert.equal(state.filterState.minimumVoteCount, 30);
});

test('manual PC and nukige filters remain available', () => {
  const state = createDefaultState(authority.sampleId).filterState;
  state.attributeSelections.platform.push('platform-pc');
  assert.deepEqual(ids(state), ['1', '3']);
  state.excludedFilterIds.push('pov-205');
  assert.deepEqual(ids(state), ['1']);
  state.excludedFilterIds = [];
  state.excludeNukige = true;
  assert.deepEqual(ids(state), ['1']);
});

test('saved explicit filters and custom ranking state survive loading', () => {
  const state = createDefaultState(authority.sampleId);
  state.filterState.attributeSelections.platform = ['platform-pc'];
  state.filterState.excludedFilterIds = ['pov-205'];
  state.tiers[0].name = '我的第一档';
  const loaded = loadState({ getItem: () => exportState(state) }, authority);
  assert.deepEqual(loaded.filterState, state.filterState);
  assert.deepEqual(loaded.tiers, state.tiers);
});

test('default filter arrays remain frozen and clones are independent', () => {
  const first = createDefaultState(authority.sampleId), second = createDefaultState(authority.sampleId);
  first.filterState.attributeSelections.platform.push('platform-pc');
  first.filterState.excludedFilterIds.push('pov-205');
  assert.deepEqual(second.filterState.attributeSelections.platform, []);
  assert.deepEqual(second.filterState.excludedFilterIds, []);
  assert.ok(Object.isFrozen(DEFAULT_FILTER_STATE.attributeSelections.platform));
  assert.ok(Object.isFrozen(DEFAULT_FILTER_STATE.excludedFilterIds));
});

test('controller clear filters uses the unrestricted platform and content defaults', () => {
  const controller = createAppController({
    sample: { sampleId: authority.sampleId, works, filters: authority.filterIds.map(filterId => ({ filterId, groupId: authority.attributeGroupByFilterId[filterId] ?? 'adult' })) },
    storage: { getItem: () => null, setItem() {} }, confirm: () => true, announce() {}, now: () => new Date().toISOString(), downloadJson() {}
  });
  controller.setFilterState({ attributeSelections: { 'game-type': [], platform: ['platform-pc'], length: [] }, excludedFilterIds: ['pov-205'] });
  controller.clearFilters();
  const state = controller.inspect([]).state.filterState;
  assert.deepEqual(state.attributeSelections.platform, []);
  assert.deepEqual(state.excludedFilterIds, []);
});

test('legacy advanced formulas do not get a dangling AND or implicit PC restriction', () => {
  for (const expression of ['', 'pov-205', 'NOT platform-pc']) {
    const state = createDefaultState(authority.sampleId);
    state.schemaVersion = LEGACY_V4_STATE_SCHEMA_VERSION;
    delete state.filterState.attributeSelections;
    delete state.filterState.excludeNukige;
    state.filterState.mode = 'advanced';
    state.filterState.advancedExpression = expression;
    const migrated = importState(JSON.stringify(state), authority);
    assert.equal(migrated.filterState.advancedExpression, expression);
    assert.deepEqual(ids(migrated.filterState), expression === '' ? ['1', '2', '3'] : expression === 'pov-205' ? ['3'] : ['2']);
  }
});
