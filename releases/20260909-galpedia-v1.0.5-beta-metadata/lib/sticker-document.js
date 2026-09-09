export const STICKER_LIMIT = 12;
// Keep the original public constant at v1. Existing saved documents and
// callers use it as their compatibility marker; extended layers use v2.
export const STICKER_SPEC_VERSION = 1;
export const EXTENDED_STICKER_SPEC_VERSION = 2;
export const STICKER_CUSTOM_DATA_LIMIT = 2_000_000;
export const STICKER_IMAGE_DATA_LIMIT = 400_000;

export const STICKER_TYPES = Object.freeze({
  'black-bar': Object.freeze({ aspectRatio: 3, defaultScale: 0.32 }),
  pixelate: Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  blur: Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  'please-wait-character': Object.freeze({ aspectRatio: 1, defaultScale: 0.28 }),
  'paper-bag-character': Object.freeze({ aspectRatio: 1, defaultScale: 0.28 })
});

export const STICKER_EXTENDED_TYPES = Object.freeze({
  'custom-image': Object.freeze({ defaultScale: 0.6 }),
  text: Object.freeze({ defaultScale: 0.6, defaultAspectRatio: 3 }),
  brush: Object.freeze({ defaultScale: 1, defaultAspectRatio: 1 }),
  'mask-brush': Object.freeze({ defaultScale: 1, defaultAspectRatio: 1 })
});

const DOCUMENT_KEYS = new Set(['stickerSpecVersion', 'baseWidth', 'baseHeight', 'layers']);
const LAYER_KEYS = new Set(['id', 'kind', 'centerX', 'centerY', 'scale', 'rotation']);
const EXTENDED_CONTENT_KEYS = Object.freeze({
  'custom-image': new Set(['imageDataUrl', 'imageName', 'aspectRatio']),
  text: new Set(['text', 'color', 'aspectRatio']),
  brush: new Set(['points', 'strokeWidth', 'color', 'aspectRatio']),
  'mask-brush': new Set(['points', 'strokeWidth', 'color', 'aspectRatio'])
});

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

function assertString(value, label, maximum = Infinity) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  if ([...value].length > maximum) throw new RangeError(`${label} must be at most ${maximum} characters`);
  return value;
}

function stringLength(value) {
  return [...value].length;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeRotation(value) {
  assertFinite(value, 'sticker rotation');
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function normalizeAspectRatio(value, label = 'sticker aspectRatio') {
  const ratio = assertFinite(value, label);
  if (ratio < 0.05 || ratio > 20) throw new RangeError(`${label} must be within [0.05, 20]`);
  return ratio;
}

function normalizeColor(value, label = 'sticker color') {
  const color = assertString(value, label);
  if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new TypeError(`${label} must be a #rrggbb color`);
  return color.toLowerCase();
}

function normalizeImageDataUrl(value) {
  const dataUrl = assertString(value, 'sticker imageDataUrl', STICKER_IMAGE_DATA_LIMIT);
  const match = /^data:image\/(png|webp|jpeg);base64,([a-z0-9+/]*={0,2})$/iu.exec(dataUrl);
  if (!match || match[2].length === 0 || match[2].length % 4 === 1) {
    throw new TypeError('sticker imageDataUrl must be a PNG, WebP, or JPEG base64 data URL');
  }
  return dataUrl;
}

function normalizeText(value) {
  const text = assertString(value, 'sticker text', 200);
  const lineCount = text.split(/\r\n|\r|\n/u).length;
  if (lineCount > 6) throw new RangeError('sticker text must have at most 6 lines');
  return text;
}

function normalizePoints(value) {
  if (!Array.isArray(value)) throw new TypeError('sticker points must be an array');
  if (value.length > 512) throw new RangeError('sticker points must contain at most 512 points');
  return value.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new TypeError(`sticker point ${index} must be [x, y]`);
    }
    const x = assertFinite(point[0], `sticker point ${index} x`);
    const y = assertFinite(point[1], `sticker point ${index} y`);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw new RangeError(`sticker point ${index} must be within [0, 1]`);
    }
    return [x, y];
  });
}

function normalizeStrokeWidth(value) {
  const strokeWidth = assertFinite(value, 'sticker strokeWidth');
  if (strokeWidth < 0.005 || strokeWidth > 0.2) {
    throw new RangeError('sticker strokeWidth must be within [0.005, 0.2]');
  }
  return strokeWidth;
}

function isExtendedKind(kind) {
  return Object.hasOwn(STICKER_EXTENDED_TYPES, kind);
}

function valueOrDefault(value, key, defaultValue) {
  return Object.hasOwn(value, key) ? value[key] : defaultValue;
}

function normalizeExtendedContent(value, kind, { allowDefaults = false } = {}) {
  const contentKeys = EXTENDED_CONTENT_KEYS[kind];
  assertKnownKeys(value, new Set([...LAYER_KEYS, ...contentKeys]), 'sticker layer');
  if (kind === 'custom-image') {
    const imageDataUrl = normalizeImageDataUrl(value.imageDataUrl);
    const imageName = assertString(value.imageName, 'sticker imageName', 80);
    const aspectRatio = normalizeAspectRatio(value.aspectRatio);
    return { imageDataUrl, imageName, aspectRatio };
  }
  if (kind === 'text') {
    const text = normalizeText(value.text);
    const color = normalizeColor(value.color);
    const aspectRatio = normalizeAspectRatio(
      valueOrDefault(value, 'aspectRatio', allowDefaults ? STICKER_EXTENDED_TYPES.text.defaultAspectRatio : undefined)
    );
    return { text, color, aspectRatio };
  }
  const points = normalizePoints(value.points);
  const strokeWidth = normalizeStrokeWidth(value.strokeWidth);
  const color = normalizeColor(valueOrDefault(value, 'color', '#000000'));
  const aspectRatio = normalizeAspectRatio(
    valueOrDefault(value, 'aspectRatio', allowDefaults ? STICKER_EXTENDED_TYPES[kind].defaultAspectRatio : undefined)
  );
  return { points, strokeWidth, color, aspectRatio };
}

function freezeLayer(layer) {
  const frozen = { ...layer };
  if (Array.isArray(frozen.points)) {
    frozen.points = Object.freeze(frozen.points.map(point => Object.freeze([...point])));
  }
  return Object.freeze(frozen);
}

function freezeDocument({ stickerSpecVersion = STICKER_SPEC_VERSION, baseWidth, baseHeight, layers }) {
  return Object.freeze({
    stickerSpecVersion,
    baseWidth,
    baseHeight,
    layers: Object.freeze(layers.map(freezeLayer))
  });
}

function customDataLength(layer) {
  if (layer.kind === 'custom-image') return stringLength(layer.imageDataUrl) + stringLength(layer.imageName);
  if (layer.kind === 'text') return stringLength(layer.text) + stringLength(layer.color);
  if (layer.kind === 'brush' || layer.kind === 'mask-brush') {
    return JSON.stringify(layer.points).length + stringLength(layer.color);
  }
  return 0;
}

function assertCustomDataBudget(layers) {
  const total = layers.reduce((sum, layer) => sum + customDataLength(layer), 0);
  if (total > STICKER_CUSTOM_DATA_LIMIT) {
    throw new RangeError(`custom sticker data must be at most ${STICKER_CUSTOM_DATA_LIMIT} characters`);
  }
}

function normalizeLayer(value, seenIds, documentVersion) {
  assertPlainObject(value, 'sticker layer');
  const isExtended = isExtendedKind(value.kind);
  const allowedKeys = isExtended
    ? new Set([...LAYER_KEYS, ...EXTENDED_CONTENT_KEYS[value.kind]])
    : LAYER_KEYS;
  assertKnownKeys(value, allowedKeys, 'sticker layer');
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    throw new TypeError('sticker id must be a non-empty string');
  }
  if (seenIds.has(value.id)) throw new TypeError(`duplicate sticker id: ${value.id}`);
  seenIds.add(value.id);
  if (!Object.hasOwn(STICKER_TYPES, value.kind) && !isExtended) {
    throw new TypeError(`unknown sticker kind: ${value.kind}`);
  }
  if (isExtended && documentVersion !== EXTENDED_STICKER_SPEC_VERSION) {
    throw new TypeError('extended sticker layers require document version 2');
  }
  const centerX = assertFinite(value.centerX, 'sticker centerX');
  const centerY = assertFinite(value.centerY, 'sticker centerY');
  const scale = assertFinite(value.scale, 'sticker scale');
  if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1) {
    throw new RangeError('sticker center must be within [0, 1]');
  }
  if (scale < 0.04 || scale > 2) throw new RangeError('sticker scale must be within [0.04, 2]');
  const base = {
    id: value.id,
    kind: value.kind,
    centerX,
    centerY,
    scale,
    rotation: normalizeRotation(value.rotation)
  };
  return isExtended
    ? freezeLayer({ ...base, ...normalizeExtendedContent(value, value.kind) })
    : freezeLayer(base);
}

function normalizeDocumentVersion(value) {
  if (value !== STICKER_SPEC_VERSION && value !== EXTENDED_STICKER_SPEC_VERSION) {
    throw new TypeError(`unsupported sticker document version: ${value}`);
  }
  return value;
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
  const stickerSpecVersion = normalizeDocumentVersion(value.stickerSpecVersion);
  if (!Array.isArray(value.layers)) throw new TypeError('sticker layers must be an array');
  if (value.layers.length > STICKER_LIMIT) throw new RangeError(`maximum ${STICKER_LIMIT} stickers`);
  const seenIds = new Set();
  const layers = value.layers.map(layer => normalizeLayer(layer, seenIds, stickerSpecVersion));
  assertCustomDataBudget(layers);
  return freezeDocument({
    stickerSpecVersion,
    baseWidth: assertDimension(value.baseWidth, 'baseWidth'),
    baseHeight: assertDimension(value.baseHeight, 'baseHeight'),
    layers
  });
}

export function stickerAspectRatio(layer) {
  assertPlainObject(layer, 'sticker layer');
  if (Object.hasOwn(STICKER_TYPES, layer.kind)) return STICKER_TYPES[layer.kind].aspectRatio;
  if (!isExtendedKind(layer.kind)) throw new TypeError(`unknown sticker kind: ${layer.kind}`);
  return normalizeAspectRatio(layer.aspectRatio);
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
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
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

export function addExtendedSticker(document, kind, properties = {}) {
  const normalized = validateStickerDocument(document);
  if (normalized.layers.length >= STICKER_LIMIT) throw new RangeError(`${STICKER_LIMIT} stickers maximum`);
  if (!isExtendedKind(kind)) throw new TypeError(`unknown extended sticker kind: ${kind}`);
  assertPlainObject(properties, 'extended sticker properties');
  const contentKeys = EXTENDED_CONTENT_KEYS[kind];
  assertKnownKeys(properties, new Set(['id', 'centerX', 'centerY', 'scale', 'rotation', ...contentKeys]), 'extended sticker properties');
  const stickerId = properties.id ?? `sticker-local-${nextStickerId++}`;
  if (typeof stickerId !== 'string' || stickerId.trim() === '') {
    throw new TypeError('sticker id must be a non-empty string');
  }
  if (normalized.layers.some(layer => layer.id === stickerId)) {
    throw new TypeError(`duplicate sticker id: ${stickerId}`);
  }
  const content = normalizeExtendedContent(properties, kind, { allowDefaults: true });
  const centerX = valueOrDefault(properties, 'centerX', 0.5);
  const centerY = valueOrDefault(properties, 'centerY', 0.5);
  const scale = valueOrDefault(properties, 'scale', STICKER_EXTENDED_TYPES[kind].defaultScale);
  const rotation = valueOrDefault(properties, 'rotation', 0);
  const layer = {
    id: stickerId,
    kind,
    centerX: clamp(assertFinite(centerX, 'sticker centerX'), 0, 1),
    centerY: clamp(assertFinite(centerY, 'sticker centerY'), 0, 1),
    scale: clamp(assertFinite(scale, 'sticker scale'), 0.04, 2),
    rotation: normalizeRotation(rotation),
    ...content
  };
  return validateStickerDocument({
    stickerSpecVersion: EXTENDED_STICKER_SPEC_VERSION,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers: [...normalized.layers, layer]
  });
}

export function updateStickerContent(document, id, patch) {
  const normalized = validateStickerDocument(document);
  assertPlainObject(patch, 'sticker content patch');
  const layer = normalized.layers.find(item => item.id === id);
  if (!layer) throw new RangeError(`unknown sticker id: ${id}`);
  if (!isExtendedKind(layer.kind)) throw new TypeError('only extended sticker layers have editable content');
  assertKnownKeys(patch, EXTENDED_CONTENT_KEYS[layer.kind], 'sticker content patch');
  const layers = normalized.layers.map(item => (item.id === id ? { ...item, ...patch } : item));
  return validateStickerDocument({
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers
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
  return freezeDocument({
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers
  });
}

export function removeSticker(document, id) {
  const normalized = validateStickerDocument(document);
  const layers = normalized.layers.filter(layer => layer.id !== id);
  if (layers.length === normalized.layers.length) throw new RangeError(`unknown sticker id: ${id}`);
  return freezeDocument({
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers
  });
}

export function moveStickerLayer(document, id, destinationIndex) {
  const normalized = validateStickerDocument(document);
  if (!Number.isSafeInteger(destinationIndex)) throw new TypeError('destination index must be an integer');
  const sourceIndex = normalized.layers.findIndex(layer => layer.id === id);
  if (sourceIndex < 0) throw new RangeError(`unknown sticker id: ${id}`);
  const layers = [...normalized.layers];
  const [layer] = layers.splice(sourceIndex, 1);
  layers.splice(clamp(destinationIndex, 0, layers.length), 0, layer);
  return freezeDocument({
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers
  });
}

export function clearStickers(document) {
  const normalized = validateStickerDocument(document);
  return freezeDocument({
    stickerSpecVersion: normalized.stickerSpecVersion,
    baseWidth: normalized.baseWidth,
    baseHeight: normalized.baseHeight,
    layers: []
  });
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
