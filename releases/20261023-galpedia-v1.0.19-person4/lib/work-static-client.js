import {querySearchService,supportsLibraryFilter} from './search-service-client.js';
import {installReviewedTagVocabulary} from './reviewed-tags.js';
import {createCurrentWorkLists,currentListSource} from './current-work-lists.js';
import {splitWorkCards} from './work-full-cards.js';
import {WORK_QUERY_REUSE} from './work-query-reuse-config.js';
import {createQueryReuse} from './work-query-reuse.js';
import {withSplitRatingWorkData} from './split-work-cards.js';
import {withRemoteWorkQueries} from './release-query-client.js';
const remoteConfig={"schema":"galpedia-work-query-http-v1","buildSha":"b83b51376c8c3d98d539fa5f3ca041b0640d713df03967b3604229e09419e8fd","releaseSha":"cf0d653f4f39e4389034c73a0fe016c948c7191daf92049393f55e9ce249a4e2","snapshotDay":"2026-09-15","pageSize":48,"entries":[{"key":"4654dcd0c669d87e70938f217630b6fe6207225af6edafbcd44ee3128759d7c5","filter":{"mode":"basic","titleQuery":"","minimumScore":0,"minimumVoteCount":1,"brandIds":[],"attributeSelections":{"game-type":[],"platform":[],"length":[]},"basicOperator":"AND","positiveFilterIds":[],"excludedFilterIds":[],"excludeNukige":false,"advancedExpression":"","releaseYearStart":1987,"releaseYearEnd":2026,"releaseStatus":"all","sortKey":"releaseDate","sortDirection":"asc","selectedOnly":false,"personIds":[],"personRole":"all"},"total":28480,"validFrom":null,"validUntil":null},{"key":"18e7c7eff53d5c20c076066bc8e948aad8b5f244847c40558a07f6f7a2681d87","filter":{"mode":"basic","titleQuery":"","minimumScore":1,"minimumVoteCount":1,"brandIds":[],"attributeSelections":{"game-type":[],"platform":[],"length":[]},"basicOperator":"AND","positiveFilterIds":[],"excludedFilterIds":[],"excludeNukige":false,"advancedExpression":"","releaseYearStart":1987,"releaseYearEnd":2026,"releaseStatus":"all","sortKey":"releaseDate","sortDirection":"asc","selectedOnly":false,"personIds":[],"personRole":"all"},"total":28456,"validFrom":null,"validUntil":null}],"endpoint":"/api/work-query/v1/page"};
import {loadCompanyWorkFilter} from './company-work-filter-loader.js';
import { WORK_STATIC } from './work-static-config.js';
import { WORK_BROWSE } from './work-browse-config.js';
import { createBrowseStartupData } from './work-browse-data.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { createResourceRequest } from './resource-request.js';
import { createWorkbenchStore, readWorkbenchFile, validateWorkbenchManifest, restoreWorkbenchContext } from './workbench-demand-data.js';
import { validateWorkbenchUISummary } from './workbench-ui-summary.js';
import { withFullWikiWorkMedia } from './full-wiki-work-data.js';
import { WORK_LIST } from './work-list-config.js';
import { WORK_LIST_DELIVERY } from './work-list-delivery-config.js';
import { createWorkListData, getSharedWorkListData, withWorkListData } from './work-list-data.js';
import { WORK_FULL_LIST } from './work-full-list-config.js';
import { selectionPages } from './selection-pages.js';

const same = (a,b) => a===b || (a && b && typeof a==='object' && typeof b==='object'
  && Array.isArray(a)===Array.isArray(b) && Object.keys(a).length===Object.keys(b).length
  && Object.keys(a).every(key=>Object.hasOwn(b,key)&&same(a[key],b[key])));

export {createStaticWorkData} from './work-static-data.js';
import {createStaticWorkData} from './work-static-data.js';

// Default browsing and detail metadata have pinned projections. Any other
// query delegates to the existing complete engine with its original inputs.
function createLocalStaticWorkQueryClient({data,workerFactory,count,sourceSha256,listData=null,prepareCards=null,includeWorkCards=false,ratingProjection=null,currentLists=null}) {
  const globalSearchIntent=Symbol('global-search-intent');
  let serviceQuery=null;
  let nextCards=null,cardStore=null,searchIntentPending=false;
  let real,realPromise,payload,terminated=false,sequence=0,mode=null,virtualRevision=0,activeRevision=null,activeRows=null,disabled=false,engineReady=false;
  const alive=()=>{if(terminated)throw Error('作品查询已结束');};
  const engine=(reviewedTags=false)=>{alive();return realPromise??=Promise.resolve().then(async()=>{real??=await workerFactory();if(terminated){real.terminate();alive();}if(searchIntentPending===globalSearchIntent)real.prepareGlobalSearch?.({workbench:sourceSha256,ratings:ratingProjection?.revision??null});else if(searchIntentPending)real.prepareSearch?.(typeof searchIntentPending==="string"?searchIntentPending:"");await real.init({...payload,includeWorkbenchUI:false,reviewedTags,...(includeWorkCards?{includeWorkCards:true}:{})});engineReady=true;return real;})
    .catch(error=>{realPromise=null;engineReady=false;throw error;});};
  const delegate=async(method,...args)=>(await engine())[method](...args);
  const prepareSearch=(query="")=>{searchIntentPending=query||true;real?.prepareSearch?.(query);};
  const invalidate=()=>{activeRevision=null;activeRows=null;mode='changed';sequence++;};
  return Object.freeze({
    // Start only the compact query engine. Full card pages and list warming
    // remain demand driven so the first interactive render does not wait for
    // the 7.4 MiB all-card bundle.
    start(){alive();return engine();},
    prepareCounts(){alive();return engine(true);},
    preload(){alive();prepareSearch();return delegate('warmSearch');},
    prepareGlobalSearch(){
      alive();searchIntentPending=globalSearchIntent;
      return Promise.resolve().then(async()=>{
        real??=await workerFactory();
        if(terminated){real.terminate();alive();}
        real.prepareGlobalSearch?.({workbench:sourceSha256,ratings:ratingProjection?.revision??null});
        return real;
      });
    },
    prewarmSort(filterState,connection){alive();return ratingProjection?.changed?false:listData?.prewarm(filterState,connection);},
    async init(next){alive();if(next?.workbenchSource?.sha256!==sourceSha256)throw Error('作品查询源不符');payload=next;return {status:'ready',workCount:count};},
    async query(input,{onProgress=()=>{}}={}){
      alive();nextCards=null;const ticket=++sequence;let rows=null;
      if(input.analysisWorkIds===undefined&&input.paged&&!input.includeProjectedCounts&&supportsLibraryFilter(input.filterState)){
        const f=input.filterState,params={q:f.titleQuery,sort:f.sortKey+'-'+f.sortDirection,page:input.pageNumber,pageSize:48};
        const result=await querySearchService('/library',params);
        if(ticket!==sequence)return {status:'stale'};
        const signature=JSON.stringify([params.q,params.sort,result.revision]);
        if(mode!=='service'||serviceQuery?.signature!==signature)virtualRevision++;
        mode='service';activeRevision='service:'+virtualRevision;serviceQuery={params,signature,total:result.page.total};activeRows=null;
        const selected=new Set(input.selectedWorkIds??[]);let selectedCount=0;
        if(selected.size){const ids=[...selected];for(let i=0;i<ids.length;i+=200){const all=await querySearchService('/library-selection',{q:params.q,sort:params.sort,ids:JSON.stringify(ids.slice(i,i+200))});selectedCount+=all.count;if(ticket!==sequence)return {status:'stale'};}}
        if(ticket!==sequence)return {status:'stale'};
        return {...result,page:{...result.page,resultRevision:activeRevision,selectAllState:selectedCount===0?'none':selectedCount===result.page.total?'all':'some',unselectedCount:result.page.total-selectedCount}};
      }

      if(input.analysisWorkIds===undefined&&!disabled&&input.paged&&!input.includeProjectedCounts&&!input.filterState.positiveFilterIds?.length&&!input.filterState.excludedFilterIds?.length&&!input.filterState.excludeNukige&&!input.filterState.advancedExpression?.trim()){
        // A score update invalidates only an explicitly re-proved result ID
        // list. Old cards are never granted by this optional shortcut.
        try{
          const eligible=!ratingProjection?.changed||await ratingProjection.canReuse?.(input.filterState);
          if(ticket!==sequence)return {status:'stale'};
          rows=await currentLists?.query(input.filterState)??null;
          const defaults=!rows&&eligible?await data.defaults():null;
          const preset=defaults&&listData?await listData.query(input.filterState,defaults.filterState):null;
          rows=rows??preset??(defaults&&same(input.filterState,defaults.filterState)?defaults:null);
        }catch{} // A failed optional preset uses the complete, shared engine.
      }
      if(ticket!==sequence)return {status:'stale'};
      if(rows){
        if(!Number.isSafeInteger(input.pageNumber)||input.pageNumber<1)throw Error('作品页码无效');
        const changed=mode!==null&&(mode!=='static'||!same(activeRows?.workIds,rows.workIds));
        if(mode!=='static'||changed)virtualRevision++;
        mode='static';activeRevision=`static:${virtualRevision}`;activeRows=rows;
        const pages=selectionPages(rows.workIds.length);
        const index=changed?0:Math.min(input.pageNumber,pages.length)-1,page=pages[index];
        const compiled=rows.pages.find(row=>row.page.start===page.start&&row.page.end===page.end);
        const row={page:{...page,pageNumber:index+1,pageCount:pages.length,total:rows.workIds.length},listPage:compiled?.listPage};
        const selected=new Set(input.selectedWorkIds??[]),selectedCount=rows.workIds.reduce((n,id)=>n+Number(selected.has(id)),0);
        return {status:'ok',workIds:rows.workIds.slice(row.page.start,row.page.end),counts:rows.counts,
          ...(row.listPage?{listPage:row.listPage}:{}),page:{...row.page,resultRevision:activeRevision,
          selectAllState:selectedCount===0?'none':selectedCount===rows.workIds.length?'all':'some',unselectedCount:rows.workIds.length-selectedCount}};
      }
      // Start the routing index alongside an actual full-engine result query.
      // Filter-count previews and preset lists do not need card transport.
      if(input.paged&&!input.includeProjectedCounts&&prepareCards) Promise.resolve().then(prepareCards).catch(()=>{});
      mode='worker';activeRevision=null;activeRows=null;
      if(!engineReady)onProgress('initializing-search');
      if(input.filterState?.titleQuery)prepareSearch(input.filterState.titleQuery);
      const ready=await engine();
      if(ticket!==sequence)return {status:'stale'};
      onProgress('querying');
      const result=await ready.query(input);
      if(ticket!==sequence)return {status:'stale'};
      if(result.status==='ok'&&result.nextWorkIds?.length)nextCards={ticket,currentIds:result.workIds,ids:result.nextWorkIds,firstPage:result.page?.start===0};
      return result;
    },
    counts:async input=>(await engine(true)).counts(input),
    async listCards(ids,{isCurrent=()=>true}={}){
      alive();const {loadFullWorkCards}=await import('./work-full-cards.js'),store=await loadFullWorkCards(sourceSha256);
      const next=nextCards&&same(ids,nextCards.currentIds)?nextCards:null;
      if(next)nextCards=null;
      cardStore=store;
      const current=store.get(ids,{isCurrent});
      const canWarm=next&&!terminated&&sequence===next.ticket&&!globalThis.navigator?.connection?.saveData&&!/^(?:slow-)?2g$/u.test(globalThis.navigator?.connection?.effectiveType??'');
      // Speculation never holds the visible page. A later query may reuse it,
      // but foreground rendering depends only on the requested cards.
      if(canWarm)void current.then(()=>{
        if(!terminated&&sequence===next.ticket)return store.get(next.ids,{priority:'prefetch',isCurrent:()=>!terminated&&sequence===next.ticket});
      }).catch(()=>{});
      return await current;
    },
    async resultIds(revision){alive();if(mode==='service'){
      if(revision!==activeRevision||!serviceQuery)throw Error('作品结果已变化');
      const query=serviceQuery,ids=[];
      for(let page=1;page<=Math.max(1,Math.ceil(query.total/48));page++){
        const result=await querySearchService('/library',{...query.params,page});
        if(revision!==activeRevision)throw Error('作品结果已变化');ids.push(...result.workIds);
      }return ids;
    }
if(typeof revision==='string'&&revision.startsWith('static:')){
      if(revision!==activeRevision||!activeRows)throw Error('作品结果已变化');return [...activeRows.workIds];
    }if(mode!=='worker')throw Error('作品结果已变化');return delegate('resultIds',revision);},
    async workMetadata(ids,kind){alive();return ['aliases','titles','person-summary'].includes(kind)?data.metadata(ids,kind):delegate('workMetadata',ids,kind);},
    async searchWorks(query){
      if(!disabled){
        real??=await workerFactory();if(terminated){real.terminate();alive();}
        try {
          const rows=await real.searchProjectedWorks?.(query,{workbench:sourceSha256,ratings:ratingProjection?.revision??null});
          if(Array.isArray(rows)&&!disabled)return rows;
        }catch{/* Missing/failed optional projection uses the complete engine. */}
      }
      return delegate('searchWorks',query);
    },companyWorkIds:(id,options)=>delegate('companyWorkIds',id,options),personCatalog:()=>delegate('personCatalog'),
    warmSearch:()=>{prepareSearch();return delegate('warmSearch');},installPersonWorkIndex(value){invalidate();return delegate('installPersonWorkIndex',value);},installSearchText(value){invalidate();return delegate('installSearchText',value);},
    cancelQueries(){alive();sequence++;nextCards=null;cardStore?.prune();real?.cancelQueries?.();},
    update(next){disabled=true;payload=next;invalidate();return delegate('update',{...next,includeWorkbenchUI:false});},
    terminate(){if(terminated)return false;terminated=true;sequence++;real?.terminate();return true;}
  });
}

let sharedWorkbench;
export function getStaticWorkbench(){
  return sharedWorkbench??=loadStaticWorkbench().catch(error=>{sharedWorkbench=null;throw error;});
}
export async function loadStaticWorkbench({fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}) {
  if(WORK_STATIC.sourceManifestSha256!==WORKBENCH_DEMAND.sha256 || WORK_BROWSE.sourceManifestSha256!==WORKBENCH_DEMAND.sha256)throw Error('作品静态源已变化');
  const client=createStaticWorkData({fetchImpl,cryptoRef}),url=new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url);
  const browse=createBrowseStartupData({config:WORK_BROWSE,fetchImpl,cryptoRef});
  const [{uiData,uiSummary},manifest,site]=await Promise.all([browse.startup(),readWorkbenchFile(url,WORKBENCH_DEMAND.sha256,{fetchImpl,cryptoRef}).then(value=>validateWorkbenchManifest(value)),client.manifest()]);
  if(site.startup.sha256!==WORK_BROWSE.sourceStartupSha256)throw Error('浏览投影来源已变化');
  validateWorkbenchUISummary(uiSummary,site.count);
  if(uiData?.schema!=='galpedia-owned-ui-v1'||uiData.sample?.works?.length!==0||uiData.ratedDisplayWorks?.length!==0)throw Error('作品UI投影无效');
  restoreWorkbenchContext(uiData);
  installReviewedTagVocabulary(uiData);
  if(WORK_LIST.sourceManifestSha256!==WORKBENCH_DEMAND.sha256||WORK_LIST.sourceDefaultsSha256!==site.defaults.sha256)throw Error('列表投影来源已变化');
  if(WORK_FULL_LIST.sourceManifestSha256!==WORKBENCH_DEMAND.sha256)throw Error('全库列表来源已变化');
  const legacyLists=createWorkListData({config:WORK_LIST,delivery:WORK_LIST_DELIVERY,fetchImpl,cryptoRef});
  const fullLists=fetchImpl===globalThis.fetch&&cryptoRef===globalThis.crypto?getSharedWorkListData(WORK_FULL_LIST)
    :createWorkListData({config:WORK_FULL_LIST,fetchImpl,cryptoRef,maxCacheBytes:8*1024*1024});
  let fullListsAvailable=true;
  const fullFallback=error=>{fullListsAvailable=false;console.warn('全库预计算列表暂不可用，使用已准备的查询引擎',error);};
  const listData={
    async prepare(){try{await fullLists.prepare();}catch(error){fullFallback(error);}},
    async query(filterState,defaults){
      if(fullListsAvailable){try{const result=await fullLists.query(filterState,WORK_FULL_LIST.filterState);if(result)return result;}catch(error){fullFallback(error);}}
      return legacyLists.query(filterState,defaults);
    },
    prewarm:(filterState,connection)=>fullListsAvailable?fullLists.prewarm(filterState,connection):legacyLists.prewarm(filterState,connection),
    page:(descriptor,ids)=>(fullLists.ownsPage(descriptor)?fullLists:legacyLists).page(descriptor,ids),
    isListCard:work=>fullLists.isListCard(work)||legacyLists.isListCard(work)
  };
  const displayedCards=new WeakSet();let staticQueryClient;
  let workData=withWorkListData(withFullWikiWorkMedia(createWorkbenchStore(manifest,uiSummary.workIds,{baseUrl:url,fetchImpl,cryptoRef}),null),listData,{
    async get(ids,{isCurrent=()=>true}={}){
      if(!isCurrent())throw Error('作品结果已更新');
      const rows=await staticQueryClient.listCards(ids,{isCurrent});
      if(!isCurrent())throw Error('作品结果已更新');
      if(rows.length!==ids.length||rows.some((row,i)=>row.workId!==ids[i]))throw Error('全库卡片响应不符');
      for(const row of rows)displayedCards.add(row);
      return new Map(rows.map(row=>[row.workId,row]));
    },isListCard:work=>displayedCards.has(work)
  });
  const split=splitWorkCards();let ratingProjection=null;
  if(split){
    const splitManifest=await split.manifest();ratingProjection={changed:!splitManifest.legacyQueriesCompatible,revision:split.revision};
    if(ratingProjection.changed){
      const reuse=createQueryReuse({descriptor:WORK_QUERY_REUSE,sourceSha256:WORKBENCH_DEMAND.sha256,
        splitManifest,familySha256:uiData.fullWiki?.familySha256??uiData.presentationFamiliesSource?.sha256,fetchImpl,cryptoRef});
      ratingProjection.canReuse=async filterState=>!splitManifest.reviewedWorkFamilies&&((await reuse.permits('full',WORK_FULL_LIST,filterState))
        ||reuse.permits('egs30',WORK_LIST,filterState));
    }
    workData=await withSplitRatingWorkData(workData,split);
  }
  staticQueryClient=createStaticWorkQueryClient({data:client,listData,ratingProjection,currentLists:createCurrentWorkLists({fetchImpl,cryptoRef,source:{...currentListSource(),ratings:split?.revision}}),count:manifest.count,sourceSha256:WORKBENCH_DEMAND.sha256,includeWorkCards:false,
    workerFactory:async()=> (await import('./workbench-worker-session.js')).getOwnedWorkbenchClient()});
  workData=withFullWikiWorkMedia(workData,null);
  return {...uiData,bangumiPublicBindings:null,confirmedBangumiImportBindings:()=>browse.bindings(),
    // Company projection is large and only needed by company filters and
    // reviewed company work lists. Keep the promise out of startup.
    loadCompanyWorkFilter,
    uiSummary,workerOwned:true,workData,staticQueryClient};
}

export function createStaticWorkQueryClient(options){const local=createLocalStaticWorkQueryClient(options);// A remote snapshot must prove the complete current query projection, not
// merely echo its own old build ID. Legacy September entries lack this proof.
const compatible = typeof options.queryProjectionRevision === 'string'
  && options.queryProjectionRevision === remoteConfig.queryProjectionRevision;
return !compatible || options.ratingProjection?.changed ? local : withRemoteWorkQueries(local,remoteConfig);}
