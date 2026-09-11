const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Keep part of the image reachable, even after a pan or a viewport resize. */
export function boundPreviewTransform(state, { width, height, imageWidth, imageHeight }) {
  const scale = clamp(Number(state.scale) || 1, .5, 4);
  const maxX = Math.max(0, (width + imageWidth * scale) / 2 - 64);
  const maxY = Math.max(0, (height + imageHeight * scale) / 2 - 80);
  return { scale, x: clamp(Number(state.x) || 0, -maxX, maxX), y: clamp(Number(state.y) || 0, -maxY, maxY) };
}

/** Anchor coordinates are relative to the viewport centre, not the image edge. */
export function zoomPreview(state, factor, anchor, bounds) {
  const scale = clamp(state.scale * factor, .5, 4), ratio = scale / state.scale;
  return boundPreviewTransform({ scale, x: anchor.x - (anchor.x - state.x) * ratio,
    y: anchor.y - (anchor.y - state.y) * ratio }, bounds);
}
