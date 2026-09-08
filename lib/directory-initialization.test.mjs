import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPersonDirectoryServices } from './person-directory-services.js';
import { prepareWorkbenchDirectories } from './workbench-directory-model.js';
import { buildCompanyDirectory, restoreCompanySummary } from './company-directory.js';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { loadWorkbenchData } from './workbench-demand-data.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { DATA_URLS, RUNTIME_FEATURES, PERSON_WORK_INDEX_SHA256, RUNTIME_DATA_CACHE_MODE } from './runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(extra = {}) {
  const calls = [], index = { persons: { p1: { workIds: ['1'] } } }, core = {}, performance = {};
  let coreOptions, indexOptions;
  const services = createPersonDirectoryServices({
    workerOwned: false, catalogWorks: [{ workId: '1' }],
    loadCatalogWorks: async () => [{ workId: '2' }],
    ensureWorker: async () => { calls.push('ensure'); },
    updateWorker: async value => { assert.equal(value, index); calls.push('update'); },
    getPerformanceRuntime: () => { calls.push('performance-factory'); return performance; },
    createCoreRuntime: options => { calls.push('core-factory'); coreOptions = options; return core; },
    createIndexRuntime: options => { calls.push('index-factory'); indexOptions = options; return { load: async () => { calls.push('load-index'); return index; } }; },
    ...extra
  });
  return { services, calls, index, core, performance, coreOptions, indexOptions };
}

test('directory factories use existing ports and pins, without loading their data', () => {
  const f = fixture();
  assert.equal(f.services.core, f.core);
  assert.equal(f.services.performance, f.performance);
  assert.equal(f.services.filterIndex, null);
  assert.deepEqual(f.calls, ['performance-factory', 'core-factory', 'index-factory']);
  assert.equal(f.coreOptions.manifestUrl, DATA_URLS.m2PersonManifest);
  assert.equal(f.coreOptions.crossSourceCrosswalkUrl, DATA_URLS.m2PersonCrossSourceCrosswalk);
  assert.deepEqual(f.coreOptions.catalogWorks, [{ workId: '1' }]);
  assert.equal(f.coreOptions.loadCatalogWorks, null);
  assert.equal(f.indexOptions.indexUrl, DATA_URLS.personWorkIndex);
  assert.equal(f.indexOptions.sha256, PERSON_WORK_INDEX_SHA256);
  assert.equal(f.indexOptions.cacheMode, RUNTIME_DATA_CACHE_MODE);
});

test('Worker-owned catalog uses the exact lazy callback, never eager work records', async () => {
  let reads = 0;
  const loadCatalogWorks = async () => { reads++; return [{ workId: '2' }]; };
  const f = fixture({ workerOwned: true, loadCatalogWorks });
  assert.deepEqual(f.coreOptions.catalogWorks, []);
  assert.equal(f.coreOptions.loadCatalogWorks, loadCatalogWorks);
  assert.equal(reads, 0);
  await f.coreOptions.loadCatalogWorks();
  assert.equal(reads, 1);
});

test('directory disable, performance bypass and filter disable preserve distinct availability', async () => {
  const off = fixture({ features: { ...RUNTIME_FEATURES, personDirectoryV1: { enabled: false } } });
  assert.deepEqual(off.calls, []);
  assert.equal(off.services.core, null);
  await assert.rejects(off.services.ensureFilterIndex(), /人物筛选索引不可用/);
  const bypass = fixture({ locationSearch: '?skipPersonPerformance' });
  assert.equal(bypass.services.performance, null);
  assert.equal(bypass.services.core, bypass.core);
  const noFilter = fixture({ features: { ...RUNTIME_FEATURES, personFilterV1: { enabled: false } } });
  assert.ok(noFilter.services.core);
  assert.ok(!noFilter.calls.includes('index-factory'));
  await assert.rejects(noFilter.services.ensureFilterIndex(), /人物筛选索引不可用/);
});

test('concurrent filter initialization publishes once, only after Worker update completes', async () => {
  const gate = deferred();
  const f = fixture({ updateWorker: async () => { f.calls.push('update'); await gate.promise; } });
  const a = f.services.ensureFilterIndex(), b = f.services.ensureFilterIndex();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.services.filterIndex, null);
  assert.deepEqual(f.calls.slice(3), ['load-index', 'ensure', 'update']);
  gate.resolve();
  assert.equal(await a, f.index); assert.equal(await b, f.index);
  assert.equal(f.services.filterIndex, f.index);
  assert.equal(await f.services.ensureFilterIndex(), f.index);
  assert.equal(f.calls.filter(x => x === 'update').length, 1);
});

for (const phase of ['load', 'ensure', 'update']) test(`filter ${phase} failure does not publish a partial index and a new attempt recovers`, async () => {
  let fail = true, loads = 0, updates = 0;
  const index = { persons: {} };
  const f = fixture({
    createIndexRuntime: () => ({ load: async () => { loads++; if (fail && phase === 'load') throw Error('load failed'); return index; } }),
    ensureWorker: async () => { if (fail && phase === 'ensure') throw Error('ensure failed'); },
    updateWorker: async () => { updates++; if (fail && phase === 'update') throw Error('update failed'); }
  });
  await assert.rejects(f.services.ensureFilterIndex(), /failed/);
  assert.equal(f.services.filterIndex, null);
  fail = false;
  assert.equal(await f.services.ensureFilterIndex(), index);
  assert.equal(loads, 2);
  assert.equal(updates, phase === 'update' ? 2 : 1);
});

test('real constructors remain lazy without a DOM or startup fetches', () => {
  let reads = 0;
  const s = createPersonDirectoryServices({
    workerOwned: true, catalogWorks: [], loadCatalogWorks: async () => { reads++; return []; },
    fetchImpl: async () => { reads++; throw Error('unexpected read'); },
    ensureWorker: async () => {}, updateWorker: async () => {}
  });
  assert.equal(typeof document, 'undefined');
  assert.ok(s.core); assert.ok(s.performance); assert.equal(reads, 0);
});

const prepared = await loadWorkbenchData({
  config: WORKBENCH_DEMAND, locationRef: { search: '' },
  fetchImpl: async url => new Response(await readFile(url)),
  legacyLoader: () => { throw Error('unexpected legacy'); }
});
const modelOptions = {
  presentationFamiliesSource: prepared.presentationFamiliesSource,
  catalogSnapshotId: prepared.sampleSource.snapshot.snapshotId,
  catalogSha256: prepared.catalogSource.sha256,
  presentationWorkIds: prepared.populationContract.presentation.workIds,
  bangumiPublicBindings: prepared.bangumiPublicBindings,
  companySummary: null, brands: prepared.brands, works: prepared.ratedDisplayWorks,
  companyAliasesById: prepared.enrichment.companyAliasesById,
  companyPinyinById: prepared.enrichment.companyPinyinById,
  avatarByCompanyId: prepared.companyProfile?.avatarByCompanyId
};

test('actual directory projection retains legacy company rows, all family memberships and representative mapping', () => {
  const actual = prepareWorkbenchDirectories(modelOptions);
  const expected = preparePresentationFamiliesSidecar(prepared.presentationFamiliesSource.value, {
    catalogSnapshotId: modelOptions.catalogSnapshotId, catalogSha256: modelOptions.catalogSha256,
    workIds: modelOptions.presentationWorkIds,
    bangumiSubjectByWorkId: new Map(prepared.bangumiPublicBindings.bindings.map(row => [row.egsWorkId, row.bangumiSubjectId]))
  });
  for (const id of modelOptions.presentationWorkIds) assert.deepEqual(actual.presentationFamilies.familyForWork(id), expected.familyForWork(id));
  const raw = new Map();
  for (const family of prepared.presentationFamiliesSource.value.families) for (const id of family.catalogMemberWorkIds) raw.set(id, family.presentationWorkId);
  assert.deepEqual(actual.representativeFamilyByWorkId, raw);
  assert.deepEqual(actual.companyDirectory, buildCompanyDirectory(modelOptions));
});

test('distinct Bangumi subjects split work cards while keeping original representative-family deduplication', () => {
  const family = prepared.presentationFamiliesSource.value.families.find(f => f.catalogMemberWorkIds.length > 1);
  const [a, b] = family.catalogMemberWorkIds;
  const result = prepareWorkbenchDirectories({ ...modelOptions, bangumiPublicBindings: { bindings: [
    { egsWorkId: a, bangumiSubjectId: '100' }, { egsWorkId: b, bangumiSubjectId: '200' }
  ] } });
  assert.equal(result.presentationFamilies.familyForWork(a), null);
  assert.equal(result.presentationFamilies.familyForWork(b), null);
  assert.equal(result.representativeFamilyByWorkId.get(a), family.presentationWorkId);
  assert.equal(result.representativeFamilyByWorkId.get(b), family.presentationWorkId);
});

test('summary-only companies do not read full works; invalid summaries fail closed', () => {
  const rows = [{ companyId: '1', searchText: 'test', brandName: '测试' }];
  const options = { ...modelOptions, companySummary: rows };
  Object.defineProperty(options, 'works', { get() { return undefined; } });
  assert.deepEqual(prepareWorkbenchDirectories(options).companyDirectory, restoreCompanySummary(rows));
  assert.throws(() => prepareWorkbenchDirectories({ ...modelOptions, companySummary: undefined }), /company summary/);
});

test('family SHA and catalog identity errors reject; absence keeps separate works', () => {
  const source = modelOptions.presentationFamiliesSource;
  for (const patch of [
    { presentationFamiliesSource: { ...source, sha256: '0'.repeat(64) } },
    { catalogSha256: '0'.repeat(64) }, { catalogSnapshotId: 'wrong' }
  ]) assert.throws(() => prepareWorkbenchDirectories({ ...modelOptions, ...patch }), error => error.message === 'presentation families sidecar rejected' && error.cause instanceof Error);
  const absent = prepareWorkbenchDirectories({ ...modelOptions, presentationFamiliesSource: null });
  assert.equal(absent.presentationFamilies, null);
  assert.equal(absent.representativeFamilyByWorkId.size, 0);
});
