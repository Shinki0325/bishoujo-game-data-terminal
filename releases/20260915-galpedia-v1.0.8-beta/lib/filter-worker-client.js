export class FilterWorkerError extends Error {
  constructor(message, { code = 'WORKER_QUERY_FAILED', requestId = null, cause, retryAt = 0 } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FilterWorkerError';
    this.code = code;
    this.requestId = requestId;
    this.retryAt = Number.isFinite(retryAt) ? Math.max(0, retryAt) : 0;
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
    const initTimeoutMs=input.initTimeoutMs??timeoutMs;
    if(!Number.isFinite(initTimeoutMs)||initTimeoutMs<=0)throw new TypeError('initTimeoutMs must be a positive finite number');
    if(input.onWorkbenchData!==undefined&&typeof input.onWorkbenchData!=='function')throw new TypeError('onWorkbenchData must be a function');
    return { workerFactory: input.workerFactory, timeoutMs, initTimeoutMs, onWorkbenchData:input.onWorkbenchData };
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
  const { workerFactory, timeoutMs, initTimeoutMs=timeoutMs, onWorkbenchData } = clientOptions(input);
  let nextRequestId = 1;
  let latestQueryId = 0;
  let latestCountsId = 0;
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
    // Display bytes can arrive while query indexing continues. Do not mark
    // the query client ready or remove its timeout until the ready response.
    if(message.type==='workbench-data'&&entry.type==='init'){
      onWorkbenchData?.(message);
      return;
    }
    pending.delete(message.id);
    globalThis.clearTimeout(entry.timer);
    if (entry.type === 'query' && message.id !== latestQueryId) {
      entry.resolve({ status: 'stale', requestId: message.id });
      return;
    }
    if(message.type==='stale'||(entry.type==='query-counts'&&message.id!==latestCountsId)){
      entry.resolve({status:'stale',requestId:message.id});return;
    }
    if (message.type === 'error') {
      entry.reject(new FilterWorkerError(
        message.error?.message ?? 'filter worker query failed',
        {
          code: message.error?.code ?? 'WORKER_QUERY_FAILED',
          requestId: message.id,
          retryAt: message.error?.retryAt
        }
      ));
      return;
    }
    if ((entry.type === 'init' || entry.type === 'update' || entry.type === 'search-text' || entry.type === 'person-index' || entry.type === 'warm-search') && message.type === 'ready') {
      initialized = true;
      entry.resolve({ status: 'ready', requestId: message.id, workCount: message.workCount,
        ...(message.uiSummary?{uiSummary:message.uiSummary}:{}),
        ...(message.uiData?{uiData:message.uiData,manifestSha256:message.manifestSha256}:{}),
        ...(message.workbenchBytes?{workbenchBytes:message.workbenchBytes,manifestSha256:message.manifestSha256}:{}) });
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
      if (message.page !== undefined) result.page = message.page;
      entry.resolve(result);
      return;
    }
    if(entry.type==='query-counts'&&message.type==='counts'){
      entry.resolve({status:'ok',total:message.total,counts:message.counts});return;
    }
    if (entry.type === 'result-ids' && message.type === 'result-ids') {
      entry.resolve(message.workIds);
      return;
    }
    if (entry.type === 'work-search' && message.type === 'work-search') {
      entry.resolve(message.works);
      return;
    }
    if (entry.type === 'company-work-ids' && message.type === 'company-work-ids') {entry.resolve(message.workIds);return;}
    if (entry.type === 'person-catalog' && message.type === 'person-catalog') {entry.resolve(message.works);return;}
    if (entry.type === 'work-metadata' && message.type === 'work-metadata') {entry.resolve(message.rows);return;}
    if (entry.type === 'work-list-cards' && message.type === 'work-list-cards') {entry.resolve(message.rows);return;}
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
    if(type==='query-counts')latestCountsId=id;
    const promise = new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        // Speculative preparation is optional. A slow background batch must
        // not tear down an otherwise responsive numeric/query index.
        if (type === 'warm-search' || type === 'query-counts') {
          pending.delete(id);
          reject(new FilterWorkerError('search preparation timed out', {code:'WORKER_TIMEOUT', requestId:id}));
          return;
        }
        invalidateWorker(generation, requestId => new FilterWorkerError(
          'filter worker request timed out',
          { code: 'WORKER_TIMEOUT', requestId }
        ));
      }, ['init','work-metadata'].includes(type)?initTimeoutMs:timeoutMs);
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
    preload() {
      if (terminated) throw new FilterWorkerError('filter worker client is terminated', {code:'WORKER_TERMINATED'});
      ensureWorker();
    },
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
    async counts(payload) {await ensureInitialized();return request('query-counts',payload);},
    async installPersonWorkIndex(personWorkIndex) {
      await ensureInitialized();
      const result = await request('person-index', { personWorkIndex });
      // Restore only acknowledged person data after a worker restart.
      initPayload = { ...initPayload, personWorkIndex };
      return result;
    },
    async installSearchText(searchText) {
      await ensureInitialized();
      const result = await request('search-text', { searchText });
      // Preserve the acknowledged carrier when a crashed worker is rebuilt.
      initPayload = { ...initPayload, searchText };
      return result;
    },
    async resultIds(resultRevision) {
      await ensureInitialized();
      return request('result-ids', {resultRevision});
    },
    async searchWorks(query) {
      await ensureInitialized();
      return request('work-search', {query});
    },
    async companyWorkIds(companyId, options={}) {
      await ensureInitialized();
      return request('company-work-ids',{...options,companyId});
    },
    async personCatalog() {
      await ensureInitialized();
      return request('person-catalog',{});
    },
    async workMetadata(workIds, kind) {
      await ensureInitialized();
      return request('work-metadata',{workIds,kind});
    },
    async listCards(workIds) {
      await ensureInitialized();
      return request('work-list-cards',{workIds});
    },
    async warmSearch() {
      await ensureInitialized();
      return request('warm-search', {});
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
