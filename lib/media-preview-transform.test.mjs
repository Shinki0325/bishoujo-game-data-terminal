import test from 'node:test';
import assert from 'node:assert/strict';
import { boundPreviewTransform, zoomPreview } from './media-preview-transform.js';
const bounds = { width: 1280, height: 900, imageWidth: 400, imageHeight: 600 };
test('zoom anchors the pixel under the cursor', () => {
  const state = { scale: 1, x: 30, y: -20 }, anchor = { x: 100, y: 80 };
  const next = zoomPreview(state, 2, anchor, bounds);
  assert.deepEqual(next, { scale: 2, x: -40, y: -120 });
  assert.equal((anchor.x - next.x) / next.scale, (anchor.x - state.x) / state.scale);
});
test('zoom limits stay finite and do not drift when already at a limit', () => {
  const max = { scale: 4, x: 12, y: 24 };
  assert.deepEqual(zoomPreview(max, 2, {x:100,y:30}, bounds), max);
  assert.equal(zoomPreview({scale:1,x:0,y:0}, .01, {x:0,y:0}, bounds).scale, .5);
});
test('drag and resized viewport always leave image reachable', () => {
  assert.deepEqual(boundPreviewTransform({scale:1,x:99999,y:-99999}, bounds), {scale:1,x:776,y:-670});
  const next = boundPreviewTransform({scale:4,x:99999,y:99999}, {...bounds,width:320,height:500});
  assert.equal(next.x, 896); assert.equal(next.y, 1370);
});
test('centre zoom does not change image placement at default position', () => {
  assert.deepEqual(zoomPreview({scale:1,x:0,y:0},1.2,{x:0,y:0},bounds), {scale:1.2,x:0,y:0});
});
