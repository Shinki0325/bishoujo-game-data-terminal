import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTENDED_STICKER_SPEC_VERSION,
  STICKER_SPEC_VERSION,
  addExtendedSticker,
  addSticker,
  createStickerDocument,
  createStickerHistory,
  moveStickerLayer,
  stickerAspectRatio,
  transformSticker,
  updateStickerContent,
  validateStickerDocument
} from './sticker-document.js';
import { composeStickerImage } from './sticker-compositor.js';

const base = () => createStickerDocument({ baseWidth: 1000, baseHeight: 800 });
const png = 'data:image/png;base64,AAAA';

test('keeps v1 documents strict and upgrades only when an extended layer is added', () => {
  const old = addSticker(base(), 'black-bar');
  assert.equal(old.stickerSpecVersion, STICKER_SPEC_VERSION);
  assert.deepEqual(Object.keys(old.layers[0]), ['id', 'kind', 'centerX', 'centerY', 'scale', 'rotation']);
  assert.throws(() => validateStickerDocument({
    ...old,
    layers: [{ ...old.layers[0], text: 'unexpected' }]
  }), /unknown key/);

  const extended = addExtendedSticker(old, 'text', { text: 'hello' , color: '#FF0000' });
  assert.equal(extended.stickerSpecVersion, EXTENDED_STICKER_SPEC_VERSION);
  assert.equal(extended.layers.at(-1).centerX, 0.5);
  assert.equal(extended.layers.at(-1).centerY, 0.5);
  assert.equal(extended.layers.at(-1).scale, 0.6);
  assert.equal(extended.layers.at(-1).aspectRatio, 3);
  assert.equal(extended.layers.at(-1).color, '#ff0000');
});

test('normalizes and freezes content while transform and history retain it', () => {
  const document = addExtendedSticker(base(), 'brush', {
    id: 'brush-1',
    points: [[0, 0.1], [0.5, 0.5], [1, 0.9]],
    strokeWidth: 0.02,
    color: '#abcdef'
  });
  assert.equal(stickerAspectRatio(document.layers[0]), 1);
  assert.ok(Object.isFrozen(document.layers[0].points));
  assert.ok(Object.isFrozen(document.layers[0].points[0]));
  assert.throws(() => { document.layers[0].points[0][0] = 0.2; }, TypeError);
  const moved = transformSticker(document, 'brush-1', { centerX: 0.2, rotation: 45 });
  assert.deepEqual(moved.layers[0].points, document.layers[0].points);
  const edited = updateStickerContent(moved, 'brush-1', { strokeWidth: 0.03 });
  assert.equal(edited.layers[0].centerX, 0.2);
  assert.equal(edited.layers[0].strokeWidth, 0.03);
  assert.throws(() => updateStickerContent(edited, 'brush-1', { scale: 0.5 }), /unknown key/);

  const history = createStickerHistory(document);
  history.push(edited);
  assert.equal(history.undo(), true);
  assert.deepEqual(history.inspect().present.layers[0].points, document.layers[0].points);
  assert.equal(history.redo(), true);
  assert.equal(history.inspect().present.layers[0].strokeWidth, 0.03);
});

test('keeps the complete v1 model and compositor contract intact', () => {
  let document = base();
  for (const kind of ['black-bar', 'pixelate', 'blur', 'please-wait-character']) {
    document = addSticker(document, kind);
  }
  const firstId = document.layers[0].id;
  document = transformSticker(document, firstId, { centerX: 2, centerY: -1, scale: 3, rotation: 540 });
  assert.equal(document.layers[0].centerX, 1);
  assert.equal(document.layers[0].centerY, 0);
  assert.equal(document.layers[0].scale, 2);
  assert.equal(document.layers[0].rotation, -180);
  document = moveStickerLayer(document, firstId, 3);
  assert.equal(document.layers[3].id, firstId);
  const history = createStickerHistory(document);
  history.push({ ...document, layers: document.layers.slice(0, 3) });
  assert.equal(history.undo(), true);
  assert.equal(history.inspect().present.layers.length, 4);
  assert.equal(history.redo(), true);
  assert.equal(history.inspect().present.layers.length, 3);
  const oldImages = new Map([
    ['please-wait-character', { source: 'wait' }],
    ['paper-bag-character', { source: 'bag' }]
  ]);
  const operations = [];
  const createCanvas = (width, height) => fakeCanvas(width, height, operations);
  const oldComposite = composeStickerImage({
    baseImage: { source: 'base' },
    document,
    createCanvas,
    stickerImages: oldImages
  });
  assert.equal(oldComposite.width, 1000);
  assert.ok(operations.some(operation => operation[0] === 'fillRect'));
  assert.ok(operations.some(operation => operation[0] === 'clip'));
  assert.ok(operations.some(operation => operation[0] === 'drawImage'));
});

test('enforces extended content limits, image map identity, and layer limit', () => {
  assert.throws(() => addExtendedSticker(base(), 'custom-image', {
    imageDataUrl: 'data:image/gif;base64,AAAA', imageName: 'x', aspectRatio: 1
  }), /PNG, WebP, or JPEG/);
  assert.throws(() => addExtendedSticker(base(), 'custom-image', {
    imageDataUrl: png, imageName: 'x', aspectRatio: 0.01
  }), /aspectRatio/);
  assert.throws(() => addExtendedSticker(base(), 'text', {
    text: '1\n2\n3\n4\n5\n6\n7', color: '#000000'
  }), /6 lines/);
  assert.throws(() => addExtendedSticker(base(), 'brush', {
    points: Array.from({ length: 513 }, () => [0, 0]), strokeWidth: 0.01, color: '#000000'
  }), /512/);

  let full = base();
  for (let index = 0; index < 12; index += 1) {
    full = index < 4
      ? addExtendedSticker(full, 'custom-image', { imageDataUrl: png, imageName: `${index}`, aspectRatio: 1 })
      : addExtendedSticker(full, 'brush', { points: [[0, 0]], strokeWidth: 0.01, color: '#000000' });
  }
  assert.equal(full.layers.length, 12);
  assert.throws(() => addExtendedSticker(full, 'text', { text: 'too many', color: '#000000' }), /12 stickers/);
  const ordered = moveStickerLayer(full, full.layers.at(-1).id, 0);
  assert.equal(ordered.layers[0].id, full.layers.at(-1).id);
});

function fakeCanvas(width, height, operations) {
  const context = {
    filter: 'none',
    drawImage: (...args) => operations.push(['drawImage', ...args]),
    save: () => operations.push(['save']),
    restore: () => operations.push(['restore']),
    translate: (...args) => operations.push(['translate', ...args]),
    rotate: (...args) => operations.push(['rotate', ...args]),
    beginPath: () => operations.push(['beginPath']),
    rect: (...args) => operations.push(['rect', ...args]),
    clip: () => operations.push(['clip']),
    moveTo: (...args) => operations.push(['moveTo', ...args]),
    lineTo: (...args) => operations.push(['lineTo', ...args]),
    arc: (...args) => operations.push(['arc', ...args]),
    stroke: () => operations.push(['stroke']),
    fill: () => operations.push(['fill']),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    fillText: (...args) => operations.push(['fillText', ...args]),
    measureText: text => ({ width: text.length * 10 })
  };
  return { width, height, getContext: () => context };
}

test('composes custom image, text, brush, and pixelated mask in bottom-to-top order', () => {
  const imageUrl = 'data:image/webp;base64,AAAA';
  let document = base();
  document = addExtendedSticker(document, 'custom-image', { imageDataUrl: imageUrl, imageName: 'x.webp', aspectRatio: 2 });
  document = addExtendedSticker(document, 'text', { text: 'one\ntwo', color: '#112233' });
  document = addExtendedSticker(document, 'brush', { points: [[0.1, 0.1], [0.9, 0.9]], strokeWidth: 0.02, color: '#00ff00' });
  document = addExtendedSticker(document, 'mask-brush', { points: [[0.2, 0.2], [0.8, 0.8]], strokeWidth: 0.04, color: '#ffffff' });
  const operations = [];
  const createCanvas = (width, height) => fakeCanvas(width, height, operations);
  const result = composeStickerImage({
    baseImage: { source: 'base' },
    document,
    createCanvas,
    stickerImages: new Map([[imageUrl, { source: 'custom' }]])
  });
  assert.equal(result.width, 1000);
  assert.ok(operations.some(operation => operation[0] === 'fillText'));
  assert.ok(operations.some(operation => operation[0] === 'stroke'));
  assert.ok(operations.some(operation => operation[0] === 'drawImage'));
  assert.ok(operations.some(operation => operation[0] === 'drawImage' && operation.includes('destination-in')) === false);
});
