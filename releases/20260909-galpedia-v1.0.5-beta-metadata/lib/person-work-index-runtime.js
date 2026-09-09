import { normalizePersonWorkIndex } from './person-work-index.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

async function sha256Hex(bytes, cryptoRef) {
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Lazy loader for the worker-facing person → work projection.
 *
 * This sidecar is intentionally independent from the M2 directory and relation
 * shards.  The initial catalogue load can therefore stay small; the caller can
 * fetch this projection only when the people condition is first used and then
 * pass it to filterWorkerClient.update().
 */
export function createPersonWorkIndexRuntime({
  indexUrl,
  sha256,
  fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto,
  cacheMode = 'force-cache'
} = {}) {
  if (!(indexUrl instanceof URL)) throw new TypeError('person work index URL is required');
  if (!SHA256_PATTERN.test(String(sha256 ?? ''))) {
    throw new TypeError('person work index sha256 is required');
  }
  if (typeof fetchImpl !== 'function' || !cryptoRef?.subtle?.digest) {
    throw new TypeError('person work index runtime requires fetch and Web Crypto');
  }
  let loadPromise = null;

  async function load() {
    if (loadPromise !== null) return loadPromise;
    loadPromise = (async () => {
      const response = await fetchImpl(indexUrl, { cache: cacheMode });
      if (!response?.ok) throw new Error(`person work index failed: HTTP ${response?.status ?? 'unknown'}`);
      const bytes = await response.arrayBuffer();
      if (await sha256Hex(bytes, cryptoRef) !== sha256) {
        throw new Error('person work index integrity failed');
      }
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      return normalizePersonWorkIndex(payload);
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  return Object.freeze({
    load,
    clear() { loadPromise = null; }
  });
}

