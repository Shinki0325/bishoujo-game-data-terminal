import { STICKER_TYPES, validateStickerDocument } from './sticker-document.js';

const IMAGE_STICKER_KINDS = new Set(['please-wait-character', 'paper-bag-character']);

function getContext(canvas) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  return context;
}

function snapshotCanvas({ canvas, width, height, createCanvas }) {
  const snapshot = createCanvas(width, height, 'snapshot');
  getContext(snapshot).drawImage(canvas, 0, 0, width, height);
  return snapshot;
}

function withLayerTransform(context, layer, width, height, layerWidth, layerHeight, draw) {
  context.save();
  try {
    context.translate(layer.centerX * width, layer.centerY * height);
    context.rotate(layer.rotation * Math.PI / 180);
    draw({ layerWidth, layerHeight });
  } finally {
    context.restore();
  }
}

function clipLayer(context, layerWidth, layerHeight) {
  context.beginPath();
  context.rect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
  context.clip();
}

function drawPixelate({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas }) {
  const snapshot = snapshotCanvas({ canvas, width, height, createCanvas });
  const effectWidth = Math.max(1, Math.floor(layerWidth / 14));
  const effectHeight = Math.max(1, Math.floor(layerHeight / 14));
  const effect = createCanvas(effectWidth, effectHeight, 'pixelate');
  const effectContext = getContext(effect);
  effectContext.imageSmoothingEnabled = false;
  const sourceX = (layer.centerX * width) - (layerWidth / 2);
  const sourceY = (layer.centerY * height) - (layerHeight / 2);
  effectContext.drawImage(snapshot, sourceX, sourceY, layerWidth, layerHeight, 0, 0, effectWidth, effectHeight);
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    clipLayer(context, layerWidth, layerHeight);
    context.imageSmoothingEnabled = false;
    context.drawImage(effect, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
  });
}

function drawBlur({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas }) {
  if (!('filter' in context)) throw new Error('Canvas blur filter is unavailable');
  const snapshot = snapshotCanvas({ canvas, width, height, createCanvas });
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    clipLayer(context, layerWidth, layerHeight);
    context.filter = `blur(${Math.max(6, Math.round(Math.min(layerWidth, layerHeight) * 0.08))}px)`;
    context.drawImage(snapshot, -(layer.centerX * width), -(layer.centerY * height), width, height);
  });
}

function drawLayer({ canvas, context, layer, width, height, createCanvas, stickerImages }) {
  const layerWidth = layer.scale * Math.min(width, height);
  const layerHeight = layerWidth / STICKER_TYPES[layer.kind].aspectRatio;
  if (layer.kind === 'pixelate') {
    drawPixelate({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas });
    return;
  }
  if (layer.kind === 'blur') {
    drawBlur({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas });
    return;
  }
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    if (layer.kind === 'black-bar') {
      context.fillStyle = '#000000';
      context.fillRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      return;
    }
    if (IMAGE_STICKER_KINDS.has(layer.kind)) {
      const image = stickerImages?.get(layer.kind);
      if (!image) throw new Error(`missing decoded sticker image: ${layer.kind}`);
      context.drawImage(image, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      return;
    }
    throw new Error(`unsupported sticker kind: ${layer.kind}`);
  });
}

export function composeStickerImage({
  baseImage,
  document,
  createCanvas,
  stickerImages,
  maximumSize = 1024
}) {
  if (typeof createCanvas !== 'function') throw new TypeError('createCanvas must be a function');
  if (!Number.isFinite(maximumSize) || maximumSize <= 0) throw new TypeError('maximumSize must be positive');
  const normalized = validateStickerDocument(document);
  const ratio = Math.min(1, maximumSize / Math.max(normalized.baseWidth, normalized.baseHeight));
  const width = Math.max(1, Math.floor(normalized.baseWidth * ratio));
  const height = Math.max(1, Math.floor(normalized.baseHeight * ratio));
  const canvas = createCanvas(width, height, 'main');
  const context = getContext(canvas);
  context.drawImage(baseImage, 0, 0, width, height);
  for (const layer of normalized.layers) {
    drawLayer({ canvas, context, layer, width, height, createCanvas, stickerImages });
  }
  return Object.freeze({ canvas, width, height });
}

export async function encodeStickerComposite(options) {
  const { canvas } = composeStickerImage(options);
  let blob;
  if (typeof canvas.convertToBlob === 'function') {
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  } else if (typeof canvas.toBlob === 'function') {
    blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob(resolve, 'image/webp', 0.9);
      } catch (error) {
        reject(error);
      }
    });
  } else {
    throw new Error('Canvas WebP encoding is unavailable');
  }
  if (!blob) throw new Error('Canvas WebP encoding returned no Blob');
  return blob;
}
