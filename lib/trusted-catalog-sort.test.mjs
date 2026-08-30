import assert from 'node:assert/strict';
import test from 'node:test';
import { SORT_KEYS, sortCatalog, sortTrustedCatalog } from './catalog.js';

function work(workId, overrides = {}) {
  return {
    workId,
    title: `作品 ${workId}`,
    furigana: '',
    brandName: `会社 ${workId}`,
    median: 7,
    voteCount: 100,
    egsScore: 70,
    vndbScore: 75,
    vndbVoteCount: 200,
    bangumiScore: 72,
    bangumiVoteCount: 150,
    brandId: `brand-${workId}`,
    rawFilterIds: [],
    filterIds: [],
    rawGenre: '',
    genreFilterIds: [],
    platformFilterId: 'pc',
    releaseDate: '2020-01-01',
    ...overrides
  };
}

test('trusted runtime sort matches the validated catalog comparator', () => {
  const works = [
    work('a', { title: '10', voteCount: null, median: null, releaseDate: '2021-01-02', workGroupId: 'g' }),
    work('b', { title: '2', voteCount: 500, median: 8, releaseDate: '2022-02-03', workGroupId: 'g' }),
    work('c', { title: 'あ', voteCount: 500, median: 8, vndbScore: null, bangumiVoteCount: null, releaseDate: '2019-03-04' })
  ];
  for (const sortKey of SORT_KEYS) {
    for (const sortDirection of ['asc', 'desc']) {
      const expected = sortCatalog(works, sortKey, sortDirection).map(item => item.workId);
      const actual = sortTrustedCatalog(works, sortKey, sortDirection).map(item => item.workId);
      assert.deepEqual(actual, expected, `${sortKey} ${sortDirection}`);
    }
  }
});
