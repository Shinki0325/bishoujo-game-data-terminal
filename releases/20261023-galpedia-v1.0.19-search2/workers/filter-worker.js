// Register the queue before waiting for the query module graph. An owned init
// can fetch its pinned source in parallel with query/family module loading.
let runtimeReady=null;
const getRuntime=()=>runtimeReady??=import('../lib/filter-worker-runtime.js')
  .then(module=>module.createFilterWorkerRuntime()).catch(error=>{runtimeReady=null;throw error;});
let projectedSearch=null,projectedKey=null;
async function searchProjection(source) {
  const key=JSON.stringify(source);
  if(projectedKey!==key){projectedSearch=null;projectedKey=key;}
  return projectedSearch??=(async()=>{
    const {loadSearchProjection}=await import('../lib/search-projections.js');
    // The exact same matcher can derive its text from complete work/alias
    // records. Avoid downloading a second, redundant full text projection.
    const started=performance.now();
    const minimal=await loadSearchProjection('workMinimal',source);
    if(minimal){
      const {createGalpediaSearch}=await import('../lib/galpedia-search.js');
      // Measure the actual carrier transfer, not a guessed device/network name.
      // Fast links may trade a small bounded fetch for less text preparation;
      // slow links use the same complete matcher directly from source rows.
      const text=performance.now()-started<=1500&&!globalThis.navigator?.connection?.saveData
        ?await loadSearchProjection('workSearch',source,{timeoutMs:2000}):null;
      return createGalpediaSearch({works:minimal.works,companyDirectory:{companies:minimal.companies},
        workSearchText:text?.searchText??null,companySearch:new Map(text?.companyRanks??minimal.companyRanks??[]),loadPersons:async()=>[]});
    }
    const [projection,works]=await Promise.all([
      loadSearchProjection('workSearch',source),loadSearchProjection('workRuntime',source)
    ]);
    if(!projection?.companies||!works){projectedSearch=null;return null;}
    const {createGalpediaSearch}=await import('../lib/galpedia-search.js');
    return createGalpediaSearch({works,companyDirectory:{companies:projection.companies},
      companySearch:new Map(projection.companyRanks),workSearchText:projection.searchText,loadPersons:async()=>[]});
  })().catch(error=>{projectedSearch=null;throw error;});
}
let sourceHandler=null,queue=Promise.resolve(),searchPreparation=null;
const latest=new Map();
async function handle(message) {
  if(message?.type==='projected-work-search') {
    if(typeof message.payload?.query!=='string'||message.payload.query.length>1000)throw Error('invalid work search query');
    try {
      const search=await searchProjection(message.payload.source);
      return {id:message.id,type:'work-search',works:search?(await search(message.payload.query)).works:null};
    } catch {return {id:message.id,type:'work-search',works:null};}
  }
  if(message?.payload?.workbenchSource){
    if(!sourceHandler){
      const source=message.payload.workbenchSource;
      const dataModule=import('../lib/workbench-demand-data.js');
      // Attach rejection handling immediately: module/index preparation must
      // not leave a failed early fetch as an unhandled rejection.
      let firstBundle=dataModule.then(data=>data.loadWorkerWorkbenchBundle(source));
      firstBundle.catch(()=>{});
      sourceHandler=Promise.all([import('../lib/workbench-worker-handler.js'),dataModule,getRuntime()])
        .then(([handler,data,runtime])=>handler.createWorkbenchWorkerHandler({runtime,
          loadSource:next=>{
            if(firstBundle&&next.sha256===source.sha256&&next.media===source.media){const bundle=firstBundle;firstBundle=null;return bundle;}
            return data.loadWorkerWorkbenchBundle(next);
          },projectWork:data.workbenchQueryWork,onData:message=>self.postMessage(message)}))
        .catch(error=>{sourceHandler=null;throw error;});
    }
    return (await sourceHandler)(message);
  }
  return sourceHandler ? (await sourceHandler)(message) : (await getRuntime()).handle(message);
}

self.addEventListener('message', event => {
  if(event.data?.type==='prepare-source'){
    // This hint comes from explicit full-filter initialization, not global
    // search. Preserve parallel module loading for the first library query.
    void getRuntime().catch(()=>{});
    // Raw bytes only. The normal init still selects and verifies its rating
    // revision, decodes the catalog and builds every cross-reference index.
    void import('../lib/workbench-demand-data.js')
      .then(data=>data.prepareWorkerWorkbenchSource(event.data.source)).catch(()=>{});
    return;
  }
  if(event.data?.type==='prepare-global-search'){
    // Global search uses a different carrier from the title/filter surface.
    // Warm only the requested carrier, alongside the same shared engine init.
    void searchProjection(event.data.source).catch(()=>{});
    return;
  }
  if(event.data?.type==='prepare-search'){
    searchPreparation=Promise.all([import('../lib/work-search-data.js'),import('../lib/work-search-config.js')])
      .then(([data,{WORK_SEARCH}])=>data.preparePrecomputedSearchText(WORK_SEARCH,{query:event.data.query||(WORK_SEARCH.core?"__warm__":"")}))
      .catch(()=>{searchPreparation=null;});
    return;
  }
  if(event.data?.type==='cancel-queries'){latest.delete('query');latest.delete('query-counts');return;}
  if(['query','query-counts'].includes(event.data?.type))latest.set(event.data.type,event.data.id);
  if (event.data?.type === 'warm-search') {
    // Owned workspaces use their pinned search carrier; only legacy sources
    // without one need to construct equivalent title/pinyin text locally.
    void (sourceHandler ? sourceHandler.then(handler=>handler(event.data))
      : getRuntime().then(runtime=>runtime.warmSearch(event.data))).then(result => self.postMessage(result))
      .catch(error=>self.postMessage({id:event.data?.id,type:'error',error:{name:error.name,message:error.message}}));
    return;
  }
  queue=queue.then(async()=>{
  if(['query','query-counts'].includes(event.data?.type)){
    await new Promise(resolve=>setTimeout(resolve,0));
    if(latest.get(event.data.type)!==event.data.id){self.postMessage({id:event.data.id,type:'stale'});return;}
  }
  const result = await handle(event.data);
  self.postMessage(result,result.workbenchBytes?[result.workbenchBytes]:[]);
  // Start inside the worker itself: a busy UI thread must not delay the first
  // preparation batch by postponing delivery of the init acknowledgement.
  if (result.type === 'ready' && ['init', 'update'].includes(event.data?.type) && event.data.payload?.prepareSearch === true) {
    void getRuntime().then(runtime=>runtime.warmSearch({id:null}));
  }
  }).catch(error=>self.postMessage({id:event.data?.id,type:'error',error:{name:error.name,message:error.message}}));
});
