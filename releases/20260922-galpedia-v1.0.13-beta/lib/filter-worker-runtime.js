import {
  createQueryIndex,
  installQuerySearchText,
  installQueryPersonWorkIndex,
  warmQuerySearchText,
  projectedCountsForIndex,
  queryIndexedCatalog
} from './query-index.js';

function elapsed(start) {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now() - start
    : 0;
}

const MAX_QUERY_CACHE_ENTRIES = 8;
const EMPTY_COUNTS = Object.freeze({
  filters: Object.freeze({}),
  brands: Object.freeze({}),
  yearCounts: Object.freeze({}),
  yearRangeGroups: Object.freeze([]),
  yearUniverseCount: 0
});

function freezeCounts(counts) {
  if (counts === EMPTY_COUNTS) return counts;
  const yearRangeGroups = Array.isArray(counts?.yearRangeGroups)
    ? counts.yearRangeGroups.map(group => Object.freeze([...group]))
    : [];
  return Object.freeze({
    filters: Object.freeze({ ...(counts?.filters ?? {}) }),
    brands: Object.freeze({ ...(counts?.brands ?? {}) }),
    yearCounts: Object.freeze({ ...(counts?.yearCounts ?? {}) }),
    yearRangeGroups: Object.freeze(yearRangeGroups),
    yearUniverseCount: Number.isSafeInteger(counts?.yearUniverseCount)
      ? counts.yearUniverseCount : 0
  });
}

function queryCacheKey(payload) {
  // Deliberately preserve array order. Two differently ordered query inputs
  // must miss independently; a hit is valid only for the complete carrier.
  return JSON.stringify({
    filterState: payload.filterState,
    selectedWorkIds: payload.selectedWorkIds ?? [],
    includeProjectedCounts: Boolean(payload.includeProjectedCounts),
    visibleBrands: payload.visibleBrands === undefined
      ? {__undefined: true} : payload.visibleBrands,
    companyLimit: payload.companyLimit === undefined
      ? {__undefined: true} : payload.companyLimit,
    visibleFilterIds:payload.visibleFilterIds,
    // Release status/date matching is defined against the current UTC day.
    // Prevent a long-lived worker from reusing yesterday's future/released
    // classification after midnight UTC.
    utcDay: Math.floor(Date.now() / 86400000)
  });
}

function createQueryCache() {
  const entries = new Map();
  return {
    clear() { entries.clear(); },
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > MAX_QUERY_CACHE_ENTRIES) {
        entries.delete(entries.keys().next().value);
      }
    },
    size() { return entries.size; }
  };
}

export function createFilterWorkerRuntime() {
  let queryIndex = null;
  const queryCache = createQueryCache();

  return Object.freeze({
    async warmSearch(message) {
      const index = queryIndex;
      try {
        if (index === null) throw new Error('filter worker has not been initialized');
        await warmQuerySearchText(index, {cancelled:() => queryIndex !== index});
        return {id:message.id, type:'ready', workCount:index.works.length};
      } catch (error) {
        return {id:message.id, type:'error', error:{message:error.message, name:error.name}};
      }
    },
    handle(message) {
      const { id = null, type, payload = {} } = message ?? {};
      try {
        if (type === 'init') {
          const nextIndex = createQueryIndex(payload);
          queryIndex = nextIndex;
          queryCache.clear();
          return { id, type: 'ready', workCount: queryIndex.works.length };
        }
        if (type === 'update') {
          const nextIndex = createQueryIndex(payload);
          queryIndex = nextIndex;
          queryCache.clear();
          return { id, type: 'ready', workCount: queryIndex.works.length };
        }
        if (queryIndex === null) throw new Error('filter worker has not been initialized');
        if (type === 'person-index') {
          installQueryPersonWorkIndex(queryIndex, payload.personWorkIndex);
          queryCache.clear();
          return { id, type: 'ready', workCount: queryIndex.works.length };
        }
        if (type === 'search-text') {
          installQuerySearchText(queryIndex, payload.searchText);
          queryCache.clear();
          return { id, type: 'ready', workCount: queryIndex.works.length };
        }
        if (!['query','query-counts'].includes(type)) throw new Error(`unsupported filter worker message: ${String(type)}`);
        const preview=type==='query-counts';
        const queryPayload=preview?{...payload,filterState:{...payload.filterState,sortKey:'voteCount',sortDirection:'desc'},includeProjectedCounts:true}:payload;

        const start = typeof performance === 'object' && typeof performance.now === 'function'
          ? performance.now()
          : 0;
        if(preview&&payload.personWorkIndex){installQueryPersonWorkIndex(queryIndex,payload.personWorkIndex);queryCache.clear();}
        const key = (preview?'counts:':'query:')+queryCacheKey(queryPayload);
        const cached = queryCache.get(key);
        if (cached !== undefined) {
          return {
            id,
            type: preview?'counts':'result',
            ...(preview?{total:cached.workIds.length}:{}),
            workIds: cached.workIds,
            counts: cached.counts,
            cacheHit: true,
            workerDurationMs: elapsed(start)
          };
        }
        const results = queryIndexedCatalog(
          queryIndex,
          queryPayload.filterState,
          queryPayload.selectedWorkIds ?? []
        );
        const counts = queryPayload.includeProjectedCounts
          ? projectedCountsForIndex(
              queryIndex,
              queryPayload.filterState,
              queryPayload.selectedWorkIds ?? [],
              {
                visibleBrands: payload.visibleBrands,
                companyLimit: payload.companyLimit
                ,...(preview?{visibleFilterIds:payload.visibleFilterIds??[]}: {})
              }
            )
          : EMPTY_COUNTS;
        const entry = Object.freeze({
          workIds: Object.freeze(results.map(work => work.workId)),
          counts: freezeCounts(counts)
        });
        queryCache.set(key, entry);
        return {
          id,
          type: preview?'counts':'result',
          ...(preview?{total:entry.workIds.length}:{}),
          workIds: entry.workIds,
          counts: entry.counts,
          cacheHit: false,
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
