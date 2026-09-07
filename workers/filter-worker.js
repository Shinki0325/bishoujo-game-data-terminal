import { createFilterWorkerRuntime } from '../lib/filter-worker-runtime.js?v=20260824-selection-source-sorting-v1';

const runtime = createFilterWorkerRuntime();

self.addEventListener('message', event => {
  if (event.data?.type === 'warm-search') {
    void runtime.warmSearch(event.data).then(result => self.postMessage(result));
    return;
  }
  const result = runtime.handle(event.data);
  self.postMessage(result);
  // Start inside the worker itself: a busy UI thread must not delay the first
  // preparation batch by postponing delivery of the init acknowledgement.
  if (result.type === 'ready' && ['init', 'update'].includes(event.data?.type) && event.data.payload?.prepareSearch === true) {
    void runtime.warmSearch({id:null});
  }
});
