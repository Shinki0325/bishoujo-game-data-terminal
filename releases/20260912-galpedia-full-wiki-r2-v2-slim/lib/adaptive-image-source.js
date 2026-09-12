const SLOW_NETWORK_TYPES = new Set(['slow-2g', '2g']);

export function canUseHighDensityPreview({ devicePixelRatio = 1, connection = null } = {}) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return false;
  if (connection?.saveData === true) return false;
  return !SLOW_NETWORK_TYPES.has(connection?.effectiveType);
}

export function applyAdaptiveImageSource(image, { thumbnailUrl, previewUrl = null, thumbnailWidth, previewWidth, sizes } = {}) {
  if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length === 0) throw new TypeError('thumbnailUrl is required');
  image.src = thumbnailUrl;
  image.removeAttribute?.('srcset');
  image.removeAttribute?.('sizes');
  if (typeof previewUrl === 'string' && previewUrl.length > 0 && previewUrl !== thumbnailUrl) {
    if (sizes) {
      // A detail preview is not necessarily twice the thumbnail's width.
      // Unknown dimensions must not be advertised as invented density values.
      if (Number.isSafeInteger(thumbnailWidth) && thumbnailWidth > 0
        && Number.isSafeInteger(previewWidth) && previewWidth > thumbnailWidth) {
        image.sizes = sizes;
        image.srcset = `${thumbnailUrl} ${thumbnailWidth}w, ${previewUrl} ${previewWidth}w`;
      }
    } else image.srcset = `${thumbnailUrl} 1x, ${previewUrl} 2x`;
  }
}
