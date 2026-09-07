const SLOW_NETWORK_TYPES = new Set(['slow-2g', '2g']);

export function canUseHighDensityPreview({ devicePixelRatio = 1, connection = null } = {}) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return false;
  if (connection?.saveData === true) return false;
  return !SLOW_NETWORK_TYPES.has(connection?.effectiveType);
}

export function applyAdaptiveImageSource(image, { thumbnailUrl, previewUrl = null } = {}) {
  if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length === 0) throw new TypeError('thumbnailUrl is required');
  image.src = thumbnailUrl;
  image.removeAttribute?.('srcset');
  if (typeof previewUrl === 'string' && previewUrl.length > 0 && previewUrl !== thumbnailUrl) {
    image.srcset = `${thumbnailUrl} 1x, ${previewUrl} 2x`;
  }
}
