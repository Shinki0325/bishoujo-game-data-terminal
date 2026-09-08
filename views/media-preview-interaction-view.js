import { createViewLifetime } from '../lib/view-lifetime.js';
import { boundPreviewTransform, zoomPreview } from '../lib/media-preview-transform.js';

/** Own only immersive preview gestures; never write ranking or cover state. */
export function createMediaPreviewInteractionView({ dialog, image, windowRef = window }) {
  const lifetime = createViewLifetime();
  const output = dialog.querySelector('#media-preview-scale');
  let state = { scale: 1, x: 0, y: 0 }, drag = null, suppressClickUntil = 0;
  const active = () => dialog.open && dialog.classList.contains('is-immersive-preview');
  const bounds = () => ({ width: dialog.clientWidth, height: dialog.clientHeight,
    imageWidth: image.offsetWidth, imageHeight: image.offsetHeight });
  function render() {
    image.style.setProperty('--preview-scale', String(state.scale));
    image.style.setProperty('--preview-x', `${state.x}px`);
    image.style.setProperty('--preview-y', `${state.y}px`);
    output.textContent = `${Math.round(state.scale * 100)}%`;
    dialog.querySelector('[data-preview-action="out"]').disabled = state.scale <= .5;
    dialog.querySelector('[data-preview-action="in"]').disabled = state.scale >= 4;
  }
  function finishDrag() {
    const previous = drag; drag = null;
    dialog.classList.remove('is-panning');
    if (previous && image.hasPointerCapture?.(previous.id)) image.releasePointerCapture(previous.id);
    return previous;
  }
  function reset() {
    finishDrag(); suppressClickUntil = 0;
    state = { scale: 1, x: 0, y: 0 }; render();
  }
  function zoom(factor, anchor = { x: 0, y: 0 }) {
    state = zoomPreview(state, factor, anchor, bounds()); render();
  }
  lifetime.listen(dialog, 'wheel', event => {
    if (!active()) return;
    event.preventDefault(); event.stopPropagation();
    if (event.target.closest?.('.media-preview-tools')) return;
    const rect = dialog.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    zoom(Math.exp(-Math.max(-120, Math.min(120, delta)) * .002),
      { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
  }, { passive: false });
  lifetime.listen(image, 'dragstart', event => { if (active()) event.preventDefault(); });
  lifetime.listen(image, 'pointerdown', event => {
    if (!active() || event.button !== 0 || !event.isPrimary || drag) return;
    event.preventDefault(); event.stopPropagation();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y, moved: false };
    image.setPointerCapture(event.pointerId); dialog.classList.add('is-panning');
  });
  lifetime.listen(image, 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    drag.moved ||= Math.hypot(dx, dy) > 4;
    state = boundPreviewTransform({ scale: state.scale, x: drag.x + dx, y: drag.y + dy }, bounds()); render();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) lifetime.listen(image, type, event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (finishDrag()?.moved) suppressClickUntil = Date.now() + 350;
  });
  lifetime.listen(image, 'dblclick', event => { if (active()) { event.preventDefault(); reset(); } });
  lifetime.listen(dialog, 'click', event => {
    if (!active()) return;
    const action = event.target.closest?.('[data-preview-action]')?.dataset.previewAction;
    if (action) {
      if (action === 'close') dialog.close();
      else if (action === 'reset') reset();
      else zoom(action === 'in' ? 1.2 : 1 / 1.2);
      return;
    }
    if (event.target === image || event.target.closest?.('.media-preview-tools') || Date.now() < suppressClickUntil) return;
    dialog.close();
  });
  lifetime.listen(dialog, 'keydown', event => {
    if (!active() || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === '0') reset();
      else if (['+', '=', '-'].includes(event.key)) zoom(event.key === '-' ? 1 / 1.2 : 1.2);
      else { const [dx, dy] = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] }[event.key];
        state = boundPreviewTransform({ ...state, x: state.x + dx, y: state.y + dy }, bounds()); render(); }
    }
  });
  lifetime.listen(dialog, 'close', reset);
  lifetime.listen(windowRef, 'resize', () => { if (active()) { finishDrag(); state = boundPreviewTransform(state, bounds()); render(); } });
  return { reset, dispose: () => { finishDrag(); lifetime.dispose(); } };
}
