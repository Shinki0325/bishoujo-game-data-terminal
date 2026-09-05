import { createFilterWorkerRuntime } from '../lib/filter-worker-runtime.js?v=20260824-selection-source-sorting-v1';

const runtime = createFilterWorkerRuntime();

self.addEventListener('message', event => {
  self.postMessage(runtime.handle(event.data));
});
