const QUERY_PARAMETER = 'interactionMetrics';
const STAGES = Object.freeze([
  'interaction-start',
  'debounce-complete',
  'worker-return',
  'controller-ready',
  'presentation-ready',
  'model-ready',
  'media-ready',
  'dom-updated',
  'next-frame'
]);

function now(performanceRef) {
  return typeof performanceRef?.now === 'function' ? performanceRef.now() : Date.now();
}

function enabledFromLocation(locationRef) {
  try {
    return new URL(locationRef?.href ?? '').searchParams.get(QUERY_PARAMETER) === '1';
  } catch {
    return false;
  }
}

function copyRecord(record) {
  const marks = Object.fromEntries(record.marks);
  const duration = (from, to) => Number.isFinite(marks[from]) && Number.isFinite(marks[to])
    ? marks[to] - marks[from]
    : null;
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    status: record.status,
    reason: record.reason,
    marks: Object.freeze({ ...marks }),
    debounceMs: duration('interaction-start', 'debounce-complete'),
    queryMs: duration('debounce-complete', 'worker-return'),
    controllerMs: duration('worker-return', 'controller-ready'),
    presentationMs: duration('controller-ready', 'presentation-ready'),
    modelMs: duration('presentation-ready', 'model-ready'),
    mediaMs: duration('model-ready', 'media-ready'),
    domMs: duration('media-ready', 'dom-updated'),
    nextFrameMs: duration('dom-updated', 'next-frame'),
    totalMs: duration('interaction-start', 'next-frame')
  });
}

export function interactionMetricsEnabled(locationRef = globalThis.location) {
  return enabledFromLocation(locationRef);
}

export function createInteractionMetrics({
  globalRef = globalThis,
  locationRef = globalThis.location,
  performanceRef = globalThis.performance,
  requestAnimationFrameRef = globalThis.requestAnimationFrame?.bind(globalThis)
} = {}) {
  const enabled = enabledFromLocation(locationRef);
  const records = [];
  const active = new Map();
  let nextId = 1;

  function performanceMark(record, stage) {
    performanceRef?.mark?.(`egs-interaction:${record.id}:${record.kind}:${stage}`);
  }

  function snapshot() {
    return Object.freeze({
      enabled,
      stages: STAGES,
      records: Object.freeze(records.map(copyRecord))
    });
  }

  function cancel(token, reason = 'canceled') {
    const record = active.get(token?.id);
    if (record === undefined || record.status !== 'pending') return false;
    record.status = 'canceled';
    record.reason = reason;
    active.delete(record.id);
    return true;
  }

  function begin(kind) {
    if (!enabled) return null;
    for (const record of active.values()) cancel(record, 'superseded');
    const record = {
      id: nextId,
      kind: String(kind || 'unknown'),
      status: 'pending',
      reason: null,
      marks: new Map()
    };
    nextId += 1;
    const startedAt = now(performanceRef);
    record.marks.set('interaction-start', startedAt);
    records.push(record);
    active.set(record.id, record);
    performanceMark(record, 'interaction-start');
    return Object.freeze({ id: record.id });
  }

  function stage(token, name) {
    if (!STAGES.includes(name) || name === 'interaction-start') return false;
    const record = active.get(token?.id);
    if (record === undefined || record.status !== 'pending' || record.marks.has(name)) return false;
    record.marks.set(name, now(performanceRef));
    performanceMark(record, name);
    if (name === 'next-frame') {
      record.status = 'complete';
      active.delete(record.id);
    }
    return true;
  }

  function completeAfterFrame(token) {
    const record = active.get(token?.id);
    if (record === undefined || record.status !== 'pending') return false;
    const schedule = typeof requestAnimationFrameRef === 'function'
      ? requestAnimationFrameRef
      : callback => globalRef.setTimeout(callback, 0);
    schedule(() => stage(token, 'next-frame'));
    return true;
  }

  function clear() {
    records.length = 0;
    active.clear();
  }

  const metrics = Object.freeze({ begin, stage, cancel, completeAfterFrame, snapshot, clear });
  if (enabled) {
    globalRef.__egsInteractionMetrics = Object.freeze({ snapshot, clear });
  }
  return metrics;
}
