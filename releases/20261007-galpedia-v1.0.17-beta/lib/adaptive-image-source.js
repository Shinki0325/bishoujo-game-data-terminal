import {bindImageSafety} from './image-safety.js';
const SLOW_NETWORK_TYPES = new Set(['slow-2g', '2g']);

export function canUseHighDensityPreview({ devicePixelRatio = 1, connection = null } = {}) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return false;
  if (connection?.saveData === true) return false;
  return !SLOW_NETWORK_TYPES.has(connection?.effectiveType);
}

function applySources(image, { thumbnailUrl, previewUrl = null, thumbnailWidth, previewWidth, sizes } = {}) {
  if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length === 0) throw new TypeError('thumbnailUrl is required');
  // Public media is also used by details and canvas export. The first request
  // must use the same CORS mode; an earlier no-cors response without Vary can
  // otherwise poison the browser cache for a later anonymous request.
  if ([thumbnailUrl, previewUrl].some(url => typeof url === 'string'
    && /^https:\/\/(?:wiki-assets|assets)\.bishojo\.date\//u.test(url))) {
    image.crossOrigin = 'anonymous';
  }
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

export function applyAdaptiveImageSource(image, options = {}) {
  image.dataset.safetyRequestedThumbnail = options.thumbnailUrl;
  return bindImageSafety(image, {urls: [options.thumbnailUrl, options.previewUrl],
    show: ([thumbnailUrl, previewUrl]) => applySources(image, {...options, thumbnailUrl, previewUrl})});
}
