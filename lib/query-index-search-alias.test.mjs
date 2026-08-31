import assert from 'node:assert/strict';
import test from 'node:test';
import { createQueryIndex, queryIndexedCatalog } from './query-index.js';

const works = [
  { workId: '1', title: 'WHITE ALBUM2 ～closing chapter～', brandId: 'leaf', median: 80, voteCount: 100, releaseDate: '2011-12-22', filterIds: [], genreFilterIds: [], platformFilterId: 'pc' },
  { workId: '2', title: 'リトルバスターズ!エクスタシー', brandId: 'key', median: 80, voteCount: 100, releaseDate: '2008-07-25', filterIds: [], genreFilterIds: [], platformFilterId: 'pc' },
  { workId: '3', title: 'この世の果てで恋を唄う少女YU-NO', brandId: 'elf', median: 80, voteCount: 100, releaseDate: '1996-12-26', filterIds: [], genreFilterIds: [], platformFilterId: 'pc' }
];
const baseState = {
  mode: 'normal', minimumScore: 0, minimumVoteCount: 0,
  releaseYearStart: 1900, releaseYearEnd: 2100, brandIds: [],
  attributeSelections: { 'game-type': [], platform: [], length: [] },
  basicOperator: 'AND', positiveFilterIds: [], excludedFilterIds: [],
  excludeNukige: false, advancedExpression: '', sortKey: 'title', sortDirection: 'asc'
};

function index() {
  return createQueryIndex({
    works,
    knownFilterIds: [],
    brands: [],
    workAliasesById: new Map([
      ['1', ['白色相簿2']],
      ['2', ['Little Busters! EX']]
    ])
  });
}

test('matches aliases when punctuation and spacing differ', () => {
  const result = queryIndexedCatalog(index(), { ...baseState, titleQuery: '白色相簿 2' });
  assert.deepEqual(result.map(work => work.workId), ['1']);
});

test('matches full-width and ASCII punctuation variants', () => {
  const result = queryIndexedCatalog(index(), { ...baseState, titleQuery: 'Little-Busters EX' });
  assert.deepEqual(result.map(work => work.workId), ['2']);
});

test('matches a separator-free romanized title without a dedicated alias', () => {
  const result = queryIndexedCatalog(index(), { ...baseState, titleQuery: 'yuno' });
  assert.deepEqual(result.map(work => work.workId), ['3']);
});
