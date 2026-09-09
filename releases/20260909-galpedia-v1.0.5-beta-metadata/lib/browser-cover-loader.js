export function loadImageUrl(url, { crossOrigin = 'anonymous', createImage = () => new Image() } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof url !== 'string' || url.length === 0) {
      reject(new TypeError('PNG cover URL is unavailable'));
      return;
    }
    const image = createImage();
    if (crossOrigin !== null) image.crossOrigin = crossOrigin;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          throw new TypeError('PNG cover decoded with invalid dimensions');
        }
        resolve(image);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => reject(new Error(`PNG cover failed to load: ${url}`)), { once: true });
    image.src = url;
  });
}
