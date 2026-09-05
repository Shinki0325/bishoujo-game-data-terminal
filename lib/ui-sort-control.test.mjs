import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSortDirection,
  renderSortDirectionControl,
  syncSortDirectionControl,
  toggleSortDirection
} from './ui-sort-control.js';

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.attributes = Object.create(null);
    this.children = [];
    this.textContent = '';
    this.title = '';
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}

const documentRef = {
  createElementNS(_namespace, tagName) { return new FakeNode(tagName, documentRef); }
};

test('sort direction helper syncs accessible state, label, title, and icon', () => {
  const button = new FakeNode('button', documentRef);
  const icon = new FakeNode('span', documentRef);
  const label = new FakeNode('span', documentRef);

  assert.equal(syncSortDirectionControl({
    button,
    icon,
    label,
    direction: 'asc',
    labelPrefix: '作品排序',
    documentRef
  }), 'asc');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), '作品排序：升序，点击切换');
  assert.equal(button.title, '作品排序：升序，点击切换');
  assert.equal(label.textContent, '升序');
  assert.equal(icon.children[0].children[0].tagName, 'path');

  renderSortDirectionControl({ button, icon, label, direction: 'desc', documentRef });
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), '排序：降序，点击切换');
  assert.equal(label.textContent, '降序');
  assert.equal(icon.children[0].children[0].getAttribute('d'), 'm3 16 4 4 4-4');
});

test('sort direction normalization and toggle keep unknown values safe', () => {
  assert.equal(normalizeSortDirection('asc'), 'asc');
  assert.equal(normalizeSortDirection('unexpected'), 'desc');
  assert.equal(toggleSortDirection('asc'), 'desc');
  assert.equal(toggleSortDirection('unexpected'), 'asc');
});

test('sort direction helper can render the icon inside the button itself', () => {
  const button = new FakeNode('button', documentRef);
  syncSortDirectionControl({ button, icon: button, direction: 'desc', documentRef });
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.children.length, 1);
  assert.equal(button.children[0].tagName, 'svg');
  assert.equal(button.children[0].children.length, 5);
});
