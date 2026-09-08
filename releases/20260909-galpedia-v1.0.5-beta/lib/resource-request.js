// Read-only resource recovery. Success caches belong to the data services,
// not this layer; a shared request owns its timeout, never a page's signal.
import { runtimeDiagnostics as diagnostics } from './runtime-diagnostics.js';
let nextRequestId = 0;
function resourceCategory(url) {
  let path;
  try { path = new URL(String(url), 'https://local.invalid/').pathname; } catch { return 'other'; }
  if (/person|m2-/i.test(path)) return 'people';
  if (/company/i.test(path)) return 'companies';
  if (/media|images|assets/i.test(path)) return 'media';
  if (/workbench|catalog|works/i.test(path)) return 'works';
  return 'other';
}
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
  const requestIds = new WeakMap();
  const retryable = error => error.kind === 'network' || error.kind === 'timeout'
    || (error.kind === 'http' && [408, 429, 500, 502, 503, 504].includes(error.status));
  async function attempt(url, cache, label, validate) {
    const controller = new AbortController();
    let timer;
    try {
      const bytes = await Promise.race([
        Promise.resolve().then(async () => {
          let response;
          try { response = await fetchImpl(url, { cache, signal: controller.signal }); }
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
      try { return await validate(bytes); }
      catch (cause) { throw new ResourceRequestError(`${label} 校验失败：${cause?.message ?? cause}`, { kind: 'validation', cause }); }
    } finally { clearTimeout(timer); }
  }
  return function request(url, { cache = 'force-cache', label = '资料', validationKey = '', validate = bytes => bytes } = {}) {
    const key = JSON.stringify([String(url), cache, validationKey]);
    if (pending.has(key)) { diagnostics.event('request-shared', { id: requestIds.get(pending.get(key)) }); return pending.get(key); }
    const failure = failures.get(key);
    if (failure && now() < failure.retryAt) { diagnostics.event('request-cooldown', failure); return Promise.reject(failure); }
    const id = ++nextRequestId, started = now();
    diagnostics.event('request-start', { id, category: diagnostics.enabled ? resourceCategory(url) : 'other' }); diagnostics.gauge('activeRequests', 1);
    const task = Promise.resolve().then(async () => {
      let last;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const value = await attempt(url, i > 0 || failure ? 'reload' : cache, label, validate);
          failures.delete(key);
          diagnostics.event('request-ready', { id, attempt: i + 1, durationMs: now() - started });
          return value;
        } catch (error) {
          last = error;
          if (!retryable(error) || i + 1 === maxAttempts) break;
          const jitter = Math.max(0, Math.min(1, random()));
          const delay = Math.max(error.retryAt - now(), Math.min(maxWaitMs, baseDelayMs * 2 ** i) * jitter);
          if (delay > maxWaitMs) break; // Do not hold a UI request for a long Retry-After.
          diagnostics.event('request-retry', { id, attempt: i + 1, kind: error.kind, status: error.status });
          await sleep(delay);
        }
      }
      last.retryAt = Math.max(last.retryAt, now() + cooldownMs);
      failures.delete(key); failures.set(key, last);
      while (failures.size > maxFailures) failures.delete(failures.keys().next().value);
      diagnostics.event('request-error', { id, kind: last.kind, status: last.status, durationMs: now() - started });
      throw last;
    });
    pending.set(key, task);
    if (diagnostics.enabled) requestIds.set(task, id);
    // Register cleanup without creating an unhandled rejecting finally promise.
    const release = () => { if (pending.get(key) === task) { pending.delete(key); diagnostics.gauge('activeRequests', -1); } };
    task.then(release, release);
    return task;
  };
}
