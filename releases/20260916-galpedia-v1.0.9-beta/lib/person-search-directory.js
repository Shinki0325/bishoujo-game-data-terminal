import { resolveSharedDataURL } from './shared-data-url.js';
import { PRECOMPUTED_PERSON_SEARCH_KEYS } from './person-search.js';
import { PERSON_DIRECTORY_INDEX } from './full-wiki-person-directory-index-config.js';
import { PERSON_SEARCH_DIRECTORY } from './person-search-directory-config.js';
import { yieldMainThread } from './yield-main-thread.js';

const HEX64 = /^[a-f0-9]{64}$/u;
const RELATIVE_PAYLOAD = /^\.\.\/runtime-data\/person-search-index-v1\/person-search\.[a-f0-9]{16}\.json$/u;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_FETCH = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
const pendingByFetcher = new WeakMap();

const cloneArray = value => Array.isArray(value) ? value : [];
const cloneNameVariants = value => cloneArray(value).map(item => {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const result = {};
    if (typeof item.name === 'string') result.name = item.name;
    if (typeof item.latin === 'string') result.latin = item.latin;
    return result;
  }
  return typeof item === 'string' ? {name: item} : {};
}).filter(item => item.name || item.latin);

function yieldBatch() {
  return yieldMainThread();
}

function assertConfig(overrideDirectoryManifestSha256) {
  if (PERSON_SEARCH_DIRECTORY.enabled !== true
    || PERSON_SEARCH_DIRECTORY.schemaVersion !== 'terminal-wiki-person-search-directory-v1'
    || !RELATIVE_PAYLOAD.test(PERSON_SEARCH_DIRECTORY.url ?? '')
    || !HEX64.test(PERSON_SEARCH_DIRECTORY.sha256 ?? '')
    || !Number.isSafeInteger(PERSON_SEARCH_DIRECTORY.bytes) || PERSON_SEARCH_DIRECTORY.bytes < 1
    || PERSON_SEARCH_DIRECTORY.directoryManifestSha256 !== PERSON_DIRECTORY_INDEX.directoryManifestSha256
    || PERSON_SEARCH_DIRECTORY.sourceManifestSha256 !== PERSON_DIRECTORY_INDEX.sourceManifestSha256
    || PERSON_SEARCH_DIRECTORY.sourceIndexSha256 !== PERSON_DIRECTORY_INDEX.sha256
    || PERSON_SEARCH_DIRECTORY.sourceIndexBytes !== PERSON_DIRECTORY_INDEX.bytes
    || !HEX64.test(PERSON_SEARCH_DIRECTORY.personWorkIndexSha256 ?? '')
    || !HEX64.test(PERSON_SEARCH_DIRECTORY.personWorkIndexSourceManifestSha256 ?? '')
    || !Number.isSafeInteger(PERSON_SEARCH_DIRECTORY.personWorkIndexBytes)
    || PERSON_SEARCH_DIRECTORY.personWorkIndexBytes < 1
    || !Array.isArray(PERSON_SEARCH_DIRECTORY.columns)
    || PERSON_SEARCH_DIRECTORY.columns.length !== 11
    || PERSON_SEARCH_DIRECTORY.columns.some(value => typeof value !== 'string')) {
    throw new TypeError('人物轻量检索配置无效');
  }
  if (overrideDirectoryManifestSha256 !== undefined
    && overrideDirectoryManifestSha256 !== PERSON_SEARCH_DIRECTORY.directoryManifestSha256) {
    throw new TypeError('人物轻量检索目录版本不一致');
  }
}

async function sha256(bytes, cryptoRef) {
  const subtle = cryptoRef?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') throw new TypeError('人物轻量检索需要 WebCrypto SHA-256');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function makeResponseError(message, status) {
  const error = new Error(message);
  if (status !== undefined) error.status = status;
  return error;
}

function assertHeader(body) {
  if (body?.schema !== 'terminal-wiki-person-search-transport-v1'
    || body.sourceIndexSha256 !== PERSON_SEARCH_DIRECTORY.sourceIndexSha256
    || body.personWorkIndexSourceManifestSha256 !== PERSON_SEARCH_DIRECTORY.personWorkIndexSourceManifestSha256
    || body.personWorkIndexSha256 !== PERSON_SEARCH_DIRECTORY.personWorkIndexSha256
    || body.header?.schemaVersion !== PERSON_SEARCH_DIRECTORY.schemaVersion
    || body.header?.directoryManifestSha256 !== PERSON_SEARCH_DIRECTORY.directoryManifestSha256
    || body.header?.sourceManifestSha256 !== PERSON_SEARCH_DIRECTORY.sourceManifestSha256
    || body.header?.sourceIndexSha256 !== PERSON_SEARCH_DIRECTORY.sourceIndexSha256
    || body.header?.personWorkIndexSha256 !== PERSON_SEARCH_DIRECTORY.personWorkIndexSha256
    || body.header?.personWorkIndexSourceManifestSha256 !== PERSON_SEARCH_DIRECTORY.personWorkIndexSourceManifestSha256
    || JSON.stringify(body.columns) !== JSON.stringify(PERSON_SEARCH_DIRECTORY.columns)
    || !Array.isArray(body.rows)
    || body.header?.counts?.persons !== body.rows.length
    || body.header?.counts?.persons !== PERSON_SEARCH_DIRECTORY.counts.persons
    || body.header?.counts?.indexedPersons !== PERSON_SEARCH_DIRECTORY.counts.indexedPersons) {
    throw new TypeError('人物轻量检索载荷头部或来源版本无效');
  }
}

async function decode(body) {
  assertHeader(body);
  const rows = new Array(body.rows.length);
  const indexedPersonIds = new Set();
  const seenEntityIds = new Set();
  const expectedColumns = PERSON_SEARCH_DIRECTORY.columns;
  let indexedCount = 0;
  for (let index = 0; index < body.rows.length; index += 1) {
    const row = body.rows[index];
    if (!Array.isArray(row) || row.length !== expectedColumns.length
      || typeof row[0] !== 'string' || !/^per_[A-Za-z0-9]+$/u.test(row[0])
      || typeof row[1] !== 'string' || !row[1] || BAD_KEYS.has(row[1])
      || typeof row[2] !== 'string' || typeof row[3] !== 'string'
      || !Array.isArray(row[4]) || !Array.isArray(row[5])
      || !row[6] || typeof row[6] !== 'object' || Array.isArray(row[6])
      || (row[7] !== null && typeof row[7] !== 'string')
      || (row[8] !== null && typeof row[8] !== 'string')
      || (row[9] !== null && typeof row[9] !== 'string')
      || typeof row[10] !== 'boolean') {
      throw new TypeError('人物轻量检索记录无效：' + index);
    }
    const entityId = row[0];
    if (seenEntityIds.has(entityId)) throw new TypeError('人物轻量检索身份重复：' + entityId);
    seenEntityIds.add(entityId);
    const record = {
      entityId,
      canonicalEntityId: row[1],
      displayName: row[2],
      canonicalName: row[3],
      aliases: cloneArray(row[4]),
      nameVariants: cloneNameVariants(row[5]),
      roles: row[6],
      primaryRole: row[7],
      searchKey: row[8] ?? '',
      pinyinSearchKey: row[9] ?? ''
    };
    Object.defineProperty(record, PRECOMPUTED_PERSON_SEARCH_KEYS, {
      configurable: false, enumerable: false, writable: false,
      value: Object.freeze({searchKey: record.searchKey, pinyinSearchKey: record.pinyinSearchKey})
    });
    if (row[10]) { indexedPersonIds.add(entityId); indexedCount += 1; }
    rows[index] = Object.freeze(record);
    if ((index + 1) % Math.max(1, PERSON_SEARCH_DIRECTORY.yieldEvery) === 0
      && index + 1 < body.rows.length) await yieldBatch();
  }
  if (indexedCount !== PERSON_SEARCH_DIRECTORY.counts.indexedPersons) {
    throw new TypeError('人物轻量检索关系索引计数无效');
  }
  return Object.freeze({records: Object.freeze(rows), indexedPersonIds});
}

async function load(fetchImpl, cryptoRef, overrideDirectoryManifestSha256) {
  assertConfig(overrideDirectoryManifestSha256);
  const response = await fetchImpl(resolveSharedDataURL(new URL(PERSON_SEARCH_DIRECTORY.url, import.meta.url)));
  if (!response?.ok) throw makeResponseError('人物轻量检索载荷读取失败', response?.status);
  if (typeof response.arrayBuffer !== 'function') throw new TypeError('人物轻量检索响应不支持 arrayBuffer');
  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength !== PERSON_SEARCH_DIRECTORY.bytes) {
    throw new TypeError('人物轻量检索载荷 bytes 校验失败');
  }
  if (await sha256(bytes, cryptoRef) !== PERSON_SEARCH_DIRECTORY.sha256) {
    throw new TypeError('人物轻量检索载荷 SHA-256 校验失败');
  }
  if (bytes.byteLength > 1000000) await yieldBatch();
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new TypeError('人物轻量检索载荷 JSON 无效'); }
  if (bytes.byteLength > 1000000) await yieldBatch();
  return decode(body);
}

/**
 * Load only fields needed by global search and person filter options.
 * Rejected promises are removed so a transient error retries next time;
 * concurrent calls for the same fetcher share one in-flight promise.
 */
export function loadPersonSearchDirectory({fetchImpl = DEFAULT_FETCH, cryptoRef = globalThis.crypto, directoryManifestSha256} = {}) {
  if (typeof fetchImpl !== 'function') return Promise.reject(new TypeError('人物轻量检索 fetch 不可用'));
  assertConfig(directoryManifestSha256);
  let pending = pendingByFetcher.get(fetchImpl);
  if (!pending) {
    pending = load(fetchImpl, cryptoRef, directoryManifestSha256).catch(error => {
      if (pendingByFetcher.get(fetchImpl) === pending) pendingByFetcher.delete(fetchImpl);
      throw error;
    });
    pendingByFetcher.set(fetchImpl, pending);
  }
  return pending;
}
