import { createCrop, moveCrop, zoomCrop } from '../lib/image-crop.js';
import { titleFromFilename } from '../lib/custom-work.js';

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function requiredElement(documentRef, id) {
  const node = documentRef.getElementById?.(id);
  if (!node) throw new Error(`Media dialog is missing #${id}`);
  return node;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.open = true;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.open = false;
}

export function createMediaDialogView({
  documentRef,
  decodeFile,
  encodeCrop,
  renderActive,
  onCreateCustom,
  onReplace = async () => {},
  onError = () => {}
}) {
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    throw new TypeError('documentRef must provide getElementById');
  }
  assertFunction(decodeFile, 'decodeFile');
  assertFunction(encodeCrop, 'encodeCrop');
  assertFunction(renderActive, 'renderActive');
  assertFunction(onCreateCustom, 'onCreateCustom');
  assertFunction(onReplace, 'onReplace');
  assertFunction(onError, 'onError');

  const cropDialog = requiredElement(documentRef, 'media-crop');
  const cropCanvas = requiredElement(documentRef, 'media-crop-canvas');
  const titleInput = requiredElement(documentRef, 'media-crop-title');
  const zoomInput = requiredElement(documentRef, 'media-crop-zoom');
  const resetButton = requiredElement(documentRef, 'media-crop-reset');
  const skipButton = requiredElement(documentRef, 'media-crop-skip');
  const cancelButton = requiredElement(documentRef, 'media-crop-cancel');
  const confirmButton = requiredElement(documentRef, 'media-crop-confirm');
  let queue = [];
  let active = null;
  let pointer = null;
  let confirming = false;

  function releaseActive() {
    const release = active?.decoded?.release;
    active = null;
    if (typeof release === 'function') release();
  }

  function draw() {
    if (!active) return;
    renderActive(active);
  }

  async function advance() {
    releaseActive();
    active = queue.shift() ?? null;
    if (!active) {
      closeDialog(cropDialog);
      return false;
    }
    try {
      active.decoded = await decodeFile(active.file);
      if (!active.decoded || !Number.isFinite(active.decoded.width) || !Number.isFinite(active.decoded.height)) {
        throw new TypeError('decoded image dimensions are invalid');
      }
      active.crop = createCrop({ width: active.decoded.width, height: active.decoded.height, viewport: 512 });
      titleInput.value = titleFromFilename(active.file.name);
      zoomInput.value = '1';
      openDialog(cropDialog);
      draw();
      return true;
    } catch (error) {
      await advance();
      throw error;
    }
  }

  async function confirmCurrent({ title = titleInput.value, crop = active?.crop } = {}) {
    if (!active || !crop) return false;
    const current = active;
    const blob = await encodeCrop({ file: current.file, image: current.decoded.image, crop });
    if (!blob) throw new TypeError('crop encoding returned no blob');
    const record = {
      title: titleFromFilename(title),
      blob,
      width: Math.min(1024, Math.floor(crop.size)),
      height: Math.min(1024, Math.floor(crop.size))
    };
    if (current.replacementWork) await onReplace(current.replacementWork, record);
    else await onCreateCustom(record);
    return advance();
  }

  async function submitCurrent() {
    if (confirming) return false;
    confirming = true;
    confirmButton.disabled = true;
    confirmButton.setAttribute('aria-busy', 'true');
    try {
      return await confirmCurrent();
    } catch (error) {
      onError(error);
      return false;
    } finally {
      confirming = false;
      confirmButton.disabled = false;
      confirmButton.removeAttribute('aria-busy');
    }
  }

  cropCanvas.addEventListener?.('pointerdown', event => {
    if (!active) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    cropCanvas.setPointerCapture?.(event.pointerId);
  });
  cropCanvas.addEventListener?.('pointermove', event => {
    if (!active || !pointer || pointer.id !== event.pointerId) return;
    active.crop = moveCrop(active.crop, { dx: event.clientX - pointer.x, dy: event.clientY - pointer.y });
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    draw();
  });
  cropCanvas.addEventListener?.('pointerup', event => {
    if (pointer?.id === event.pointerId) pointer = null;
  });
  zoomInput.addEventListener?.('input', () => {
    if (!active) return;
    active.crop = zoomCrop(active.crop, {
      scale: Number(zoomInput.value),
      focalX: active.crop.viewport / 2,
      focalY: active.crop.viewport / 2
    });
    draw();
  });
  resetButton.addEventListener?.('click', () => {
    if (!active) return;
    active.crop = createCrop({ width: active.decoded.width, height: active.decoded.height, viewport: 512 });
    zoomInput.value = '1';
    draw();
  });
  skipButton.addEventListener?.('click', () => { void advance(); });
  cancelButton.addEventListener?.('click', () => {
    queue = [];
    releaseActive();
    closeDialog(cropDialog);
  });
  confirmButton.addEventListener?.('click', () => { void submitCurrent(); });

  return Object.freeze({
    async openUpload(files, { availableSlots } = {}) {
      if (!Number.isSafeInteger(availableSlots) || availableSlots < 0) {
        throw new RangeError('availableSlots must be a non-negative safe integer');
      }
      queue = Array.from(files ?? []).slice(0, availableSlots).map(file => ({ file }));
      return advance();
    },
    async openReplacement(work, file) {
      if (work === null || typeof work !== 'object' || typeof work.workId !== 'string') {
        throw new TypeError('replacement work must contain workId');
      }
      if (!file) return false;
      queue = [{ file, replacementWork: work }];
      return advance();
    },
    confirmCurrent,
    skipCurrent: advance,
    cancelAll() {
      queue = [];
      releaseActive();
      closeDialog(cropDialog);
    }
  });
}
