// Copied into lib/work-search-data.js by the verified search-core stage.
import {createResourceRequest} from './resource-request.js';
import {normalizeSearchText, normalizeLooseSearchText} from './search-normalization.js';
import {snapshotSearchText} from './search-text.js';

const prepared = new Map();
const projections = new WeakMap();
export function usesCoreSearchText(query) {
  return typeof query === 'string' && !/[\r\n\u2028\u2029]/u.test(query)
    && Boolean(normalizeSearchText(query));
}
function project(value, query) {
  if (value.transportKind !== 'core') return value;
  // Normal substrings with letters/numbers are already covered by loose text.
  // Only punctuation queries may see the NUL-separated punctuation runs.
  if (!normalizeLooseSearchText(query)) return {...value, transportKind:'symbols'};
  if (!projections.has(value)) {
    projections.set(value, {...value, rows:value.rows.map(row => ['', row[1], row[2]])});
  }
  return projections.get(value);
}
export function preparePrecomputedSearchText(config, options = {}) {
  if (Object.keys(options).some(key => !['fetchImpl','cryptoRef','query'].includes(key))
    || options.fetchImpl && options.fetchImpl !== globalThis.fetch
    || options.cryptoRef && options.cryptoRef !== globalThis.crypto) {
    return loadPrecomputedSearchText(config, options);
  }
  const key = JSON.stringify([config, Boolean(config.core && usesCoreSearchText(options.query))]);
  if (!prepared.has(key)) {
    prepared.set(key, loadRawSearchText(config, options).catch(error => {
      prepared.delete(key);
      throw error;
    }));
  }
  return prepared.get(key).then(value => project(value, options.query));
}
export async function loadPrecomputedSearchText(config, options = {}) {
  return project(await loadRawSearchText(config, options), options.query);
}
export async function loadSearchTextForWorks(config, workIds, options = {}) {
  let value=await preparePrecomputedSearchText(config,options);
  try { snapshotSearchText(value,workIds); return value; }
  catch(error) {
    if(value.transportKind==='full')throw error;
    value=await preparePrecomputedSearchText(config,{...options,query:''});
    snapshotSearchText(value,workIds);return value;
  }
}
async function loadRawSearchText(config, {
  fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto,
  decompress = globalThis.DecompressionStream, requestPolicy = {}, query = ''
} = {}) {
  if (config?.schema !== 'galpedia-search-transport-v1'
    || config.path !== '../runtime-data/work-search-v1/search.json.gz'
    || ![config.sourceManifestSha256, config.sourceWorkerSha256].every(isSha)) {
    throw Error('搜索资料描述无效');
  }
  const request = createResourceRequest({...requestPolicy, fetchImpl});
  const sha = async bytes => Array.from(new Uint8Array(
    await cryptoRef.subtle.digest('SHA-256', bytes)
  ), n => n.toString(16).padStart(2, '0')).join('');
  const read = async (descriptor, kind) => {
    const d = descriptor;
    if (!Number.isSafeInteger(d.bytes) || d.bytes < 1 || d.bytes > 8 * 1024 * 1024
      || !Number.isSafeInteger(d.rawBytes) || d.rawBytes < 1 || d.rawBytes > 32 * 1024 * 1024
      || ![d.sha256, d.rawSha256].every(isSha)) throw Error('搜索资料描述无效');
    return request(new URL(d.path, import.meta.url), {
      label:'搜索索引', validationKey:d.sha256,
      validate:async bytes => {
        if (bytes.byteLength !== d.bytes || await sha(bytes) !== d.sha256) throw Error('搜索压缩摘要不符');
        if (typeof decompress !== 'function') throw Error('搜索解压不可用');
        const reader = new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader();
        const chunks = [];
        let length = 0;
        try {
          for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > d.rawBytes) throw Error('搜索解压超过预算');
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        if (length !== d.rawBytes) throw Error('搜索解压长度不符');
        const raw = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
        if (await sha(raw) !== d.rawSha256) throw Error('搜索原文摘要不符');
        const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw));
        if (kind === 'core' && (value?.schema !== 'query-search-text-v2'
          || !Array.isArray(value.workIds) || value.workIds.some(id => typeof id !== 'string')
          || !Array.isArray(value.rows) || value.rows.length !== value.workIds.length
          || value.rows.some(row => !Array.isArray(row) || row.length !== 3
            || row.some(text => typeof text !== 'string')))) throw Error('搜索列格式不符');
        return {...value, transportKind:kind};
      }
    });
  };
  if (config.core && usesCoreSearchText(query)) {
    try {
      const d = config.core;
      if (d.schema !== 'galpedia-search-core-v1' || d.normalMode !== 'punctuation-runs'
        || d.sourceRawSha256 !== config.rawSha256
        || !/^\.\.\/runtime-data\/work-search-v1\/core\.[a-f0-9]{64}\.json\.gz$/u.test(d.path)
        || !d.path.includes('.' + d.sha256 + '.')) throw Error('搜索来源不符');
      return await read(d, 'core');
    } catch { /* An optional optimization must retain the full carrier fallback. */ }
  }
  return read(config, 'full');
}
function isSha(value) { return /^[a-f0-9]{64}$/u.test(value ?? ''); }
