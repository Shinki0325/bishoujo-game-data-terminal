import {
  createQueryIndex,
  projectedCountsForIndex,
  queryIndexedCatalog
} from './query-index.js?v=20260824-selection-source-sorting-v1';

function elapsed(start) {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now() - start
    : 0;
}

export function createFilterWorkerRuntime() {
  let queryIndex = null;

  return Object.freeze({
    handle(message) {
      const { id = null, type, payload = {} } = message ?? {};
      try {
        if (type === 'init') {
          queryIndex = createQueryIndex(payload);
          return { id, type: 'ready', workCount: queryIndex.works.length };
        }
        if (queryIndex === null) throw new Error('filter worker has not been initialized');
        if (type !== 'query') throw new Error(`unsupported filter worker message: ${String(type)}`);

        const start = typeof performance === 'object' && typeof performance.now === 'function'
          ? performance.now()
          : 0;
        const results = queryIndexedCatalog(
          queryIndex,
          payload.filterState,
          payload.selectedWorkIds ?? []
        );
        const counts = payload.includeProjectedCounts
          ? projectedCountsForIndex(
              queryIndex,
              payload.filterState,
              payload.selectedWorkIds ?? [],
              {
                visibleBrands: payload.visibleBrands,
                companyLimit: payload.companyLimit
              }
            )
          : { filters: {}, brands: {}, yearCounts: {} };
        return {
          id,
          type: 'result',
          workIds: results.map(work => work.workId),
          counts,
          workerDurationMs: elapsed(start)
        };
      } catch (error) {
        return {
          id,
          type: 'error',
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'Error',
            code: error?.code
          }
        };
      }
    }
  });
}
