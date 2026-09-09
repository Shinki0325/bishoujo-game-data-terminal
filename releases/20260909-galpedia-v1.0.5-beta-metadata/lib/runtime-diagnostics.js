// Opt-in, bounded, local-only diagnostics. Never accept URLs, queries or error messages.
const EVENTS = new Set(['request-start','request-shared','request-retry','request-cooldown','request-ready','request-error',
  'session-loading','session-ready','session-empty','session-error','session-stop',
  'cache-hit','cache-miss','cache-evict','worker-loading','worker-ready','worker-error','query-ready']);
const GAUGES = new Set(['activeRequests','activeSessions','listeners','cacheEntries','cachePending','cacheBytes']);
const KINDS = new Set(['network','timeout','http','validation','unknown']);
const CATEGORIES = new Set(['works','people','companies','media','other']);

export function createRuntimeDiagnostics({ enabled = false, maxEvents = 128, now = () => performance.now() } = {}) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1024) throw new TypeError('Invalid diagnostic capacity');
  const events = [], counters = Object.create(null), gauges = Object.create(null), metadata = Object.create(null);
  return Object.freeze({
    enabled,
    event(type, fields = {}) {
      if (!enabled || !EVENTS.has(type)) return;
      const row = { type, at: now() };
      for (const key of ['id','attempt','status','durationMs','total','pageNumber','revision']) {
        if (Number.isFinite(fields[key]) && fields[key] >= 0) row[key] = fields[key];
      }
      if (KINDS.has(fields.kind)) row.kind = fields.kind;
      if (CATEGORIES.has(fields.category)) row.category = fields.category;
      counters[type] = (counters[type] ?? 0) + 1;
      events.push(Object.freeze(row));
      if (events.length > maxEvents) events.shift();
    },
    gauge(name, delta) {
      if (enabled && GAUGES.has(name) && Number.isFinite(delta)) gauges[name] = (gauges[name] ?? 0) + delta;
    },
    identify({ runtimeRelease, dataSnapshot, appVersion, appRelease } = {}) {
      if (!enabled) return;
      for (const [key, value] of Object.entries({ runtimeRelease, dataSnapshot, appVersion, appRelease })) {
        if (typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/u.test(value)) metadata[key] = value;
      }
    },
    snapshot() {
      return { enabled, metadata: { ...metadata }, counters: { ...counters }, gauges: { ...gauges }, events: events.map(v => ({ ...v })) };
    },
    clear() { events.length = 0; for (const key of Object.keys(counters)) delete counters[key]; }
  });
}

export const runtimeDiagnostics = createRuntimeDiagnostics({
  enabled: new URLSearchParams(globalThis.location?.search ?? '').get('diagnostics') === '1'
});
