import { createFilterWorkerRuntime } from '../lib/filter-worker-runtime.js?v=20260824-selection-source-sorting-v1';

const runtime = createFilterWorkerRuntime();
let sourceHandler=null,queue=Promise.resolve();
async function handle(message) {
  if(message?.payload?.workbenchSource){
    sourceHandler??=Promise.all([import('../lib/workbench-worker-handler.js'),import('../lib/workbench-demand-data.js')])
      .then(([handler,data])=>handler.createWorkbenchWorkerHandler({runtime,loadSource:data.loadWorkerWorkbenchBundle,projectWork:data.workbenchQueryWork,onData:message=>self.postMessage(message,[message.workbenchBytes])}))
      .catch(error=>{sourceHandler=null;throw error;});
    return (await sourceHandler)(message);
  }
  return runtime.handle(message);
}

self.addEventListener('message', event => {
  if (event.data?.type === 'warm-search') {
    void runtime.warmSearch(event.data).then(result => self.postMessage(result));
    return;
  }
  queue=queue.then(async()=>{
  const result = await handle(event.data);
  self.postMessage(result,result.workbenchBytes?[result.workbenchBytes]:[]);
  // Start inside the worker itself: a busy UI thread must not delay the first
  // preparation batch by postponing delivery of the init acknowledgement.
  if (result.type === 'ready' && ['init', 'update'].includes(event.data?.type) && event.data.payload?.prepareSearch === true) {
    void runtime.warmSearch({id:null});
  }
  }).catch(error=>self.postMessage({id:event.data?.id,type:'error',error:{name:error.name,message:error.message}}));
});
