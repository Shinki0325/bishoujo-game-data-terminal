import { STICKER_LIMIT, addExtendedSticker, updateStickerContent, transformSticker, moveStickerLayer } from '../lib/sticker-document.js';

const LABELS = { 'black-bar': '遮挡条', pixelate: '马赛克', blur: '模糊', 'please-wait-character': '请稍候', 'paper-bag-character': '纸袋角色', 'custom-image': '图片贴纸', text: '文本', brush: '画笔', 'mask-brush': '打码画笔' };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Optional enhancement panel: the existing editor remains the single history owner.
export function createStickerToolsView({ documentRef, canvas, inspect, commit, select, transient, render, uploadImage, onError }) {
  const root = documentRef.getElementById('sticker-tools');
  if (!root) return { sync() {}, reset() {}, selectMode() {}, locked() { return false; } };
  const get = id => documentRef.getElementById(id);
  const list = get('sticker-layers'), status = get('sticker-tool-status');
  const color = get('sticker-color'), width = get('sticker-stroke-width'), text = get('sticker-text');
  const file = get('sticker-file');
  const toolButtons = [...root.querySelectorAll('[data-editor-tool]')];
  let mode = 'select', drawing = null, pending = false, generation = 0, releases = [];
  let lastDocument = null, lastSelection = null, lastBusy = null;
  const state = () => inspect();
  const layer = () => state().document?.layers.find(item => item.id === state().selectedId);
  function report(error) { status.textContent = error.message || '编辑失败，请重试。'; onError(error); }
  function run(action) { if (!state().active || state().busy || pending || drawing) return; try { action(); } catch (error) { report(error); sync(); } }
  function add(kind, properties) {
    const next = addExtendedSticker(state().document, kind, properties);
    commit(next, { selectedId: next.layers.at(-1).id });
    setMode('select');
  }
  function textValue() {
    const value = text.value.trim() || '输入文字';
    if (value.split(/\r\n|\r|\n/u).length > 6) throw new RangeError('文本最多 6 行，请减少换行后再保存。');
    return value;
  }
  text.addEventListener('input', () => {
    text.setCustomValidity(text.value.split(/\r\n|\r|\n/u).length > 6 ? '文本最多 6 行' : '');
    sync();
  });
  function setMode(value) {
    mode = value;
    canvas.dataset.editorTool = mode;
    toolButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.editorTool === mode)));
    status.textContent = mode === 'select' ? '选择图层后可拖动、缩放、旋转。' : '在图片上涂抹，每一笔独立成层；切换“选择”可移动。';
  }
  toolButtons.forEach(button => button.addEventListener('click', () => run(() => setMode(button.dataset.editorTool))));
  get('sticker-add-text').addEventListener('click', () => run(() => add('text', { text: textValue(), color: color.value, aspectRatio: 3 })));
  text.addEventListener('change', () => run(() => {
    if (layer()?.kind === 'text') commit(updateStickerContent(state().document, layer().id, { text: textValue() }));
  }));
  color.addEventListener('change', () => run(() => {
    if (['text', 'brush'].includes(layer()?.kind)) commit(updateStickerContent(state().document, layer().id, { color: color.value }));
  }));
  width.addEventListener('change', () => run(() => {
    if (['brush', 'mask-brush'].includes(layer()?.kind) && mode === 'select') commit(updateStickerContent(state().document, layer().id, { strokeWidth: Number(width.value) / 100 }));
  }));
  for (const [id, key, ratio] of [['sticker-size', 'scale', 100], ['sticker-rotation', 'rotation', 1]]) {
    get(id).addEventListener('change', () => run(() => {
      if (layer()) commit(transformSticker(state().document, layer().id, { [key]: Number(get(id).value) / ratio }));
    }));
  }
  for (const [id, index] of [['sticker-layer-top', () => state().document.layers.length - 1], ['sticker-layer-bottom', () => 0]]) {
    get(id).addEventListener('click', () => run(() => { if (layer()) commit(moveStickerLayer(state().document, layer().id, index())); }));
  }
  get('sticker-upload').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const selectedFile = file.files?.[0]; file.value = '';
    if (!selectedFile || !state().active || pending || state().busy) return;
    const token = generation; pending = true; status.textContent = '正在处理图片贴纸…'; sync();
    let decoded;
    try {
      if (releases.length >= 24) throw new RangeError('本次编辑的图片资源已达上限，请保存后重新打开再添加。');
      decoded = await uploadImage(selectedFile);
      if (token !== generation || !state().active) { decoded.release?.(); return; }
      const next = addExtendedSticker(state().document, 'custom-image', decoded.properties);
      state().stickerImages.set(decoded.properties.imageDataUrl, decoded.image);
      releases.push(decoded.release ?? (() => {}));
      commit(next, { selectedId: next.layers.at(-1).id }); setMode('select');
    } catch (error) { decoded?.release?.(); if (token === generation) report(error); }
    finally { if (token === generation) { pending = false; sync(); } }
  });
  function imagePoint(event) {
    const rect = canvas.getBoundingClientRect(), doc = state().document;
    const ratio = Math.min(rect.width / doc.baseWidth, rect.height / doc.baseHeight);
    const w = doc.baseWidth * ratio, h = doc.baseHeight * ratio;
    return [clamp((event.clientX - rect.left - (rect.width - w) / 2) / w, 0, 1), clamp((event.clientY - rect.top - (rect.height - h) / 2) / h, 0, 1)];
  }
  function strokeDocument() {
    const doc = drawing.document, minDimension = Math.min(doc.baseWidth, doc.baseHeight);
    const points = drawing.points.map(([x, y]) => [x * doc.baseWidth, y * doc.baseHeight]);
    const padding = drawing.width * minDimension;
    const left = Math.min(...points.map(p => p[0])) - padding, top = Math.min(...points.map(p => p[1])) - padding;
    const w = Math.max(minDimension * .04, Math.max(...points.map(p => p[0])) - left + padding);
    const h = Math.max(w / 20, Math.min(w * 20, Math.max(...points.map(p => p[1])) - top + padding));
    return addExtendedSticker(doc, drawing.kind, {
      points: points.map(([x, y]) => [clamp((x - left) / w, 0, 1), clamp((y - top) / h, 0, 1)]),
      color: drawing.color, strokeWidth: clamp(padding / w, .005, .2), aspectRatio: w / h,
      centerX: clamp((left + w / 2) / doc.baseWidth, 0, 1), centerY: clamp((top + h / 2) / doc.baseHeight, 0, 1), scale: clamp(w / minDimension, .04, 2)
    });
  }
  canvas.addEventListener('pointerdown', event => {
    if (!state().active || mode === 'select') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (state().busy || pending || drawing) return;
    if (state().document.layers.length >= STICKER_LIMIT) { status.textContent = '最多 12 个图层，请先删除部分图层后继续绘制。'; return; }
    drawing = { pointer: event.pointerId, document: state().document, points: [imagePoint(event)], width: Number(width.value) / 100, color: color.value, kind: mode };
    canvas.setPointerCapture?.(event.pointerId);
    try { const next = strokeDocument(); transient(next, next.layers.at(-1).id); } catch (error) { drawing = null; report(error); }
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!drawing || drawing.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const point = imagePoint(event), previous = drawing.points.at(-1);
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < .003) return;
    if (drawing.points.length >= 510) drawing.points = drawing.points.filter((_, index) => index % 2 === 0);
    drawing.points.push(point);
    try { const next = strokeDocument(); transient(next, next.layers.at(-1).id); } catch (error) { report(error); }
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (!drawing || drawing.pointer !== event.pointerId) return;
    event.stopImmediatePropagation(); event.preventDefault();
    try {
      const next = type === 'pointerup' ? strokeDocument() : null;
      drawing = null; transient(null, null);
      if (next) commit(next, { selectedId: next.layers.at(-1).id });
      render();
    } catch (error) { drawing = null; transient(null, null); report(error); }
  }, true);
  function sync() {
    const current = state(); if (!current.active) return;
    const chosen = layer(), blocked = current.busy || pending || !!drawing;
    root.querySelectorAll('button,input,textarea').forEach(node => { node.disabled = blocked; });
    // The upload is asynchronous: keep the session open until the result is accepted or cancelled.
    get('sticker-save').disabled = blocked || Boolean(text.validationMessage);
    if (blocked) for (const id of ['sticker-undo', 'sticker-redo', 'sticker-delete', 'sticker-clear', 'sticker-layer-backward', 'sticker-layer-forward']) get(id).disabled = true;
    for (const id of ['sticker-size', 'sticker-rotation', 'sticker-layer-top', 'sticker-layer-bottom']) get(id).disabled = blocked || !chosen;
    if (chosen) {
      get('sticker-layer-top').disabled = blocked || chosen.id === current.document.layers.at(-1)?.id;
      get('sticker-layer-bottom').disabled = blocked || chosen.id === current.document.layers[0]?.id;
    }
    for (const id of ['sticker-upload', 'sticker-add-text']) get(id).disabled = blocked || current.document.layers.length >= STICKER_LIMIT;
    if (lastDocument === current.document && lastSelection === current.selectedId && lastBusy === blocked) return;
    lastDocument = current.document; lastSelection = current.selectedId; lastBusy = blocked;
    list.replaceChildren();
    [...current.document.layers].reverse().forEach((item, index) => {
      const button = documentRef.createElement('button'); button.type = 'button';
      button.className = 'sticker-layer-item'; button.dataset.layerId = item.id;
      button.textContent = `${current.document.layers.length - index}. ${item.kind === 'text' ? item.text : item.imageName || LABELS[item.kind]}`;
      button.setAttribute('aria-pressed', String(item.id === current.selectedId)); button.disabled = blocked;
      button.addEventListener('click', () => run(() => { text.setCustomValidity(''); setMode('select'); select(item.id); })); list.append(button);
    });
    get('sticker-layer-count').textContent = `${current.document.layers.length} / ${STICKER_LIMIT}`;
    for (const [id, value] of [['sticker-size', Math.round((chosen?.scale ?? .6) * 100)], ['sticker-rotation', Math.round(chosen?.rotation ?? 0)]]) if (documentRef.activeElement !== get(id)) get(id).value = String(value);
    if (chosen?.kind === 'text' && documentRef.activeElement !== text) text.value = chosen.text;
    if (chosen?.color && documentRef.activeElement !== color && mode === 'select') color.value = chosen.color;
    if (chosen?.strokeWidth && documentRef.activeElement !== width && mode === 'select') width.value = String(Math.round(chosen.strokeWidth * 100));
  }
  function reset() {
    generation++; pending = false; drawing = null;
    releases.splice(0).forEach(release => release());
    lastDocument = null; lastSelection = null; lastBusy = null;
    text.value = ''; text.setCustomValidity(''); setMode('select');
  }
  return { sync, reset, selectMode: () => setMode('select'), locked: () => pending || !!drawing };
}
