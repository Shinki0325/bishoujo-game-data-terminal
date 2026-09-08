import { runtimeDiagnostics as diagnostics } from './runtime-diagnostics.js';

// LRU for reconstructible values. Pending requests are pinned until settlement.
// Byte weights are accounting estimates, not a measurement of JS heap memory.
export function createBudgetCache({ maxEntries = 128, maxBytes = 32 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Invalid cache budget');
  }
  const entries = new Map();
  let bytes = 0, evictions = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key); bytes -= entry.bytes;
    diagnostics.gauge('cacheEntries', -1); diagnostics.gauge('cacheBytes', -entry.bytes);
    if (entry.pending) diagnostics.gauge('cachePending', -1);
    return true;
  }
  function trim() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      if (entry.pending) continue;
      remove(key); evictions++; diagnostics.event('cache-evict');
    }
  }
  return Object.freeze({
    get size() { return entries.size; },
    has: key => entries.has(key),
    get(key) {
      const entry = entries.get(key);
      diagnostics.event(entry ? 'cache-hit' : 'cache-miss');
      if (!entry) return undefined;
      entries.delete(key); entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      remove(key); entries.set(key, { value, bytes: 0, pending: true });
      diagnostics.gauge('cacheEntries', 1); diagnostics.gauge('cachePending', 1); trim();
    },
    settle(key, value, weight = 0) {
      const entry = entries.get(key);
      if (!entry || entry.value !== value || !entry.pending) return false;
      if (!Number.isSafeInteger(weight) || weight < 0) throw new TypeError('Invalid cache weight');
      entry.pending = false; entry.bytes = weight; bytes += weight;
      diagnostics.gauge('cachePending', -1); diagnostics.gauge('cacheBytes', weight); trim();
      return true;
    },
    delete: remove,
    clear() { for (const key of entries.keys()) remove(key); },
    inspect() {
      return { entries: entries.size, pending: [...entries.values()].filter(e => e.pending).length,
        bytes, evictions, maxEntries, maxBytes };
    }
  });
}
