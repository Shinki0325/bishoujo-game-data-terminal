const SCHEMA_VERSION = 1;
const MAX_QUEUE = 20;
const EVENT_DEFINITIONS = Object.freeze({ work_detail_open: 'work', company_detail_open: 'company' });
const ID_PATTERN = /^\d{1,12}$/;

function eventId() {
  const random = globalThis.crypto?.randomUUID?.();
  return (random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96).padEnd(8, '0');
}

export function createTelemetryClient({ endpoint = null, releaseId = undefined, fetchImpl = globalThis.fetch, sendBeacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator), now = () => Date.now() } = {}) {
  let target = null;
  try {
    const parsed = new URL(String(endpoint ?? ''));
    const currentOrigin = typeof globalThis.location?.origin === 'string'
      ? globalThis.location.origin
      : null;
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:')
        && (currentOrigin === null || parsed.origin === currentOrigin)) {
      target = parsed.href;
    }
  } catch {}
  const enabled = target !== null;
  const seen = new Set();
  const queue = [];
  let flushScheduled = false;
  function scheduleFlush() {
    if (flushScheduled || typeof queueMicrotask !== 'function') return;
    flushScheduled = true;
    queueMicrotask(() => { flushScheduled = false; void flush(); });
  }
  function record(event, entityType, entityId) {
    if (!enabled || EVENT_DEFINITIONS[event] !== entityType) return false;
    const normalizedId = String(entityId ?? '');
    const key = `${event}:${entityType}:${normalizedId}`;
    if (!ID_PATTERN.test(normalizedId) || seen.has(key)) return false;
    queue.push({ schemaVersion: SCHEMA_VERSION, eventId: eventId(), event, entityType, entityId: normalizedId, occurredAt: new Date(now()).toISOString(), ...(typeof releaseId === 'string' && releaseId.length > 0 ? { releaseId } : {}) });
    seen.add(key);
    if (queue.length > MAX_QUEUE) queue.shift();
    scheduleFlush();
    return true;
  }
  async function flush() {
    if (!enabled || queue.length === 0) return 0;
    const events = queue.splice(0, queue.length);
    const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, events });
    try {
      if (typeof sendBeacon === 'function' && typeof Blob === 'function' && sendBeacon(target, new Blob([body], { type: 'application/json' }))) return events.length;
      if (typeof fetchImpl !== 'function') return 0;
      const response = await fetchImpl(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'omit' });
      if (!response?.ok && response?.status !== 202) throw new Error(`telemetry rejected: ${response?.status ?? 'unknown'}`);
      return events.length;
    } catch {
      queue.unshift(...events.slice(-MAX_QUEUE));
      return 0;
    }
  }
  return Object.freeze({ enabled, recordWorkOpen(workId) { return record('work_detail_open', 'work', workId); }, recordCompanyOpen(companyId) { return record('company_detail_open', 'company', companyId); }, flush, pendingCount() { return queue.length; }, seenCount() { return seen.size; } });
}
