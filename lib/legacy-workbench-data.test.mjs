import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runtimePayloadTestRoot } from './runtime-payload-test-root.mjs';
import { createHash } from 'node:crypto';
import { loadLegacyWorkbenchData } from './legacy-workbench-data.js';
import { assertSample, prepareRuntimeSample } from './runtime-sample.js';
import { fetchStagedRuntimeCoreSources } from './runtime-core-sources.js';
import { loadWorkbenchData, reviveWorkbench, serializeWorkbench } from './workbench-demand-data.js';
import { RUNTIME_FEATURES } from './runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';
import { toWorkerLookup, restrictAssetsManifestToCatalog, projectBrandsWithAliases, projectWorkWithDisplayTitle, applyBangumiCanonicalAliasFallback } from './workbench-data-projection.js';

const bytes = new Map();
async function diskSource(url) {
  // Resolve data through the active release, avoiding the historical preview
  // junction left at the editable repository's data/ path.
  const relative = new URL(url).pathname.split('/data/')[1];
  if (relative) url = new URL(`data/${relative}`, runtimePayloadTestRoot);
  const key = String(url);
  if (!bytes.has(key)) bytes.set(key, await readFile(url));
  const body = bytes.get(key);
  return { value: JSON.parse(body), sha256: createHash('sha256').update(body).digest('hex') };
}
function options(extra = {}) {
  const measures = [], diagnostics = [], calls = [];
  return {
    measures, diagnostics, calls,
    startupMetrics: {
      measure: (name, run) => { measures.push(name); return run(); },
      measureAsync: (name, run) => { measures.push(name); return run(); }
    },
    fetchSource: (url, label) => { calls.push({ url: String(url), label }); return diskSource(url); },
    publishDiagnostics: value => diagnostics.push(value),
    ...extra
  };
}
const normal = options();
const prepared = await loadLegacyWorkbenchData(normal);
const root = new URL('../runtime-data/workbench-demand/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
const full = (await Promise.all(manifest.shards.map(async entry => JSON.parse(await readFile(new URL(entry.path, root)), reviveWorkbench)))).flat();

test('legacy assembly matches every existing card carrier, without a DOM', () => {
  assert.equal(typeof document, 'undefined');
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.ratedDisplayWorks, serializeWorkbench), reviveWorkbench), full);
  assert.equal(prepared.runtimeDiagnostics.runtimeWorkCount, full.length);
  assert.deepEqual(normal.measures, ['runtime-fetch-and-parse', 'sample-preparation']);
  assert.deepEqual(normal.diagnostics, [prepared.runtimeDiagnostics]);
  assert.equal(prepared.confirmedBangumiImportBindings, prepared.bangumiPublicBindings.bindings);
  assert.ok(prepared.populationContract.admissions.workIds.length > 0);
  assert.ok(prepared.brands.some(brand => brand.searchAliases?.length));
});

test('legacy validated lookup facades cross the Worker boundary without methods or lost entries', () => {
  const maps = {
    workAliasesById: prepared.workAliasesById,
    workPinyinById: prepared.workPinyinById,
    companyAliasesById: prepared.enrichment.companyAliasesById,
    companyPinyinById: prepared.enrichment.companyPinyinById
  };
  assert.throws(() => structuredClone(maps), { name: 'DataCloneError' });
  const payload = {
    works: prepared.ratedDisplayWorks, brands: prepared.brands,
    backendIndexes: prepared.sample.backendIndexes,
    ...Object.fromEntries(Object.entries(maps).map(([key, value]) => [key, toWorkerLookup(value)]))
  };
  const cloned = structuredClone(payload);
  for (const [key, source] of Object.entries(maps)) assert.deepEqual([...cloned[key]], [...source.entries()]);
  assert.deepEqual(cloned.works, prepared.ratedDisplayWorks);
  assert.equal(toWorkerLookup(null), null);
  assert.equal(toWorkerLookup(cloned.workAliasesById), cloned.workAliasesById);
});

test('the public main exports remain compatible with isolated data modules', async () => {
  const main = await import('../main.js');
  assert.equal(main.assertSample, assertSample);
  assert.equal(main.prepareRuntimeSample, prepareRuntimeSample);
  assert.equal(main.fetchStagedRuntimeCoreSources, fetchStagedRuntimeCoreSources);
});

test('legacy URL and disabled demand config invoke only the explicit legacy adapter', async () => {
  let calls = 0;
  const legacyLoader = () => { calls++; return prepared; };
  const fetchImpl = () => { throw Error('demand fetch must not run'); };
  assert.equal(await loadWorkbenchData({ legacyLoader, fetchImpl, locationRef: { search: '?legacyWorkbench' } }), prepared);
  assert.equal(await loadWorkbenchData({ legacyLoader, fetchImpl, config: { enabled: false } }), prepared);
  assert.equal(calls, 2);
});

for (const [key, message] of [
  ['vndbRatingsV1', 'VNDB ratings sidecar rejected'],
  ['bangumiRatingsV1', 'Bangumi ratings sidecar rejected'],
  ['bangumiPublicBindingsV1', 'Bangumi public bindings carrier rejected'],
  ['bangumiCanonicalAliasFallbackV1', 'Bangumi canonical alias fallback rejected'],
  ['authorityFanoutV1', 'authority fanout projection rejected']
]) test(`${key}: a wrong SHA fails closed`, async () => {
  const label = {
    vndbRatingsV1: 'VNDB ratings sidecar', bangumiRatingsV1: 'Bangumi ratings sidecar',
    bangumiPublicBindingsV1: 'Bangumi public bindings carrier',
    bangumiCanonicalAliasFallbackV1: 'Bangumi canonical alias fallback',
    authorityFanoutV1: 'authority fanout projection'
  }[key];
  await assert.rejects(loadLegacyWorkbenchData(options({ fetchSource: async (url, name) => {
    const source = await diskSource(url);
    return name === label ? { ...source, sha256: '0'.repeat(64) } : source;
  } })), error => error.message === message && /hash/.test(error.cause?.message));
});

test('required source failure does not degrade to a partial catalog and a fresh attempt recovers', async () => {
  await assert.rejects(loadLegacyWorkbenchData(options({ fetchSource: async (url, label) => {
    if (label === 'VNDB admissions sidecar') throw Error('offline admissions');
    return diskSource(url);
  } })), /offline admissions/);
  const recovered = await loadLegacyWorkbenchData(options());
  assert.deepEqual(recovered.ratedDisplayWorks, prepared.ratedDisplayWorks);
});

test('enrichment and company profile retain catalog-source identity validation', async () => {
  for (const label of ['alias enrichment sidecar', 'company profile sidecar']) {
    await assert.rejects(loadLegacyWorkbenchData(options({ fetchSource: async (url, name) => {
      const source = await diskSource(url);
      if (name === label) source.value.sourceCatalogSha256 = '0'.repeat(64);
      return source;
    } })), error => error.message === `${label} rejected` && /SHA|sha|hash/.test(error.cause?.message));
  }
});

test('disabled ratings/binding/fallback flags do not fetch or silently apply those carriers', async () => {
  const features = { ...RUNTIME_FEATURES };
  for (const key of ['vndbRatingsV1', 'bangumiRatingsV1', 'bangumiPublicBindingsV1', 'bangumiCanonicalAliasFallbackV1']) features[key] = { ...features[key], enabled: false };
  const setup = options({ features });
  const result = await loadLegacyWorkbenchData(setup);
  assert.equal(result.bangumiPublicBindings, null);
  assert.equal(result.confirmedBangumiImportBindings, null);
  assert.ok(setup.calls.every(call => !/ratings sidecar|bindings carrier|canonical alias fallback/.test(call.label)));
  assert.equal(result.ratedDisplayWorks.length, full.length);
});

test('legacy media fallback retains its bridge SHA guard', async () => {
  await assert.rejects(loadLegacyWorkbenchData(options({
    features: { ...RUNTIME_FEATURES, authorityFanoutV1: { ...RUNTIME_FEATURES.authorityFanoutV1, enabled: false } },
    fetchSource: async (url, label) => {
      const source = await diskSource(url);
      return label === 'G1 media clearance bridge' ? { ...source, sha256: '0'.repeat(64) } : source;
    }
  })), /G1 media clearance bridge hash mismatch/);
});

test('sample validation keeps filter membership, dimensions and duplicate identities strict', () => {
  const sample = {
    schemaVersion: 'egs-tier-sample-document-v3', sampleId: 'test', brands: [],
    filters: [{ filterId: 'f', displayTitle: '内容', groupId: 'content', groupTitleZh: '内容', displayOrder: 0 }],
    genreFilters: [{ filterId: 'g', displayTitle: '类型', groupId: 'game-type', groupTitleZh: '类型', displayOrder: 0 }],
    platformFilters: [{ filterId: 'p', displayTitle: '平台', groupId: 'platform', groupTitleZh: '平台', displayOrder: 0 }],
    works: [{ workId: '1', coverPath: 'cover.webp', coverWidth: 10, coverHeight: 20, rawGenre: '', rawFilterIds: ['f'], filterIds: ['f'], genreFilterIds: ['g'], platformFilterId: 'p' }]
  };
  const check = value => assertSample(value, { enforceAuthorityCounts: false });
  assert.equal(check(sample), sample);
  assert.throws(() => assertSample(sample), /45/);
  for (const patch of [{ filterIds: ['unknown'] }, { filterIds: ['f', 'f'] }, { filterIds: ['g'] }, { coverPath: '../private' }, { coverWidth: 0 }, { platformFilterId: 'g' }]) {
    assert.throws(() => check({ ...sample, works: [{ ...sample.works[0], ...patch }] }));
  }
  assert.throws(() => check({ ...sample, works: [...sample.works, ...sample.works] }), /workId/);
});

test('presentation helpers preserve originals and do not overwrite canonical titles', () => {
  const brand = { brandId: 'b', searchAliases: ['ABC'] };
  assert.equal(projectBrandsWithAliases([brand], null)[0], brand);
  assert.deepEqual(projectBrandsWithAliases([brand], new Map([['b', ['ＡＢＣ', '别名']]]))[0].searchAliases, ['ABC', '别名']);
  const work = { workId: '1', title: '原名' };
  assert.equal(projectWorkWithDisplayTitle(work), work);
  const titles = new Map([['1', '人工标题']]);
  const result = applyBangumiCanonicalAliasFallback({ workDisplayTitlesById: titles, fallbackByWorkId: new Map([['1', { displayTitle: '不覆盖' }], ['2', { displayTitle: '补充' }]]) });
  assert.equal(result.workDisplayTitlesById.get('1'), '人工标题');
  assert.equal(result.workDisplayTitlesById.get('2'), '补充');
  assert.equal(titles.size, 1);
  const manifest = { assets: [{ workId: '1' }, { workId: '2' }] };
  assert.equal(restrictAssetsManifestToCatalog(manifest, ['1', '2']), manifest);
  assert.deepEqual(restrictAssetsManifestToCatalog(manifest, ['1']).assets, [{ workId: '1' }]);
  assert.equal(manifest.assets.length, 2);
});
