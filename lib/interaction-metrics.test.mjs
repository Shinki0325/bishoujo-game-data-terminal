import assert from 'node:assert/strict';
import test from 'node:test';
import { createInteractionMetrics } from './interaction-metrics.js';

function harness() {
  let time = 0;
  const frames = [];
  const marks = [];
  const globalRef = { setTimeout: callback => callback() };
  const metrics = createInteractionMetrics({
    globalRef,
    locationRef: { href: 'https://example.test/?interactionMetrics=1' },
    performanceRef: {
      now: () => time,
      mark: name => marks.push(name)
    },
    requestAnimationFrameRef: callback => frames.push(callback)
  });
  return {
    metrics,
    marks,
    tick(value) { time += value; },
    frame() { frames.shift()?.(); }
  };
}

test('records debounce, query, media, DOM and next-frame durations', () => {
  const clock = harness();
  const token = clock.metrics.begin('search');
  clock.tick(150);
  clock.metrics.stage(token, 'debounce-complete');
  clock.tick(8);
  clock.metrics.stage(token, 'worker-return');
  clock.tick(1);
  clock.metrics.stage(token, 'controller-ready');
  clock.tick(1);
  clock.metrics.stage(token, 'presentation-ready');
  clock.tick(1);
  clock.metrics.stage(token, 'model-ready');
  clock.tick(2);
  clock.metrics.stage(token, 'media-ready');
  clock.tick(12);
  clock.metrics.stage(token, 'dom-updated');
  clock.tick(4);
  clock.metrics.completeAfterFrame(token);
  clock.frame();

  const [record] = clock.metrics.snapshot().records;
  assert.equal(record.status, 'complete');
  assert.equal(record.debounceMs, 150);
  assert.equal(record.queryMs, 8);
  assert.equal(record.controllerMs, 1);
  assert.equal(record.presentationMs, 1);
  assert.equal(record.modelMs, 1);
  assert.equal(record.mediaMs, 2);
  assert.equal(record.domMs, 12);
  assert.equal(record.nextFrameMs, 4);
  assert.equal(record.totalMs, 179);
  assert.equal(clock.marks.length, 9);
});

test('a newer interaction cancels the unfinished record', () => {
  const clock = harness();
  const first = clock.metrics.begin('search');
  clock.tick(20);
  const second = clock.metrics.begin('sort');
  assert.equal(clock.metrics.stage(first, 'debounce-complete'), false);
  assert.equal(clock.metrics.stage(second, 'debounce-complete'), true);
  const [canceled, pending] = clock.metrics.snapshot().records;
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.reason, 'superseded');
  assert.equal(pending.status, 'pending');
});
