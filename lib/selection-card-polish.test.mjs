import assert from 'node:assert/strict';
import test from 'node:test';
import { createSelectionCard } from '../views/selection-view.js';

// A small DOM double for structure/text contracts; real layout and hit targets
// are checked separately in the browser, not inferred from this double.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.text = '';
    this.classList = {
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        if (enabled) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      }
    };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(e => e.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener() {}
}
const documentRef = { createElement: tag => new Element(tag) };
function nodes(root, name) {
  return [root, ...root.children.flatMap(child => nodes(child, name))].filter(node => node.className.split(' ').includes(name));
}
const all = { showTitle: true, showCompany: true, showYear: true, showEgs: true, showVndb: true, showBangumi: true };
const work = { workId: 'fixture', title: '作品标题', brandName: '会社', releaseDate: '2006-01-01', median: 88, voteCount: 100, vndbRating: { cardText: 'VNDB 81.4' }, bangumiRating: { detailScore: '8.6' } };
function card({ display = all, view = 'full', ...patch } = {}) {
  return createSelectionCard(documentRef, { ...work, ...patch }, {
    display, view, selectionEnabled: false, selected: false,
    onToggle() {}, onOpenDetails() {}, coverUrl: 'https://example.test/cover.webp'
  });
}

test('all 64 display combinations preserve independent fields without empty metadata wrappers', () => {
  const keys = Object.keys(all);
  for (let mask = 0; mask < 64; mask++) {
    const display = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    const root = card({ display });
    for (const [key, name] of [['showTitle', 'title'], ['showCompany', 'company'], ['showYear', 'year'], ['showEgs', 'egs-rating'], ['showVndb', 'vndb-rating'], ['showBangumi', 'bangumi-rating']]) {
      assert.equal(nodes(root, `selection-card-${name}`).length, Number(display[key]), `${mask}:${key}`);
    }
    assert.equal(nodes(root, 'selection-card-overlay').length, Number(mask !== 0));
    assert.equal(nodes(root, 'selection-card-metadata').length, Number(display.showCompany || display.showYear));
  }
});

test('rating emphasis preserves source text, values and unavailable states', () => {
  const root = card();
  assert.deepEqual(nodes(root, 'selection-card-rating-line').map(e => e.textContent), ['EGS 88', 'VNDB 81.4', 'BGM 8.6']);
  assert.deepEqual(nodes(root, 'selection-card-rating-value').map(e => e.tagName), ['strong', 'strong', 'strong']);
  const missing = card({ median: null, voteCount: null, vndbRating: undefined, bangumiRating: undefined });
  assert.deepEqual(nodes(missing, 'selection-card-rating-line').map(e => e.textContent), ['EGS 暂无评分']);
});

test('year shares the full-card metadata row but stays a direct compact-card child', () => {
  const full = card();
  assert.equal(nodes(full, 'selection-card-year')[0].parentElement, nodes(full, 'selection-card-metadata')[0]);
  const compact = card({ view: 'compact' });
  assert.equal(nodes(compact, 'selection-card-metadata').length, 0);
  assert.equal(nodes(compact, 'selection-card-year')[0].parentElement, compact);
  assert.equal(nodes(compact, 'selection-card-company')[0].parentElement, nodes(compact, 'selection-card-overlay')[0]);
});

test('missing company and date produce no placeholder metadata', () => {
  assert.equal(nodes(card({ brandName: '', releaseDate: null }), 'selection-card-metadata').length, 0);
  const root = card({ brandName: '' });
  assert.equal(nodes(root, 'selection-card-metadata')[0].textContent, '2006');
  assert.equal(nodes(root, 'selection-card-title')[0].title, work.title);
});
