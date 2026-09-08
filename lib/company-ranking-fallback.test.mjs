import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyRankingCard } from '../views/company-ranking-card.js';

function fakeNode(tagName) {
  const classNames = new Set();
  const node = {
    tagName: tagName.toUpperCase(),
    attrs: {},
    dataset: {},
    children: [],
    events: {},
    className: '',
    classList: {
      add(...names) { names.forEach(name => classNames.add(name)); },
      remove(...names) { names.forEach(name => classNames.delete(name)); },
      contains(name) { return classNames.has(name); }
    },
    hidden: false,
    parentElement: null,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
    },
    addEventListener(type, listener, options = {}) {
      (this.events[type] ??= []).push({ listener, once: Boolean(options.once) });
    },
    dispatch(type, init = {}) {
      const event = {
        type,
        target: this,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...init
      };
      for (const entry of [...(this.events[type] ?? [])]) {
        entry.listener(event);
        if (entry.once) {
          const listeners = this.events[type] ?? [];
          const index = listeners.indexOf(entry);
          if (index >= 0) listeners.splice(index, 1);
        }
      }
      return event;
    }
  };
  return node;
}

function createDocument() {
  return {
    createElement: tagName => fakeNode(tagName),
    defaultView: { matchMedia: () => ({ matches: true }) }
  };
}

function callbacks(calls) {
  return {
    isCardActivationEnabled: () => true,
    shouldSuppressMediaClick: () => false,
    onOpenDetails: item => calls.push(['details', item.workId]),
    onArrange: item => calls.push(['arrange', item.workId]),
    onContextMenu: () => calls.push(['menu']),
    onDragStart: () => calls.push(['drag']),
    onDragEnd: () => calls.push(['dragend'])
  };
}

function parts(card) {
  const [cover, title, handle] = card.children;
  const [image, fallback] = cover.children;
  return { cover, title, handle, image, fallback };
}

function createCard(companyImageUrl, calls = []) {
  const item = { workId: 'company-1', title: '会社名称', companyImageUrl };
  const card = createCompanyRankingCard(createDocument(), item, callbacks(calls));
  return { card, item, ...parts(card) };
}

test('company name fallback stays visible for empty URLs and hidden titles', () => {
  const { card, title, image, fallback } = createCard('');
  title.hidden = true;

  assert.equal(image.hidden, true);
  assert.equal(card.classList.contains('is-image-missing'), true);
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.textContent, '会社名称');
  assert.equal(fallback.attrs['aria-hidden'], 'true');
  assert.equal(fallback.parentElement.tagName, 'BUTTON');
  image.dispatch('load');
  assert.equal(fallback.hidden, false);
});

test('company name fallback covers loading and hides only after a successful load', () => {
  const { card, cover, title, image, fallback } = createCard('https://example.test/company.webp');
  title.hidden = true;

  assert.equal(image.hidden, false);
  assert.equal(fallback.hidden, false);
  image.dispatch('load');
  assert.equal(image.hidden, false);
  assert.equal(fallback.hidden, true);
  assert.equal(card.classList.contains('is-image-missing'), false);
  assert.equal(title.textContent, '会社名称');
  assert.equal(cover.children.length, 2);
});

test('company name fallback remains visible after an image error', () => {
  const { card, image, fallback } = createCard('https://example.test/missing.webp');

  image.dispatch('error');
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
  assert.equal(card.classList.contains('is-image-missing'), true);
});

test('company card keeps existing activation, menu, touch, keyboard, and drag callbacks', () => {
  const calls = [];
  const { card, cover, handle } = createCard('https://example.test/company.webp', calls);
  const event = {};

  cover.dispatch('click', event);
  handle.dispatch('click', event);
  card.dispatch('keydown', { key: 'Enter' });
  card.dispatch('contextmenu', { pointerType: 'touch' });
  card.dispatch('contextmenu', { pointerType: 'mouse' });
  const dataTransfer = { effectAllowed: '', setData(...args) { calls.push(args); } };
  card.dispatch('dragstart', { dataTransfer });
  card.dispatch('dragend');

  assert.equal(handle.textContent, '⋯');
  assert.equal(handle.attrs.title, '更多操作；按住可拖动');
  assert.equal(handle.attrs['aria-haspopup'], 'dialog');
  assert.deepEqual(calls, [
    ['details', 'company-1'],
    ['arrange', 'company-1'],
    ['arrange', 'company-1'],
    ['menu'],
    ['text/plain', 'company-1'],
    ['drag'],
    ['dragend']
  ]);
  assert.equal(dataTransfer.effectAllowed, 'move');
});
