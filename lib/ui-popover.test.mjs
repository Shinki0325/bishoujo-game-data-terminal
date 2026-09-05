import assert from 'node:assert/strict';
import test from 'node:test';
import { createPopoverController } from './ui-popover.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, capture: options === true || options?.capture === true });
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.listener !== listener));
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    const path = [];
    for (let node = this; node; node = node.parentNode) path.push(node);
    for (const node of [...path].reverse()) {
      for (const entry of [...(node.listeners?.get(event.type) ?? [])]) {
        if (!entry.capture) continue;
        event.currentTarget = node;
        entry.listener.call(node, event);
        if (event.cancelBubble) return !event.defaultPrevented;
      }
    }
    for (const node of path) {
      for (const entry of [...(node.listeners?.get(event.type) ?? [])]) {
        if (entry.capture) continue;
        event.currentTarget = node;
        entry.listener.call(node, event);
        if (event.cancelBubble) return !event.defaultPrevented;
      }
    }
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(documentRef, tagName = 'div', rect = {}) {
    super();
    this.ownerDocument = documentRef;
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = -1;
    this.rect = { left: 0, top: 0, width: 120, height: 32, ...rect };
    this.focusCount = 0;
  }

  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.attributes.id = String(value); }
  get href() { return this.attributes.href ?? ''; }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some(child => child.contains(node));
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  getBoundingClientRect() {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height
    };
  }
  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }
  matches(selector) {
    if (selector === ':modal') return this.isModal === true;
    return false;
  }
  querySelectorAll(selector) {
    const all = [];
    const visit = node => {
      for (const child of node.children) {
        all.push(child);
        visit(child);
      }
    };
    visit(this);
    if (selector.includes('[role="menuitem"]')) {
      return all.filter(node => node.getAttribute('role') === 'menuitem');
    }
    if (selector === 'button,a[href],[role="menuitem"], [tabindex]' || selector.includes('button,a[href]')) {
      return all.filter(node => node.tagName === 'BUTTON' || node.tagName === 'A' || node.getAttribute('role') === 'menuitem' || node.tabIndex >= 0);
    }
    return [];
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.activeElement = null;
    this.documentElement = { clientWidth: 1024, clientHeight: 768 };
    this.dialogs = [];
  }
  querySelector(selector) {
    if (selector === 'dialog:modal') return this.dialogs.filter(dialog => dialog.isModal && !dialog.hidden).at(-1) ?? null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === 'dialog' || selector === 'dialog[open]' || selector === 'dialog:modal') {
      return this.dialogs.filter(dialog => selector === 'dialog:modal' ? dialog.isModal && !dialog.hidden : selector !== 'dialog[open]' || dialog.open);
    }
    return [];
  }
}

class FakeWindow extends FakeEventTarget {
  constructor() {
    super();
    this.innerWidth = 1024;
    this.innerHeight = 768;
  }
}

function event(type, target = null, extra = {}) {
  return {
    type,
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
    ...extra
  };
}

function harness({ menuRect = { width: 240, height: 180 }, kind = 'actions' } = {}) {
  const documentRef = new FakeDocument();
  const windowRef = new FakeWindow();
  const button = new FakeElement(documentRef, 'button', { left: 840, top: 700, width: 80, height: 32 });
  const menu = new FakeElement(documentRef, 'div', menuRect);
  menu.hidden = true;
  documentRef.body = new FakeElement(documentRef, 'body');
  documentRef.body.append(button, menu);
  return { documentRef, windowRef, button, menu, kind };
}

function button(documentRef, label = 'item') {
  const node = new FakeElement(documentRef, 'button');
  node.textContent = label;
  node.tabIndex = 0;
  return node;
}

test('syncs ARIA, opens one same-group menu, positions it, and closes outside', () => {
  const first = harness();
  const second = harness();
  const firstItem = button(first.documentRef, 'first');
  const secondItem = button(second.documentRef, 'second');
  first.menu.append(firstItem);
  second.menu.append(secondItem);
  first.documentRef.body.append(second.button, second.menu);
  const controller = createPopoverController({
    items: [
      { button: first.button, menu: first.menu, kind: 'actions' },
      { button: second.button, menu: second.menu, kind: 'actions' }
    ],
    documentRef: first.documentRef,
    windowRef: first.windowRef
  });

  assert.equal(first.button.getAttribute('aria-haspopup'), 'menu');
  assert.equal(first.button.getAttribute('aria-controls'), first.menu.id);
  assert.equal(first.menu.getAttribute('role'), 'menu');
  first.button.dispatchEvent(event('click'));
  assert.equal(first.menu.hidden, false);
  assert.equal(first.button.getAttribute('aria-expanded'), 'true');
  assert.equal(first.menu.style.left, '776px');
  assert.equal(first.menu.style.top, '516px');

  second.button.dispatchEvent(event('click'));
  assert.equal(first.menu.hidden, true);
  assert.equal(second.menu.hidden, false);
  first.documentRef.dispatchEvent(event('click', first.documentRef.body));
  assert.equal(second.menu.hidden, true);
  controller.destroy();
});

test('trigger arrows focus first/last and action arrows skip disabled or hidden entries', () => {
  const h = harness();
  const one = button(h.documentRef, 'one');
  const disabled = button(h.documentRef, 'disabled');
  disabled.disabled = true;
  const hidden = button(h.documentRef, 'hidden');
  hidden.hidden = true;
  const last = button(h.documentRef, 'last');
  h.menu.append(one, disabled, hidden, last);
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'actions' }], documentRef: h.documentRef, windowRef: h.windowRef });

  const down = event('keydown', h.button, { key: 'ArrowDown' });
  h.button.dispatchEvent(down);
  assert.equal(down.defaultPrevented, true);
  assert.equal(h.documentRef.activeElement, one);
  const up = event('keydown', h.button, { key: 'ArrowUp' });
  h.button.dispatchEvent(up);
  assert.equal(h.documentRef.activeElement, last);

  const next = event('keydown', one, { key: 'ArrowDown' });
  h.menu.dispatchEvent(next);
  assert.equal(h.documentRef.activeElement, last);
  const home = event('keydown', last, { key: 'Home' });
  h.menu.dispatchEvent(home);
  assert.equal(h.documentRef.activeElement, one);
  const end = event('keydown', one, { key: 'End' });
  h.menu.dispatchEvent(end);
  assert.equal(h.documentRef.activeElement, last);
  controller.destroy();
});

test('form popovers preserve native form semantics and close on Tab without focus theft', () => {
  const h = harness({ kind: 'form' });
  const checkbox = new FakeElement(h.documentRef, 'input');
  checkbox.type = 'checkbox';
  checkbox.tabIndex = 0;
  const range = new FakeElement(h.documentRef, 'input');
  range.type = 'range';
  range.tabIndex = 0;
  h.menu.append(checkbox, range);
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'form' }], documentRef: h.documentRef, windowRef: h.windowRef });
  assert.equal(h.menu.getAttribute('role'), 'dialog');
  assert.equal(h.button.getAttribute('aria-haspopup'), 'dialog');
  h.button.dispatchEvent(event('click'));
  const arrow = event('keydown', range, { key: 'ArrowLeft' });
  h.menu.dispatchEvent(arrow);
  assert.equal(arrow.defaultPrevented, false);
  const tab = event('keydown', range, { key: 'Tab' });
  h.menu.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.equal(h.menu.hidden, false);
  const outside = new FakeElement(h.documentRef, 'button');
  h.documentRef.dispatchEvent(event('focusin', outside));
  assert.equal(h.menu.hidden, true);
  assert.equal(h.documentRef.activeElement, null);
  controller.destroy();
});

test('Escape restores trigger, respects defaultPrevented, and yields to an upper modal', () => {
  const h = harness();
  const item = button(h.documentRef);
  h.menu.append(item);
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'actions' }], documentRef: h.documentRef, windowRef: h.windowRef });
  h.button.dispatchEvent(event('click'));
  const ignored = event('keydown', h.menu, { key: 'Escape' });
  ignored.preventDefault();
  h.documentRef.dispatchEvent(ignored);
  assert.equal(h.menu.hidden, false);
  const modal = new FakeElement(h.documentRef, 'dialog');
  modal.open = true;
  modal.isModal = true;
  modal.hidden = false;
  h.documentRef.dialogs.push(modal);
  const blocked = event('keydown', h.menu, { key: 'Escape' });
  h.documentRef.dispatchEvent(blocked);
  assert.equal(h.menu.hidden, false);
  modal.isModal = false;
  const escaped = event('keydown', h.menu, { key: 'Escape' });
  h.documentRef.dispatchEvent(escaped);
  assert.equal(h.menu.hidden, true);
  assert.equal(h.documentRef.activeElement, h.button);
  assert.equal(escaped.defaultPrevented, true);
  controller.destroy();
});

test('a popover inside its own modal remains usable while lower menus are blocked', () => {
  const h = harness();
  const modal = new FakeElement(h.documentRef, 'dialog');
  modal.open = true;
  modal.isModal = true;
  modal.hidden = false;
  modal.append(h.button, h.menu);
  h.documentRef.dialogs.push(modal);
  const item = button(h.documentRef);
  h.menu.append(item);
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'actions' }], documentRef: h.documentRef, windowRef: h.windowRef });
  h.button.dispatchEvent(event('click'));
  assert.equal(h.menu.hidden, false);
  h.documentRef.dispatchEvent(event('keydown', h.menu, { key: 'Escape' }));
  assert.equal(h.menu.hidden, true);
  controller.destroy();
});

test('action capture closes despite stopPropagation and does not steal a newly opened modal focus', () => {
  const h = harness();
  const item = button(h.documentRef);
  h.menu.append(item);
  const modal = new FakeElement(h.documentRef, 'dialog');
  modal.open = true;
  modal.isModal = true;
  modal.hidden = false;
  item.addEventListener('click', click => {
    click.stopPropagation();
    modal.focus();
  });
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'actions' }], documentRef: h.documentRef, windowRef: h.windowRef });
  h.button.dispatchEvent(event('click'));
  item.dispatchEvent(event('click', item));
  assert.equal(h.menu.hidden, true);
  assert.equal(h.documentRef.activeElement, modal);
  assert.equal(h.button.focusCount, 0);
  controller.destroy();
});

test('resize and scroll reposition an open menu; destroy removes behavior', () => {
  const h = harness({ menuRect: { width: 240, height: 300 } });
  const controller = createPopoverController({ items: [{ button: h.button, menu: h.menu, kind: 'actions' }], documentRef: h.documentRef, windowRef: h.windowRef });
  h.button.dispatchEvent(event('click'));
  const initial = h.menu.style.top;
  h.button.rect.top = 120;
  h.windowRef.dispatchEvent(event('resize'));
  assert.notEqual(h.menu.style.top, initial);
  h.button.rect.top = 200;
  h.windowRef.dispatchEvent(event('scroll'));
  assert.equal(h.menu.style.top, '236px');
  controller.destroy();
  h.button.dispatchEvent(event('click'));
  assert.equal(h.menu.hidden, true);
});
