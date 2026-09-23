import {
  STICKER_LIMIT,
  STICKER_TYPES,
  addSticker,
  clearStickers,
  createStickerHistory,
  moveStickerLayer,
  removeSticker,
  transformSticker,
  validateStickerDocument
} from '../lib/sticker-document.js';
import { createActionIcon } from '../lib/action-icons.js';
import { createPopoverController } from '../lib/ui-popover.js';

const PALETTE = Object.freeze({
  'sticker-option-black-bar': 'black-bar',
  'sticker-option-pixelate': 'pixelate',
  'sticker-option-blur': 'blur',
  'sticker-option-please-wait-character': 'please-wait-character',
  'sticker-option-paper-bag-character': 'paper-bag-character'
});

function requiredElement(documentRef, id) {
  const node = documentRef.getElementById?.(id);
  if (!node) throw new Error(`Sticker editor is missing #${id}`);
  return node;
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.open = true;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.open = false;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function angle(left, right) {
  return Math.atan2(right.y - left.y, right.x - left.x);
}

function rotatePoint(x, y, radians) {
  return {
    x: (x * Math.cos(radians)) - (y * Math.sin(radians)),
    y: (x * Math.sin(radians)) + (y * Math.cos(radians))
  };
}

export function createStickerEditorView({
  documentRef,
  windowRef = null,
  requestFrame,
  cancelFrame,
  renderPreview,
  compose,
  confirm,
  onError
}) {
  if (!documentRef || typeof documentRef.getElementById !== 'function') {
    throw new TypeError('documentRef must provide getElementById');
  }
  assertFunction(requestFrame, 'requestFrame');
  assertFunction(cancelFrame, 'cancelFrame');
  assertFunction(renderPreview, 'renderPreview');
  assertFunction(compose, 'compose');
  assertFunction(confirm, 'confirm');
  assertFunction(onError, 'onError');

  const dialog = requiredElement(documentRef, 'sticker-editor');
  const canvas = requiredElement(documentRef, 'sticker-editor-canvas');
  const undoButton = requiredElement(documentRef, 'sticker-undo');
  const redoButton = requiredElement(documentRef, 'sticker-redo');
  const moreButton = requiredElement(documentRef, 'sticker-more');
  const moreMenu = requiredElement(documentRef, 'sticker-more-menu');
  const clearButton = requiredElement(documentRef, 'sticker-clear');
  const deleteButton = requiredElement(documentRef, 'sticker-delete');
  const backwardButton = requiredElement(documentRef, 'sticker-layer-backward');
  const forwardButton = requiredElement(documentRef, 'sticker-layer-forward');
  const selectionControls = requiredElement(documentRef, 'sticker-selection-controls');
  const cancelButton = requiredElement(documentRef, 'sticker-cancel');
  const saveButton = requiredElement(documentRef, 'sticker-save');
  const paletteButtons = new Map(Object.entries(PALETTE).map(([id, kind]) => [
    kind,
    requiredElement(documentRef, id)
  ]));
  const mutatingButtons = [
    undoButton,
    redoButton,
    clearButton,
    deleteButton,
    backwardButton,
    forwardButton,
    ...paletteButtons.values()
  ];

  function installIcon(button, iconName) {
    button.replaceChildren(createActionIcon(documentRef, iconName));
  }

  function installLayerIcon(button, direction) {
    const layers = createActionIcon(documentRef, 'layers-2');
    layers.setAttribute('class', 'layer-icon');
    const arrow = createActionIcon(documentRef, direction);
    arrow.setAttribute('class', 'layer-arrow-icon');
    button.replaceChildren(layers, arrow);
  }

  function installLabelledIcon(button, iconName, labelText) {
    const label = button.querySelector?.('.action-label') ?? documentRef.createElement('span');
    label.className = 'action-label';
    if (!label.textContent) label.textContent = labelText;
    button.replaceChildren(createActionIcon(documentRef, iconName), label);
  }

  installIcon(undoButton, 'undo-2');
  installIcon(redoButton, 'redo-2');
  installIcon(moreButton, 'ellipsis');
  installLayerIcon(backwardButton, 'arrow-down');
  installLayerIcon(forwardButton, 'arrow-up');
  installIcon(deleteButton, 'trash-2');
  installLabelledIcon(clearButton, 'trash-2', '清空贴纸');
  installLabelledIcon(saveButton, 'save', '保存贴纸');
  moreButton.setAttribute('aria-controls', 'sticker-more-menu');
  moreButton.setAttribute('aria-expanded', 'false');
  moreMenu.hidden = true;
  const popoverWindow = windowRef ?? documentRef.defaultView ?? (typeof window === 'undefined' ? {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
    removeEventListener() {}
  } : window);
  const popoverController = createPopoverController({
    items: [{ button: moreButton, menu: moreMenu, kind: 'actions' }],
    documentRef,
    windowRef: popoverWindow
  });

  let session = null;
  let frameId = null;
  let busy = false;
  const pointers = new Map();
  let gesture = null;
  let blankPointerId = null;

  function currentDocument() {
    return session?.transientDocument ?? session?.history.inspect().present ?? null;
  }

  function currentLayer() {
    return currentDocument()?.layers.find(layer => layer.id === session?.selectedId) ?? null;
  }

  function closeMenu() {
    popoverController.closeAll();
  }

  function inspect() {
    if (!session) return Object.freeze({ active: false, busy: false, document: null, selectedId: null });
    return Object.freeze({
      active: true,
      busy,
      baseImage: session.baseImage,
      baseBlob: session.baseBlob,
      stickerImages: session.stickerImages,
      document: currentDocument(),
      selectedId: session.selectedId
    });
  }

  function syncControls() {
    if (!session) return;
    const document = currentDocument();
    const history = session.history.inspect();
    const selectedIndex = document.layers.findIndex(layer => layer.id === session.selectedId);
    selectionControls.hidden = selectedIndex < 0;
    undoButton.disabled = busy || history.past.length === 0;
    redoButton.disabled = busy || history.future.length === 0;
    clearButton.disabled = busy || document.layers.length === 0;
    deleteButton.disabled = busy || selectedIndex < 0;
    backwardButton.disabled = busy || selectedIndex <= 0;
    forwardButton.disabled = busy || selectedIndex < 0 || selectedIndex >= document.layers.length - 1;
    for (const button of paletteButtons.values()) {
      button.disabled = busy || document.layers.length >= STICKER_LIMIT;
    }
    saveButton.disabled = busy;
    cancelButton.disabled = busy;
    moreButton.disabled = busy;
  }

  function scheduleRender() {
    if (!session || frameId !== null) return;
    const synchronousMarker = {};
    frameId = synchronousMarker;
    const requestedId = requestFrame(() => {
      frameId = null;
      if (!session) return;
      syncControls();
      renderPreview(inspect());
    });
    if (frameId === synchronousMarker) frameId = requestedId;
  }

  function setBusy(next) {
    busy = next;
    saveButton.setAttribute('aria-busy', next ? 'true' : 'false');
    if (!next) saveButton.removeAttribute('aria-busy');
    for (const button of mutatingButtons) button.disabled = next;
    saveButton.disabled = next;
    cancelButton.disabled = next;
    moreButton.disabled = next;
    syncControls();
  }

  function commit(document, { selectedId = session?.selectedId, coalesceKey = null } = {}) {
    if (!session || busy) return;
    session.history.push(document, { coalesceKey });
    session.transientDocument = null;
    session.selectedId = selectedId && document.layers.some(layer => layer.id === selectedId)
      ? selectedId
      : null;
    scheduleRender();
  }

  function useHistory(method) {
    if (!session || busy || !session.history[method]()) return;
    session.transientDocument = null;
    if (session.selectedId && !currentDocument().layers.some(layer => layer.id === session.selectedId)) {
      session.selectedId = null;
    }
    scheduleRender();
  }

  function canvasRect() {
    return canvas.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 512, height: 512 };
  }

  function imageRect() {
    const rect = canvasRect();
    const document = currentDocument();
    const ratio = Math.min(rect.width / document.baseWidth, rect.height / document.baseHeight);
    const width = document.baseWidth * ratio;
    const height = document.baseHeight * ratio;
    return {
      x: (rect.width - width) / 2,
      y: (rect.height - height) / 2,
      width,
      height
    };
  }

  function eventPoint(event) {
    const rect = canvasRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function layerGeometry(layer) {
    const rect = imageRect();
    const width = layer.scale * Math.min(rect.width, rect.height);
    return {
      centerX: rect.x + (layer.centerX * rect.width),
      centerY: rect.y + (layer.centerY * rect.height),
      width,
      height: width / STICKER_TYPES[layer.kind].aspectRatio,
      radians: layer.rotation * Math.PI / 180
    };
  }

  function localPoint(point, geometry) {
    const offset = { x: point.x - geometry.centerX, y: point.y - geometry.centerY };
    return rotatePoint(offset.x, offset.y, -geometry.radians);
  }

  function worldPoint(geometry, local) {
    const rotated = rotatePoint(local.x, local.y, geometry.radians);
    return { x: geometry.centerX + rotated.x, y: geometry.centerY + rotated.y };
  }

  function hitTest(point) {
    const document = currentDocument();
    const selected = currentLayer();
    if (selected) {
      const geometry = layerGeometry(selected);
      const handles = [
        [-geometry.width / 2, -geometry.height / 2],
        [geometry.width / 2, -geometry.height / 2],
        [geometry.width / 2, geometry.height / 2],
        [-geometry.width / 2, geometry.height / 2]
      ];
      if (handles.some(([x, y]) => distance(point, worldPoint(geometry, { x, y })) <= 12)) {
        return { type: 'scale', layer: selected };
      }
      const rotationHandle = worldPoint(geometry, { x: 0, y: (-geometry.height / 2) - 28 });
      if (distance(point, rotationHandle) <= 12) return { type: 'rotate', layer: selected };
    }
    for (let index = document.layers.length - 1; index >= 0; index -= 1) {
      const layer = document.layers[index];
      const geometry = layerGeometry(layer);
      const local = localPoint(point, geometry);
      if (Math.abs(local.x) <= geometry.width / 2 && Math.abs(local.y) <= geometry.height / 2) {
        return { type: 'move', layer };
      }
    }
    return null;
  }

  function beginPinch() {
    if (!session?.selectedId || pointers.size !== 2) return false;
    const [left, right] = [...pointers.values()];
    const layer = currentLayer();
    if (!layer) return false;
    gesture = {
      type: 'pinch',
      document: currentDocument(),
      layer,
      distance: Math.max(1, distance(left, right)),
      angle: angle(left, right)
    };
    blankPointerId = null;
    return true;
  }

  canvas.addEventListener?.('pointerdown', event => {
    if (!session || busy) return;
    const point = eventPoint(event);
    pointers.set(event.pointerId, point);
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic test events and browsers without active capture may reject this call.
    }
    if (pointers.size === 2 && beginPinch()) return;
    if (pointers.size !== 1) return;
    const hit = hitTest(point);
    if (!hit) {
      blankPointerId = event.pointerId;
      gesture = null;
      return;
    }
    blankPointerId = null;
    session.selectedId = hit.layer.id;
    const geometry = layerGeometry(hit.layer);
    gesture = {
      type: hit.type,
      pointerId: event.pointerId,
      document: currentDocument(),
      layer: hit.layer,
      start: point,
      center: { x: geometry.centerX, y: geometry.centerY },
      distance: Math.max(1, distance(point, { x: geometry.centerX, y: geometry.centerY })),
      angle: Math.atan2(point.y - geometry.centerY, point.x - geometry.centerX)
    };
    scheduleRender();
  });

  canvas.addEventListener?.('pointermove', event => {
    if (!session || busy || !pointers.has(event.pointerId)) return;
    const point = eventPoint(event);
    pointers.set(event.pointerId, point);
    if (!gesture) return;
    let patch = null;
    if (gesture.type === 'pinch' && pointers.size === 2) {
      const [left, right] = [...pointers.values()];
      patch = {
        scale: gesture.layer.scale * (distance(left, right) / gesture.distance),
        rotation: gesture.layer.rotation + ((angle(left, right) - gesture.angle) * 180 / Math.PI)
      };
    } else if (gesture.pointerId === event.pointerId && gesture.type === 'move') {
      const rect = imageRect();
      patch = {
        centerX: gesture.layer.centerX + ((point.x - gesture.start.x) / rect.width),
        centerY: gesture.layer.centerY + ((point.y - gesture.start.y) / rect.height)
      };
    } else if (gesture.pointerId === event.pointerId && gesture.type === 'scale') {
      patch = { scale: gesture.layer.scale * (distance(point, gesture.center) / gesture.distance) };
    } else if (gesture.pointerId === event.pointerId && gesture.type === 'rotate') {
      const nextAngle = Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x);
      patch = { rotation: gesture.layer.rotation + ((nextAngle - gesture.angle) * 180 / Math.PI) };
    }
    if (!patch) return;
    session.transientDocument = transformSticker(gesture.document, gesture.layer.id, patch);
    scheduleRender();
  });

  function releasePointer(event) {
    if (!session || !pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (gesture && (gesture.type !== 'pinch' || pointers.size < 2)) {
      if (session.transientDocument) {
        const completed = session.transientDocument;
        session.transientDocument = null;
        commit(completed, { selectedId: gesture.layer.id, coalesceKey: `gesture-${event.pointerId}` });
      }
      gesture = null;
    } else if (blankPointerId === event.pointerId) {
      blankPointerId = null;
      session.selectedId = null;
      scheduleRender();
    }
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener?.(type, releasePointer);
  }

  for (const [kind, button] of paletteButtons) {
    button.addEventListener?.('click', () => {
      if (!session || busy) return;
      try {
        const document = addSticker(currentDocument(), kind);
        commit(document, { selectedId: document.layers.at(-1).id, coalesceKey: 'add' });
      } catch (error) {
        onError(error);
      }
    });
  }

  undoButton.addEventListener?.('click', () => useHistory('undo'));
  redoButton.addEventListener?.('click', () => useHistory('redo'));
  moreButton.addEventListener?.('click', event => {
    event.stopPropagation?.();
  });
  clearButton.addEventListener?.('click', () => {
    closeMenu();
    if (!session || busy || currentDocument().layers.length === 0 || !confirm('清空贴纸？')) return;
    commit(clearStickers(currentDocument()), { selectedId: null, coalesceKey: 'clear' });
  });
  deleteButton.addEventListener?.('click', () => {
    if (!session?.selectedId || busy) return;
    commit(removeSticker(currentDocument(), session.selectedId), { selectedId: null, coalesceKey: 'delete' });
  });

  function moveLayer(offset) {
    if (!session?.selectedId || busy) return;
    const document = currentDocument();
    const index = document.layers.findIndex(layer => layer.id === session.selectedId);
    commit(moveStickerLayer(document, session.selectedId, index + offset), {
      selectedId: session.selectedId,
      coalesceKey: 'layer-order'
    });
  }
  backwardButton.addEventListener?.('click', () => moveLayer(-1));
  forwardButton.addEventListener?.('click', () => moveLayer(1));

  function cancel() {
    if (!session || busy) return false;
    closeMenu();
    const resolve = session.resolve;
    session.history.reset(session.initialDocument);
    session = null;
    pointers.clear();
    gesture = null;
    blankPointerId = null;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    closeDialog(dialog);
    resolve(null);
    return true;
  }

  async function save() {
    if (!session || busy) return false;
    closeMenu();
    setBusy(true);
    const activeSession = session;
    const document = currentDocument();
    try {
      const composed = await compose({
        baseImage: activeSession.baseImage,
        baseBlob: activeSession.baseBlob,
        stickerImages: activeSession.stickerImages,
        document
      });
      if (session !== activeSession) return false;
      const result = Object.freeze({
        baseBlob: activeSession.baseBlob,
        compositeBlob: composed?.compositeBlob ?? composed,
        document: validateStickerDocument(composed?.document ?? document)
      });
      const resolve = activeSession.resolve;
      session = null;
      pointers.clear();
      gesture = null;
      blankPointerId = null;
      frameId = null;
      closeDialog(dialog);
      resolve(result);
      return true;
    } catch (error) {
      if (session === activeSession) {
        setBusy(false);
        closeMenu();
        onError(error);
        scheduleRender();
      }
      return false;
    }
  }

  cancelButton.addEventListener?.('click', cancel);
  saveButton.addEventListener?.('click', () => { void save(); });
  dialog.addEventListener?.('cancel', event => {
    event.preventDefault?.();
    cancel();
  });

  documentRef.addEventListener?.('keydown', event => {
    if (event.defaultPrevented) return;
    if (!session || busy) return;
    const eventTarget = event.target ?? documentRef.activeElement;
    if (moreMenu.contains?.(eventTarget) || moreButton.contains?.(eventTarget)) return;
    const topModal = documentRef.querySelector?.('dialog:modal');
    if (topModal && !topModal.contains?.(eventTarget)) return;
    const key = String(event.key ?? '');
    const command = event.ctrlKey || event.metaKey;
    if (command && key.toLowerCase() === 'z') {
      event.preventDefault?.();
      useHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (command && key.toLowerCase() === 'y') {
      event.preventDefault?.();
      useHistory('redo');
      return;
    }
    if (key === 'Escape') {
      event.preventDefault?.();
      if (!moreMenu.hidden) {
        closeMenu();
        return;
      }
      cancel();
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && session.selectedId) {
      event.preventDefault?.();
      commit(removeSticker(currentDocument(), session.selectedId), { selectedId: null, coalesceKey: 'delete' });
      return;
    }
    if (!session.selectedId || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    event.preventDefault?.();
    const document = currentDocument();
    const layer = currentLayer();
    const amount = event.shiftKey ? 10 : 1;
    const patch = {
      centerX: layer.centerX + ((key === 'ArrowRight' ? amount : key === 'ArrowLeft' ? -amount : 0) / document.baseWidth),
      centerY: layer.centerY + ((key === 'ArrowDown' ? amount : key === 'ArrowUp' ? -amount : 0) / document.baseHeight)
    };
    commit(transformSticker(document, layer.id, patch), { selectedId: layer.id, coalesceKey: `nudge-${key}` });
  });

  return Object.freeze({
    open({ baseImage, baseBlob, document, stickerImages = new Map() }) {
      if (session) return Promise.reject(new Error('sticker editor is already open'));
      const initialDocument = validateStickerDocument(document);
      let resolve;
      const result = new Promise(resolvePromise => { resolve = resolvePromise; });
      session = {
        baseImage,
        baseBlob,
        stickerImages,
        initialDocument,
        history: createStickerHistory(initialDocument),
        transientDocument: null,
        selectedId: initialDocument.layers.at(-1)?.id ?? null,
        resolve
      };
      busy = false;
      pointers.clear();
      gesture = null;
      blankPointerId = null;
      openDialog(dialog);
      closeMenu();
      syncControls();
      scheduleRender();
      return result;
    },
    cancel,
    inspect
  });
}
