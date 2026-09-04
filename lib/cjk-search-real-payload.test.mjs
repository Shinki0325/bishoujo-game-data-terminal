import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterPersonsBySearch, withCjkPersonSearchKey } from './person-search.js';
import { createQueryIndex, queryIndexedCatalog } from './query-index.js';

const root = new URL('../', import.meta.url);
const readJson = relativePath => JSON.parse(readFileSync(new URL(relativePath, root), 'utf8'));

test('real work payload matches 瀬里奈 through simplified Chinese and pinyin', () => {
  const catalog = readJson('data/catalog.json');
  const source = catalog.works.find(work => work.workId === '3773');
  assert.equal(source?.title, '瀬里奈');
  const work = {
    workId: source.workId,
    title: source.title,
    brandId: source.companyId,
    median: source.median,
    voteCount: source.voteCount,
    releaseDate: source.releaseDate,
    filterIds: source.filterIds,
    genreFilterIds: source.genreIds,
    platformFilterId: source.platformId
  };
  const index = createQueryIndex({ works: [work], knownFilterIds: [] });
  const state = {
    mode: 'normal', minimumScore: 0, minimumVoteCount: 0,
    releaseYearStart: 1900, releaseYearEnd: 2100, brandIds: [],
    attributeSelections: { 'game-type': [], platform: [], length: [] },
    basicOperator: 'AND', positiveFilterIds: [], excludedFilterIds: [],
    excludeNukige: false, advancedExpression: '', sortKey: 'title', sortDirection: 'asc'
  };
  assert.deepEqual(queryIndexedCatalog(index, { ...state, titleQuery: '瀬里奈' }).map(item => item.workId), ['3773']);
  assert.deepEqual(queryIndexedCatalog(index, { ...state, titleQuery: '濑里奈' }).map(item => item.workId), ['3773']);
  assert.deepEqual(queryIndexedCatalog(index, { ...state, titleQuery: 'lailinai' }).map(item => item.workId), ['3773']);
});

test('real performance directory matches 成瀬未亜 through simplified Chinese and pinyin', () => {
  const index = readJson('data/terminal-wiki-m2-person-source-only-v1/performance-candidate/directory-index.json');
  const source = index.records.find(person => person.entityId === 'per_000000000c6c');
  assert.equal(source?.canonicalName, '成瀬 未亜');
  const person = withCjkPersonSearchKey(source);
  assert.deepEqual(filterPersonsBySearch([person], '成瀬 未亜').map(item => item.entityId), ['per_000000000c6c']);
  assert.deepEqual(filterPersonsBySearch([person], '成濑未亚').map(item => item.entityId), ['per_000000000c6c']);
  assert.deepEqual(filterPersonsBySearch([person], 'chenglai').map(item => item.entityId), ['per_000000000c6c']);
  assert.deepEqual(filterPersonsBySearch([person], 'cheng lai').map(item => item.entityId), ['per_000000000c6c']);
  assert.equal(person.displayName, source.displayName);
});

test('full performance directory retains all chenglai candidates and includes 成瀬未亜', () => {
  const index = readJson('data/terminal-wiki-m2-person-source-only-v1/performance-candidate/directory-index.json');
  const persons = index.records.map(withCjkPersonSearchKey);
  const matches = filterPersonsBySearch(persons, 'chenglai');
  assert.equal(matches.length, 8);
  assert.equal(matches.some(person => person.entityId === 'per_000000000c6c'), true);
});
