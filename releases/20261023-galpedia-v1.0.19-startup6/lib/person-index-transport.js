import { resolveSharedDataURL } from './shared-data-url.js';
import {personDirectoryTransportRequest} from './person-directory-transport-codec.js';
import {PERSON_DIRECTORY_INDEX} from './full-wiki-person-directory-index-config.js';

// The boot module and full-wiki-directories.js import this exact URL so the
// browser module cache gives them one WeakMap-backed transport instance.
const byFetch = new WeakMap();
const indexUrlPattern = /^\.\.\/runtime-data\/person-directory-index-v2\/person-directory\.[a-f0-9]{16}\.json$/u;
const shaPattern = /^[a-f0-9]{64}$/u;

function configuredRequest() {
  const config = PERSON_DIRECTORY_INDEX;
  if (config?.enabled !== true
    || config.schemaVersion !== 'terminal-wiki-person-directory-index-v2'
    || !indexUrlPattern.test(config.url ?? '')
    || !shaPattern.test(config.sha256 ?? '')
    || !Number.isSafeInteger(config.bytes) || config.bytes < 1
    || !shaPattern.test(config.directoryManifestSha256 ?? '')
    || !shaPattern.test(config.sourceManifestSha256 ?? '')) return null;
  try { return personDirectoryTransportRequest(config, import.meta.url); } catch { return null; }
}

function fetchEntries(fetchImpl) {
  let entries = byFetch.get(fetchImpl);
  if (!entries) { entries = new Map(); byFetch.set(fetchImpl, entries); }
  return entries;
}

function requestEntry(fetchImpl, request) {
  const entries = fetchEntries(fetchImpl);
  const key = request.url.href;
  let entry = entries.get(key);
  if (entry) return entry;
  entry = {promise: null};
  entry.promise = Promise.resolve().then(() => fetchImpl(resolveSharedDataURL(request.url))).then(response => {
    if (!response?.ok) throw new Error(`人物窄目录预取失败 (${response?.status ?? 0})`);
    return response.arrayBuffer();
  }).catch(error => {
    // A failed speculative request must never poison a later real load.
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  });
  entries.set(key, entry);
  return entry;
}

/**
 * Speculatively fetch bytes only.  This intentionally does not decode or
 * validate the JSON; full-wiki-directories remains the authority for SHA,
 * length, schema, directory pin, row/count, and source-manifest checks.
 * Errors are swallowed for boot and the rejected entry is removed for retry.
 */
export function prefetchPersonDirectoryIndex({fetchImpl = globalThis.fetch} = {}) {
  if (typeof fetchImpl !== 'function') return Promise.resolve(null);
  const request = configuredRequest();
  if (!request) return Promise.resolve(null);
  return requestEntry(fetchImpl, request).promise.then(() => true, () => null);
}

/**
 * Consume bytes started by boot for the same fetch function and exact config
 * URL.  The entry is released after the shared promise settles, allowing the
 * loader to parse and validate without retaining the raw ArrayBuffer.
 */
export function takePersonDirectoryIndexBytes(url, {fetchImpl = globalThis.fetch} = {}) {
  if (typeof fetchImpl !== 'function' || !(url instanceof URL)) return null;
  const request = configuredRequest();
  if (!request || request.url.href !== url.href) return null;
  const entries = fetchEntries(fetchImpl);
  const entry = entries.get(url.href);
  if (!entry) return null;
  const shared = entry.promise.finally(() => {
    if (entries.get(url.href) === entry) entries.delete(url.href);
  });
  return shared;
}

export function personDirectoryPrefetchConfig() {
  const request = configuredRequest();
  return request ? Object.freeze({...request}) : null;
}
