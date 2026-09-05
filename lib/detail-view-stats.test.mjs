import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLocalPreviewOrigin,
  resolveDetailViewCountMode
} from './detail-view-stats.js';

test('recognizes supported local preview origins only', () => {
  assert.equal(isLocalPreviewOrigin('http://localhost:4186'), true);
  assert.equal(isLocalPreviewOrigin('http://127.0.0.1:4186'), true);
  assert.equal(isLocalPreviewOrigin('http://[::1]:4186'), true);
  assert.equal(isLocalPreviewOrigin('https://example.com'), false);
  assert.equal(isLocalPreviewOrigin('http://127.0.0.2:4186'), false);
});

test('local previews never use the formal stats request', () => {
  for (const [pageOrigin, endpointOrigin] of [
    ['http://localhost:4186', 'https://favorite.bishojo.date'],
    ['http://127.0.0.1:4186', 'http://127.0.0.1:4186'],
    ['http://[::1]:4186', 'https://favorite.bishojo.date']
  ]) {
    assert.equal(resolveDetailViewCountMode({
      pageOrigin,
      endpointOrigin
    }), 'local-preview');
  }
});

test('non-local origins preserve same-origin and different-origin behavior', () => {
  assert.equal(resolveDetailViewCountMode({
    pageOrigin: 'https://favorite.bishojo.date',
    endpointOrigin: 'https://favorite.bishojo.date'
  }), 'same-origin');
  assert.equal(resolveDetailViewCountMode({
    pageOrigin: 'https://preview.example.com',
    endpointOrigin: 'https://favorite.bishojo.date'
  }), 'hidden');
});
