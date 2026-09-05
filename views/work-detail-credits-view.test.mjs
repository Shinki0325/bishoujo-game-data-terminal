import assert from 'node:assert/strict';
import { createWorkDetailCreditsView } from './work-detail-credits-view.js';

class Node {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.className = ''; this.classList = { add: (...names) => { this.className = `${this.className} ${names.join(' ')}`.trim(); } }; this.dataset = {}; this.hidden = false; this.listeners = {}; this.attributes = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  remove() { this.removed = true; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatch(type) { for (const listener of this.listeners[type] ?? []) listener({ type, target: this }); }
  click() { this.dispatch('click'); }
  querySelectorAll(selector) {
    const match = node => selector.startsWith('.') ? node.className.split(/\s+/u).includes(selector.slice(1)) : node.tagName === selector.toUpperCase();
    return this.children.flatMap(child => [ ...(match(child) ? [child] : []), ...child.querySelectorAll(selector) ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
class Document { createElement(tag) { return new Node(tag, this); } }

const documentRef = new Document();
const root = documentRef.createElement('section');
const status = documentRef.createElement('p');
const tabs = documentRef.createElement('nav');
const content = documentRef.createElement('div');
const view = createWorkDetailCreditsView({ root, status, tabs, content });

assert.equal(view.renderWork({
  staff: {},
  cast: [
    { characterName: '有图角色', role: 'primary', image: { url: 'https://assets.example.test/char.webp', fallbackUrl: 'https://raw.example.test/char.webp' }, actors: [{ name: '声优甲' }] },
    { characterName: '入池角色', role: 'side', scopeLabel: '入池作品', actors: [] },
    { characterName: '登场角色', role: 'appears', actors: [] },
  ],
  songs: []
}), true);
tabs.children[0].click();
const rows = content.querySelectorAll('li');
assert.equal(rows.length, 3);
assert.equal(rows[0].querySelector('.details-cast-portrait').children[1].tagName, 'IMG');
assert.equal(rows[1].dataset.scope, 'admission');
assert.equal(rows[1].querySelector('.details-cast-scope').textContent, '入池作品');
assert.equal(rows[1].querySelector('.details-cast-placeholder').textContent, '暂无图片');

const image = rows[0].querySelector('img');
image.dispatch('error');
assert.equal(image.src, 'https://raw.example.test/char.webp');
assert.equal(image.dataset.fallbackAttempted, 'true');
assert.equal(rows[0].querySelector('.details-cast-portrait').dataset.state, undefined);
image.dispatch('error');
assert.equal(rows[0].querySelector('.details-cast-portrait').dataset.state, 'error');
assert.equal(rows[0].querySelector('.details-cast-placeholder').textContent, '图片加载失败');
assert.equal(rows[0].querySelector('strong').textContent, '有图角色');
assert.equal(rows[1].querySelector('strong').textContent, '入池角色');
assert.equal(rows[2].querySelector('strong').textContent, '登场角色');
assert.equal(rows[2].querySelector('small').textContent, '登场');

assert.equal(view.renderWork({
  staff: { artwork: [{ name: '原画甲' }] },
  cast: [{ characterName: '角色甲', actors: [] }],
  songs: [{ title: '歌曲甲', categories: ['OP'], credits: {} }]
}), true);
tabs.children[2].click();
assert.equal(tabs.children[2].getAttribute('aria-selected'), 'true');
assert.equal(view.renderWork({
  staff: { artwork: [{ name: '原画甲' }] },
  cast: [{ characterName: '角色甲', image: { url: 'https://assets.example.test/a.webp' }, actors: [] }],
  songs: [{ title: '歌曲甲', categories: ['OP'], credits: {} }]
}), true);
assert.equal(tabs.children[2].getAttribute('aria-selected'), 'true');

console.log('work-detail credits cast visual checks: 17/17');
