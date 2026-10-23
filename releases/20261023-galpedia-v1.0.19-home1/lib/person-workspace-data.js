import { createM2PersonPerformanceRuntime } from './m2-person-performance-runtime.js';
import { DATA_URLS, RUNTIME_DATA_CACHE_MODE } from './runtime-config.js';

let runtime;
export function getPersonWorkspaceRuntime() {
  runtime ??= createM2PersonPerformanceRuntime({
    manifestUrl: DATA_URLS.m2PersonPerformanceManifest,
    indexUrl: DATA_URLS.m2PersonPerformanceIndex,
    cacheMode: RUNTIME_DATA_CACHE_MODE
  });
  return runtime;
}
