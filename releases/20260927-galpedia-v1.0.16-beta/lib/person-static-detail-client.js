import { PERSON_STATIC_DETAIL } from './person-static-detail-config.js';
import { createResourceRequest } from './resource-request.js';

export function createStaticPersonDetailClient({ config = PERSON_STATIC_DETAIL, fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto, decompress = globalThis.DecompressionStream,
  maxCacheBytes = 32 * 1024 * 1024, requestPolicy = {} } = {}) {
  const manifestUrl = new URL(config.url, import.meta.url), baseUrl = new URL('./', manifestUrl);
  const request = createResourceRequest({ fetchImpl, ...requestPolicy });
  const routes = new Map(), people = new Map();
  let manifestPromise, cacheBytes = 0;
  const hash = async bytes => Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  const pinned = (url, descriptor, validate) => {
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 16 * 1024 * 1024
      || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 ?? '')) throw Error('人物详情描述无效');
    return request(url, { label: '人物详情', validationKey: `${config.revision}:${descriptor.sha256}`,
      validate: async bytes => {
        if (bytes.byteLength !== descriptor.bytes || await hash(bytes) !== descriptor.sha256) throw Error('人物详情摘要不符');
        return validate(bytes);
      }
    });
  };
  const json = (bytes, schema) => {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (value.schema !== schema || value.revision !== config.revision) throw Error('人物详情版本不符');
    return value;
  };
  const manifest = () => manifestPromise ??= pinned(manifestUrl, config, bytes => {
    const value = json(bytes, 'galpedia-person-static-details-manifest-v1');
    if (value.compression !== 'gzip' || value.routeScheme !== 'sha256-prefix-2'
      || !Number.isSafeInteger(value.count) || value.count < 1 || !value.routes
      || Object.keys(value.routes).length !== 256) throw Error('人物详情清单无效');
    return value;
  }).catch(error => { manifestPromise = null; throw error; });
  const inflate = async (bytes, expected) => {
    if (!Number.isSafeInteger(expected) || expected < 1 || expected > 16 * 1024 * 1024) throw Error('人物详情解压预算无效');
    if (typeof decompress !== 'function') throw Error('当前浏览器不支持人物详情解压');
    const reader = new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > expected) throw Error('人物详情超过解压预算'); chunks.push(value);
      }
      if (size !== expected) throw Error('人物详情解压长度不符');
    } finally { await reader.cancel().catch(() => {}); }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  };
  return Object.freeze({
    async loadPerson(personId) {
      const id = String(personId ?? '');
      if (!/^per_[A-Za-z0-9]+$/u.test(id)) throw Error('人物身份无效');
      if (people.has(id)) { const entry = people.get(id); people.delete(id); people.set(id, entry); return entry.promise; }
      const entry = { bytes: 0, promise: null };
      entry.promise = (async () => {
        const site = await manifest(), bucket = (await hash(new TextEncoder().encode(id))).slice(0, 2);
        if (!routes.has(bucket)) {
          const descriptor = site.routes[bucket];
          if (descriptor?.path !== `${bucket}/routes.json`) throw Error('人物详情路由越界');
          const promise = pinned(new URL(descriptor.path, baseUrl), descriptor, bytes => {
            const value = json(bytes, 'galpedia-person-static-detail-routes-v1');
            if (value.bucket !== bucket || !value.persons) throw Error('人物详情路由无效'); return value;
          }).catch(error => { routes.delete(bucket); throw error; });
          routes.set(bucket, promise);
          while (routes.size > 16) routes.delete(routes.keys().next().value);
        }
        const descriptor = (await routes.get(bucket)).persons[id];
        if (descriptor?.path !== `${bucket}/${id}.json.gz`) throw Error('未找到人物详情');
        const person = await pinned(new URL(descriptor.path, baseUrl), descriptor, async bytes => {
          const model = json(await inflate(bytes, descriptor.rawBytes), 'galpedia-person-static-detail-v1');
          if (model.personId !== id || model.person?.entityId !== id || !Array.isArray(model.person.credits)
            || !Array.isArray(model.person.timelineCast) || !Array.isArray(model.person.coActors)
            || !Array.isArray(model.person.coCompanies)) throw Error('人物详情身份或结构无效');
          return model.person;
        });
        entry.bytes = descriptor.rawBytes; cacheBytes += entry.bytes;
        for (const [key, item] of people) {
          if (cacheBytes <= maxCacheBytes) break;
          if (!item.bytes) continue; people.delete(key); cacheBytes -= item.bytes;
        }
        return person;
      })().catch(error => { people.delete(id); throw error; });
      people.set(id, entry); return entry.promise;
    }
  });
}
