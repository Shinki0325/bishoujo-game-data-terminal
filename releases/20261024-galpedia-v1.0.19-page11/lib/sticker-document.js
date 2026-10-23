export const STICKER_LIMIT = 12;
export const STICKER_SPEC_VERSION = 1;

export const STICKER_TYPES = Object.freeze({
  'black-bar': Object.freeze({ aspectRatio: 3, defaultScale: 0.32 }),
  pixelate: Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  blur: Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  'please-wait-character': Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  'paper-bag-character': Object.freeze({ aspectRatio: 1, defaultScale: 0.28 })
});

const DOCUMENT_KEYS = new Set(['stickerSpecVersion', 'baseWidth', 'baseHeight', 'layers']);
const LAYER_KEYS = new Set(['id', 'kind', 'centerX', 'centerY', 'scale', 'rotation']);
let nextStickerId = 1;

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} has unknown key: ${key}`);
  }
}

function assertDimension(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeRotation(value) {
  assertFinite(value, 'sticker rotation');
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function freezeLayer(layer) {
  return Object.freeze({
    id: layer.id,
    kind: layer.kind,
    centerX: layer.centerX,
    centerY: layer.centerY,
    scale: layer.scale,
    rotation: layer.rotation
  });
}

function freezeDocument({ baseWidth, baseHeight, layers }) {
  return Object.freeze({
    stickerSpecVersion: STICKER_SPEC_VERSION,
    baseWidth,
    baseHeight,
    layers: Object.freeze(layers.map(freezeLayer))
  });
}

function normalizeLayer(value, seenIds) {
  assertPlainObject(value, 'sticker layer');
  assertKnownKeys(value, LAYER_KEYS, 'sticker layer');
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    throw new TypeError('sticker id must be a non-empty string');
  }
  if (seenIds.has(value.id)) throw new TypeError(`duplicate sticker id: ${value.id}`);
  seenIds.add(value.id);
  if (!Object.hasOwn(STICKER_TYPES, value.kind)) {
    throw new TypeError(`unknown sticker kind: ${value.kind}`);
  }
  const centerX = assertFinite(value.centerX, 'sticker centerX');
  const centerY = assertFinite(value.centerY, 'sticker centerY');
  const scale = assertFinite(value.scale, 'sticker scale');
  if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1) {
    throw new RangeError('sticker center must be within [0, 1]');
  }
  if (scale < 0.04 || scale > 2) throw new RangeError('sticker scale must be within [0.04, 2]');
  return freezeLayer({
    id: value.id,
    kind: value.kind,
    centerX,
    centerY,
    scale,
    rotation: normalizeRotation(value.rotation)
  });
}

export function createStickerDocument({ baseWidth, baseHeight }) {
  return freezeDocument({
    baseWidth: assertDimension(baseWidth, 'baseWidth'),
    baseHeight: assertDimension(baseHeight, 'baseHeight'),
    layers: []
  });
}

export function validateStickerDocument(value) {
  assertPlainObject(value, 'sticker document');
  assertKnownKeys(value, DOCUMENT_KEYS, 'sticker document');
  if (value.stickerSpecVersion !== STICKER_SPEC_VERSION) {
    throw new TypeError(`unsupported sticker document version: ${value.stickerSpecVersion}`);
  }
  if (!Array.isArray(value.layers)) throw new TypeError('sticker layers must be an array');
  if (value.layers.length > STICKER_LIMIT) throw new RangeError(`maximum ${STICKER_LIMIT} stickers`);
  const seenIds = new Set();
  return freezeDocument({
    baseWidth: assertDimension(value.baseWidth, 'baseWidth'),
    baseHeight: assertDimension(value.baseHeight, 'baseHeight'),
    layers: value.layers.map(layer => normalizeLayer(layer, seenIds))
  });
}

export function addSticker(document, kind, { id, centerX = 0.5, centerY = 0.5 } = {}) {
  const normalized = validateStickerDocument(document);
  if (normalized.layers.length >= STICKER_LIMIT) throw new RangeError(`${STICKER_LIMIT} stickers maximum`);
  if (!Object.hasOwn(STICKER_TYPES, kind)) throw new TypeError(`unknown sticker kind: ${kind}`);
  const stickerId = id ?? `sticker-local-${nextStickerId++}`;
  if (typeof stickerId !== 'string' || stickerId.trim() === '') {
    throw new TypeError('sticker id must be a non-empty string');
  }
  if (normalized.layers.some(layer => layer.id === stickerId)) {
    throw new TypeError(`duplicate sticker id: ${stickerId}`);
  }
  return freezeDocument({
    ...normalized,
    layers: [...normalized.layers, {
      id: stickerId,
      kind,
      centerX: clamp(assertFinite(centerX, 'sticker centerX'), 0, 1),
      centerY: clamp(assertFinite(centerY, 'sticker centerY'), 0, 1),
      scale: STICKER_TYPES[kind].defaultScale,
      rotation: 0
    }]
  });
}

export function transformSticker(document, id, patch) {
  const normalized = validateStickerDocument(document);
  assertPlainObject(patch, 'sticker transform');
  assertKnownKeys(patch, new Set(['centerX', 'centerY', 'scale', 'rotation']), 'sticker transform');
  let found = false;
  const layers = normalized.layers.map(layer => {
    if (layer.id !== id) return layer;
    found = true;
    return {
      ...layer,
      centerX: Object.hasOwn(patch, 'centerX') ? clamp(assertFinite(patch.centerX, 'sticker centerX'), 0, 1) : layer.centerX,
      centerY: Object.hasOwn(patch, 'centerY') ? clamp(assertFinite(patch.centerY, 'sticker centerY'), 0, 1) : layer.centerY,
      scale: Object.hasOwn(patch, 'scale') ? clamp(assertFinite(patch.scale, 'sticker scale'), 0.04, 2) : layer.scale,
      rotation: Object.hasOwn(patch, 'rotation') ? normalizeRotation(patch.rotation) : layer.rotation
    };
  });
  if (!found) throw new RangeError(`unknown sticker id: ${id}`);
  return freezeDocument({ ...normalized, layers });
}

export function removeSticker(document, id) {
  const normalized = validateStickerDocument(document);
  const layers = normalized.layers.filter(layer => layer.id !== id);
  if (layers.length === normalized.layers.length) throw new RangeError(`unknown sticker id: ${id}`);
  return freezeDocument({ ...normalized, layers });
}

export function moveStickerLayer(document, id, destinationIndex) {
  const normalized = validateStickerDocument(document);
  if (!Number.isSafeInteger(destinationIndex)) throw new TypeError('destination index must be an integer');
  const sourceIndex = normalized.layers.findIndex(layer => layer.id === id);
  if (sourceIndex < 0) throw new RangeError(`unknown sticker id: ${id}`);
  const layers = [...normalized.layers];
  const [layer] = layers.splice(sourceIndex, 1);
  layers.splice(clamp(destinationIndex, 0, layers.length), 0, layer);
  return freezeDocument({ ...normalized, layers });
}

export function clearStickers(document) {
  const normalized = validateStickerDocument(document);
  return freezeDocument({ ...normalized, layers: [] });
}

export function createStickerHistory(initialDocument, { limit = 50 } = {}) {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new TypeError('history limit must be positive');
  let past = [];
  let present = validateStickerDocument(initialDocument);
  let future = [];
  let activeCoalesceKey = null;

  function push(document, { coalesceKey = null } = {}) {
    past = [...past, present].slice(-limit);
    present = validateStickerDocument(document);
    future = [];
    activeCoalesceKey = coalesceKey;
  }

  function replace(document, { coalesceKey = null } = {}) {
    if (coalesceKey !== null && coalesceKey !== activeCoalesceKey) {
      push(document, { coalesceKey });
      return;
    }
    present = validateStickerDocument(document);
  }

  function undo() {
    if (past.length === 0) return false;
    future = [present, ...future];
    present = past[past.length - 1];
    past = past.slice(0, -1);
    activeCoalesceKey = null;
    return true;
  }

  function redo() {
    if (future.length === 0) return false;
    past = [...past, present].slice(-limit);
    present = future[0];
    future = future.slice(1);
    activeCoalesceKey = null;
    return true;
  }

  function reset(document) {
    past = [];
    present = validateStickerDocument(document);
    future = [];
    activeCoalesceKey = null;
  }

  function inspect() {
    return Object.freeze({
      past: Object.freeze([...past]),
      present,
      future: Object.freeze([...future])
    });
  }

  return Object.freeze({ push, replace, undo, redo, reset, inspect });
}
