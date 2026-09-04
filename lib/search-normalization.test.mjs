import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CJK_SEARCH_VARIANT_COUNT,
  CJK_SEARCH_VARIANT_SOURCE,
  foldCjkSearchVariants
} from './cjk-search-variants.js';
import {
  CJK_SEARCH_PINYIN_CHARACTER_COUNT,
  CJK_SEARCH_PINYIN_SOURCE
} from './cjk-search-pinyin.js';
import { filterPersonsBySearch, withCjkPersonSearchKey } from './person-search.js';
import {
  buildPinyinSearchHaystack,
  buildSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText,
  normalizeSearchText
} from './search-normalization.js';

test('pins the generated OpenCC character table', () => {
  assert.equal(CJK_SEARCH_VARIANT_COUNT, 4163);
  assert.deepEqual(CJK_SEARCH_VARIANT_SOURCE, {
    project: 'BYVoid/OpenCC',
    tag: 'ver.1.4.1',
    commit: '81223ed87ae53283ef518e2deac34b7971f8a39e',
    license: 'Apache-2.0'
  });
});

test('pins the generated pypinyin corpus table', () => {
  assert.equal(CJK_SEARCH_PINYIN_CHARACTER_COUNT, 2529);
  assert.deepEqual(CJK_SEARCH_PINYIN_SOURCE, {
    project: 'mozillazg/python-pinyin',
    package: 'pypinyin',
    version: '0.55.0',
    license: 'MIT'
  });
});

test('folds Japanese and traditional forms without changing display values', () => {
  const displayName = '成瀬 未亜';
  assert.equal(foldCjkSearchVariants(displayName), '成濑 未亚');
  assert.equal(displayName, '成瀬 未亜');
  assert.equal(foldCjkSearchVariants('桜沢島葉樹'), '樱泽岛叶树');
});

test('keeps original and folded index keys while leaving query normalization directional', () => {
  const haystack = buildSearchHaystack(['成瀬 未亜'], { loose: true });
  assert.equal(haystack.includes('成瀬未亜'), true);
  assert.equal(haystack.includes('成濑未亚'), true);
  assert.equal(normalizeLooseSearchText('成濑 未亚'), '成濑未亚');
  assert.equal(normalizeSearchText('  ＡＢＣ  '), 'abc');
});

test('builds search-only Mandarin pinyin after CJK folding', () => {
  const haystack = buildPinyinSearchHaystack(['成瀬 未亜']);
  assert.equal(haystack, 'chenglaiweiya');
  assert.equal(normalizeGeneratedPinyinQuery('Cheng Lai'), 'chenglai');
  assert.equal(normalizeGeneratedPinyinQuery('ai'), '');
});

test('excludes a conflicting OpenCC composition from the emitted map', () => {
  assert.equal(foldCjkSearchVariants('頴'), '頴');
});

test('person search accepts simplified input and preserves collision candidates', () => {
  const persons = [
    withCjkPersonSearchKey({ entityId: 'naruse', canonicalName: '成瀬 未亜', displayName: '成瀬 未亜', aliases: [], nameVariants: [] }),
    withCjkPersonSearchKey({ entityId: 'liu-simple', canonicalName: '柳知萧', aliases: [], nameVariants: [] }),
    withCjkPersonSearchKey({ entityId: 'liu-traditional', canonicalName: '柳知蕭', aliases: [], nameVariants: [] })
  ];
  assert.deepEqual(filterPersonsBySearch(persons, '成濑未亚').map(person => person.entityId), ['naruse']);
  assert.deepEqual(filterPersonsBySearch(persons, '成瀬未亜').map(person => person.entityId), ['naruse']);
  assert.deepEqual(filterPersonsBySearch(persons, 'chenglai').map(person => person.entityId), ['naruse']);
  assert.deepEqual(filterPersonsBySearch(persons, '柳知萧').map(person => person.entityId), ['liu-simple', 'liu-traditional']);
});
