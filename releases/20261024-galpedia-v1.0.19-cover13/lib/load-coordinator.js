// Shared policy for resource transfers and entity models. Use separate pools:
// an entity task may await resource tasks, so it must not hold a network slot.
const priorities = Object.freeze({ visible: 0, action: 1, intent: 2, idle: 3 });
const aborted = () => new DOMException('读取已取消', 'AbortError');
export function loadingPriority(value = 'action') {
  const priority = value === 'foreground' ? 'action' : value === 'prefetch' ? 'intent' : value;
  if (!Object.hasOwn(priorities, priority)) throw new TypeError('未知加载优先级');
  return priority;
}

// Estimate retained JSON-like models, including hydrated rows, rather than
// counting compressed transfer bytes. This is a budget estimate, not heap size.
export function estimateModelBytes(value, limit = Infinity) {
  const seen = new WeakSet(), pending = [value];
  let bytes = 0;
  while (pending.length && bytes <= limit) {
    const item = pending.pop();
    if (typeof item === 'string') bytes += 16 + item.length * 2;
    else if (item === null || typeof item !== 'object') bytes += 8;
    else if (!seen.has(item)) {
      seen.add(item);
      if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) bytes += item.byteLength + 32;
      else {
        bytes += Array.isArray(item) ? 32 + item.length * 8 : 48;
        for (const key of Object.keys(item)) {
          bytes += key.length * 2 + 16;
          pending.push(item[key]);
        }
      }
    }
  }
  return bytes;
}

export function createLoadCoordinator({
  concurrency = 24, backgroundConcurrency = 2, mediaConcurrency = Math.min(6, concurrency), maxPending = 1024,
  maxEntries = 64, maxCacheBytes = 0,
  estimate = value => estimateModelBytes(value, maxCacheBytes),
  now = () => globalThis.performance?.now?.() ?? Date.now()
} = {}) {
  if (![concurrency, backgroundConcurrency, mediaConcurrency, maxPending, maxEntries].every(n => Number.isSafeInteger(n) && n > 0)
    || backgroundConcurrency > concurrency || mediaConcurrency > concurrency || !Number.isFinite(maxCacheBytes) || maxCacheBytes < 0) throw new TypeError('加载预算无效');
  const jobs = new Map(), cache = new Map();
  const counters = { started: 0, joined: 0, hits: 0, completed: 0, failed: 0, cancelled: 0, evicted: 0, waitMs: 0, runMs: 0 };
  let active = 0, background = 0, mediaActive = 0, cacheBytes = 0, pumpScheduled = false;
  const rank = job => Math.min(...[...job.consumers].map(c => priorities[c.priority]));
  function removeCache(key) {
    const entry = cache.get(key);
    if (entry) { cacheBytes -= entry.bytes; cache.delete(key); }
  }
  function remember(key, value, speculative) {
    if (!maxCacheBytes) return;
    let bytes;
    try { bytes = estimate(value); } catch { return; }
    // An unmeasurable/oversized model is still returned in full, just not retained.
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > maxCacheBytes
      || (speculative && bytes > maxCacheBytes / 8)) return;
    removeCache(key); cache.set(key, { value, bytes, speculative }); cacheBytes += bytes;
    const speculativeEntries = () => [...cache].filter(([, entry]) => entry.speculative);
    // Predictions have a separate small allowance and cannot evict a visit.
    while (speculativeEntries().reduce((n, [, entry]) => n + entry.bytes, 0) > maxCacheBytes / 8
      || speculativeEntries().length > Math.max(1, Math.floor(maxEntries / 4))) {
      removeCache(speculativeEntries()[0][0]); counters.evicted++;
    }
    while (cacheBytes > maxCacheBytes || cache.size > maxEntries) {
      removeCache(speculativeEntries()[0]?.[0] ?? cache.keys().next().value); counters.evicted++;
    }
  }
  function schedule() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    queueMicrotask(() => { pumpScheduled = false; pump(); });
  }
  function settle(job, error, value) {
    active--; if (job.background) background--; if (job.lane === 'media') mediaActive--;
    counters.runMs += Math.max(0, now() - job.startedAt);
    const owned = jobs.get(job.key) === job;
    if (owned) jobs.delete(job.key);
    if (error) counters.failed++;
    else {
      counters.completed++;
      if (owned && job.consumers.size && job.retain) remember(job.key, value, !job.demanded);
    }
    for (const consumer of job.consumers) {
      consumer.signal?.removeEventListener('abort', consumer.abort);
      if (error) consumer.reject(error); else consumer.resolve(value);
    }
    job.consumers.clear(); schedule();
  }
  function pump() {
    while (active < concurrency) {
      let chosen, chosenRank = Infinity;
      for (const job of jobs.values()) {
        if (job.started || !job.consumers.size) continue;
        const priority = rank(job);
        if (priority >= 2 && background >= backgroundConcurrency) continue;
        // Cover classification must not fill every slot before the next page's data.
        if (job.lane === 'media' && mediaActive >= mediaConcurrency) continue;
        if (priority < chosenRank) { chosen = job; chosenRank = priority; }
      }
      if (!chosen) break;
      const job = chosen;
      job.started = true; job.background = chosenRank >= 2; job.startedAt = now();
      active++; if (job.background) background++; if (job.lane === 'media') mediaActive++;
      counters.started++; counters.waitMs += Math.max(0, job.startedAt - job.createdAt);
      Promise.resolve().then(() => {
        if (job.controller.signal.aborted) throw aborted();
        return job.run(job.controller.signal);
      }).then(value => settle(job, null, value), error => settle(job, error));
    }
  }
  return Object.freeze({
    read(key, run, { signal, priority = 'action', retain = true, lane = 'data' } = {}) {
      if (typeof key !== 'string' || !key || typeof run !== 'function') return Promise.reject(new TypeError('读取键或加载器无效'));
      priority = loadingPriority(priority);
      if (!['data','media'].includes(lane)) return Promise.reject(new TypeError('未知读取类型'));
      if (signal?.aborted) return Promise.reject(aborted());
      if (cache.has(key)) {
        const entry = cache.get(key);
        if (priorities[priority] < 2) {
          entry.speculative = false; cache.delete(key); cache.set(key, entry);
        }
        counters.hits++;
        return Promise.resolve(entry.value);
      }
      let job = jobs.get(key);
      if (!job) {
        if (jobs.size >= maxPending) return Promise.reject(new Error('加载队列繁忙，请重试'));
        job = { key, run, retain, lane, createdAt: now(), controller: new AbortController(), consumers: new Set(), started: false };
        jobs.set(key, job);
      } else { counters.joined++; job.retain ||= retain; }
      job.demanded ||= priorities[priority] < 2;
      const promise = new Promise((resolve, reject) => {
        const consumer = { resolve, reject, priority, signal };
        consumer.abort = () => {
          if (!job.consumers.delete(consumer)) return;
          signal?.removeEventListener('abort', consumer.abort);
          counters.cancelled++; reject(aborted());
          if (!job.consumers.size) {
            if (jobs.get(key) === job) jobs.delete(key);
            job.controller.abort();
          }
          schedule();
        };
        job.consumers.add(consumer);
        signal?.addEventListener('abort', consumer.abort, { once: true });
        if (signal?.aborted) consumer.abort();
      });
      schedule(); return promise;
    },
    // Only unreferenced successful models are held here. History/view state
    // and active UI objects have their own lifetime and are never deleted here.
    clearCache() { cache.clear(); cacheBytes = 0; },
    promote(key, priority = 'action') {
      priority = loadingPriority(priority);
      const job = jobs.get(key);
      if (!job) return false;
      job.demanded ||= priorities[priority] < 2;
      for (const consumer of job.consumers)
        if (priorities[priority] < priorities[consumer.priority]) consumer.priority = priority;
      schedule(); return true;
    },
    inspect: () => Object.freeze({ ...counters, active, background, mediaActive, mediaConcurrency,
      pending: jobs.size, queued: [...jobs.values()].filter(job => !job.started).length,
      cached: cache.size, speculativeCached: [...cache.values()].filter(entry => entry.speculative).length,
      estimatedCacheBytes: cacheBytes, maxCacheBytes })
  });
}

// A separate gateway per fetch implementation prevents tests, credentials or
// application-specific transports from borrowing one another's requests.
const transfers = new WeakMap();
export function resourceTransferCoordinator(fetchImpl) {
  let value = transfers.get(fetchImpl);
  if (!value) { value = createLoadCoordinator(); transfers.set(fetchImpl, value); }
  return value;
}
