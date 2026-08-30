import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileKeyedChildren } from './keyed-dom.js';

class Node {
  constructor(id) {
    this.id = id;
    this.parent = null;
  }
  get nextSibling() {
    if (this.parent === null) return null;
    const index = this.parent.children.indexOf(this);
    return this.parent.children[index + 1] ?? null;
  }
}

class Parent {
  constructor(children = []) {
    this.children = [];
    for (const child of children) this.insertBefore(child, null);
  }
  get firstChild() { return this.children[0] ?? null; }
  insertBefore(node, reference) {
    if (node.parent !== null) node.parent.removeChild(node);
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    this.children.splice(index, 0, node);
    node.parent = this;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error('node is not a child');
    this.children.splice(index, 1);
    node.parent = null;
  }
}

test('moves retained nodes into keyed order and removes only stale nodes', () => {
  const a = new Node('a');
  const b = new Node('b');
  const c = new Node('c');
  const d = new Node('d');
  const parent = new Parent([a, b, c]);
  const result = reconcileKeyedChildren(parent, [c, a, d]);
  assert.deepEqual(parent.children.map(node => node.id), ['c', 'a', 'd']);
  assert.equal(parent.children[0], c);
  assert.equal(parent.children[1], a);
  assert.equal(b.parent, null);
  assert.deepEqual(result, { moved: 2, removed: 1 });
});

test('does no DOM work when the order is unchanged', () => {
  const a = new Node('a');
  const b = new Node('b');
  const parent = new Parent([a, b]);
  assert.deepEqual(reconcileKeyedChildren(parent, [a, b]), { moved: 0, removed: 0 });
});

test('keeps lightweight test DOMs compatible through replaceChildren', () => {
  const parent = {
    children: [new Node('old')],
    replaceChildren(...nodes) { this.children = nodes; }
  };
  const next = new Node('next');
  assert.deepEqual(reconcileKeyedChildren(parent, [next]), { moved: 1, removed: 0 });
  assert.deepEqual(parent.children, [next]);
});
