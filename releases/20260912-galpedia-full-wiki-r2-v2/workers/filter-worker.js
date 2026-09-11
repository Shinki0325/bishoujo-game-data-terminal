// Register the queue before waiting for the query module graph. An owned init
// can fetch its pinned source in parallel with query/family module loading.
const runtimeReady = import('../lib/filter-worker-runtime.js')
  .then(module=>module.createFilterWorkerRuntime());
runtimeReady.catch(()=>{});
let sourceHandler=null,queue=Promise.resolve();
async function handle(message) {
  if(message?.payload?.workbenchSource){
    if(!sourceHandler){
      const source=message.payload.workbenchSource;
      const dataModule=import('../lib/workbench-demand-data.js');
      // Attach rejection handling immediately: module/index preparation must
      // not leave a failed early fetch as an unhandled rejection.
      let firstBundle=dataModule.then(data=>data.loadWorkerWorkbenchBundle(source));
      firstBundle.catch(()=>{});
      sourceHandler=Promise.all([import('../lib/workbench-worker-handler.js'),dataModule,runtimeReady])
        .then(([handler,data,runtime])=>handler.createWorkbenchWorkerHandler({runtime,
          loadSource:next=>{
            if(firstBundle&&next.sha256===source.sha256&&next.media===source.media){const bundle=firstBundle;firstBundle=null;return bundle;}
            return data.loadWorkerWorkbenchBundle(next);
          },projectWork:data.workbenchQueryWork,onData:message=>self.postMessage(message)}))
        .catch(error=>{sourceHandler=null;throw error;});
    }
    return (await sourceHandler)(message);
  }
  return sourceHandler ? (await sourceHandler)(message) : (await runtimeReady).handle(message);
}

self.addEventListener('message', event => {
  if (event.data?.type === 'warm-search') {
    void runtimeReady.then(runtime=>runtime.warmSearch(event.data)).then(result => self.postMessage(result))
      .catch(error=>self.postMessage({id:event.data?.id,type:'error',error:{name:error.name,message:error.message}}));
    return;
  }
  queue=queue.then(async()=>{
  const result = await handle(event.data);
  self.postMessage(result,result.workbenchBytes?[result.workbenchBytes]:[]);
  // Start inside the worker itself: a busy UI thread must not delay the first
  // preparation batch by postponing delivery of the init acknowledgement.
  if (result.type === 'ready' && ['init', 'update'].includes(event.data?.type) && event.data.payload?.prepareSearch === true) {
    void runtimeReady.then(runtime=>runtime.warmSearch({id:null}));
  }
  }).catch(error=>self.postMessage({id:event.data?.id,type:'error',error:{name:error.name,message:error.message}}));
});
