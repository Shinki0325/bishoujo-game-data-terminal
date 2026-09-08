import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaDialogView } from './media-dialog-view.js';

class FakeNode {
  constructor(id) {
    this.id = id;
    this.listeners = new Map();
    this.attributes = new Map();
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.textContent = '';
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event });
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 512, height: 512 }; }
  setPointerCapture() {}
}

function fixture({ decodeFile, onEditStickers = async () => null } = {}) {
  const ids = [
    'media-crop', 'media-crop-canvas', 'media-crop-title', 'media-crop-reset',
    'media-crop-skip', 'media-crop-cancel', 'media-crop-stickers', 'media-crop-confirm',
    'media-crop-progress', 'media-crop-progress-bar', 'media-crop-status',
    'media-crop-stickers-clear', 'media-crop-retry', 'media-crop-zoom', 'media-crop-zoom-value'
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, new FakeNode(id)]));
  nodes['media-crop-canvas'].getContext = () => ({ });
  const documentRef = { getElementById: id => nodes[id] ?? null };
  const created = [];
  const rendered = [];
  const errors = [];
  const dialog = createMediaDialogView({
    documentRef,
    decodeFile: decodeFile ?? (async () => ({ image: {}, width: 1000, height: 800, release() {} })),
    encodeCrop: async () => new Blob(['base']),
    renderActive: active => rendered.push(active),
    onCreateCustom: async record => created.push(record),
    onReplace: async () => {},
    onEditStickers,
    onError: error => errors.push(error)
  });
  return { dialog, nodes, created, rendered, errors };
}

const layerDocument = Object.freeze({
  stickerSpecVersion: 1,
  baseWidth: 1000,
  baseHeight: 1000,
  layers: Object.freeze([{ id: 'layer-1', kind: 'blur', centerX: .5, centerY: .5, scale: .3, rotation: 0 }])
});

const tick = () => new Promise(resolve => setImmediate(resolve));

test('sticker save is a draft until final crop confirmation and can be edited again', async () => {
  const calls = [];
  const compositeBlob = new Blob(['composite']);
  const f = fixture({
    onEditStickers: async options => {
      calls.push(options);
      return { baseBlob: options.baseBlob, compositeBlob, stickerDocument: layerDocument };
    }
  });
  await f.dialog.openUpload([{ name: 'draft.png' }], { availableSlots: 1 });
  f.nodes['media-crop-stickers'].dispatch('click');
  await tick();
  assert.equal(f.created.length, 0);
  assert.equal(f.nodes['media-crop-reset'].disabled, true);
  assert.ok(f.rendered.at(-1).stickerPreview, 'the composite is decoded for the crop preview');
  f.nodes['media-crop-stickers'].dispatch('click');
  await tick();
  assert.equal(calls.length, 2);
  assert.strictEqual(calls[1].baseBlob, calls[0].baseBlob);
  assert.strictEqual(calls[1].stickerDocument, layerDocument);
  await f.dialog.confirmCurrent();
  assert.equal(f.created.length, 1);
  assert.strictEqual(f.created[0].baseBlob, calls[0].baseBlob, 'the crop base remains the persisted base');
  assert.strictEqual(f.created[0].stickerDocument, layerDocument);
  assert.strictEqual(f.created[0].blob, compositeBlob);
  assert.deepEqual(f.errors, []);
});

test('draft locks crop, clear unlocks it, and optional zoom/progress controls are wired', async () => {
  const f = fixture({
    onEditStickers: async options => ({
      baseBlob: options.baseBlob,
      compositeBlob: new Blob(['composite']),
      stickerDocument: layerDocument
    })
  });
  await f.dialog.openUpload([{ name: 'progress.png' }], { availableSlots: 1 });
  assert.equal(f.nodes['media-crop-progress'].textContent, '图片 1 / 1');
  assert.equal(f.nodes['media-crop-progress-bar'].value, 1);
  f.nodes['media-crop-stickers'].dispatch('click');
  await tick();
  const before = f.rendered.at(-1).crop;
  f.nodes['media-crop-zoom'].value = '2';
  f.nodes['media-crop-zoom'].dispatch('input');
  assert.deepEqual(f.rendered.at(-1).crop, before);
  assert.equal(f.dialog.clearStickerDraft(), true);
  assert.equal(f.nodes['media-crop-reset'].disabled, false);
  f.nodes['media-crop-zoom'].value = '2';
  f.nodes['media-crop-zoom'].dispatch('input');
  assert.equal(f.rendered.at(-1).crop.size, 400);
  assert.equal(f.nodes['media-crop-zoom-value'].textContent, '200%');
});

test('skip invalidates a pending decode and releases a late result before advancing', async () => {
  let firstResolve;
  const released = [];
  const f = fixture({
    decodeFile: file => file.name === 'first.png'
      ? new Promise(resolve => { firstResolve = resolve; })
      : Promise.resolve({ image: {}, width: 500, height: 500, release: () => released.push('second') })
  });
  const opening = f.dialog.openUpload([{ name: 'first.png' }, { name: 'second.png' }], { availableSlots: 2 });
  await tick();
  const skipping = f.dialog.skipCurrent();
  firstResolve({ image: {}, width: 100, height: 100, release: () => released.push('first') });
  await skipping;
  await opening;
  assert.deepEqual(released, ['first']);
  assert.equal(f.nodes['media-crop-progress'].textContent, '图片 2 / 2');
  assert.equal(f.rendered.at(-1).file.name, 'second.png');
});

test('a failed first item stays active, retry can recover it, and skip then advances', async () => {
  let attempts = 0;
  const f = fixture({
    decodeFile: file => {
      attempts++;
      if (file.name === 'first.png' && attempts === 1) return Promise.reject(new Error('decode failed'));
      return Promise.resolve({ image: {}, width: 500, height: 500, release() {} });
    }
  });
  await assert.rejects(
    f.dialog.openUpload([{ name: 'first.png' }, { name: 'second.png' }], { availableSlots: 2 }),
    /decode failed/
  );
  assert.equal(attempts, 1, 'failure does not silently consume the next item');
  assert.match(f.nodes['media-crop-status'].textContent, /图片读取失败/u);
  assert.equal(f.nodes['media-crop-confirm'].disabled, true);
  assert.equal(f.nodes['media-crop-stickers'].disabled, true);
  assert.equal(f.nodes['media-crop-skip'].disabled, false);
  assert.equal(f.nodes['media-crop-cancel'].disabled, false);
  assert.equal(f.nodes['media-crop-retry'].hidden, false);
  assert.equal(await f.dialog.retryCurrent(), true);
  assert.equal(attempts, 2);
  assert.equal(f.nodes['media-crop-status'].hidden, true);
  assert.equal(await f.dialog.skipCurrent(), true);
  assert.equal(attempts, 3);
});

test('a final retry failure remains cancellable without an invalid decoded resource', async () => {
  const f = fixture({
    decodeFile: () => Promise.reject(new Error('still broken'))
  });
  await assert.rejects(
    f.dialog.openUpload([{ name: 'broken.png' }], { availableSlots: 1 }),
    /still broken/
  );
  assert.equal(await f.dialog.retryCurrent(), false);
  assert.match(f.nodes['media-crop-status'].textContent, /still broken/u);
  assert.equal(f.nodes['media-crop-retry'].hidden, false);
  f.dialog.cancelAll();
  assert.equal(f.nodes['media-crop'].open, false);
});

test('cancel invalidates a pending failed decode and prevents a late dialog reopen', async () => {
  let resolveDecode;
  const released = [];
  const f = fixture({
    decodeFile: () => new Promise(resolve => { resolveDecode = resolve; })
  });
  const opening = f.dialog.openUpload([{ name: 'cancel.png' }], { availableSlots: 1 });
  await tick();
  f.dialog.cancelAll();
  resolveDecode({ image: {}, width: 100, height: 100, release: () => released.push('late') });
  assert.equal(await opening, false);
  assert.deepEqual(released, ['late']);
  assert.equal(f.nodes['media-crop'].open, false);
});

test('preview resources are released when a draft is cleared or the dialog is cancelled', async () => {
  const released = [];
  const f = fixture({
    decodeFile: file => Promise.resolve({
      image: {}, width: 100, height: 100,
      release: () => released.push(file instanceof Blob ? 'preview' : 'base')
    }),
    onEditStickers: async options => ({
      baseBlob: options.baseBlob,
      compositeBlob: new Blob(['composite']),
      stickerDocument: layerDocument
    })
  });
  await f.dialog.openUpload([{ name: 'release.png' }], { availableSlots: 1 });
  f.nodes['media-crop-stickers'].dispatch('click');
  await tick();
  assert.equal(f.dialog.clearStickerDraft(), true);
  assert.ok(released.includes('preview'));
  f.dialog.cancelAll();
  assert.ok(released.includes('base'));
});
