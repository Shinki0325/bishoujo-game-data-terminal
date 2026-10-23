import { resourceTransferCoordinator, loadingPriority } from './load-coordinator.js';
import { resolveSharedDataURL } from './shared-data-url.js';
// Read-only resource recovery. Success caches belong to the data services,
// not this layer; a shared request owns its timeout, never a page's signal.
export class ResourceRequestError extends Error {
  constructor(message, { kind, status = null, retryAt = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'ResourceRequestError';
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function retryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = /^\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export function createResourceRequest({
  fetchImpl = globalThis.fetch, now = Date.now, random = Math.random,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 15000, maxAttempts = 2, baseDelayMs = 400,
  maxWaitMs = 3000, cooldownMs = 3000, maxFailures = 256
} = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxFailures) || maxFailures < 1
    || [baseDelayMs, maxWaitMs, cooldownMs].some(n => !Number.isFinite(n) || n < 0)) throw new TypeError('Invalid resource recovery policy');
  const pending = new Map(), failures = new Map();
  const transfers = resourceTransferCoordinator(fetchImpl);
  const transferKey = (url, cache, pin) => JSON.stringify([String(resolveSharedDataURL(url)), cache, timeoutMs, pin]);
  const retryable = error => error.kind === 'network' || error.kind === 'timeout'
    || (error.kind === 'http' && [408, 429, 500, 502, 503, 504].includes(error.status));
  async function attempt(url, cache, label, validate, validationKey, priority, lane) {
    const bytes = await transfers.read(transferKey(url, cache, validationKey), async () => {
    const controller = new AbortController();
    let timer;
    try {
      const bytes = await Promise.race([
        Promise.resolve().then(async () => {
          let response;
          try { response = await fetchImpl(resolveSharedDataURL(url), { cache, signal: controller.signal }); }
          catch (cause) { throw new ResourceRequestError(`${label} 网络读取失败`, { kind: 'network', cause }); }
          if (!response.ok) {
            void response.body?.cancel?.().catch(() => {});
            throw new ResourceRequestError(`${label} 加载失败：HTTP ${response.status}`, {
              kind: 'http', status: response.status,
              retryAt: now() + retryAfterMs(response.headers?.get?.('Retry-After'), now())
            });
          }
          try { return await response.arrayBuffer(); }
          catch (cause) { throw new ResourceRequestError(`${label} 响应读取失败`, { kind: 'network', cause }); }
        }),
        new Promise((_, reject) => { timer = setTimeout(() => {
          reject(new ResourceRequestError(`${label} 读取超时`, { kind: 'timeout' }));
          controller.abort();
        }, timeoutMs); })
      ]);
      clearTimeout(timer);
      return bytes;
    } finally { clearTimeout(timer); }
    }, { priority, retain: false, lane });
    // Transfer sharing never shares a caller's decoded or validated result.
    try { return await validate(bytes.slice(0)); }
    catch (cause) { throw new ResourceRequestError(`${label} 校验失败：${cause?.message ?? cause}`, { kind: 'validation', cause }); }
  }
  function request(url, { cache = 'force-cache', label = '资料', validationKey = '', validate = bytes => bytes, priority = 'action', lane = 'data' } = {}) {
    if (!['data','media'].includes(lane)) throw new TypeError('未知读取类型');
    priority = loadingPriority(priority);
    request.promote(url, { cache, validationKey, priority });
    const key = JSON.stringify([String(url), cache, validationKey]);
    const existing = pending.get(key);
    if (existing) {
      const order = ['visible', 'action', 'intent', 'idle'];
      if (order.indexOf(priority) < order.indexOf(existing.priority)) existing.priority = priority;
      return existing.promise;
    }
    const failure = failures.get(key);
    if (failure && now() < failure.retryAt) return Promise.reject(failure);
    const job = { priority, lane, promise: null };
    const task = Promise.resolve().then(async () => {
      let last;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const value = await attempt(url, i > 0 || failure ? 'reload' : cache, label, validate, validationKey, job.priority, job.lane);
          failures.delete(key);
          return value;
        } catch (error) {
          last = error;
          if (!retryable(error) || i + 1 === maxAttempts) break;
          const jitter = Math.max(0, Math.min(1, random()));
          const delay = Math.max(error.retryAt - now(), Math.min(maxWaitMs, baseDelayMs * 2 ** i) * jitter);
          if (delay > maxWaitMs) break; // Do not hold a UI request for a long Retry-After.
          await sleep(delay);
        }
      }
      last.retryAt = Math.max(last.retryAt, now() + cooldownMs);
      failures.delete(key); failures.set(key, last);
      while (failures.size > maxFailures) failures.delete(failures.keys().next().value);
      throw last;
    });
    job.promise = task; pending.set(key, job);
    // Register cleanup without creating an unhandled rejecting finally promise.
    const release = () => { if (pending.get(key) === job) pending.delete(key); };
    task.then(release, release);
    return task;
  }
  request.promote = (url, { cache = 'force-cache', validationKey = '', priority = 'action' } = {}) => {
    priority = loadingPriority(priority);
    const job = pending.get(JSON.stringify([String(url), cache, validationKey]));
    const order = ['visible', 'action', 'intent', 'idle'];
    if (job && order.indexOf(priority) < order.indexOf(job.priority)) job.priority = priority;
    transfers.promote(transferKey(url, cache, validationKey), priority);
    transfers.promote(transferKey(url, 'reload', validationKey), priority);
  };
  request.inspect = () => transfers.inspect();
  return request;
}
