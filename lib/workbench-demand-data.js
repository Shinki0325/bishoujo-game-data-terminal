import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { decodeWorkbenchTable } from './workbench-table.js';
import { RUNTIME_FEATURES, ENRICHMENT_SIDECAR_SHA256, COMPANY_PROFILE_SIDECAR_SHA256, PRESENTATION_FAMILIES_SIDECAR_SHA256, BANGUMI_PUBLIC_BINDINGS_SHA256 } from './runtime-config.js';

export const WORKBENCH_SCHEMA = 'galpedia-workbench-demand-v1';
export const WORKBENCH_COLUMNS = ['workId','title','displayTitle','furigana','brandId','brandName','releaseDate','workGroupId','filterIds','genreFilterIds','platformFilterId','median','voteCount','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount','externalAdmissionVisible','isCrossSourceAdmission','isNukige','projectedThumbnailPath','projectedPreviewPath','coverWidth','coverHeight','previewWidth','previewHeight'];
const QUERY_FIELDS = ['workId','title','furigana','brandId','brandName','releaseDate','workGroupId','filterIds','genreFilterIds','platformFilterId','median','voteCount','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount','externalAdmissionVisible'];
export const workbenchQueryWork = work => Object.fromEntries(QUERY_FIELDS.map(key=>[key,work[key]]));
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
export function workbenchSourcePins() {
  return {enrichment:ENRICHMENT_SIDECAR_SHA256,companyProfile:COMPANY_PROFILE_SIDECAR_SHA256,families:PRESENTATION_FAMILIES_SIDECAR_SHA256,bangumiBindings:BANGUMI_PUBLIC_BINDINGS_SHA256,...Object.fromEntries(['authorityFanoutV1','vndbRatingsV1','bangumiRatingsV1','bangumiCanonicalAliasFallbackV1'].map(key=>[key,{enabled:RUNTIME_FEATURES[key].enabled,sha256:RUNTIME_FEATURES[key].sha256}]))};
}
export async function readWorkbenchFile(url,hash,{fetchImpl=fetch,cryptoRef=crypto}={}) {
  if(!shaPattern.test(hash)) throw new TypeError('资料清单缺少有效校验值');
  const res=await fetchImpl(url,{cache:'force-cache'});
  if(!res.ok) throw new Error(`作品资料读取失败 (${res.status})`);
  const bytes=await res.arrayBuffer();
  const digest=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==hash) throw new Error('作品资料校验失败，请重试');
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function validateWorkbenchManifest(m,{sourcePins=workbenchSourcePins()}={}) {
  if(m?.schema!==WORKBENCH_SCHEMA||m.dataRevision!==`wb-${m.sourceDigest}`||!shaPattern.test(m.sourceDigest)||JSON.stringify(m.sourcePins)!==JSON.stringify(sourcePins)||!Number.isInteger(m.count)||m.count<1||!Number.isInteger(m.blockSize)||m.blockSize<1||!Array.isArray(m.shards)||m.shards.length!==Math.ceil(m.count/m.blockSize)) throw new TypeError('作品数据版本或清单格式不兼容');
  for(const descriptor of [m.bootstrap,...m.shards,m.firstPage]) if(!descriptor||!shaPattern.test(descriptor.sha256)||!/^[a-z0-9-]+\.[a-f0-9]{16}\.json$/u.test(descriptor.path)) throw new TypeError('作品分片清单不完整');
  return m;
}
export function createWorkbenchStore(manifest,works,{baseUrl,fetchImpl=fetch,cryptoRef=crypto,maxCached=64,concurrency=6,firstPagePromise=null}={}) {
  if(new Set(works.map(w=>w.workId)).size!==manifest.count||works.length!==manifest.count)throw new TypeError('作品索引身份重复或数量错误');
  const position=new Map(works.map((w,i)=>[w.workId,i])),cache=new Map(),pending=new Map(),queue=[];
  let running=0,firstPromise=null,firstRows=null;
  const run=job=>new Promise((resolve,reject)=>{queue.push({job,resolve,reject});pump();});
  function pump(){while(running<concurrency&&queue.length){const task=queue.shift();running++;Promise.resolve().then(task.job).then(task.resolve,task.reject).finally(()=>{running--;pump();});}}
  const read=d=>readWorkbenchFile(new URL(d.path,baseUrl),d.sha256,{fetchImpl,cryptoRef});
  function check(rows,ids){if(!Array.isArray(rows)||rows.length!==ids.length||rows.some((w,i)=>w.workId!==ids[i]))throw new TypeError('作品分片身份或顺序错误');return rows;}
  function bucket(n){
    if(cache.has(n)){const rows=cache.get(n);cache.delete(n);cache.set(n,rows);return Promise.resolve(rows);}
    if(pending.has(n))return pending.get(n);
    const task=run(async()=>{const rows=check(await read(manifest.shards[n]),works.slice(n*manifest.blockSize,(n+1)*manifest.blockSize).map(w=>w.workId));cache.set(n,rows);while(cache.size>maxCached)cache.delete(cache.keys().next().value);return rows;}).finally(()=>pending.delete(n));
    pending.set(n,task);return task;
  }
  function first(){
    return firstPromise??=(async()=>{const seeded=firstPagePromise;firstPagePromise=null;const rows=check(await (seeded??read(manifest.firstPage)),manifest.firstPage.ids);firstRows=new Map(rows.map(w=>[w.workId,w]));return firstRows;})().catch(e=>{firstPromise=null;throw e;});
  }
  return Object.freeze({
    async get(ids){
      const publicIds=[...new Set(ids.filter(id=>position.has(id)))];
      const unknown=ids.filter(id=>!position.has(id)&&!String(id).startsWith('custom-local-'));if(unknown.length)throw new TypeError('未知作品 '+unknown[0]);
      if(!publicIds.length)return new Map();
      if(publicIds.every(id=>manifest.firstPage.ids.includes(id))){const rows=await first();return new Map(publicIds.map(id=>[id,rows.get(id)]));}
      const groups=[...new Set(publicIds.map(id=>Math.floor(position.get(id)/manifest.blockSize)))];
      const loaded=new Map(await Promise.all(groups.map(async n=>[n,await bucket(n)])));
      return new Map(publicIds.map(id=>[id,loaded.get(Math.floor(position.get(id)/manifest.blockSize))[position.get(id)%manifest.blockSize]]));
    },
    peek(id){return firstRows?.get(id)??cache.get(Math.floor(position.get(id)/manifest.blockSize))?.[position.get(id)%manifest.blockSize]??null;},
    async hydrate(items){const rows=await this.get(items.map(w=>w.workId));return items.map(w=>rows.has(w.workId)?{...rows.get(w.workId),...(w.presentationFamily?{presentationFamily:w.presentationFamily,presentationMemberCount:w.presentationMemberCount}: {})}:w);},
    stats(){return {cached:cache.size,pending:pending.size,running,firstPageLoaded:firstRows!==null};}
  });
}
let sharedWorkbench = null;
let sharedHeader = null;
function loadWorkbenchHeader({config,fetchImpl,cryptoRef}) {
  const shared=config===WORKBENCH_DEMAND&&fetchImpl===globalThis.fetch&&cryptoRef===globalThis.crypto;
  const read=async()=>{
    const url=new URL(config.manifestPath,import.meta.url);
    const manifest=validateWorkbenchManifest(await readWorkbenchFile(url,config.sha256,{fetchImpl,cryptoRef}));
    const firstPagePromise=readWorkbenchFile(new URL(manifest.firstPage.path,url),manifest.firstPage.sha256,{fetchImpl,cryptoRef});
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
    return sharedWorkbench ??= loadDemandPayload({config,fetchImpl,cryptoRef}).catch(error=>{sharedWorkbench=null;throw error;});
  }
  return loadDemandPayload({config,fetchImpl,cryptoRef});
}
async function loadDemandPayload({config,fetchImpl,cryptoRef}) {
  const {url,manifest,firstPagePromise}=await loadWorkbenchHeader({config,fetchImpl,cryptoRef});
  const body=await readWorkbenchFile(new URL(manifest.bootstrap.path,url),manifest.bootstrap.sha256,{fetchImpl,cryptoRef});
  if(body.schema!==WORKBENCH_SCHEMA||JSON.stringify(body.columns)!==JSON.stringify(WORKBENCH_COLUMNS)||(body.table&&body.rows))throw new TypeError('作品轻量索引格式错误');
  body.context = restoreWorkbenchContext(body.context);
  const works=body.table ? decodeWorkbenchTable(body.table,WORKBENCH_COLUMNS,manifest.count) : body.rows?.map(row=>{if(row.length!==WORKBENCH_COLUMNS.length)throw new TypeError('作品字段数错误');return Object.fromEntries(WORKBENCH_COLUMNS.map((key,i)=>[key,row[i]]));});
  if(!Array.isArray(works)||works.length!==manifest.count)throw new TypeError('作品轻量索引数量错误');
  for(const work of works)if(body.fallbackMedia?.[work.workId])Object.assign(work,body.fallbackMedia[work.workId]);
  const sample={...body.sample,brands:body.context.brands,works,backendIndexes:null};
  const workData=createWorkbenchStore(manifest,works,{baseUrl:url,fetchImpl,cryptoRef,firstPagePromise});
  return {...body.context,searchText:body.searchText??null,confirmedBangumiImportBindings:body.context.bangumiPublicBindings?.bindings??null,sample,ratedDisplayWorks:works,sampleSource:{...body.context.sampleSource,works:works.map(w=>({...w,companyId:w.brandId}))},workData};
}
