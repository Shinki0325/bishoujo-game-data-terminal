import { createLazyResource } from '../lib/lazy-resource.js';
import { STICKER_TYPES } from '../lib/sticker-document.js';

const STICKER_IMAGE_ASSETS = Object.freeze({
  'please-wait-character': '../assets/stickers/please-wait-character.webp',
  'paper-bag-character': '../assets/stickers/paper-bag-character.png'
});

// Browser-only canvas/image/editor adapter; no catalog or ranking state.
export function createMediaEditEnvironment({ documentRef, windowRef, announce }) {
  function renderCropActive(active) {
    const canvas = documentRef.getElementById('media-crop-canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = active.crop.viewport;
    canvas.height = active.crop.viewport;
    const { x, y, size } = active.crop;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(active.decoded.image, x, y, size, size, 0, 0, canvas.width, canvas.height);
  }

  async function decodeMediaFile(file) {
    const url = windowRef.URL.createObjectURL(file);
    try {
      const image = new windowRef.Image();
      image.src = url;
      await image.decode();
      return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release() { windowRef.URL.revokeObjectURL(url); }
      };
    } catch (error) {
      windowRef.URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function blobForUrl(url) {
    const response = await windowRef.fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`图片底图加载失败（HTTP ${response.status}）。`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new TypeError('图片底图响应类型无效。');
    return blob;
  }

  async function decodeBlob(blob) {
    return decodeMediaFile(new windowRef.File([blob], 'sticker-base', { type: blob.type || 'image/webp' }));
  }

  function createCanvas(width, height) {
    const canvas = documentRef.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function loadStickerImages() {
    const releases = [];
    const release = () => { for (const cleanup of releases.splice(0)) cleanup(); };
    const images = new Map();
    try {
      for (const [kind, relativeUrl] of Object.entries(STICKER_IMAGE_ASSETS)) {
        const blob = await blobForUrl(new URL(relativeUrl, import.meta.url).href);
        const decoded = await decodeBlob(blob);
        images.set(kind, decoded.image);
        if (typeof decoded.release === 'function') releases.push(decoded.release);
      }
      return { images, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  function renderStickerPreview(state) {
    const canvas = documentRef.getElementById('sticker-editor-canvas');
    const context = canvas.getContext('2d');
    if (!context || !state.document) return;
    canvas.width = 512;
    canvas.height = 512;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111821';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      const preview = composeStickerImage({
        baseImage: state.baseImage,
        document: state.document,
        createCanvas,
        stickerImages: state.stickerImages,
        maximumSize: 512
      });
      const ratio = Math.min(canvas.width / preview.width, canvas.height / preview.height);
      const width = preview.width * ratio;
      const height = preview.height * ratio;
      const left = (canvas.width - width) / 2;
      const top = (canvas.height - height) / 2;
      context.drawImage(preview.canvas, left, top, width, height);
      const selected = state.document.layers.find(layer => layer.id === state.selectedId);
      if (!selected) return;
      const layerWidth = selected.scale * Math.min(width, height);
      const layerHeight = layerWidth / STICKER_TYPES[selected.kind].aspectRatio;
      context.save();
      context.translate(left + (selected.centerX * width), top + (selected.centerY * height));
      context.rotate(selected.rotation * Math.PI / 180);
      context.strokeStyle = '#7ce8ff';
      context.lineWidth = 2;
      context.strokeRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      context.fillStyle = '#111821';
      context.strokeStyle = '#ffffff';
      for (const [x, y] of [
        [-layerWidth / 2, -layerHeight / 2],
        [layerWidth / 2, -layerHeight / 2],
        [layerWidth / 2, layerHeight / 2],
        [-layerWidth / 2, layerHeight / 2]
      ]) {
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
      context.beginPath();
      context.moveTo(0, -layerHeight / 2);
      context.lineTo(0, (-layerHeight / 2) - 28);
      context.stroke();
      context.beginPath();
      context.arc(0, (-layerHeight / 2) - 28, 7, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    } catch (error) {
      announce(error instanceof Error ? error.message : '图片贴纸预览失败。', 'error');
      console.error(error);
    }
  }

  let stickerEditor = null, composeStickerImage, encodeStickerComposite;
  const ensureStickerEditor = createLazyResource(async attempt => {
    const [view, compositor] = await Promise.all([
      attempt === 0 ? import('./sticker-editor-view.js') : import(`./sticker-editor-view.js?retry=${attempt}`),
      attempt === 0 ? import('../lib/sticker-compositor.js') : import(`../lib/sticker-compositor.js?retry=${attempt}`)
    ]);
    ({ composeStickerImage, encodeStickerComposite } = compositor);
    stickerEditor = view.createStickerEditorView({
    documentRef,
    requestFrame: callback => windowRef.requestAnimationFrame(callback),
    cancelFrame: frame => windowRef.cancelAnimationFrame(frame),
    renderPreview: renderStickerPreview,
    compose: async state => ({
      compositeBlob: await encodeStickerComposite({
        baseImage: state.baseImage,
        document: state.document,
        createCanvas,
        stickerImages: state.stickerImages
      }),
      document: state.document
    }),
    confirm: message => windowRef.confirm(message),
    onError(error) {
      announce(error instanceof Error ? error.message : '图片贴纸编辑失败。', 'error');
      console.error(error);
    }
  });

    return stickerEditor;
  });

  return Object.freeze({
    decodeFile: decodeMediaFile, decodeBlob, blobForUrl, createCanvas,
    renderCrop: renderCropActive, loadStickerImages, loadEditor: ensureStickerEditor,
    cancel() { stickerEditor?.cancel(); }
  });
}

