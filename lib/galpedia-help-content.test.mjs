import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articles,
  CONTEXTS,
  getHelpArticle,
  HELP_ARTICLES,
  searchHelpArticles
} from './galpedia-help-content.js';
import { CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES } from './galpedia-release-notes.js';

const EXPECTED_IDS = [
  'home.overview',
  'works.overview', 'works.search', 'works.filters', 'works.formulas', 'works.display', 'works.selection', 'works.compare', 'works.mobile',
  'tier.overview', 'tier.candidates', 'tier.bangumi', 'tier.drag-drop', 'tier.batch-select', 'tier.custom-images', 'tier.stickers', 'tier.edit-tiers', 'tier.live', 'tier.export', 'tier.backup',
  'companies.overview', 'companies.works', 'companies.ranking',
  'people.overview',
  'data.sources', 'data.scores', 'data.snapshots', 'data.missing-data',
  'about.galpedia', 'about.changelog', 'about.shiori'
];

test('exports exactly the 31 designed help articles with valid structure', () => {
  assert.equal(articles, HELP_ARTICLES);
  assert.equal(articles.length, 31);
  assert.deepEqual(articles.map(item => item.id), EXPECTED_IDS);
  assert.ok(Object.isFrozen(articles));
  const ids = new Set(EXPECTED_IDS);
  for (const item of articles) {
    assert.equal(typeof item.category, 'string');
    assert.equal(typeof item.title, 'string');
    assert.equal(typeof item.summary, 'string');
    for (const field of ['keywords', 'steps', 'notes', 'related', 'sections']) {
      assert.ok(Array.isArray(item[field]), item.id + '.' + field);
    }
    for (const value of [...item.keywords, ...item.steps, ...item.notes]) {
      assert.equal(typeof value, 'string');
    }
    for (const section of item.sections) {
      assert.equal(typeof section.title, 'string');
      assert.ok(Array.isArray(section.paragraphs));
      for (const paragraph of section.paragraphs) assert.equal(typeof paragraph, 'string');
    }
    for (const related of item.related) assert.ok(ids.has(related), item.id + ' -> ' + related);
    assert.ok(item.contexts.length > 0);
  }
});

test('getHelpArticle resolves known IDs and safely misses unknown IDs', () => {
  assert.equal(getHelpArticle('tier.bangumi').title, '从 Bangumi 导入公开收藏');
  assert.equal(getHelpArticle('unknown.article'), undefined);
  assert.equal(getHelpArticle(null), undefined);
});

test('release notes are one local source for the about landing and changelog', () => {
  assert.equal(GALPEDIA_RELEASE_NOTES.length, 1);
  assert.equal(CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES[0]);
  assert.equal(CURRENT_GALPEDIA_RELEASE.version, 'v1.0.0-beta.1');
  assert.equal(CURRENT_GALPEDIA_RELEASE.label, '公测版');
  assert.equal(CURRENT_GALPEDIA_RELEASE.date, '2026-09-05');
  assert.equal(CURRENT_GALPEDIA_RELEASE.releaseId, '20260905-galpedia-v1.0.0-beta.1');
  assert.equal(CURRENT_GALPEDIA_RELEASE.notice, '目前处于公测阶段，资料与使用体验仍在持续完善。');
  assert.equal(CURRENT_GALPEDIA_RELEASE.summary.length, 3);
  assert.equal(CURRENT_GALPEDIA_RELEASE.log.length, 4);
  assert.equal(getHelpArticle('about.changelog').sourceRefs[0], CURRENT_GALPEDIA_RELEASE.releaseId);
  assert.ok(searchHelpArticles('v1.0.0-beta.1').some(item => item.id === 'about.changelog'));
  assert.ok(searchHelpArticles('2026-09-05').some(item => item.id === 'about.changelog'));
});

test('search is local substring search with normalized whitespace and title priority', () => {
  const bangumi = searchHelpArticles('  BANGUMI  ').map(item => item.id);
  assert.equal(bangumi[0], 'tier.bangumi');
  assert.ok(bangumi.includes('data.sources'));
  assert.equal(searchHelpArticles('贴 纸')[0].id, 'tier.stickers');
  assert.ok(searchHelpArticles('贴 纸').some(item => item.id === 'tier.stickers'));
  assert.equal(searchHelpArticles('公  开收藏')[0].id, 'tier.bangumi');
  assert.deepEqual(searchHelpArticles('   '), []);
  assert.throws(() => searchHelpArticles(null), TypeError);
});

test('search includes summary, sections, steps, and notes', () => {
  assert.ok(searchHelpArticles('候选池').some(item => item.id === 'tier.candidates'));
  assert.ok(searchHelpArticles('参与作品').some(item => item.id === 'people.overview'));
  assert.ok(searchHelpArticles('稍后重试').some(item => item.id === 'data.missing-data'));
  assert.ok(searchHelpArticles('可读的形状').some(item => item.id === 'works.formulas'));
});

test('contexts keep content domains separate from the four handbook columns', () => {
  assert.equal(getHelpArticle('home.overview').category, 'home');
  assert.ok(getHelpArticle('home.overview').contexts.includes(CONTEXTS.CURRENT));
  assert.equal(getHelpArticle('data.scores').category, 'data');
  assert.ok(getHelpArticle('data.scores').contexts.includes(CONTEXTS.DATA));
  assert.equal(getHelpArticle('about.shiori').category, 'about');
  assert.ok(getHelpArticle('about.shiori').contexts.includes(CONTEXTS.ABOUT));
});

test('records verified live filter commits and sticker gestures', () => {
  const filters = getHelpArticle('works.filters');
  assert.ok(filters.notes.some(note => note.includes('结果会自动更新')));
  assert.ok(filters.notes.some(note => note.includes('点击“应用”即可收起筛选面板')));
  assert.match(getHelpArticle('tier.stickers').steps.join(''), /双指.*缩放.*旋转/u);
});

test('keeps overview copy short and limits keeper tips to user-facing principles', () => {
  assert.deepEqual(getHelpArticle('home.overview').notes, []);
  assert.deepEqual(getHelpArticle('home.overview').sections, []);
  assert.deepEqual(getHelpArticle('companies.overview').notes, []);
  assert.deepEqual(getHelpArticle('companies.overview').sections, []);
  const people = getHelpArticle('people.overview');
  assert.match(people.summary, /姓名或别名/u);
  assert.equal(people.steps.length, 3);
  assert.deepEqual(people.sections, []);
  assert.deepEqual(
    articles.filter(item => item.keeperTip).map(item => item.id),
    ['tier.backup', 'data.scores', 'data.missing-data']
  );
});

test('visible handbook copy excludes implementation-only vocabulary', () => {
  const forbidden = /canonical|\bAPI\b|载荷|投影|contract|identity|运行时|当前实现|实体|索引|工作池|公共 JSON|JSON 公共|数据边界|规范化|部署|筛选 ID|字段|规则/iu;
  for (const item of articles) {
    const visible = [
      item.title,
      item.subtitle,
      item.summary,
      ...item.steps,
      ...item.notes,
      item.keeperTip,
      ...item.sections.flatMap(section => [section.title, ...section.paragraphs])
    ].join(' ');
    assert.doesNotMatch(visible, forbidden, item.id);
  }
});
