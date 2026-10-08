import { WORKBENCH_COMPACT_TRANSPORT } from './workbench-compact-transport-config.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { createResourceRequest } from './resource-request.js';
import { decodeWorkbenchTable } from './workbench-table.js';
import { decodeWorkbenchContext } from './workbench-context.js';
import { snapshotSearchText } from './search-text.js';
import { WORK_SEARCH } from './work-search-config.js';
import { loadSearchTextForWorks } from './work-search-data.js';
import { RUNTIME_FEATURES, ENRICHMENT_SIDECAR_SHA256, COMPANY_PROFILE_SIDECAR_SHA256, PRESENTATION_FAMILIES_SIDECAR_SHA256, BANGUMI_PUBLIC_BINDINGS_SHA256 } from './runtime-config.js';

export const WORKBENCH_SCHEMA = 'galpedia-workbench-demand-v1';
export const WORKBENCH_COLUMNS = ['workId','title','displayTitle','furigana','brandId','brandName','releaseDate','workGroupId','filterIds','genreFilterIds','platformFilterId','median','voteCount','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount','externalAdmissionVisible','isCrossSourceAdmission','isNukige','projectedThumbnailPath','projectedPreviewPath','coverWidth','coverHeight','previewWidth','previewHeight'];
// Fixed-shape projection avoids allocating 18 entry pairs for every work before
// structured-cloning the query payload to its worker.
export const workbenchQueryWork = work => ({
  workId:work.workId,title:work.title,furigana:work.furigana,brandId:work.brandId,brandName:work.brandName,
  releaseDate:work.releaseDate,workGroupId:work.workGroupId,filterIds:work.filterIds,genreFilterIds:work.genreFilterIds,
  platformFilterId:work.platformFilterId,median:work.median,voteCount:work.voteCount,egsScore:work.egsScore,
  vndbScore:work.vndbScore,vndbVoteCount:work.vndbVoteCount,bangumiScore:work.bangumiScore,
  bangumiVoteCount:work.bangumiVoteCount,externalAdmissionVisible:work.externalAdmissionVisible
});
export const reviveWorkbench = (_key,value) => value && Object.keys(value).length===1 && Array.isArray(value.__map) ? new Map(value.__map) : value;
export const serializeWorkbench = (_key,value) => value instanceof Map || (value && typeof value.get==='function' && typeof value.entries==='function') ? {__map:[...value.entries()]} : value;
// Only context contains serialized Maps. Do not run a JSON reviver over every
// scalar in the much larger row matrix or over card payloads.
export function restoreWorkbenchContext(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(restoreWorkbenchContext);
  const entries = Object.entries(value);
  if (entries.length === 1 && Array.isArray(value.__map)) {
    return new Map(value.__map.map(([key, item]) => [key, restoreWorkbenchContext(item)]));
  }
  for (const [key, item] of entries) {
    if (item && typeof item === 'object') value[key] = restoreWorkbenchContext(item);
  }
  return value;
}
const shaPattern=/^[a-f0-9]{64}$/u;
const USER_WORK_LIMIT=200;
export function workbenchSourcePins() {
  return {enrichment:ENRICHMENT_SIDECAR_SHA256,companyProfile:COMPANY_PROFILE_SIDECAR_SHA256,families:PRESENTATION_FAMILIES_SIDECAR_SHA256,bangumiBindings:BANGUMI_PUBLIC_BINDINGS_SHA256,...Object.fromEntries(['authorityFanoutV1','vndbRatingsV1','bangumiRatingsV1','bangumiCanonicalAliasFallbackV1'].map(key=>[key,{enabled:RUNTIME_FEATURES[key].enabled,sha256:RUNTIME_FEATURES[key].sha256}]))};
}
const resourceReaders = new WeakMap();
function resourceReader(fetchImpl) {
  if (!resourceReaders.has(fetchImpl)) resourceReaders.set(fetchImpl, createResourceRequest({ fetchImpl }));
  return resourceReaders.get(fetchImpl);
}
export async function readWorkbenchFile(url,hash,options={}) {
  return readWorkbenchBytes(url,hash,{...options,parseJson:true});
}
async function readWorkbenchBytes(url,hash,{fetchImpl=fetch,cryptoRef=crypto,requestResource=resourceReader(fetchImpl),parseJson=false}={}) {
  if(!shaPattern.test(hash)) throw new TypeError('资料清单缺少有效校验值');
  return requestResource(url,{label:'作品资料',validationKey:`${hash}:${parseJson}`,validate:async bytes=>{
    const digest=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==hash) throw new Error('作品资料校验失败，请重试');
    return parseJson ? JSON.parse(new TextDecoder().decode(bytes)) : bytes;
  }});
}
export function validateWorkbenchManifest(m,{sourcePins=workbenchSourcePins()}={}) {
  if(m?.schema!==WORKBENCH_SCHEMA||m.dataRevision!==`wb-${m.sourceDigest}`||!shaPattern.test(m.sourceDigest)||JSON.stringify(m.sourcePins)!==JSON.stringify(sourcePins)||!Number.isInteger(m.count)||m.count<1||!Number.isInteger(m.blockSize)||m.blockSize<1||!Array.isArray(m.shards)||m.shards.length!==Math.ceil(m.count/m.blockSize)) throw new TypeError('作品数据版本或清单格式不兼容');
  for(const descriptor of [m.bootstrap,...m.shards,m.firstPage,...(m.searchText===undefined?[]:[m.searchText]),...(m.workerBootstrap===undefined?[]:[m.workerBootstrap])]) if(!descriptor||!shaPattern.test(descriptor.sha256)||!/^[a-z0-9-]+\.[a-f0-9]{16}\.json$/u.test(descriptor.path)) throw new TypeError('作品分片清单不完整');
  return m;
}
export function createWorkbenchStore(manifest,works,{baseUrl,fetchImpl=fetch,cryptoRef=crypto,maxCached=64,maxRecords=512,concurrency=6,firstPagePromise=null,requestPolicy={}}={}) {
  const requestResource=createResourceRequest({...requestPolicy,fetchImpl});
  const workIds=works.map(work=>typeof work==='string'?work:work.workId);
  if(workIds.some(id=>typeof id!=='string'||!id)||new Set(workIds).size!==manifest.count||workIds.length!==manifest.count)throw new TypeError('作品索引身份重复或数量错误');
  if(!Number.isSafeInteger(maxRecords)||maxRecords<1)throw new TypeError('作品记录缓存容量无效');
  // The shard router needs identity/order only, not the full catalog objects.
  works=null;
  const position=new Map(workIds.map((id,i)=>[id,i])),firstPageIds=new Set(manifest.firstPage.ids),cache=new Map(),pending=new Map(),recordCache=new Map(),queue=[];
  // Keep the selected board's validated source rows separately from the
  // generic 512-record LRU. The fullWiki media wrapper may spread this store;
  // all retained reads therefore stay closure-bound to this original store.
  const retained=new Map();
  let retainedIds=new Set();
  let running=0,firstPromise=null,firstRows=null;
  const run=job=>new Promise((resolve,reject)=>{queue.push({job,resolve,reject});pump();});
  function pump(){while(running<concurrency&&queue.length){const task=queue.shift();running++;Promise.resolve().then(task.job).then(task.resolve,task.reject).finally(()=>{running--;pump();});}}
  const read=d=>readWorkbenchFile(new URL(d.path,baseUrl),d.sha256,{fetchImpl,cryptoRef,requestResource});
  function check(rows,ids){if(!Array.isArray(rows)||rows.length!==ids.length||rows.some((w,i)=>w.workId!==ids[i]))throw new TypeError('作品分片身份或顺序错误');return rows;}
  function cachedRecord(id){
    if(!recordCache.has(id))return null;
    const row=recordCache.get(id);recordCache.delete(id);recordCache.set(id,row);return row;
  }
  function rememberRecords(rows){
    for(const row of rows){
      if(!row||typeof row.workId!=='string')continue;
      recordCache.delete(row.workId);recordCache.set(row.workId,row);
      while(recordCache.size>maxRecords)recordCache.delete(recordCache.keys().next().value);
    }
  }
  function rememberRetained(rows){
    for(const row of rows){
      if(!row||typeof row.workId!=='string'||!retainedIds.has(row.workId))continue;
      retained.delete(row.workId);retained.set(row.workId,row);
    }
  }
  function bucket(n){
    if(cache.has(n)){const rows=cache.get(n);cache.delete(n);cache.set(n,rows);return Promise.resolve(rows);}
    if(pending.has(n))return pending.get(n);
    const task=run(async()=>{const rows=check(await read(manifest.shards[n]),workIds.slice(n*manifest.blockSize,(n+1)*manifest.blockSize));rememberRetained(rows);cache.set(n,rows);while(cache.size>maxCached)cache.delete(cache.keys().next().value);return rows;}).finally(()=>pending.delete(n));
    pending.set(n,task);return task;
  }
  function first(){
    return firstPromise??=(async()=>{const seeded=firstPagePromise;firstPagePromise=null;const rows=check(await (seeded??read(manifest.firstPage)),manifest.firstPage.ids);firstRows=new Map(rows.map(w=>[w.workId,w]));rememberRecords(rows);rememberRetained(rows);return firstRows;})().catch(e=>{firstPromise=null;throw e;});
  }
  return Object.freeze({
    retainWorkIds(ids){
      retainedIds=new Set([...new Set((ids??[]).filter(id=>position.has(id)))].slice(0,USER_WORK_LIMIT));
      for(const id of retained.keys())if(!retainedIds.has(id))retained.delete(id);
      // Do not use `this.peek`: fullWiki wraps this object with a spread and
      // binds methods to the media wrapper. This closure always returns the
      // original, schema-validated source row.
      for(const id of retainedIds){
        const row=retained.get(id)??firstRows?.get(id)??cachedRecord(id)??cache.get(Math.floor(position.get(id)/manifest.blockSize))?.[position.get(id)%manifest.blockSize]??null;
        if(row)retained.set(id,row);
      }
    },
    async get(ids){
      const publicIds=[...new Set(ids.filter(id=>position.has(id)))];
      const unknown=ids.filter(id=>!position.has(id)&&!String(id).startsWith('custom-local-'));if(unknown.length)throw new TypeError('未知作品 '+unknown[0]);
      if(!publicIds.length)return new Map();
      const resolved=new Map(publicIds.filter(id=>retained.has(id)).map(id=>[id,retained.get(id)]));
      const unresolved=publicIds.filter(id=>!resolved.has(id));
      if(!unresolved.length)return new Map(publicIds.map(id=>[id,resolved.get(id)]));
      if(unresolved.every(id=>firstPageIds.has(id))){const rows=await first();return new Map(publicIds.map(id=>[id,resolved.get(id)??rows.get(id)]));}
      const missing=[];
      const firstPagePending=[];
      for(const id of unresolved){
        if(firstPageIds.has(id)){firstPagePending.push(id);continue;}
        const row=cachedRecord(id);if(row){resolved.set(id,row);if(retainedIds.has(id))retained.set(id,row);}else missing.push(id);
      }
      const groups=[...new Set(missing.map(id=>Math.floor(position.get(id)/manifest.blockSize)))];
      // Start the pinned first-page read and non-first-page shard reads in the
      // same turn. A mixed visible page must not discard the prefetched first
      // page merely because one ID came from another shard.
      const firstPagePromise=firstPagePending.length?first():Promise.resolve(null);
      const shardPromise=Promise.all(groups.map(async n=>[n,await bucket(n)]));
      const [firstRowsLoaded,loadedRows]=await Promise.all([firstPagePromise,shardPromise]);
      for(const id of firstPagePending)resolved.set(id,firstRowsLoaded.get(id));
      const loaded=new Map(loadedRows);
      if(!missing.length)return new Map(publicIds.map(id=>[id,resolved.get(id)]));
      const fetched=[];
      for(const id of missing){const row=loaded.get(Math.floor(position.get(id)/manifest.blockSize))[position.get(id)%manifest.blockSize];resolved.set(id,row);fetched.push(row);}
      rememberRecords(fetched);
      rememberRetained(fetched);
      return new Map(publicIds.map(id=>[id,resolved.get(id)]));
    },
    peek(id){return retained.get(id)??firstRows?.get(id)??cachedRecord(id)??cache.get(Math.floor(position.get(id)/manifest.blockSize))?.[position.get(id)%manifest.blockSize]??null;},
    async hydrate(items){const rows=await this.get(items.map(w=>w.workId));return items.map(w=>rows.has(w.workId)?{...rows.get(w.workId),...(w.presentationFamily?{presentationFamily:w.presentationFamily,presentationMemberCount:w.presentationMemberCount}: {})}:w);},
    stats(){return {cached:cache.size,records:recordCache.size,pending:pending.size,running,firstPageLoaded:firstRows!==null,retained:retained.size};}
  });
}
let sharedWorkbench = null;
let sharedHeader = null;
function loadWorkbenchHeader({config,fetchImpl,cryptoRef}) {
  const shared=config===WORKBENCH_DEMAND&&fetchImpl===globalThis.fetch&&cryptoRef===globalThis.crypto;
  const read=async()=>{
    const url=new URL(config.manifestPath,import.meta.url);
    const hint=config.firstPage;
    const canPrefetch=hint&&shaPattern.test(hint.sha256)&&/^first-page\.[a-f0-9]{16}\.json$/u.test(hint.path);
    const early=canPrefetch?readWorkbenchFile(new URL(hint.path,url),hint.sha256,{fetchImpl,cryptoRef}):null;
    early?.catch(()=>{});
    const manifest=validateWorkbenchManifest(await readWorkbenchFile(url,config.sha256,{fetchImpl,cryptoRef}));
    // This is only a transport hint, never a replacement for the pinned
    // manifest or the first-page identity check. A stale hint is discarded.
    const matched=early&&hint.path===manifest.firstPage.path&&hint.sha256===manifest.firstPage.sha256;
    const firstPagePromise=matched?early:readWorkbenchFile(new URL(manifest.firstPage.path,url),manifest.firstPage.sha256,{fetchImpl,cryptoRef});
    firstPagePromise.catch(()=>{});
    return {url,manifest,firstPagePromise};
  };
  if(!shared)return read();
  return sharedHeader??=read().catch(error=>{sharedHeader=null;throw error;});
}
export async function loadWorkbenchLanding({config=WORKBENCH_DEMAND,fetchImpl=fetch,cryptoRef=crypto}={}) {
  if(!config.enabled)return null;
  const {manifest,firstPagePromise}=await loadWorkbenchHeader({config,fetchImpl,cryptoRef});
  const works=await firstPagePromise;
  if(!Array.isArray(works)||works.length!==manifest.firstPage.ids.length||works.some((w,i)=>w.workId!==manifest.firstPage.ids[i]))throw new TypeError('首屏作品身份不一致');
  return {works,manifest};
}
export function preloadWorkbenchData() {
  if (!WORKBENCH_DEMAND.enabled || new URLSearchParams(globalThis.location?.search??'').has('legacyWorkbench')) return Promise.resolve(null);
  return loadWorkbenchData();
}
export async function loadWorkbenchData(options={}) {
  const {legacyLoader,config=WORKBENCH_DEMAND,locationRef=globalThis.location,fetchImpl=fetch,cryptoRef=crypto}=options;
  if(!config.enabled||new URLSearchParams(locationRef?.search??'').has('legacyWorkbench')) return legacyLoader();
  // Only share production-default requests. Injected test loaders stay isolated.
  if (config===WORKBENCH_DEMAND && locationRef===globalThis.location && fetchImpl===globalThis.fetch && cryptoRef===globalThis.crypto) {
    // Worker-side decoding does not need the UI session/client module graph.
    const session=typeof document==='object' ? await import('./workbench-worker-session.js') : null;
    const load = session?.ownedWorkbenchEnabled(locationRef)
      ? async()=>{
        // Start these independent branches together. Waiting for the UI
        // manifest first used to postpone the entire Worker fetch/decode path.
        const [reply,header,{validateWorkbenchUISummary}]=await Promise.all([
          session.loadOwnedWorkbench(),loadWorkbenchHeader({config,fetchImpl,cryptoRef}),
          import('./workbench-ui-summary.js')
        ]);
        if(reply.manifestSha256!==config.sha256)throw new TypeError('查询线程数据版本不一致');
        validateWorkbenchUISummary(reply.uiSummary,header.manifest.count);
        if(reply.uiData?.schema!=='galpedia-owned-ui-v1'||reply.uiData.sample?.works?.length!==0||reply.uiData.ratedDisplayWorks?.length!==0||reply.workbenchBytes)throw new TypeError('查询线程启动数据不兼容');
        return attachWorkbenchStore({...reply.uiData,workerOwned:true,uiSummary:reply.uiSummary},header,{fetchImpl,cryptoRef});
      }
      : ()=>loadDemandPayload({config,fetchImpl,cryptoRef});
    return sharedWorkbench ??= load().catch(error=>{sharedWorkbench=null;throw error;});
  }
  return loadDemandPayload({config,fetchImpl,cryptoRef});
}
async function loadDemandPayload({config,fetchImpl,cryptoRef}) {
  const header=await loadWorkbenchHeader({config,fetchImpl,cryptoRef});
  const {url,manifest}=header;
  const body=await readWorkbenchFile(new URL(manifest.bootstrap.path,url),manifest.bootstrap.sha256,{fetchImpl,cryptoRef});
  return attachWorkbenchStore(decodeWorkbenchPayload(body,manifest),header,{fetchImpl,cryptoRef});
}
// Worker entry point: independently checks the pinned manifest and bootstrap,
// without requesting the first-page cards or creating a UI-side card cache.
export async function loadWorkerWorkbenchSource(source,{config=WORKBENCH_DEMAND,fetchImpl=fetch,cryptoRef=crypto}={}) {
  return (await loadWorkerWorkbenchBundle(source,{config,fetchImpl,cryptoRef})).data;
}
async function readWorkerWorkbenchTransport(source,{config=WORKBENCH_DEMAND,fetchImpl=fetch,cryptoRef=crypto,manifestRequest=null}={}) {
  if(!config.enabled||source?.sha256!==config.sha256)throw new TypeError('查询线程拒绝不匹配的数据版本');
  if(source.media!==undefined&&source.media!=='on-demand-v1')throw new TypeError('查询线程媒体模式不兼容');
  const url=new URL(config.manifestPath,import.meta.url);
  const manifest=validateWorkbenchManifest(await readWorkbenchFile(url,config.sha256,{fetchImpl,cryptoRef,...(manifestRequest?{requestResource:manifestRequest}:{})}));
  const deferred=source.media==='on-demand-v1'&&Boolean(manifest.workerBootstrap);
  let descriptor=deferred?manifest.workerBootstrap:manifest.bootstrap;
  const compact=WORKBENCH_COMPACT_TRANSPORT;
  if(deferred && config.sha256===compact.sourceManifestSha256) {
    const aliasReference=compact.schema==='terminal-wiki-alias-reference-transport-v1';
    const titleReference=compact.schema==='terminal-wiki-display-title-reference-transport-v1' || aliasReference;
    const sourceCompact=titleReference?compact.sourceCompact:compact;
    const sourceValid=sourceCompact && /^worker-compact\.[a-f0-9]{16}\.json$/u.test(sourceCompact.path)
      && shaPattern.test(sourceCompact.sha256) && sourceCompact.path===`worker-compact.${sourceCompact.sha256.slice(0,16)}.json`
      && Number.isSafeInteger(sourceCompact.bytes) && sourceCompact.bytes>0;
    const referencePath=aliasReference ? `../work-query-v3/worker-alias-ref.${compact.sha256?.slice(0,16)}.json` : `../work-query-v2/worker-title-ref.${compact.sha256?.slice(0,16)}.json`;
    const referenceValid=titleReference && compact.path===referencePath
      && shaPattern.test(compact.semanticSha256) && compact.proof
      && /^proof\.[a-f0-9]{16}\.json$/u.test(compact.proof.path) && shaPattern.test(compact.proof.sha256)
      && compact.proof.path===`proof.${compact.proof.sha256.slice(0,16)}.json`
      && Number.isSafeInteger(compact.proof.bytes) && compact.proof.bytes>0;
    if((compact.schema!=='terminal-wiki-compact-worker-transport-v1' && !referenceValid)
      || !sourceValid || descriptor.sha256!==compact.sourceWorkerBootstrapSha256
      || !shaPattern.test(compact.sha256) || !Number.isSafeInteger(compact.bytes) || compact.bytes<1) {
      throw new TypeError('查询线程紧凑传输与原始数据绑定不匹配');
    }
    descriptor=compact;
  }
  const preparedSearch=deferred&&descriptor===compact;
  if(preparedSearch&&(WORK_SEARCH.sourceManifestSha256!==config.sha256||WORK_SEARCH.sourceWorkerSha256!==(compact.sourceCompact?.sha256??compact.sha256)
    ||WORK_SEARCH.rawSha256!==manifest.searchText?.sha256))
    throw new TypeError('预计算搜索来源不匹配');
  // The initial query bundle shares bandwidth with cards and search data.
  // Keep its read budget inside the 60s initialization window without applying
  // the small-resource 15s timeout to a healthy large transfer. Retries and SHA
  // checks remain unchanged; normal interaction requests keep their own limit.
  const requestResource=createResourceRequest({fetchImpl,timeoutMs:30000});
  const readDescriptor=async d=>{
    const value=await readWorkbenchBytes(new URL(d.path,url),d.sha256,{fetchImpl,cryptoRef,requestResource});
    if(descriptor===compact && value.byteLength!==d.bytes)throw new TypeError('紧凑查询数据长度不匹配');
    return value;
  };
  // Optimization failure keeps the original verified carrier available.
  // Source/schema mismatches above never bypass identity checks via fallback.
  const fallback=descriptor===compact && ['terminal-wiki-display-title-reference-transport-v1','terminal-wiki-alias-reference-transport-v1'].includes(compact.schema)
    ?()=>readDescriptor(compact.sourceCompact):null;
  let bytes,usedFallback=false;
  try {bytes=await readDescriptor(descriptor);}
  catch(error) {if(!fallback)throw error;bytes=await fallback();usedFallback=true;}
  return {url,manifest,deferred,preparedSearch,bytes,fallback:usedFallback?null:fallback};
}

// One optional transport per owned Worker, consumed once by normal init.
// It shares the in-flight request, retains no decoded/UI data, and resets on
// failure so a failed hint cannot poison the foreground retry.
export function createWorkerWorkbenchTransportLoader(options={}) {
  let pending=null;
  const entryFor=(source,speculative=false)=>{
    const key=JSON.stringify([source?.sha256,source?.media]);
    if(pending?.key===key)return pending;
    const entry={key,promise:null,speculative};
    // A failed optional manifest read must not install a cooldown in the
    // foreground manifest reader. Its own normal policy remains unchanged.
    const readOptions=speculative?{...options,manifestRequest:createResourceRequest({fetchImpl:options.fetchImpl??globalThis.fetch})}:options;
    entry.promise=readWorkerWorkbenchTransport(source,readOptions).catch(error=>{
      if(pending===entry)pending=null;
      throw error;
    });
    pending=entry;return entry;
  };
  return Object.freeze({prepare:source=>entryFor(source,true).promise,async consume(source){
    let entry=entryFor(source);
    try{
      try{return await entry.promise;}
      catch(error){
        if(!entry.speculative)throw error;
        // An in-flight hint can fail after init starts. Fall back once to the
        // normal foreground read, which keeps all source/size/SHA checks.
        if(pending===entry)pending=null;
        entry=entryFor(source);return await entry.promise;
      }
    }finally{if(pending===entry)pending=null;}
  }});
}
let defaultWorkerTransportLoader;
const workerTransportLoader=()=>defaultWorkerTransportLoader??=createWorkerWorkbenchTransportLoader();
export function prepareWorkerWorkbenchSource(source) {
  // Only the configured query transport can be warmed through a Worker hint.
  if(source?.sha256!==WORKBENCH_DEMAND.sha256||source.media!=='on-demand-v1')return Promise.reject(new TypeError('查询预取源不匹配'));
  return workerTransportLoader().prepare(source);
}
export async function loadWorkerWorkbenchBundle(source,{config=WORKBENCH_DEMAND,fetchImpl=fetch,cryptoRef=crypto}={}) {
  if(!config.enabled||source?.sha256!==config.sha256)throw new TypeError('查询线程拒绝不匹配的数据版本');
  if(source.media!==undefined&&source.media!=='on-demand-v1')throw new TypeError('查询线程媒体模式不兼容');
  const loadRatings=async()=>{
    const splitCards=(await import('./work-full-cards.js')).splitWorkCards();
    if(!splitCards)return {splitCards:null,project:null};
    if(source.ratingRevision)splitCards.pinRevision(source.ratingRevision);
    return {splitCards,project:await splitCards.queryProjection()};
  };
  // Only a UI-selected rating revision can start ahead of the source read.
  // Speculative hints and unpinned callers retain the original selection order.
  const ratingsPromise=source.ratingRevision?loadRatings():null;
  ratingsPromise?.catch(()=>{});
  let {url,manifest,deferred,preparedSearch,bytes,fallback}=config===WORKBENCH_DEMAND&&fetchImpl===globalThis.fetch&&cryptoRef===globalThis.crypto
    ?await workerTransportLoader().consume(source)
    :await readWorkerWorkbenchTransport(source,{config,fetchImpl,cryptoRef});
  // The search carrier is intentionally deferred.  Title search installs it
  // through the worker on first use; ordinary browsing never pays its 4.5 MiB.
  const loadSearchText=preparedSearch?(query="")=>loadSearchTextForWorks(WORK_SEARCH,
    workerData?.ratedDisplayWorks?.map(work=>work.workId)??[],{fetchImpl,cryptoRef,query}):null;
  const decode=value=>{
    const body=JSON.parse(new TextDecoder().decode(value));
    if(deferred&&body.mediaMode!=='on-demand-v1')throw new TypeError('查询线程媒体索引不兼容');
    return decodeWorkbenchPayload(body,manifest,{allowDeferredMedia:deferred,includePersonCatalog:false});
  };
  let workerData;
  try {workerData=decode(bytes);}
  catch(error) {if(!fallback)throw error;bytes=await fallback();workerData=decode(bytes);}
  const {splitCards,project}=await (ratingsPromise??loadRatings());
  if(splitCards){
    const works=workerData.ratedDisplayWorks.map(project);
    workerData.ratedDisplayWorks=works;workerData.sample={...workerData.sample,works,backendIndexes:null};
  }
  if(loadSearchText){workerData.loadSearchText=loadSearchText;workerData.searchCoreAvailable=Boolean(WORK_SEARCH.core);}
  if(deferred){
    workerData.mediaData=createWorkbenchStore(manifest,workerData.ratedDisplayWorks,{baseUrl:url,fetchImpl,cryptoRef});
    if(splitCards)workerData.mediaData=await (await import('./split-work-cards.js')).withSplitRatingWorkData(workerData.mediaData,splitCards);
  }
  return {data:workerData,bytes};
}
export function decodeWorkbenchPayload(body,manifest,{includePersonCatalog=true,allowDeferredMedia=false}={}) {
  if(body.mediaMode!==undefined&&(!allowDeferredMedia||body.mediaMode!=='on-demand-v1'))throw new TypeError('按需媒体索引不能用作完整作品资料');
  if(body.schema!==WORKBENCH_SCHEMA||JSON.stringify(body.columns)!==JSON.stringify(WORKBENCH_COLUMNS)||(body.table&&body.rows))throw new TypeError('作品轻量索引格式错误');
  const works=body.table ? decodeWorkbenchTable(body.table,WORKBENCH_COLUMNS,manifest.count) : body.rows?.map(row=>{if(row.length!==WORKBENCH_COLUMNS.length)throw new TypeError('作品字段数错误');return Object.fromEntries(WORKBENCH_COLUMNS.map((key,i)=>[key,row[i]]));});
  if(!Array.isArray(works)||works.length!==manifest.count)throw new TypeError('作品轻量索引数量错误');
  if (!body.context || typeof body.context !== 'object' || Array.isArray(body.context)) throw new TypeError('作品上下文格式错误');
  if (Object.hasOwn(body.context, 'packedFamilies') || Object.hasOwn(body.context, 'packedDisplayTitles') || Object.hasOwn(body.context, 'packedAliases')) {
    // Packed references contain JSON scalars; restore serialized Maps once.
    const {packedFamilies, packedDisplayTitles, packedAliases, ...plainContext} = body.context;
    body.context = decodeWorkbenchContext({...restoreWorkbenchContext(plainContext),
      ...(Object.hasOwn(body.context,'packedFamilies')?{packedFamilies}:{}),
      ...(Object.hasOwn(body.context,'packedDisplayTitles')?{packedDisplayTitles}:{}),
      ...(Object.hasOwn(body.context,'packedAliases')?{packedAliases}:{})}, works);
  } else body.context = restoreWorkbenchContext(body.context);
  for(const work of works)if(body.fallbackMedia?.[work.workId])Object.assign(work,body.fallbackMedia[work.workId]);
  const sample={...body.sample,brands:body.context.brands,works,backendIndexes:null};
  if(manifest.searchText && body.searchText)throw new TypeError('搜索索引不能同时内嵌和分片');
  return {...body.context,searchText:body.searchText??null,confirmedBangumiImportBindings:body.context.bangumiPublicBindings?.bindings??null,sample,ratedDisplayWorks:works,sampleSource:{...body.context.sampleSource,...(includePersonCatalog?{works:works.map(w=>({...w,companyId:w.brandId}))}:{})}};
}
function attachWorkbenchStore(payload,{url,manifest,firstPagePromise},{fetchImpl,cryptoRef}) {
  const works=payload.workerOwned?payload.uiSummary.workIds:payload.ratedDisplayWorks;
  const workData=createWorkbenchStore(manifest,works,{baseUrl:url,fetchImpl,cryptoRef,firstPagePromise});
  let searchPromise=null;
  const loadSearchText=!payload.workerOwned&&manifest.searchText ? ()=>searchPromise??=readWorkbenchFile(new URL(manifest.searchText.path,url),manifest.searchText.sha256,{fetchImpl,cryptoRef}).then(carrier=>{snapshotSearchText(carrier,works.map(w=>w.workId));return carrier;}).catch(error=>{searchPromise=null;throw error;}) : null;
  return {...payload,loadSearchText,workData};
}
