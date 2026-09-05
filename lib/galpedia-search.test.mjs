import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompanyDirectory } from './company-directory.js';
import { createGalpediaSearch } from './galpedia-search.js';
import { withCjkPersonSearchKey } from './person-search.js';

function work(workId, title, brandId = 'leaf', extra = {}) {
  return {
    workId,
    title,
    brandId,
    brandName: brandId === 'leaf' ? 'Leaf' : 'Key',
    median: 80,
    voteCount: 100,
    releaseDate: '2000-01-01',
    filterIds: [],
    genreFilterIds: [],
    platformFilterId: 'platform-pc',
    ...extra
  };
}

function directory(works, aliases = ['科乐美']) {
  return buildCompanyDirectory({
    brands: [
      { brandId: 'leaf', brandName: 'Leaf' },
      { brandId: 'key', brandName: 'Key' }
    ],
    works,
    companyAliasesById: new Map([['leaf', aliases]])
  });
}

test('empty and whitespace queries return empty groups without loading persons', async () => {
  let loadCount = 0;
  const works = [work('1', '作品')];
  const search = createGalpediaSearch({
    works,
    companyDirectory: directory(works),
    loadPersons: async () => {
      loadCount += 1;
      return [];
    }
  });

  assert.deepEqual(await search(''), { works: [], companies: [], persons: [] });
  assert.deepEqual(await search(' 　'), { works: [], companies: [], persons: [] });
  assert.equal(loadCount, 0);
});

test('work, company, and person search accepts CJK variants, aliases, and pinyin', async () => {
  const works = [
    work('1', '瀬里奈', 'leaf', {
      searchAliases: ['セリナ'],
      searchPinyin: ['lailinai']
    }),
    work('2', '别的作品', 'key')
  ];
  const persons = [
    withCjkPersonSearchKey({ entityId: 'person-a', canonicalName: '成瀬 未亜', displayName: '成瀬 未亜', aliases: [], nameVariants: [] }),
    withCjkPersonSearchKey({ entityId: 'person-b', canonicalName: '柳知蕭', displayName: '柳知蕭', aliases: [], nameVariants: [] })
  ];
  const search = createGalpediaSearch({
    works,
    companyDirectory: directory(works),
    loadPersons: async () => persons
  });

  assert.deepEqual((await search('濑里奈')).works.map(item => item.id), ['1']);
  assert.deepEqual((await search('lailinai')).works.map(item => item.id), ['1']);
  assert.deepEqual((await search('科乐美')).companies.map(item => item.name), ['Leaf']);
  assert.deepEqual((await search('科乐美')).works.map(item => item.id), ['1']);
  assert.deepEqual((await search('成濑未亚')).persons.map(item => item.id), ['person-a']);
  assert.deepEqual((await search('chenglai')).persons.map(item => item.id), ['person-a']);
});

test('company directory pinyin remains searchable when it is stored in its private index key', async () => {
  const works = [work('1', '作品', 'konami', { brandName: 'コナミ' })];
  const companyDirectory = buildCompanyDirectory({
    brands: [{ brandId: 'konami', brandName: 'コナミ' }],
    works,
    companyPinyinById: new Map([['konami', ['konami']]])
  });
  const search = createGalpediaSearch({ works, companyDirectory, loadPersons: async () => [] });

  assert.deepEqual((await search('konami')).companies.map(item => item.id), ['konami']);
});

test('optional enrichment maps preserve query-index aliases without changing display names', async () => {
  const works = [work('1', '原始展示名')];
  const search = createGalpediaSearch({
    works,
    companyDirectory: directory(works),
    enrichment: {
      workAliasesById: new Map([['1', ['别名作品']]]),
      workPinyinById: new Map([['1', ['bieliming']]])
    },
    loadPersons: async () => []
  });

  assert.deepEqual(await search('别名作品'), {
    works: [{ id: '1', name: '原始展示名', subtitle: 'Leaf · 2000' }],
    companies: [],
    persons: []
  });
  assert.deepEqual((await search('bieliming')).works.map(item => item.id), ['1']);
});

test('same-name person records remain separate identities', async () => {
  const works = [work('1', '作品')];
  const persons = [
    withCjkPersonSearchKey({ entityId: 'same-a', canonicalName: '柳知萧', displayName: '柳知萧', aliases: [], nameVariants: [] }),
    withCjkPersonSearchKey({ entityId: 'same-b', canonicalName: '柳知蕭', displayName: '柳知蕭', aliases: [], nameVariants: [] })
  ];
  const search = createGalpediaSearch({
    works,
    companyDirectory: directory(works),
    loadPersons: async () => persons
  });

  assert.deepEqual((await search('柳知萧')).persons.map(item => item.id), ['same-a', 'same-b']);
});

test('each result group is capped at five entries', async () => {
  const works = Array.from({ length: 7 }, (_, index) => work(String(index + 1), `同名作品 ${index + 1}`));
  const brands = Array.from({ length: 7 }, (_, index) => ({
    brandId: `company-${index + 1}`,
    brandName: `会社 ${index + 1}`
  }));
  const companyAliasesById = new Map(brands.map(brand => [brand.brandId, ['同名']]));
  const companyDirectory = buildCompanyDirectory({ brands, works, companyAliasesById });
  const persons = Array.from({ length: 7 }, (_, index) => withCjkPersonSearchKey({
    entityId: `person-${index + 1}`,
    canonicalName: `同名人物 ${index + 1}`,
    displayName: `同名人物 ${index + 1}`,
    aliases: [],
    nameVariants: []
  }));
  const search = createGalpediaSearch({
    works,
    companyDirectory,
    loadPersons: async () => persons
  });

  const result = await search('同名');
  assert.equal(result.works.length, 5);
  assert.equal(result.companies.length, 5);
  assert.equal(result.persons.length, 5);
});
