import { resolveKeeperGuide as resolveKeeperGuideRules } from './keeper-guide-rules.js';
import { createKeeperPreferences as createKeeperPreferencesStore } from './keeper-guide-preferences.js';

let singleton = null;
let singletonStorage = null;

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

/** Return the one guide preference/lifecycle store used by help and main. */
export function createKeeperPreferences({ storage = defaultStorage() } = {}) {
  if (singleton === null || singletonStorage !== storage) {
    singletonStorage = storage;
    singleton = createKeeperPreferencesStore({ storage });
  }
  return singleton;
}

/** Side-effect-free rules entry point shared by every guide surface. */
export function resolveKeeperGuide(snapshot, prefs = createKeeperPreferences().get()) {
  return resolveKeeperGuideRules(snapshot, prefs);
}

export function getKeeperGuideRuntime(options = {}) {
  const preferences = createKeeperPreferences(options);
  return Object.freeze({
    preferences,
    resolve: snapshot => resolveKeeperGuide(snapshot, preferences.get())
  });
}
