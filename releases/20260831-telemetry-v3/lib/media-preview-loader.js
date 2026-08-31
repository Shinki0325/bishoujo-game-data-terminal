function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function resetImage(image) {
  image.hidden = true;
  image.alt = '';
  image.removeAttribute('src');
}

export function createMediaPreviewLoader({ image, resolveUrl, reveal }) {
  if (image === null || typeof image !== 'object' || typeof image.removeAttribute !== 'function') {
    throw new TypeError('image must provide removeAttribute');
  }
  assertFunction(resolveUrl, 'resolveUrl');
  assertFunction(reveal, 'reveal');

  let requestId = 0;

  async function open(work) {
    if (work === null || typeof work !== 'object' || typeof work.title !== 'string') {
      throw new TypeError('work must contain a title string');
    }
    const current = ++requestId;
    resetImage(image);
    try {
      const url = await resolveUrl(work);
      if (current !== requestId) return false;
      if (typeof url !== 'string' || url.length === 0) {
        throw new TypeError('resolveUrl must return a non-empty string');
      }
      image.src = url;
      image.alt = work.title;
      if (typeof image.decode === 'function') await image.decode();
      if (current !== requestId) return false;
      const isCurrent = () => current === requestId;
      await reveal(work, isCurrent);
      if (!isCurrent()) return false;
      image.hidden = false;
      return true;
    } catch (error) {
      if (current !== requestId) return false;
      resetImage(image);
      throw error;
    }
  }

  function cancel() {
    requestId += 1;
    resetImage(image);
  }

  return Object.freeze({ open, cancel });
}
