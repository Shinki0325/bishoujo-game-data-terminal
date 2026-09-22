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

export function createStaticWorkData({config=WORK_STATIC,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,requestPolicy={},maxCacheBytes=32*1024*1024}={}) {
  const manifestUrl=new URL(config.url,import.meta.url),base=new URL('./',manifestUrl);
  const request=createResourceRequest({...requestPolicy,fetchImpl});
  const cache=new Map();let manifestPromise,cacheBytes=0;
  const sha=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const pinned=(url,descriptor,validate)=>{
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||!Number.isSafeInteger(descriptor?.bytes)
      ||descriptor.bytes<1||descriptor.bytes>16*1024*1024||!/^[a-f0-9]{64}$/u.test(descriptor.sha256??''))throw Error('作品静态描述无效');
    return request(url,{label:'作品资料',validationKey:descriptor.sha256,validate:async bytes=>{
      if(bytes.byteLength!==descriptor.bytes||await sha(bytes)!==descriptor.sha256)throw Error('作品静态摘要不符');
      return validate(bytes);
    }});
  };
  const manifest=()=>manifestPromise??=pinned(manifestUrl,config,bytes=>{
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(value.schema!=='galpedia-work-static-manifest-v1'||value.revision!==config.revision
      ||value.sourceManifestSha256!==config.sourceManifestSha256||!Number.isSafeInteger(value.count)||value.count<1
      ||Object.keys(value.metadata??{}).length!==16)throw Error('作品静态清单不符');
    return value;
  }).catch(error=>{manifestPromise=null;throw error;});
  async function read(descriptor,expectedPath) {
    if(descriptor?.path!==expectedPath||!/^(?:startup|default-results|metadata-[0-9a-f])\.json\.gz$/u.test(expectedPath))throw Error('作品静态路径无效');
    if(cache.has(expectedPath)){const entry=cache.get(expectedPath);cache.delete(expectedPath);cache.set(expectedPath,entry);return entry.promise;}
    const entry={bytes:0,promise:null};
    entry.promise=pinned(new URL(expectedPath,base),descriptor,async bytes=>{
      const expected=descriptor.rawBytes;
      if(!Number.isSafeInteger(expected)||expected<1||expected>16*1024*1024||typeof decompress!=='function')throw Error('作品解压预算无效');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>expected)throw Error('作品解压超过预算');chunks.push(value);}
        if(length!==expected)throw Error('作品解压长度不符');
      }finally{await reader.cancel().catch(()=>{});}
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(value.schema!=='galpedia-work-static-v1'||value.revision!==config.revision)throw Error('作品静态版本不符');
      entry.bytes=length;return value;
    }).then(value=>{cacheBytes+=entry.bytes;for(const [key,item]of cache){if(cacheBytes<=maxCacheBytes)break;if(item.bytes){cache.delete(key);cacheBytes-=item.bytes;}}return value;})
      .catch(error=>{cache.delete(expectedPath);throw error;});
    cache.set(expectedPath,entry);return entry.promise;
  }
  return Object.freeze({
    manifest,
    async startup(){const site=await manifest();const value=await read(site.startup,'startup.json.gz');
      validateWorkbenchUISummary(value.uiSummary,site.count);
      if(value.uiData?.schema!=='galpedia-owned-ui-v1'||value.uiData.sample?.works?.length!==0||value.uiData.ratedDisplayWorks?.length!==0)throw Error('作品UI投影无效');
      return {...value,uiData:restoreWorkbenchContext(value.uiData)};
    },
    async defaults(){const site=await manifest(),value=await read(site.defaults,'default-results.json.gz');
      if(!Array.isArray(value.workIds)||new Set(value.workIds).size!==value.workIds.length||!Array.isArray(value.pages)||!value.filterState)throw Error('默认作品结果无效');
      let position=0;
      for(const [i,row]of value.pages.entries()){
        if(row.page?.start!==position||row.page.end<=position||row.page.pageNumber!==i+1||row.page.total!==value.workIds.length
          ||row.page.pageCount!==value.pages.length||!same(row.workIds,value.workIds.slice(position,row.page.end)))throw Error('默认作品分页无效');
        position=row.page.end;
      }
      if(position!==value.workIds.length)throw Error('默认作品分页不完整');return value;
    },
    async metadata(ids,kind){
      if(!['aliases','titles','person-summary'].includes(kind)||!Array.isArray(ids)||ids.length>50000||ids.some(id=>typeof id!=='string'||!/^\d+$/u.test(id)))throw Error('作品元数据请求无效');
      const site=await manifest(),routes=await Promise.all(ids.map(async id=>({id,bucket:(await sha(new TextEncoder().encode(id)))[0]})));
      const groups=await Promise.all([...new Set(routes.map(row=>row.bucket))].map(async bucket=>{
        const value=await read(site.metadata[bucket],`metadata-${bucket}.json.gz`);
        if(value.bucket!==bucket||!value.records)throw Error('作品元数据分块无效');return [bucket,value.records];
      }));
      const records=new Map(groups);
      return routes.map(({id,bucket})=>{
        const row=records.get(bucket)[id];if(row?.workId!==id||!Array.isArray(row.aliases))throw Error('作品元数据身份无效');
        return kind==='aliases'?{workId:id,aliases:[...row.aliases]}:kind==='titles'?{workId:id,title:row.title}:{...row};
      });
    }
  });
}

// Default browsing and detail metadata have pinned projections. Any other
// query delegates to the existing complete engine with its original inputs.
function createLocalStaticWorkQueryClient({data,workerFactory,count,sourceSha256,listData=null,prepareCards=null,includeWorkCards=false}) {
  let nextCards=null,cardStore=null,searchIntentPending=false;
  let real,realPromise,payload,terminated=false,sequence=0,mode=null,virtualRevision=0,activeRevision=null,activeRows=null,disabled=false,engineReady=false;
  const alive=()=>{if(terminated)throw Error('作品查询已结束');};
  const engine=()=>{alive();return realPromise??=Promise.resolve().then(async()=>{real??=await workerFactory();if(terminated){real.terminate();alive();}if(searchIntentPending)real.prepareSearch?.();await real.init({...payload,includeWorkbenchUI:false,...(includeWorkCards?{includeWorkCards:true}:{})});engineReady=true;return real;})
    .catch(error=>{realPromise=null;engineReady=false;throw error;});};
  const delegate=async(method,...args)=>(await engine())[method](...args);
  const prepareSearch=()=>{searchIntentPending=true;real?.prepareSearch?.();};
  const invalidate=()=>{activeRevision=null;activeRows=null;mode='changed';sequence++;};
  return Object.freeze({
    // Start only the compact query engine. Full card pages and list warming
    // remain demand driven so the first interactive render does not wait for
    // the 7.4 MiB all-card bundle.
    start(){alive();return engine();},
    preload(){alive();prepareSearch();return delegate('warmSearch');},
    prewarmSort(filterState,connection){alive();return listData?.prewarm(filterState,connection);},
    async init(next){alive();if(next?.workbenchSource?.sha256!==sourceSha256)throw Error('作品查询源不符');payload=next;return {status:'ready',workCount:count};},
    async query(input,{onProgress=()=>{}}={}){
      alive();nextCards=null;const ticket=++sequence;const defaults=!disabled&&input.paged&&!input.includeProjectedCounts?await data.defaults():null;
      if(ticket!==sequence)return {status:'stale'};
      const preset=defaults&&listData?await listData.query(input.filterState,defaults.filterState):null;
      if(ticket!==sequence)return {status:'stale'};
      const rows=preset??(defaults&&same(input.filterState,defaults.filterState)?defaults:null);
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
      if(input.filterState?.titleQuery||input.filterState?.advancedExpression)prepareSearch();
      const ready=await engine();
      if(ticket!==sequence)return {status:'stale'};
      onProgress('querying');
      const result=await ready.query(input);
      if(ticket!==sequence)return {status:'stale'};
      if(result.status==='ok'&&result.nextWorkIds?.length)nextCards={ticket,currentIds:result.workIds,ids:result.nextWorkIds,firstPage:result.page?.start===0};
      return result;
    },
    counts:input=>delegate('counts',input),
    async listCards(ids,{isCurrent=()=>true}={}){
      alive();const {loadFullWorkCards}=await import('./work-full-cards.js'),store=await loadFullWorkCards(sourceSha256);
      const next=nextCards&&same(ids,nextCards.currentIds)?nextCards:null;
      if(next)nextCards=null;
      cardStore=store;
      const current=store.get(ids,{isCurrent});
      const canWarm=next&&!terminated&&sequence===next.ticket&&!globalThis.navigator?.connection?.saveData&&!/^(?:slow-)?2g$/u.test(globalThis.navigator?.connection?.effectiveType??'');
      // Prepare the adjacent page alongside current cards. On the first page,
      // allow a bounded initialization window so immediate pagination is warm.
      // A failed or very slow speculative fetch cannot indefinitely hold UI.
      const warm=canWarm?store.get(next.ids,{priority:'prefetch',isCurrent:()=>!terminated&&sequence===next.ticket}).catch(()=>{}):null;
      const rows=await current;
      if(warm&&next.firstPage){let timer;try{await Promise.race([warm,new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}finally{clearTimeout(timer);}}
      return rows;
    },
    async resultIds(revision){alive();if(typeof revision==='string'&&revision.startsWith('static:')){
      if(revision!==activeRevision||!activeRows)throw Error('作品结果已变化');return [...activeRows.workIds];
    }if(mode!=='worker')throw Error('作品结果已变化');return delegate('resultIds',revision);},
    async workMetadata(ids,kind){alive();return ['aliases','titles','person-summary'].includes(kind)?data.metadata(ids,kind):delegate('workMetadata',ids,kind);},
    searchWorks:query=>{prepareSearch();return delegate('searchWorks',query);},companyWorkIds:(id,options)=>delegate('companyWorkIds',id,options),personCatalog:()=>delegate('personCatalog'),
    warmSearch:()=>{prepareSearch();return delegate('warmSearch');},installPersonWorkIndex(value){invalidate();return delegate('installPersonWorkIndex',value);},installSearchText(value){invalidate();return delegate('installSearchText',value);},
    cancelQueries(){alive();sequence++;nextCards=null;cardStore?.prune();real?.cancelQueries?.();},
    update(next){disabled=true;payload=next;invalidate();return delegate('update',{...next,includeWorkbenchUI:false});},
    terminate(){if(terminated)return false;terminated=true;sequence++;real?.terminate();return true;}
  });
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
  const workData=withWorkListData(withFullWikiWorkMedia(createWorkbenchStore(manifest,uiSummary.workIds,{baseUrl:url,fetchImpl,cryptoRef}),null),listData,{
    async get(ids,{isCurrent=()=>true}={}){
      if(!isCurrent())throw Error('作品结果已更新');
      const rows=await staticQueryClient.listCards(ids,{isCurrent});
      if(!isCurrent())throw Error('作品结果已更新');
      if(rows.length!==ids.length||rows.some((row,i)=>row.workId!==ids[i]))throw Error('全库卡片响应不符');
      for(const row of rows)displayedCards.add(row);
      return new Map(rows.map(row=>[row.workId,row]));
    },isListCard:work=>displayedCards.has(work)
  });
  staticQueryClient=createStaticWorkQueryClient({data:client,listData,count:manifest.count,sourceSha256:WORKBENCH_DEMAND.sha256,includeWorkCards:false,
    workerFactory:async()=> (await import('./workbench-worker-session.js')).getOwnedWorkbenchClient()});
  return {...uiData,bangumiPublicBindings:null,confirmedBangumiImportBindings:()=>browse.bindings(),
    // Company projection is large and only needed by company filters and
    // reviewed company work lists. Keep the promise out of startup.
    loadCompanyWorkFilter,
    uiSummary,workerOwned:true,workData,staticQueryClient};
}

export function createStaticWorkQueryClient(options){return withRemoteWorkQueries(createLocalStaticWorkQueryClient(options),remoteConfig);}
