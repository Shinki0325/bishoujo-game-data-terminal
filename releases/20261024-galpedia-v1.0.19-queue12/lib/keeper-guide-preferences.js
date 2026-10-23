/**
 * Persistent, deliberately small state for the GALPEDIA keeper guide.
 *
 * This module owns only guide preferences and guide lifecycle marks. It does
 * not know anything about works, tiers, imports, or any other application
 * state. A storage failure leaves the current session usable in memory.
 */

export const KEEPER_PREFERENCES_STORAGE_KEY = 'galpedia.keeperGuide.v1';
export const KEEPER_PREFERENCES_SCHEMA_VERSION = 1;
export const KEEPER_GUIDE_CONTENT_VERSION = 1;

export const KEEPER_GUIDE_IDS = Object.freeze([
  'helpOverview',
  'compareActive',
  'tier.start',
  'tier.firstDrag',
  'bangumi.input',
  'bangumi.result'
]);

const PREFERENCE_KEYS = Object.freeze(['illustrations', 'autoTips']);
const GUIDE_ID_ALIASES = Object.freeze({
  'bangumi.input': 'bangumi.input',
  'bangumi.result': 'bangumi.result',
  helpOverview: 'helpOverview',
  'help.overview': 'helpOverview',
  compareActive: 'compareActive',
  'compare.active': 'compareActive',
  'tier.start': 'tier.start',
  tierStart: 'tier.start',
  workRanking: 'tier.start',
  rankingStart: 'tier.start',
  'tier.firstDrag': 'tier.firstDrag',
  tierFirstDrag: 'tier.firstDrag',
  rankingFirstDrag: 'tier.firstDrag'
});

const DEFAULT_STATE = Object.freeze({
  schemaVersion: KEEPER_PREFERENCES_SCHEMA_VERSION,
  illustrations: true,
  autoTips: true,
  dismissed: Object.freeze({}),
  completed: Object.freeze({})
});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownBoolean(value) {
  return typeof value === 'boolean';
}

function normalizeMarkMap(value) {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return null;
  const result = {};
  for (const [rawId, rawVersion] of Object.entries(value)) {
    const id = normalizeKeeperGuideId(rawId);
    // Marks are disposable content-version metadata. Unknown guides and old
    // versions must not invalidate explicit preference switches.
    if (!id || rawVersion !== KEEPER_GUIDE_CONTENT_VERSION) continue;
    result[id] = KEEPER_GUIDE_CONTENT_VERSION;
  }
  return result;
}

function normalizeStoredState(value) {
  if (!isPlainObject(value)) return null;
  if (value.schemaVersion !== KEEPER_PREFERENCES_SCHEMA_VERSION) return null;
  if (!ownBoolean(value.illustrations) || !ownBoolean(value.autoTips)) return null;
  const dismissed = normalizeMarkMap(value.dismissed);
  const completed = normalizeMarkMap(value.completed);
  if (dismissed === null || completed === null) return null;
  return {
    schemaVersion: KEEPER_PREFERENCES_SCHEMA_VERSION,
    illustrations: value.illustrations,
    autoTips: value.autoTips,
    dismissed,
    completed
  };
}

function cloneState(state) {
  return {
    schemaVersion: state.schemaVersion,
    illustrations: state.illustrations,
    autoTips: state.autoTips,
    dismissed: { ...state.dismissed },
    completed: { ...state.completed }
  };
}

function freezeState(state) {
  const snapshot = cloneState(state);
  Object.freeze(snapshot.dismissed);
  Object.freeze(snapshot.completed);
  return Object.freeze(snapshot);
}

/** Resolve an accepted public guide id to the stable persisted id. */
export function normalizeKeeperGuideId(id) {
  if (typeof id !== 'string') return null;
  return GUIDE_ID_ALIASES[id] ?? null;
}

export function isKnownKeeperGuideId(id) {
  return normalizeKeeperGuideId(id) !== null;
}

function readInitialState(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { state: cloneState(DEFAULT_STATE), persistent: false };
  }
  try {
    const raw = storage.getItem(KEEPER_PREFERENCES_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === '') {
      return { state: cloneState(DEFAULT_STATE), persistent: true };
    }
    const parsed = JSON.parse(raw);
    const state = normalizeStoredState(parsed);
    if (!state) return { state: cloneState(DEFAULT_STATE), persistent: false };
    return { state, persistent: true };
  } catch {
    return { state: cloneState(DEFAULT_STATE), persistent: false };
  }
}

function serializeState(state) {
  return JSON.stringify({
    schemaVersion: KEEPER_PREFERENCES_SCHEMA_VERSION,
    illustrations: state.illustrations,
    autoTips: state.autoTips,
    dismissed: state.dismissed,
    completed: state.completed
  });
}

/**
 * Create an isolated preference store. `storage` is intentionally injected so
 * tests and embedders can provide localStorage/sessionStorage-like objects.
 */
export function createKeeperPreferences({ storage } = {}) {
  const initial = readInitialState(storage);
  let state = initial.state;
  let persistent = initial.persistent;
  const subscribers = new Set();

  function get() {
    return freezeState(state);
  }

  function notify() {
    const snapshot = get();
    for (const listener of subscribers) {
      try { listener(snapshot); } catch { /* a listener cannot break the store */ }
    }
  }

  function persist() {
    if (!persistent || !storage || typeof storage.setItem !== 'function') return;
    try {
      storage.setItem(KEEPER_PREFERENCES_STORAGE_KEY, serializeState(state));
    } catch {
      // Continue with the updated in-memory session state after quota/IO errors.
      persistent = false;
    }
  }

  function commit(nextState) {
    state = nextState;
    persist();
    notify();
    return get();
  }

  function setPreference(key, value) {
    if (!PREFERENCE_KEYS.includes(key) || !ownBoolean(value)) return false;
    if (state[key] === value) return true;
    commit({ ...cloneState(state), [key]: value });
    return true;
  }

  function mark(kind, id, contentVersion = KEEPER_GUIDE_CONTENT_VERSION) {
    const normalizedId = normalizeKeeperGuideId(id);
    if (!normalizedId || contentVersion !== KEEPER_GUIDE_CONTENT_VERSION) return false;
    if (state[kind][normalizedId] === KEEPER_GUIDE_CONTENT_VERSION) return true;
    const next = cloneState(state);
    next[kind][normalizedId] = KEEPER_GUIDE_CONTENT_VERSION;
    commit(next);
    return true;
  }

  function reset() {
    const next = cloneState(state);
    next.dismissed = {};
    next.completed = {};
    return commit(next);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  return Object.freeze({
    get,
    setPreference,
    dismiss: (id, contentVersion) => mark('dismissed', id, contentVersion),
    complete: (id, contentVersion) => mark('completed', id, contentVersion),
    reset,
    subscribe
  });
}
