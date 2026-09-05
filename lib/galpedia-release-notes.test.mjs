import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES } from './galpedia-release-notes.js';

test('GALPEDIA release notes are a frozen, unique local public-beta record', () => {
  assert.ok(Object.isFrozen(GALPEDIA_RELEASE_NOTES));
  assert.equal(GALPEDIA_RELEASE_NOTES.length, 1);
  assert.equal(CURRENT_GALPEDIA_RELEASE, GALPEDIA_RELEASE_NOTES[0]);
  assert.equal(CURRENT_GALPEDIA_RELEASE.version, 'v1.0.0-beta.1');
  assert.equal(CURRENT_GALPEDIA_RELEASE.label, '公测版');
  assert.equal(CURRENT_GALPEDIA_RELEASE.date, '2026-09-05');
  assert.equal(CURRENT_GALPEDIA_RELEASE.releaseId, '20260905-galpedia-v1.0.0-beta.1');
  assert.equal(new Set(GALPEDIA_RELEASE_NOTES.map(note => note.version)).size, GALPEDIA_RELEASE_NOTES.length);
  assert.equal(new Set(GALPEDIA_RELEASE_NOTES.map(note => note.releaseId)).size, GALPEDIA_RELEASE_NOTES.length);
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE));
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE.summary));
  assert.ok(Object.isFrozen(CURRENT_GALPEDIA_RELEASE.log));
  assert.ok(CURRENT_GALPEDIA_RELEASE.summary.length <= 3);
  assert.ok(CURRENT_GALPEDIA_RELEASE.summary.length > 0);
  assert.ok(CURRENT_GALPEDIA_RELEASE.log.length > 0);
  assert.equal(CURRENT_GALPEDIA_RELEASE.log[0].title, '公测开启');
  assert.notDeepEqual(CURRENT_GALPEDIA_RELEASE.log.map(entry => entry.text), CURRENT_GALPEDIA_RELEASE.summary);
  for (const entry of CURRENT_GALPEDIA_RELEASE.log) {
    assert.ok(Object.isFrozen(entry));
    assert.equal(typeof entry.title, 'string');
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.title.length > 0);
    assert.ok(entry.text.length > 0);
  }
});
