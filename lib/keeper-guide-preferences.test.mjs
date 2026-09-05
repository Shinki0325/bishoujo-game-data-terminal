import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KEEPER_GUIDE_CONTENT_VERSION,
  KEEPER_PREFERENCES_SCHEMA_VERSION,
  KEEPER_PREFERENCES_STORAGE_KEY,
  createKeeperPreferences,
  normalizeKeeperGuideId
} from './keeper-guide-preferences.js';

function memoryStorage(initial) {
  const values = new Map(initial ? [[KEEPER_PREFERENCES_STORAGE_KEY, initial]] : []);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

test('defaults are enabled and storage is scoped to the keeper namespace', () => {
  const storage = memoryStorage();
  const preferences = createKeeperPreferences({ storage });
  assert.deepEqual(preferences.get(), {
    schemaVersion: KEEPER_PREFERENCES_SCHEMA_VERSION,
    illustrations: true,
    autoTips: true,
    dismissed: {},
    completed: {}
  });
  assert.equal(storage.values.has(KEEPER_PREFERENCES_STORAGE_KEY), false);
  assert.equal(normalizeKeeperGuideId('tierStart'), 'tier.start');
  assert.equal(normalizeKeeperGuideId('not-a-guide'), null);
});

test('preferences, marks, and subscriptions persist as one module-owned record', () => {
  const storage = memoryStorage();
  const preferences = createKeeperPreferences({ storage });
  const updates = [];
  const unsubscribe = preferences.subscribe((snapshot) => updates.push(snapshot));

  assert.equal(preferences.setPreference('illustrations', false), true);
  assert.equal(preferences.setPreference('autoTips', false), true);
  assert.equal(preferences.dismiss('compareActive'), true);
  assert.equal(preferences.complete('tier.start', KEEPER_GUIDE_CONTENT_VERSION), true);
  assert.equal(preferences.dismiss('unknown-id'), false);
  assert.equal(preferences.complete('compareActive', 99), false);
  assert.equal(updates.length, 4);
  assert.equal(storage.values.size, 1);

  const persisted = JSON.parse(storage.values.get(KEEPER_PREFERENCES_STORAGE_KEY));
  assert.equal(persisted.illustrations, false);
  assert.equal(persisted.autoTips, false);
  assert.deepEqual(persisted.dismissed, { compareActive: 1 });
  assert.deepEqual(persisted.completed, { 'tier.start': 1 });

  unsubscribe();
  assert.equal(preferences.setPreference('autoTips', true), true);
  assert.equal(updates.length, 4);

  const restored = createKeeperPreferences({ storage });
  assert.equal(restored.get().illustrations, false);
  assert.equal(restored.get().autoTips, true);
  assert.deepEqual(restored.get().dismissed, { compareActive: 1 });
  assert.deepEqual(restored.get().completed, { 'tier.start': 1 });
});

test('reset clears only guide marks and preserves explicit switches', () => {
  const preferences = createKeeperPreferences({ storage: memoryStorage() });
  preferences.setPreference('illustrations', false);
  preferences.setPreference('autoTips', false);
  preferences.dismiss('helpOverview');
  preferences.complete('compareActive');

  const result = preferences.reset();
  assert.equal(result.illustrations, false);
  assert.equal(result.autoTips, false);
  assert.deepEqual(result.dismissed, {});
  assert.deepEqual(result.completed, {});
});

test('invalid or unavailable storage falls back to a session-only store', () => {
  const invalid = memoryStorage(JSON.stringify({ schemaVersion: 999, illustrations: false, autoTips: false }));
  const fromInvalid = createKeeperPreferences({ storage: invalid });
  assert.equal(fromInvalid.get().illustrations, true);
  assert.equal(fromInvalid.setPreference('illustrations', false), true);
  assert.equal(JSON.parse(invalid.values.get(KEEPER_PREFERENCES_STORAGE_KEY)).schemaVersion, 999);

  const throwingStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }
  };
  const fromThrowing = createKeeperPreferences({ storage: throwingStorage });
  assert.equal(fromThrowing.dismiss('helpOverview'), true);
  assert.equal(fromThrowing.get().dismissed.helpOverview, 1);
});

test('schema rejects malformed mark maps and ignores unknown or old marks', () => {
  const malformed = memoryStorage(JSON.stringify({
    schemaVersion: 1,
    illustrations: false,
    autoTips: false,
    dismissed: { 'unknown-id': 1, 'compareActive': 99 },
    completed: { 'tier.start': 1 }
  }));
  const preferences = createKeeperPreferences({ storage: malformed });
  assert.deepEqual(preferences.get().dismissed, {});
  assert.deepEqual(preferences.get().completed, { 'tier.start': 1 });
  assert.equal(preferences.get().illustrations, false);
  assert.equal(preferences.get().autoTips, false);
  assert.equal(preferences.setPreference('unknown', true), false);
  assert.equal(preferences.setPreference('illustrations', 'false'), false);
});
