import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRankingLocatorEntries,
  searchRankingLocator
} from './ranking-locator.js';

test('显示译名时仍可按原始日文标题查找', () => {
  const sample = { tiers: [], candidateWorks: [{ workId: 'jp', title: 'サクラノ刻', displayTitle: '樱之刻' }] };
  assert.equal(searchRankingLocator(sample, 'サクラノ刻').results[0].workId, 'jp');
  assert.equal(searchRankingLocator(sample, '樱之刻').results[0].workId, 'jp');
});

function model() {
  return {
    tiers: [
      { id: 's', name: 'S', works: [
        { workId: 'w-1', title: '樱之刻', aliases: ['サクラノ刻', 'Sakura no Toki'] }
      ] },
      { id: 'a', name: 'A', works: [
        { workId: 'w-2', displayTitle: 'WHITE ALBUM2', searchAliases: ['白色相簿2'] }
      ] }
    ],
    candidateWorks: [
      { workId: 'w-3', title: '未排作品', aliases: ['Candidate Alias'] },
      { workId: 'c-1', title: 'アリスソフト会社', company: { aliases: ['Alice Soft'] } }
    ]
  };
}

test('全榜索引保留等级顺序并包含已排与候选', () => {
  const entries = buildRankingLocatorEntries(model());
  assert.deepEqual(entries.map(entry => [entry.workId, entry.locationLabel]), [
    ['w-1', 'S'], ['w-2', 'A'], ['w-3', '候选区'], ['c-1', '候选区']
  ]);
  assert.equal(entries[0].aliases.includes('サクラノ刻'), true);
});

test('搜索支持名称、别名、繁简变体和公司别名', () => {
  assert.deepEqual(searchRankingLocator(model(), '白色相簿2').results.map(entry => entry.workId), ['w-2']);
  assert.deepEqual(searchRankingLocator(model(), '樱之刻').results.map(entry => entry.workId), ['w-1']);
  assert.deepEqual(searchRankingLocator(model(), 'AliceSoft').results.map(entry => entry.workId), ['c-1']);
  assert.deepEqual(searchRankingLocator(model(), 'sakura').results.map(entry => entry.workId), ['w-1']);
});

test('结果有上限但总数保持完整，且不改变榜单顺序', () => {
  const source = model();
  source.candidateWorks = Array.from({ length: 8 }, (_, index) => ({
    workId: `extra-${index}`,
    title: `候选 ${index}`
  }));
  const result = searchRankingLocator(source, '候选', { limit: 3 });
  assert.equal(result.total, 8);
  assert.equal(result.limited, true);
  assert.deepEqual(result.results.map(entry => entry.workId), ['extra-0', 'extra-1', 'extra-2']);
});

test('重复作品只显示已排位置，避免同一选择出现两次', () => {
  const source = model();
  source.candidateWorks.push({ workId: 'w-1', title: '重复候选' });
  const entries = buildRankingLocatorEntries(source);
  assert.equal(entries.filter(entry => entry.workId === 'w-1').length, 1);
  assert.equal(entries.find(entry => entry.workId === 'w-1').locationLabel, 'S');
});
