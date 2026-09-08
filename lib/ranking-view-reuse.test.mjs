import assert from 'node:assert/strict';
import test from 'node:test';
import { createRankingCard } from '../views/ranking-view.js';

class Element extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {
      values: {},
      setProperty: (key, value) => { this.style.values[key] = String(value); },
      removeProperty: key => { delete this.style.values[key]; },
      getPropertyValue: key => this.style.values[key] ?? ''
    };
    this.className = '';
    this.hidden = false;
    this.draggable = false;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.classList = {
      contains: name => this.className.split(' ').filter(Boolean).includes(name),
      add: (...names) => {
        const values = new Set(this.className.split(' ').filter(Boolean));
        names.forEach(name => values.add(name));
        this.className = [...values].join(' ');
      },
      remove: (...names) => {
        const values = new Set(this.className.split(' ').filter(Boolean));
        names.forEach(name => values.delete(name));
        this.className = [...values].join(' ');
      },
      toggle: (name, enabled) => {
        if (enabled === undefined) enabled = !this.classList.contains(name);
        if (enabled) this.classList.add(name); else this.classList.remove(name);
      }
    };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return `${this.text ?? ''}${this.children.map(child => child.textContent).join('')}`; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    if (index < 0) throw new Error('child not found');
    if (next.parentElement) next.parentElement.removeChild(next);
    next.parentElement = this;
    previous.parentElement = null;
    this.children[index] = next;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
  }
  remove() { this.parentElement?.removeChild(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('.')
      ? node.classList.contains(selector.slice(1))
      : selector === node.tagName;
    return this.children.flatMap(child => [ ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector) ]);
  }
  cloneNode() {
    const clone = new Element(this.tagName, this.ownerDocument);
    clone.className = this.className;
    clone.attributes = { ...this.attributes };
    clone.src = this.src;
    clone.hidden = this.hidden;
    return clone;
  }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { width: 100, height: 120, top: 0, bottom: 120, left: 0, right: 100 }; }
}

const documentRef = {
  activeElement: null,
  createElement(tagName) { return new Element(tagName, documentRef); },
  defaultView: { innerWidth: 1280, matchMedia: () => ({ matches: true }) }
};

function callbacks(calls) {
  return {
    onOpenDetails: work => calls.push(['details', work.title]),
    onOpenMedia: work => calls.push(['media', work.title]),
    onDragStart: () => {},
    onDragEnd: () => {},
    onArrange: work => calls.push(['arrange', work.title]),
    shouldSuppressMediaClick: () => false,
    isCardActivationEnabled: () => true
  };
}

test('ranking card keeps its node while latest work, callback and media are synchronized', () => {
  const calls = [];
  const first = { workId: 'w1', title: '旧标题', coverWidth: 400, coverHeight: 600 };
  const card = createRankingCard(documentRef, first, { ...callbacks(calls), coverUrl: 'https://cdn.test/old.webp' });
  const cover = card.querySelector('.ranking-card-cover');
  const image = cover.querySelector('img');
  cover.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, [['media', '旧标题']]);

  const nextCalls = [];
  const next = { workId: 'w1', title: '新标题', coverWidth: null, coverHeight: null };
  assert.equal(card.__rankingUpdate(next, { ...callbacks(nextCalls) }, {
    coverUrl: 'blob:new-cover',
    previewUrl: 'blob:new-preview'
  }), card);
  assert.equal(card.querySelector('.ranking-card-title').textContent, '新标题');
  assert.equal(card.getAttribute('aria-label'), '新标题');
  assert.equal(image.src, 'blob:new-cover');
  assert.equal(image.crossOrigin, '');
  assert.equal(card.style.getPropertyValue('--ranking-cover-ratio'), '');
  cover.dispatchEvent(new Event('click'));
  assert.deepEqual(nextCalls, [['media', '新标题']]);
  assert.deepEqual(calls, [['media', '旧标题']]);
});

test('unchanged card refresh does not rewrite card attributes or styles', () => {
  const work = { workId: 'w1', title: '标题', coverWidth: 400, coverHeight: 600 };
  const media = { coverUrl: 'https://cdn.test/cover.webp' };
  const card = createRankingCard(documentRef, work, { ...callbacks([]), ...media });
  card.__rankingUpdate(work, callbacks([]), media);
  let writes = 0;
  const setAttribute = card.setAttribute.bind(card);
  card.setAttribute = (...args) => { writes++; setAttribute(...args); };
  const setStyle = card.style.setProperty;
  card.style.setProperty = (...args) => { writes++; setStyle(...args); };
  card.style.removeProperty = () => { writes++; };
  const dataset = card.dataset;
  card.dataset = new Proxy(dataset, { set(target, key, value) { writes++; target[key] = value; return true; } });
  card.__rankingUpdate({ ...work }, callbacks([]), { ...media });
  assert.equal(writes, 0);
  card.__rankingUpdate({ ...work, title: '新标题', coverWidth: 600 }, callbacks([]), media);
  assert.ok(writes > 0);
  assert.equal(card.getAttribute('aria-label'), '新标题');
});
