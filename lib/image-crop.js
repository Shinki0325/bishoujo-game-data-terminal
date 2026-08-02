function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
  return value;
}

function assertCrop(crop) {
  if (crop === null || typeof crop !== 'object' || Array.isArray(crop)) {
    throw new TypeError('crop must be an object');
  }
  for (const name of ['width', 'height', 'viewport', 'size', 'x', 'y']) {
    if (!Number.isFinite(crop[name])) throw new TypeError(`crop.${name} must be finite`);
  }
  return crop;
}

export function createCrop({ width, height, viewport }) {
  finitePositive(width, 'width');
  finitePositive(height, 'height');
  finitePositive(viewport, 'viewport');
  const size = Math.min(width, height);
  return Object.freeze({
    width,
    height,
    viewport,
    size,
    x: (width - size) / 2,
    y: (height - size) / 2
  });
}

export function sourceRect(crop) {
  assertCrop(crop);
  return { x: crop.x, y: crop.y, size: crop.size };
}

export function moveCrop(crop, { dx, dy }) {
  assertCrop(crop);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new TypeError('crop movement must be finite');
  const ratio = crop.size / crop.viewport;
  return Object.freeze({
    ...crop,
    x: clamp(crop.x - (dx * ratio), 0, crop.width - crop.size),
    y: clamp(crop.y - (dy * ratio), 0, crop.height - crop.size)
  });
}

export function zoomCrop(crop, { scale, focalX, focalY }) {
  assertCrop(crop);
  finitePositive(scale, 'scale');
  if (!Number.isFinite(focalX) || !Number.isFinite(focalY)) throw new TypeError('crop focal point must be finite');
  const maximumSize = Math.min(crop.width, crop.height);
  const nextSize = clamp(maximumSize / scale, 1, maximumSize);
  const sourceFocalX = crop.x + ((focalX / crop.viewport) * crop.size);
  const sourceFocalY = crop.y + ((focalY / crop.viewport) * crop.size);
  return Object.freeze({
    ...crop,
    size: nextSize,
    x: clamp(sourceFocalX - ((focalX / crop.viewport) * nextSize), 0, crop.width - nextSize),
    y: clamp(sourceFocalY - ((focalY / crop.viewport) * nextSize), 0, crop.height - nextSize)
  });
}

export async function encodeSquareCrop({ image, crop, createCanvas, maximumSize = 1024 }) {
  assertCrop(crop);
  if (image === null || typeof image !== 'object') throw new TypeError('image must be an object');
  if (typeof createCanvas !== 'function') throw new TypeError('createCanvas must be a function');
  finitePositive(maximumSize, 'maximumSize');
  const outputSize = Math.max(1, Math.min(maximumSize, Math.floor(crop.size)));
  const canvas = createCanvas(outputSize);
  const context = canvas?.getContext?.('2d');
  if (!context || typeof context.drawImage !== 'function' || typeof canvas.convertToBlob !== 'function') {
    throw new TypeError('createCanvas must return a Canvas with drawImage and convertToBlob');
  }
  const rect = sourceRect(crop);
  context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, outputSize, outputSize);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
}
