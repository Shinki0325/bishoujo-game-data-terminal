import { createResourceRequest } from './resource-request.js';

const card = Symbol('validated-work-card');
const digestPattern = /^[a-f0-9]{64}$/u;
const stale = () => new Error('作品结果已更新');

// These are display projections, never a replacement for edition/detail data.
export function createWorkCardData({config, workIds, fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto, decompress = globalThis.DecompressionStream,
  requestPolicy = {}, maxCacheBytes = 4 * 1024 * 1024, concurrency = 8} = {}) {
  if (config?.schema !== 'galpedia-work-card-config-v1'
    || config.basePath !== '../runtime-data/work-card-v1/'
    || !digestPattern.test(config.sourceManifestSha256 ?? '')
    || ![8,16,32,64].includes(config.blockSize) || !Array.isArray(workIds)
    || workIds.length !== config.count || !workIds.length
    || new Set(workIds).size !== workIds.length
    || workIds.some(id => typeof id !== 'string' || !/^\d+$/u.test(id))
    || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16
    || !Number.isSafeInteger(maxCacheBytes) || maxCacheBytes < 0) throw Error('卡片资料配置无效');
  const ids = [...workIds], request = createResourceRequest({...requestPolicy, fetchImpl});
  const cache = new Map(), pending = new Map(), queue = [];
  let directoryPromise, cacheBytes = 0, active = 0, directoryBytes = 0;

  function descriptorValid(d, kind) {
    return digestPattern.test(d?.sha256 ?? '') && d.path === `${kind}-${d.sha256}.json.gz`
      && Number.isSafeInteger(d.bytes) && d.bytes > 0 && d.bytes <= (kind === 'directory' ? 1024*1024 : 256*1024)
      && Number.isSafeInteger(d.rawBytes) && d.rawBytes > 0 && d.rawBytes <= (kind === 'directory' ? 4*1024*1024 : 1024*1024);
  }
  async function read(d, kind, validate) {
    if (!descriptorValid(d, kind)) throw Error('卡片资料描述无效');
    return request(new URL(config.basePath + d.path, import.meta.url), {
      label: '作品卡片资料', validationKey: d.sha256,
      validate: async bytes => {
        if (bytes.byteLength !== d.bytes) throw Error('卡片资料长度不符');
        const hash = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2,'0')).join('');
        if (hash !== d.sha256) throw Error('卡片资料摘要不符');
        if (typeof decompress !== 'function') throw Error('卡片解压不可用');
        const reader = new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader();
        const chunks = []; let length = 0;
        try {
          for (;;) {
            const {value, done} = await reader.read(); if (done) break;
            length += value.byteLength;
            if (length > d.rawBytes) throw Error('卡片解压超过预算');
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        if (length !== d.rawBytes) throw Error('卡片解压长度不符');
        const raw = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
        const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw));
        if (value.schema !== 'galpedia-work-card-v1' || value.kind !== kind
          || value.sourceManifestSha256 !== config.sourceManifestSha256) throw Error('卡片资料来源不符');
        return validate(value);
      }
    });
  }
  function directory() {
    return directoryPromise ??= read(config.directory, 'directory', value => {
      if (value.blockSize !== config.blockSize || !Array.isArray(value.workIds)
        || value.workIds.length !== ids.length || value.workIds.some((id,i) => id !== ids[i])
        || !Array.isArray(value.chunks) || value.chunks.length !== Math.ceil(ids.length / config.blockSize)
        || value.chunks.some(d => !descriptorValid(d, 'chunk'))
        || new Set(value.chunks.map(d => d.path)).size !== value.chunks.length) throw Error('卡片路由身份不符');
      directoryBytes = config.directory.rawBytes;
      return {chunks: value.chunks, positions: new Map(ids.map((id,i) => [id, Math.floor(i / config.blockSize)]))};
    }).catch(error => { directoryPromise = null; throw error; });
  }
  function pump() {
    while (active < concurrency && queue.length) {
      const entry = queue.shift();
      if (![...entry.consumers].some(current => current())) {
        pending.delete(entry.key); entry.reject(stale()); continue;
      }
      active++;
      read(entry.descriptor, 'chunk', value => {
        const expected = ids.slice(entry.index * config.blockSize, (entry.index + 1) * config.blockSize);
        if (!Array.isArray(value.works) || value.works.length !== expected.length
          || value.works.some((work,i) => work?.workId !== expected[i])) throw Error('卡片分片身份不符');
        for (const work of value.works) Object.defineProperty(work, card, {value:true, enumerable:true});
        return value.works;
      }).then(works => {
        cache.set(entry.key, {works, bytes: entry.descriptor.rawBytes});
        cacheBytes += entry.descriptor.rawBytes;
        for (const [key, item] of cache) {
          if (cacheBytes <= maxCacheBytes) break;
          cache.delete(key); cacheBytes -= item.bytes;
        }
        entry.resolve(works);
      }, entry.reject).finally(() => {
        pending.delete(entry.key); active--; pump();
      });
    }
  }
  function chunk(d, index, isCurrent) {
    if (cache.has(d.sha256)) {
      const value = cache.get(d.sha256); cache.delete(d.sha256); cache.set(d.sha256, value);
      return Promise.resolve(value.works);
    }
    let entry = pending.get(d.sha256);
    if (entry) { entry.consumers.add(isCurrent); return entry.promise; }
    entry = {key:d.sha256, descriptor:d, index, consumers:new Set([isCurrent])};
    entry.promise = new Promise((resolve,reject) => {entry.resolve=resolve; entry.reject=reject;});
    pending.set(entry.key, entry); queue.push(entry); pump();
    return entry.promise;
  }
  return Object.freeze({
    prepare: () => directory().then(() => undefined),
    async get(requested, {isCurrent = () => true} = {}) {
      if (!Array.isArray(requested) || requested.length > 119 || new Set(requested).size !== requested.length
        || requested.some(id => typeof id !== 'string') || typeof isCurrent !== 'function') throw Error('卡片请求无效');
      if (!isCurrent()) throw stale();
      if (!requested.length) return new Map();
      const index = await directory();
      if (!isCurrent()) throw stale();
      if (requested.some(id => !index.positions.has(id))) throw Error('未知作品卡片');
      const blocks = [...new Set(requested.map(id => index.positions.get(id)))];
      const pages = await Promise.all(blocks.map(i => chunk(index.chunks[i], i, isCurrent)));
      if (!isCurrent()) throw stale();
      const rows = new Map(pages.flat().map(work => [work.workId, work]));
      return new Map(requested.map(id => [id, rows.get(id)]));
    },
    isListCard: work => work?.[card] === true,
    stats: () => ({cacheBytes, directoryBytes, cached:cache.size, active, queued:queue.length})
  });
}
