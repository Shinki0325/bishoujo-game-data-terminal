import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES } from './galpedia-release-notes.js';

test('GALPEDIA release notes are a frozen, unique local public-beta record', () => {
  assert.ok(Object.isFrozen(GALPEDIA_RELEASE_NOTES));
  assert.equal(GALPEDIA_RELEASE_NOTES.length, 3);
  assert.equal(CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES[0]);
  assert.equal(CURRENT_GALPEDIA_RELEASE.version, 'v1.0.5-beta');
  assert.equal(CURRENT_GALPEDIA_RELEASE.label, '公测版');
  assert.equal(CURRENT_GALPEDIA_RELEASE.date, '2026-09-09');
  assert.equal(CURRENT_GALPEDIA_RELEASE.releaseId, '20260909-galpedia-v1.0.5-beta');
  assert.equal(GALPEDIA_RELEASE_NOTES[1].version, 'v1.0.4-beta');
  assert.equal(GALPEDIA_RELEASE_NOTES[2].version, 'v1.0.3-beta');
  assert.equal(new Set(GALPEDIA_RELEASE_NOTES.map(note => note.version)).size, GALPEDIA_RELEASE_NOTES.length);
  assert.equal(new Set(GALPEDIA_RELEASE_NOTES.map(note => note.releaseId)).size, GALPEDIA_RELEASE_NOTES.length);
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE));
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE.summary));
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE.log));
  assert.ok(CURRENT_GALPEDIA_RELEASE.summary.length <= 3);
  assert.ok(CURRENT_GALPEDIA_RELEASE.summary.length > 0);
  assert.ok(CURRENT_GALPEDIA_RELEASE.log.length > 0);
  assert.equal(CURRENT_GALPEDIA_RELEASE.log[0].title, '排榜显示与导出');
  assert.notDeepEqual(CURRENT_GALPEDIA_RELEASE.log.map(entry => entry.text), CURRENT_GALPEDIA_RELEASE.summary);
  for (const entry of CURRENT_GALPEDIA_RELEASE.log) {
    assert.ok(Object.isFrozen(entry));
    assert.equal(typeof entry.title, 'string');
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.title.length > 0);
    assert.ok(entry.text.length > 0);
  }
});
