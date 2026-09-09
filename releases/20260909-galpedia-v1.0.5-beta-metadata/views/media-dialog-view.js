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

function optionalElement(documentRef, id) {
  return documentRef.getElementById?.(id) ?? null;
}

function openDialog(dialog) {
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.open = true;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.open = false;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function createMediaDialogView({
  documentRef,
  decodeFile,
  encodeCrop,
  renderActive,
  onCreateCustom,
  onReplace = async () => {},
  onEditStickers = async () => null,
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
  assertFunction(onEditStickers, 'onEditStickers');
  assertFunction(onError, 'onError');

  const cropDialog = requiredElement(documentRef, 'media-crop');
  const cropCanvas = requiredElement(documentRef, 'media-crop-canvas');
  const titleInput = requiredElement(documentRef, 'media-crop-title');
  const resetButton = requiredElement(documentRef, 'media-crop-reset');
  const skipButton = requiredElement(documentRef, 'media-crop-skip');
  const cancelButton = requiredElement(documentRef, 'media-crop-cancel');
  const stickersButton = requiredElement(documentRef, 'media-crop-stickers');
  const confirmButton = requiredElement(documentRef, 'media-crop-confirm');
  // These nodes are intentionally optional so the media flow stays compatible
  // with older index files while the host page rolls out the richer controls.
  const progressNode = optionalElement(documentRef, 'media-crop-progress');
  const progressBar = optionalElement(documentRef, 'media-crop-progress-bar');
  const statusNode = optionalElement(documentRef, 'media-crop-status');
  const clearDraftButton = optionalElement(documentRef, 'media-crop-stickers-clear');
  const retryButton = optionalElement(documentRef, 'media-crop-retry');
  const zoomControl = optionalElement(documentRef, 'media-crop-zoom');
  const zoomValueNode = optionalElement(documentRef, 'media-crop-zoom-value');
  let queue = [];
  let queueTotal = 0;
  let active = null;
  const pointers = new Map();
  let pinch = null;
  let confirming = false;
  let editingStickers = false;
  let retrying = false;
  let generation = 0;
  let transitionPromise = null;
  const cropControls = [titleInput, resetButton, skipButton, cancelButton, stickersButton, confirmButton];

  function hasStickerDraft() {
    return Array.isArray(active?.stickerDraft?.stickerDocument?.layers)
      && active.stickerDraft.stickerDocument.layers.length > 0;
  }

  function cropFingerprint(crop) {
    if (!crop) return '';
    return [crop.width, crop.height, crop.size, crop.x, crop.y].join('|');
  }

  function setStatus(message = '') {
    if (!statusNode) return;
    statusNode.textContent = message;
    if ('hidden' in statusNode) statusNode.hidden = !message;
  }

  function releaseDecoded(decoded) {
    try { decoded?.release?.(); }
    catch (error) { onError(error); }
  }

  function syncControls() {
    const busy = confirming || editingStickers || retrying;
    const locked = hasStickerDraft();
    const failed = Boolean(active?.failedError) || !active?.crop;
    for (const control of cropControls) control.disabled = busy || failed;
    skipButton.disabled = busy;
    cancelButton.disabled = busy;
    resetButton.disabled = busy || failed || locked;
    stickersButton.disabled = busy || failed;
    confirmButton.disabled = busy || failed;
    if (clearDraftButton) {
      clearDraftButton.disabled = busy || !locked;
      if ('hidden' in clearDraftButton) clearDraftButton.hidden = !locked;
    }
    if (retryButton) {
      retryButton.disabled = busy || !active?.failedError;
      if ('hidden' in retryButton) retryButton.hidden = !active?.failedError;
    }
    if (zoomControl) zoomControl.disabled = busy || locked || !active?.crop;
  }

  function updateProgress() {
    const current = active && queueTotal > 0 ? queueTotal - queue.length : 0;
    const text = active && queueTotal > 0 ? `图片 ${current} / ${queueTotal}` : '';
    if (progressNode) {
      progressNode.textContent = text;
      if ('hidden' in progressNode) progressNode.hidden = !text;
      progressNode.setAttribute?.('aria-valuemin', '0');
      progressNode.setAttribute?.('aria-valuemax', String(queueTotal));
      progressNode.setAttribute?.('aria-valuenow', String(current));
    }
    if (progressBar) {
      if ('max' in progressBar) progressBar.max = Math.max(0, queueTotal);
      if ('value' in progressBar) progressBar.value = current;
      if ('hidden' in progressBar) progressBar.hidden = !text;
      progressBar.setAttribute?.('aria-valuemin', '0');
      progressBar.setAttribute?.('aria-valuemax', String(queueTotal));
      progressBar.setAttribute?.('aria-valuenow', String(current));
    }
  }

  function canvasPoint(event) {
    const rect = cropCanvas.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: active?.crop.viewport ?? 1,
      height: active?.crop.viewport ?? 1
    };
    const viewport = active?.crop.viewport ?? 1;
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewport,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewport
    };
  }

  function currentScale(crop) {
    return Math.min(crop.width, crop.height) / crop.size;
  }

  function beginPinch() {
    if (!active || pointers.size !== 2) {
      pinch = null;
      return;
    }
    const [left, right] = [...pointers.values()];
    pinch = {
      crop: active.crop,
      distance: Math.max(1, distance(left, right))
    };
  }

  function releaseActive() {
    const decoded = active?.decoded;
    const stickerPreview = active?.stickerPreview;
    active = null;
    pointers.clear();
    pinch = null;
    releaseDecoded(decoded);
    releaseDecoded(stickerPreview);
    updateProgress();
    syncControls();
  }

  function draw() {
    if (!active) return;
    if (active.crop || active.failedError) {
      try { renderActive(active); }
      catch (error) { onError(error); }
    }
    syncZoomControl();
    syncControls();
  }

  async function advanceOnce() {
    const token = ++generation;
    releaseActive();
    active = queue.shift() ?? null;
    updateProgress();
    if (!active) {
      queueTotal = 0;
      updateProgress();
      closeDialog(cropDialog);
      return false;
    }
    const current = active;
    setStatus('');
    let decoded = null;
    try {
      decoded = await decodeFile(current.file);
      if (token !== generation || active !== current) {
        releaseDecoded(decoded);
        return false;
      }
      current.decoded = decoded;
      if (!Number.isFinite(decoded?.width) || !Number.isFinite(decoded?.height)) {
        throw new TypeError('decoded image dimensions are invalid');
      }
      current.crop = createCrop({ width: decoded.width, height: decoded.height, viewport: 512 });
      current.failedError = null;
      titleInput.value = titleFromFilename(current.file.name);
      setStatus('');
      openDialog(cropDialog);
      draw();
      return true;
    } catch (error) {
      if (token !== generation || active !== current) {
        if (decoded && current.decoded !== decoded) {
          releaseDecoded(decoded);
        }
        return false;
      }
      if (current.decoded === decoded) {
        releaseDecoded(current.decoded);
        current.decoded = null;
      }
      current.crop = null;
      current.failedError = error;
      setStatus(`图片读取失败：${error instanceof Error ? error.message : '未知错误'}。可重试、跳过或取消。`);
      openDialog(cropDialog);
      draw();
      throw error;
    }
  }

  function advance() {
    if (transitionPromise) return transitionPromise;
    const promise = advanceOnce();
    let wrapped;
    wrapped = promise.finally(() => {
      if (transitionPromise === wrapped) transitionPromise = null;
    });
    transitionPromise = wrapped;
    return wrapped;
  }

  function syncZoomControl() {
    if (!zoomControl) return;
    const value = active?.crop ? currentScale(active.crop) : 1;
    zoomControl.value = String(Number(value.toFixed(2)));
    zoomControl.setAttribute?.('aria-valuenow', String(Number(value.toFixed(2))));
    zoomValueNode && (zoomValueNode.textContent = `${Math.round(value * 100)}%`);
  }

  function recordFor({ title, crop, baseBlob, edited }) {
    const outputSize = Math.min(1024, Math.floor(crop.size));
    const draft = edited ?? null;
    return {
      title: titleFromFilename(title),
      blob: draft?.compositeBlob ?? baseBlob,
      width: outputSize,
      height: outputSize,
      ...(draft === null ? {} : {
        baseBlob: draft.baseBlob ?? baseBlob,
        stickerDocument: draft.stickerDocument
      })
    };
  }

  async function commitCurrent(current, record) {
    if (active !== current) return false;
    if (current.replacementWork) await onReplace(current.replacementWork, record);
    else await onCreateCustom(record);
    return advance();
  }

  async function confirmCurrent({ title = titleInput.value, crop = active?.crop } = {}) {
    if (!active || !crop) return false;
    const current = active;
    const token = generation;
    if (current.stickerDraft) {
      if (cropFingerprint(crop) !== current.stickerDraft.cropFingerprint) {
        const error = new Error('已有贴纸编辑，请先清除贴纸编辑后再裁切。');
        setStatus(error.message);
        onError(error);
        return false;
      }
      return commitCurrent(current, recordFor({
        title, crop, baseBlob: current.stickerDraft.baseBlob,
        edited: current.stickerDraft
      }));
    }
    const baseBlob = await encodeCrop({ file: current.file, image: current.decoded.image, crop });
    if (token !== generation || active !== current) return false;
    if (!baseBlob) throw new TypeError('crop encoding returned no blob');
    return commitCurrent(current, recordFor({ title, crop, baseBlob }));
  }

  async function editCurrentStickers() {
    if (!active?.crop || !active.decoded || confirming || editingStickers) return false;
    editingStickers = true;
    syncControls();
    stickersButton.setAttribute('aria-busy', 'true');
    const current = active;
    const crop = active.crop;
    const token = generation;
    const title = titleInput.value;
    try {
      const baseBlob = current.stickerDraft?.baseBlob
        ?? await encodeCrop({ file: current.file, image: current.decoded.image, crop });
      if (!baseBlob) throw new TypeError('crop encoding returned no blob');
      const outputSize = Math.min(1024, Math.floor(crop.size));
      const edited = await onEditStickers({
        baseBlob,
        title: titleFromFilename(title),
        width: outputSize,
        height: outputSize,
        ...(current.stickerDraft ? { stickerDocument: current.stickerDraft.stickerDocument } : {})
      });
      if (token !== generation || active !== current || edited === null || edited === undefined) return false;
      const stickerDocument = edited.stickerDocument ?? edited.document;
      if (!stickerDocument || !Array.isArray(stickerDocument.layers)) {
        throw new TypeError('贴纸编辑器未返回有效文档。');
      }
      if (stickerDocument.layers.length === 0) {
        // An empty document means the user cleared the draft. Discarding it
        // here lets the next crop produce a fresh base instead of reusing a
        // stale baseBlob from the previous crop.
        current.stickerDraft = null;
        releaseDecoded(current.stickerPreview);
        current.stickerPreview = null;
        setStatus('');
      } else {
        const compositeBlob = edited.compositeBlob ?? edited.blob;
        if (!compositeBlob) throw new TypeError('贴纸编辑器未返回合成图片。');
        const stickerPreview = await decodeFile(compositeBlob);
        if (token !== generation || active !== current) {
          releaseDecoded(stickerPreview);
          return false;
        }
        if (!stickerPreview || !Number.isFinite(stickerPreview.width) || !Number.isFinite(stickerPreview.height)) {
          releaseDecoded(stickerPreview);
          throw new TypeError('贴纸合成预览解码失败。');
        }
        const previousPreview = current.stickerPreview;
        current.stickerDraft = Object.freeze({
          baseBlob: edited.baseBlob ?? baseBlob,
          compositeBlob,
          stickerDocument,
          cropFingerprint: cropFingerprint(crop)
        });
        current.stickerPreview = stickerPreview;
        releaseDecoded(previousPreview);
        setStatus('已暂存贴纸编辑；如需重裁，请先清除贴纸编辑。');
      }
      draw();
      return true;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      editingStickers = false;
      syncControls();
      stickersButton.removeAttribute('aria-busy');
    }
  }

  async function submitCurrent() {
    if (confirming) return false;
    confirming = true;
    syncControls();
    confirmButton.disabled = true;
    confirmButton.setAttribute('aria-busy', 'true');
    try {
      return await confirmCurrent();
    } catch (error) {
      onError(error);
      return false;
    } finally {
      confirming = false;
      syncControls();
      confirmButton.removeAttribute('aria-busy');
    }
  }

  cropCanvas.addEventListener?.('pointerdown', event => {
    if (!active?.crop || hasStickerDraft() || confirming || editingStickers) return;
    pointers.set(event.pointerId, canvasPoint(event));
    cropCanvas.setPointerCapture?.(event.pointerId);
    beginPinch();
  });
  cropCanvas.addEventListener?.('pointermove', event => {
    if (!active?.crop || hasStickerDraft() || confirming || editingStickers || !pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    const next = canvasPoint(event);
    pointers.set(event.pointerId, next);
    if (pointers.size === 1) {
      active.crop = moveCrop(active.crop, { dx: next.x - previous.x, dy: next.y - previous.y });
    } else if (pointers.size === 2 && pinch) {
      const [left, right] = [...pointers.values()];
      active.crop = zoomCrop(pinch.crop, {
        scale: clamp(
          currentScale(pinch.crop) * (distance(left, right) / pinch.distance),
          1,
          4
        ),
        focalX: (left.x + right.x) / 2,
        focalY: (left.y + right.y) / 2
      });
    }
    draw();
  });

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    beginPinch();
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    cropCanvas.addEventListener?.(type, releasePointer);
  }
  cropCanvas.addEventListener?.('wheel', event => {
    if (!active?.crop || hasStickerDraft() || confirming || editingStickers) return;
    const focal = canvasPoint(event);
    active.crop = zoomCrop(active.crop, {
      scale: clamp(currentScale(active.crop) * Math.exp(-event.deltaY * 0.0015), 1, 4),
      focalX: focal.x,
      focalY: focal.y
    });
    event.preventDefault?.();
    draw();
  });
  resetButton.addEventListener?.('click', () => {
    if (!active?.crop || hasStickerDraft()) {
      if (hasStickerDraft()) setStatus('已有贴纸编辑，请先清除贴纸编辑后再裁切。');
      return;
    }
    active.crop = createCrop({ width: active.decoded.width, height: active.decoded.height, viewport: 512 });
    draw();
  });
  skipButton.addEventListener?.('click', () => { if (!confirming && !editingStickers) void skipCurrent(); });
  cancelButton.addEventListener?.('click', () => {
    if (!confirming && !editingStickers) cancelAll();
  });
  retryButton?.addEventListener?.('click', () => { void retryCurrent(); });
  stickersButton.addEventListener?.('click', () => { void editCurrentStickers(); });
  confirmButton.addEventListener?.('click', () => { void submitCurrent(); });
  clearDraftButton?.addEventListener?.('click', () => {
    if (!active || !hasStickerDraft() || confirming || editingStickers) return;
    active.stickerDraft = null;
    releaseDecoded(active.stickerPreview);
    active.stickerPreview = null;
    setStatus('');
    draw();
  });
  zoomControl?.addEventListener?.('input', () => {
    if (!active?.crop || hasStickerDraft() || confirming || editingStickers) return;
    const scale = Number(zoomControl.value);
    if (!Number.isFinite(scale)) return;
    active.crop = zoomCrop(active.crop, {
      scale: clamp(scale, 1, 4),
      focalX: active.crop.viewport / 2,
      focalY: active.crop.viewport / 2
    });
    draw();
  });

  async function replaceQueue(nextQueue) {
    const pending = transitionPromise;
    generation++;
    releaseActive();
    queue = nextQueue;
    queueTotal = nextQueue.length;
    updateProgress();
    if (pending) await pending.catch(() => {});
    return advance();
  }

  async function skipCurrent() {
    const pending = transitionPromise;
    generation++;
    releaseActive();
    if (pending) await pending.catch(() => {});
    return advance();
  }

  async function retryCurrent() {
    const current = active;
    if (!current?.failedError || confirming || editingStickers || retrying || transitionPromise) return false;
    retrying = true;
    const token = ++generation;
    current.crop = null;
    current.failedError = null;
    setStatus('正在重试读取图片…');
    syncControls();
    let decoded = null;
    try {
      decoded = await decodeFile(current.file);
      if (token !== generation || active !== current) {
        releaseDecoded(decoded);
        return false;
      }
      current.decoded = decoded;
      if (!Number.isFinite(decoded?.width) || !Number.isFinite(decoded?.height)) {
        throw new TypeError('decoded image dimensions are invalid');
      }
      current.crop = createCrop({ width: decoded.width, height: decoded.height, viewport: 512 });
      current.failedError = null;
      setStatus('');
      openDialog(cropDialog);
      draw();
      return true;
    } catch (error) {
      if (token !== generation || active !== current) {
        if (decoded && current.decoded !== decoded) releaseDecoded(decoded);
        return false;
      }
      if (current.decoded === decoded) {
        releaseDecoded(current.decoded);
        current.decoded = null;
      }
      current.crop = null;
      current.failedError = error;
      setStatus(`图片读取失败：${error instanceof Error ? error.message : '未知错误'}。可重试、跳过或取消。`);
      draw();
      onError(error);
      return false;
    } finally {
      retrying = false;
      syncControls();
    }
  }

  function cancelAll() {
    generation++;
    queue = [];
    queueTotal = 0;
    releaseActive();
    setStatus('');
    closeDialog(cropDialog);
    updateProgress();
  }

  return Object.freeze({
    async openUpload(files, { availableSlots } = {}) {
      if (!Number.isSafeInteger(availableSlots) || availableSlots < 0) {
        throw new RangeError('availableSlots must be a non-negative safe integer');
      }
      return replaceQueue(Array.from(files ?? []).slice(0, availableSlots).map(file => ({ file })));
    },
    async openReplacement(work, file) {
      if (work === null || typeof work !== 'object' || typeof work.workId !== 'string') {
        throw new TypeError('replacement work must contain workId');
      }
      if (!file) return false;
      return replaceQueue([{ file, replacementWork: work }]);
    },
    confirmCurrent,
    skipCurrent,
    retryCurrent,
    clearStickerDraft() {
      if (!active || !hasStickerDraft() || confirming || editingStickers) return false;
      active.stickerDraft = null;
      releaseDecoded(active.stickerPreview);
      active.stickerPreview = null;
      setStatus('');
      draw();
      return true;
    },
    cancelAll
  });
}
