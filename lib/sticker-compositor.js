import { stickerAspectRatio, validateStickerDocument } from './sticker-document.js';

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

function pointInLayer(point, layerWidth, layerHeight) {
  return [
    point[0] * layerWidth - layerWidth / 2,
    point[1] * layerHeight - layerHeight / 2
  ];
}

function strokePath(context, points, layerWidth, layerHeight) {
  context.beginPath();
  if (points.length === 1) {
    const [x, y] = pointInLayer(points[0], layerWidth, layerHeight);
    context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2);
    return;
  }
  if (points.length === 0) return;
  const [firstX, firstY] = pointInLayer(points[0], layerWidth, layerHeight);
  context.moveTo(firstX, firstY);
  for (const point of points.slice(1)) {
    const [x, y] = pointInLayer(point, layerWidth, layerHeight);
    context.lineTo(x, y);
  }
}

function drawBrush({ context, layer, width, height, layerWidth, layerHeight }) {
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    context.lineWidth = layer.strokeWidth * layerWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = layer.color;
    strokePath(context, layer.points, layerWidth, layerHeight);
    if (layer.points.length === 1) {
      context.fillStyle = layer.color;
      context.fill();
    } else if (layer.points.length > 1) {
      context.stroke();
    }
  });
}

function createPixelatedCanvas({ canvas, width, height, createCanvas }) {
  const snapshot = snapshotCanvas({ canvas, width, height, createCanvas });
  const reducedWidth = Math.max(1, Math.floor(width / 14));
  const reducedHeight = Math.max(1, Math.floor(height / 14));
  const reduced = createCanvas(reducedWidth, reducedHeight, 'mask-brush-pixelate');
  const reducedContext = getContext(reduced);
  reducedContext.imageSmoothingEnabled = false;
  reducedContext.drawImage(snapshot, 0, 0, width, height, 0, 0, reducedWidth, reducedHeight);
  const pixelated = createCanvas(width, height, 'mask-brush-pixelate-upscale');
  const pixelatedContext = getContext(pixelated);
  pixelatedContext.imageSmoothingEnabled = false;
  pixelatedContext.drawImage(reduced, 0, 0, reducedWidth, reducedHeight, 0, 0, width, height);
  return pixelated;
}

function drawMaskBrush({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas }) {
  // Capture the complete current canvas before creating the mask. This means
  // the layer always pixelates whatever is underneath it, including prior
  // stickers, instead of painting a cosmetic dark line.
  const pixelated = createPixelatedCanvas({ canvas, width, height, createCanvas });
  const mask = createCanvas(width, height, 'mask-brush-mask');
  const maskContext = getContext(mask);
  withLayerTransform(maskContext, layer, width, height, layerWidth, layerHeight, () => {
    maskContext.lineWidth = layer.strokeWidth * layerWidth;
    maskContext.lineCap = 'round';
    maskContext.lineJoin = 'round';
    maskContext.strokeStyle = '#ffffff';
    maskContext.fillStyle = '#ffffff';
    strokePath(maskContext, layer.points, layerWidth, layerHeight);
    if (layer.points.length === 1) maskContext.fill();
    else if (layer.points.length > 1) maskContext.stroke();
  });
  const masked = createCanvas(width, height, 'mask-brush-result');
  const maskedContext = getContext(masked);
  maskedContext.drawImage(pixelated, 0, 0, width, height);
  maskedContext.globalCompositeOperation = 'destination-in';
  maskedContext.drawImage(mask, 0, 0, width, height);
  context.drawImage(masked, 0, 0, width, height);
}

function drawText({ context, layer, width, height, layerWidth, layerHeight }) {
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    const lines = layer.text.split(/\r\n|\r|\n/u);
    const lineHeight = layerHeight / Math.max(1, lines.length);
    const longestLine = Math.max(1, ...lines.map(line => line.length));
    let fontSize = Math.max(1, lineHeight * 0.78);
    const measure = size => {
      context.font = `600 ${size}px sans-serif`;
      if (typeof context.measureText !== 'function') return longestLine * size * 0.6;
      return Math.max(0, ...lines.map(line => context.measureText(line).width));
    };
    const availableWidth = Math.max(1, layerWidth * 0.92);
    while (fontSize > 1 && measure(fontSize) > availableWidth) fontSize *= 0.92;
    measure(fontSize);
    context.fillStyle = layer.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let index = 0; index < lines.length; index += 1) {
      const y = -layerHeight / 2 + lineHeight * (index + 0.5);
      context.fillText(lines[index], 0, y);
    }
  });
}

function getStickerImage(stickerImages, key, label) {
  const image = stickerImages?.get?.(key);
  if (!image) throw new Error(`missing decoded sticker image: ${label}`);
  return image;
}

function drawLayer({ canvas, context, layer, width, height, createCanvas, stickerImages }) {
  const layerWidth = layer.scale * Math.min(width, height);
  const layerHeight = layerWidth / stickerAspectRatio(layer);
  if (layer.kind === 'pixelate') {
    drawPixelate({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas });
    return;
  }
  if (layer.kind === 'blur') {
    drawBlur({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas });
    return;
  }
  if (layer.kind === 'brush') {
    drawBrush({ context, layer, width, height, layerWidth, layerHeight });
    return;
  }
  if (layer.kind === 'mask-brush') {
    drawMaskBrush({ canvas, context, layer, width, height, layerWidth, layerHeight, createCanvas });
    return;
  }
  if (layer.kind === 'text') {
    drawText({ context, layer, width, height, layerWidth, layerHeight });
    return;
  }
  withLayerTransform(context, layer, width, height, layerWidth, layerHeight, () => {
    if (layer.kind === 'black-bar') {
      context.fillStyle = '#000000';
      context.fillRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      return;
    }
    if (IMAGE_STICKER_KINDS.has(layer.kind)) {
      const image = getStickerImage(stickerImages, layer.kind, layer.kind);
      context.drawImage(image, -layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      return;
    }
    if (layer.kind === 'custom-image') {
      const image = getStickerImage(stickerImages, layer.imageDataUrl, 'custom-image');
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
