import {bindImageSafety} from './image-safety.js';
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

  let requestId = 0, gate = null;

  async function open(work) {
    if (work === null || typeof work !== 'object' || typeof work.title !== 'string') {
      throw new TypeError('work must contain a title string');
    }
    const current = ++requestId;
    gate?.dispose(); gate = null;
    resetImage(image);
    try {
      const url = await resolveUrl(work);
      if (current !== requestId) return false;
      if (typeof url !== 'string' || url.length === 0) {
        throw new TypeError('resolveUrl must return a non-empty string');
      }
      const isCurrent = () => current === requestId;
      await reveal(work, isCurrent);
      if (!isCurrent()) return false;
      gate = bindImageSafety(image, {urls:[url],hide:()=>resetImage(image),show:async ([source],stillAllowed)=>{
        image.src=source;image.alt=work.title;
        try {if(typeof image.decode==='function')await image.decode();}
        catch {if(stillAllowed())resetImage(image);return;}
        if(isCurrent()&&stillAllowed())image.hidden=false;
      }});
      return true;
    } catch (error) {
      if (current !== requestId) return false;
      resetImage(image);
      throw error;
    }
  }

  function cancel() {
    requestId += 1;
    gate?.dispose();gate=null;
    resetImage(image);
  }

  return Object.freeze({ open, cancel });
}
