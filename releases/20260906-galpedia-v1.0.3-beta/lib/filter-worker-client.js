export class FilterWorkerError extends Error {
  constructor(message, { code = 'WORKER_QUERY_FAILED', requestId = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FilterWorkerError';
    this.code = code;
    this.requestId = requestId;
  }
}

function assertWorker(worker) {
  if (
    worker === null
    || typeof worker !== 'object'
    || typeof worker.addEventListener !== 'function'
    || typeof worker.postMessage !== 'function'
  ) {
    throw new TypeError('worker must provide addEventListener and postMessage');
  }
}

function clientOptions(input) {
  if (input?.workerFactory !== undefined) {
    if (typeof input.workerFactory !== 'function') throw new TypeError('workerFactory must be a function');
    const timeoutMs = input.timeoutMs ?? 10000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive finite number');
    }
    return { workerFactory: input.workerFactory, timeoutMs };
  }
  assertWorker(input);
  let available = true;
  return {
    timeoutMs: 10000,
    workerFactory() {
      if (!available) {
        throw new FilterWorkerError('filter worker cannot be rebuilt without a workerFactory', {
          code: 'WORKER_REBUILD_UNAVAILABLE'
        });
      }
      available = false;
      return input;
    }
  };
}

export function createFilterWorkerClient(input) {
  const { workerFactory, timeoutMs } = clientOptions(input);
  let nextRequestId = 1;
  let latestQueryId = 0;
  let initialized = false;
  let initPayload = null;
  let initPromise = null;
  let terminated = false;
  let worker = null;
  let workerGeneration = 0;
  const pending = new Map();

  function rejectGeneration(generation, errorFactory) {
    for (const [requestId, entry] of [...pending]) {
      if (entry.generation !== generation) continue;
      pending.delete(requestId);
      globalThis.clearTimeout(entry.timer);
      entry.reject(errorFactory(requestId));
    }
  }

  function invalidateWorker(generation, errorFactory) {
    if (generation !== workerGeneration) return;
    const failedWorker = worker;
    worker = null;
    initialized = false;
    initPromise = null;
    rejectGeneration(generation, errorFactory);
    failedWorker?.terminate?.();
  }

  function onMessage(generation, event) {
    if (generation !== workerGeneration) return;
    const message = event?.data ?? {};
    const entry = pending.get(message.id);
    if (!entry || entry.generation !== generation) return;
    pending.delete(message.id);
    globalThis.clearTimeout(entry.timer);
    if (entry.type === 'query' && message.id !== latestQueryId) {
      entry.resolve({ status: 'stale', requestId: message.id });
      return;
    }
    if (message.type === 'error') {
      entry.reject(new FilterWorkerError(
        message.error?.message ?? 'filter worker query failed',
        {
          code: message.error?.code ?? 'WORKER_QUERY_FAILED',
          requestId: message.id
        }
      ));
      return;
    }
    if ((entry.type === 'init' || entry.type === 'update') && message.type === 'ready') {
      initialized = true;
      entry.resolve({ status: 'ready', requestId: message.id, workCount: message.workCount });
      return;
    }
    if (entry.type === 'query' && message.type === 'result') {
      const result = {
        status: 'ok',
        requestId: message.id,
        workIds: message.workIds,
        counts: message.counts
      };
      if (message.workerDurationMs !== undefined) result.workerDurationMs = message.workerDurationMs;
      entry.resolve(result);
      return;
    }
    entry.reject(new FilterWorkerError('filter worker returned an unexpected response', {
      code: 'WORKER_PROTOCOL_ERROR',
      requestId: message.id
    }));
  }

  function ensureWorker() {
    if (worker !== null) return worker;
    const nextWorker = workerFactory();
    assertWorker(nextWorker);
    worker = nextWorker;
    workerGeneration += 1;
    const generation = workerGeneration;
    worker.addEventListener('message', event => onMessage(generation, event));
    worker.addEventListener('error', event => {
      invalidateWorker(generation, requestId => new FilterWorkerError(
        'filter worker runtime failed',
        {
          code: 'WORKER_RUNTIME_ERROR',
          requestId,
          cause: event?.error
        }
      ));
    });
    return worker;
  }

  function request(type, payload) {
    if (terminated) throw new FilterWorkerError('filter worker client is terminated', {
      code: 'WORKER_TERMINATED'
    });
    const activeWorker = ensureWorker();
    const generation = workerGeneration;
    const id = nextRequestId;
    nextRequestId += 1;
    if (type === 'query') latestQueryId = id;
    const promise = new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        invalidateWorker(generation, requestId => new FilterWorkerError(
          'filter worker request timed out',
          { code: 'WORKER_TIMEOUT', requestId }
        ));
      }, timeoutMs);
      pending.set(id, { type, generation, timer, resolve, reject });
    });
    try {
      activeWorker.postMessage({ id, type, payload });
    } catch (cause) {
      invalidateWorker(generation, requestId => new FilterWorkerError(
        'filter worker request could not be posted',
        { code: 'WORKER_POST_FAILED', requestId, cause }
      ));
    }
    return promise;
  }

  function ensureInitialized() {
    if (initialized) return Promise.resolve({ status: 'ready', requestId: null });
    if (initPayload === null) {
      throw new FilterWorkerError('filter worker has not been initialized', {
        code: 'WORKER_NOT_READY'
      });
    }
    if (initPromise !== null) return initPromise;
    const pendingInit = request('init', initPayload);
    initPromise = pendingInit;
    pendingInit.then(
      () => {
        if (initPromise === pendingInit) initPromise = null;
      },
      () => {
        if (initPromise === pendingInit) initPromise = null;
      }
    );
    return initPromise;
  }

  return Object.freeze({
    init(payload) {
      initPayload = payload;
      return ensureInitialized();
    },
    query(payload) {
      if (terminated) {
        throw new FilterWorkerError('filter worker client is terminated', {
          code: 'WORKER_TERMINATED'
        });
      }
      if (initialized) return request('query', payload);
      return ensureInitialized().then(() => request('query', payload));
    },
    update(payload) {
      if (terminated) {
        throw new FilterWorkerError('filter worker client is terminated', {
          code: 'WORKER_TERMINATED'
        });
      }
      if (initPayload === null) {
        throw new FilterWorkerError('filter worker has not been initialized', {
          code: 'WORKER_NOT_READY'
        });
      }
      initPayload = payload;
      return ensureInitialized().then(() => request('update', payload));
    },
    terminate() {
      if (terminated) return false;
      terminated = true;
      const activeWorker = worker;
      worker = null;
      rejectGeneration(workerGeneration, requestId => new FilterWorkerError(
        'filter worker client was terminated',
        { code: 'WORKER_TERMINATED', requestId }
      ));
      activeWorker?.terminate?.();
      return true;
    }
  });
}
