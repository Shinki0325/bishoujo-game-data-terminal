import { createFilterWorkerRuntime } from '../lib/filter-worker-runtime.js';

const runtime = createFilterWorkerRuntime();

self.addEventListener('message', event => {
  self.postMessage(runtime.handle(event.data));
});
