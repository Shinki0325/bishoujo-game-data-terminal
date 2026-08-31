const QUERY_PARAMETER = 'startupMetrics';

function now(performanceRef) {
  return typeof performanceRef?.now === 'function' ? performanceRef.now() : Date.now();
}

function mark(performanceRef, name) {
  performanceRef?.mark?.(name);
}

export function startupMetricsEnabled(locationRef = globalThis.location) {
  try {
    return new URL(locationRef?.href ?? '').searchParams.get(QUERY_PARAMETER) === '1';
  } catch {
    return false;
  }
}

export function createStartupMetrics({
  globalRef = globalThis,
  locationRef = globalThis.location,
  performanceRef = globalThis.performance
} = {}) {
  const enabled = startupMetricsEnabled(locationRef);
  const phases = [];

  function snapshot() {
    return { phases: phases.map(phase => ({ ...phase })) };
  }

  function start(name) {
    if (!enabled) return () => {};
    const startedAt = now(performanceRef);
    const markPrefix = `egs-startup:${name}`;
    mark(performanceRef, `${markPrefix}:start`);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      phases.push({ name, durationMs: now(performanceRef) - startedAt });
      mark(performanceRef, `${markPrefix}:end`);
    };
  }

  function measure(name, operation) {
    const finish = start(name);
    try {
      return operation();
    } finally {
      finish();
    }
  }

  async function measureAsync(name, operation) {
    const finish = start(name);
    try {
      return await operation();
    } finally {
      finish();
    }
  }

  const metrics = Object.freeze({ start, measure, measureAsync, snapshot });
  if (enabled) globalRef.__egsStartupMetrics = Object.freeze({ snapshot });
  return metrics;
}
