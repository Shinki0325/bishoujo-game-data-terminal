import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareBangumiCanonicalAliasFallback } from './bangumi-canonical-alias-fallback.js';
import { prepareEnrichmentSidecar } from './enrichment-sidecar.js';
import { createQueryIndex, queryIndexedCatalog } from './query-index.js';
import { BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH } from './runtime-config.js';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const sha256 = path => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
const catalog = readJson('data/catalog.json');
const enrichmentSource = readJson('data/egs-tier-full-enrichment-v1.json');
const fallbackSource = readJson(`data/${BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH}`);
const bindingsSource = readJson('data/egs-tier-bangumi-public-bindings-v1.json');
const catalogSha256 = sha256('data/catalog.json');
const enrichmentSha256 = sha256('data/egs-tier-full-enrichment-v1.json');
const bindingsSha256 = sha256('data/egs-tier-bangumi-public-bindings-v1.json');
const workIds = new Set(catalog.works.map(work => work.workId));

const enrichment = prepareEnrichmentSidecar(enrichmentSource, {
  catalogSnapshotId: catalog.snapshot.snapshotId,
  catalogSha256,
  workIds,
  companyIds: new Set(catalog.companies.map(company => company.companyId))
});
const fallback = prepareBangumiCanonicalAliasFallback(fallbackSource, {
  catalogSnapshotId: catalog.snapshot.snapshotId,
  catalogSha256,
  enrichmentSha256,
  bangumiPublicBindingsSha256: bindingsSha256,
  workIds: [...workIds]
});
const workAliasesById = new Map(enrichment.workAliasesById);
for (const [workId, entry] of fallback.workFallbackById) {
  workAliasesById.set(workId, Object.freeze([
    entry.displayTitle,
    ...(workAliasesById.get(workId) ?? []).filter(alias => alias !== entry.displayTitle)
  ]));
}
const whiteAlbum = fallback.workFallbackById.get('701');
const works = catalog.works
  .filter(work => ['701', '1714', '12797', '13255', '2093', '26653', '26724', '27720', '29872', '32047', '36202'].includes(work.workId))
  .map(work => ({
    workId: work.workId,
    title: work.title,
    brandId: work.companyId,
    median: work.median,
    voteCount: work.voteCount,
    releaseDate: work.releaseDate,
    filterIds: work.filterIds,
    genreFilterIds: work.genreIds,
    platformFilterId: work.platformId
  }));
const index = createQueryIndex({ works, knownFilterIds: [], workAliasesById });
const baseState = {
  mode: 'normal', minimumScore: 0, minimumVoteCount: 0,
  releaseYearStart: 1900, releaseYearEnd: 2100, brandIds: [],
  attributeSelections: { 'game-type': [], platform: [], length: [] },
  basicOperator: 'AND', positiveFilterIds: [], excludedFilterIds: [],
  excludeNukige: false, advancedExpression: '', sortKey: 'title', sortDirection: 'asc'
};

function search(query) {
  return queryIndexedCatalog(index, { ...baseState, titleQuery: query }).map(work => work.workId);
}

test('indexes the frozen Bangumi Chinese title for WHITE ALBUM', () => {
  assert.equal(whiteAlbum.bangumiSubjectId, '1053');
  assert.equal(whiteAlbum.displayTitle, '白色相簿');
  assert.equal(search('白色相簿').includes('701'), true);
});

test('indexes additional frozen Bangumi Chinese titles that were previously absent', () => {
  assert.deepEqual(search('家族计划'), ['1714']);
  assert.deepEqual(search('命运石之门'), ['12797']);
  assert.deepEqual(search('白色相簿2 终章'), ['13255']);
});

test('matches YU-NO without requiring a manually duplicated separator alias', () => {
  assert.deepEqual(search('yuno'), ['2093', '26653']);
});

test('exports the confirmed Nukitashi shared search alias to every member', () => {
  assert.deepEqual([...search('拔作岛')].sort(), ['26724', '27720', '29872', '32047', '36202']);
});

test('matches the confirmed Nukitashi romanized alias for every member', () => {
  assert.deepEqual([...search('nukitashi')].sort(), ['26724', '27720', '29872', '32047', '36202']);
});
