import { createLoadCoordinator } from './load-coordinator.js';

// Objects in identity keys are canonicalized; arrays preserve semantic order.
function canonical(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  throw new TypeError('实体读取范围必须可序列化');
}
function immutable(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}

export function entityReadKey({ releaseKey, sourcePins, kind, id, section, scope = null, query = null, cursor = null }) {
  if (![releaseKey, kind, id, section].every(value => typeof value === 'string' && value.length)
    || !sourcePins || !Object.keys(sourcePins).length) throw new TypeError('实体读取缺少版本、身份或来源绑定');
  return JSON.stringify(canonical({ releaseKey, sourcePins, kind, id, section, scope, query, cursor }));
}

// Each adapter declares exactly which complete sections it can provide. There
// is deliberately no fallback from "overview" to an incomplete "full" model.
export function createEntityReader({
  releaseKey, sourcePins, kind, sections,
  coordinator = createLoadCoordinator({ concurrency: 4, backgroundConcurrency: 1, maxCacheBytes: 32 * 1024 * 1024 }),
  validate
}) {
  if (!sections || typeof validate !== 'function') throw new TypeError('实体读取适配器无效');
  const pins = immutable(canonical(sourcePins));
  return Object.freeze({
    read(id, { section = 'full', scope = null, query = null, cursor = null, signal, priority = 'action' } = {}) {
      const loader = Object.hasOwn(sections, section) ? sections[section] : null;
      if (typeof loader !== 'function') return Promise.reject(new Error('该资料分节尚未接入：' + section));
      scope = immutable(canonical(scope)); query = immutable(canonical(query)); cursor = immutable(canonical(cursor));
      const key = entityReadKey({ releaseKey, sourcePins: pins, kind, id, section, scope, query, cursor });
      return coordinator.read(key, async sharedSignal => {
        const data = await loader(id, { scope, query, cursor, signal: sharedSignal });
        if (sharedSignal.aborted) throw new DOMException('读取已取消', 'AbortError');
        await validate(data, { id, section, scope, query, cursor });
        return Object.freeze({ data, key, kind, id, section, scope,
          completeness: 'complete', releaseKey, sourcePins: pins });
      }, { signal, priority });
    },
    inspect: () => coordinator.inspect(),
    clearCache: () => coordinator.clearCache()
  });
}
