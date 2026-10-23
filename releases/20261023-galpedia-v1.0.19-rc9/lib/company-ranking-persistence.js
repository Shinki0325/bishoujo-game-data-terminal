// A synchronous recovery copy precedes the serialized shared-record write.
// Web Locks coordinate tabs; a missing lock service keeps a recoverable draft.
export function createCompanyRankingPersistence({ storage, key, lock, onStatus = () => {},
  createId = () => globalThis.crypto.randomUUID() }) {
  const draftKey = `${key}:draft:${createId()}`;
  let expected = null, readable = true, pending = Promise.resolve(), latest = null, generation = 0;
  let status = { kind: 'saved', recoverable: false };
  try { expected = storage?.getItem(key) ?? null; } catch { readable = false; }
  function report(kind, recoverable = status.recoverable) {
    status = { kind, recoverable };
    try { onStatus({ ...status }); } catch { /* Feedback cannot break editing. */ }
  }
  function drafts() {
    const result = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name?.startsWith(`${key}:draft:`)) continue;
        try {
          const value = JSON.parse(storage.getItem(name));
          if (typeof value?.payload === 'string' && typeof value.savedAt === 'string'
            && Number.isFinite(Date.parse(value.savedAt))) result.push({ ...value, key: name });
        } catch { /* One malformed copy must not hide other drafts or stop startup. */ }
      }
    } catch { /* Already read copies remain available. */ }
    return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  function commit(payload) {
    if (!readable) { report('error'); return false; }
    try {
      const current = storage.getItem(key);
      if (current !== expected) { report('conflict'); return false; }
      storage.setItem(key, payload);
      expected = payload;
      if (payload === latest) {
        try { storage.removeItem?.(draftKey); } catch { /* Keep the recovery copy. */ }
        report('saved', false);
      }
      return true;
    } catch { report('error'); return false; }
  }
  function save(payload) {
    latest = payload;
    let copied = false;
    try {
      if (typeof storage?.setItem !== 'function') throw new Error('storage unavailable');
      storage.setItem(draftKey, JSON.stringify({ payload, savedAt: new Date().toISOString() }));
      copied = true;
    } catch { /* A quota failure may still permit replacing the existing record. */ }
    report('saving', copied);
    if (lock === undefined) { commit(payload); return pending; } // synchronous adapters/tests
    if (lock === null) { report(copied ? 'draft' : 'error', copied); return pending; }
    const ticket = generation;
    pending = pending.then(() => lock(() => ticket === generation && commit(payload)))
      .catch(() => { if (ticket === generation) report('error', copied); });
    return pending;
  }
  return Object.freeze({
    initial: expected, save, drafts,
    inspect: () => ({ ...status }),
    settled: () => pending,
    retry: () => latest === null ? pending : save(latest),
    readLatest() {
      // Read first; a failure must not acknowledge or overwrite an unseen value.
      const raw = storage.getItem(key);
      return raw;
    },
    acceptLatest(raw) { generation++; expected = raw; readable = true; latest = null; report('saved', false); },
    hasUnsaved: () => latest !== null && status.kind !== 'saved'
  });
}
