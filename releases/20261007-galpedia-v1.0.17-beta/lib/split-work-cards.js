// Runtime module installed into the actual immutable candidate by the builder.
// Per-session descriptors pin one complete revision; metadata buckets never
// include rating values or a changing global source digest.
import {createResourceRequest} from './resource-request.js';
const scores=['median','voteCount','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount'];
const ratingFields=new Set([...scores,'vndbRating','bangumiRating','egsSnapshotAt']);
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function createSplitWorkCards(config,{fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,maxCachedBuckets=32,requestPolicy={},bootstrapRequestPolicy=null}={}) {
  check(Number.isInteger(maxCachedBuckets)&&maxCachedBuckets>0&&maxCachedBuckets<=256,'分桶缓存预算无效');
  const base=new URL('./',new URL(config.url,import.meta.url)),request=createResourceRequest({...requestPolicy,fetchImpl});
  const digest=async b=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
  // Routes depend only on IDs in this verified, fixed session directory.
  // Share concurrent hashes and retain their one-byte result (at most count).
  // Metadata and rating validation still compare every row with its SHA route.
  const encoder=new TextEncoder(),routes=new Map(),pendingRoutes=new Map();let knownIds,routeDirectory;
  const bucket=async wid=>{
    check(knownIds?.has(wid),'未知作品分桶');
    if(routeDirectory)return routeDirectory.get(wid);
    if(routes.has(wid))return routes.get(wid);
    if(pendingRoutes.has(wid))return pendingRoutes.get(wid);
    const pending=cryptoRef.subtle.digest('SHA-256',encoder.encode('egs:'+wid)).then(bytes=>{
      const key=new Uint8Array(bytes)[0].toString(16).padStart(2,'0');routes.set(wid,key);return key;
    }).finally(()=>pendingRoutes.delete(wid));
    pendingRoutes.set(wid,pending);return pending;
  };
  // Only revision selection uses a short recovery deadline. Once selected,
  // card reads retain the normal resource timeout and retry policy.
  const bootstrapRequest=bootstrapRequestPolicy?createResourceRequest({...requestPolicy,...bootstrapRequestPolicy,fetchImpl}):request;
  let manifestPromise,tablePromise;const buckets=new Map(),pendingBuckets=new Map();
  // A visible page spans more buckets than the parsed-bucket budget. Keep a
  // bounded, revision-local projection so repeated rendering does not decode
  // and validate the same buckets again. Returned card rows are still cloned.
  const cardRows=new Map(),ratingRowCache=new Map(),prefetchedRows=new Map();
  // One speculative page must not evict the last two actually visited pages.
  // Promotion reuses its complete projection without fetching/decoding again.
  // Budgets are 96 visited rows plus 48 speculative rows, never full records.
  function remember(cache,key,value,limit){
    cache.delete(key);cache.set(key,value);
    while(cache.size>limit)cache.delete(cache.keys().next().value);
    return value;
  }
  async function read(d,{bootstrap=false}={}){
    check(d&&/^[a-z0-9-]+\.[a-f0-9]{64}\.json\.gz$/.test(d.path)&&d.path.includes('.'+d.sha256+'.')
      &&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=4*1024*1024
      &&Number.isSafeInteger(d.rawBytes)&&d.rawBytes>0&&d.rawBytes<=12*1024*1024,'分离资料描述无效');
    return (bootstrap?bootstrapRequest:request)(new URL(d.path,base),{label:'作品资料',validationKey:d.sha256,validate:async bytes=>{
      check(bytes.byteLength===d.bytes&&await digest(bytes)===d.sha256,'分离资料摘要错误');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;check(size<=d.rawBytes,'分离资料解压超限');chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});}
      check(size===d.rawBytes,'分离资料解压长度错误');const raw=new Uint8Array(size);let offset=0;
      for(const c of chunks){raw.set(c,offset);offset+=c.length;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }});
  }
  const manifest=()=>manifestPromise??=read(config,{bootstrap:true}).then(m=>{
    check(m.schema==='galpedia-split-work-cards-v2'&&m.sourceManifestSha256===config.sourceManifestSha256
      &&m.sourceDirectorySha256===config.sourceDirectorySha256&&m.count===config.count&&typeof m.legacyQueriesCompatible==='boolean'
      &&Array.isArray(m.workIds)&&m.workIds.length===m.count&&new Set(m.workIds).size===m.count
      &&m.workIds.every(id=>typeof id==='string'&&/^[1-9][0-9]*$/.test(id)),'分离资料目录不符');
    check(m.legacyQueriesCompatible||/^[a-f0-9]{64}$/.test(m.ratingRevision)
      &&m.ratingRevision===config.ratingRevision,'评分版本不一致');
    for(const family of ['metadata','ratings'])check(m[family]&&Object.keys(m[family]).length<=256
      &&Object.keys(m[family]).every(k=>/^[a-f0-9]{2}$/.test(k)),'分离资料桶无效');
    knownIds=new Set(m.workIds);
    // Optional positions are authenticated by this manifest's SHA. The release
    // validator recomputes every SHA route; runtime verifies each loaded row
    // against the same fixed directory. Older/structurally invalid directories
    // retain native hashing rather than preventing card display.
    routeDirectory=null;
    if(typeof m.sha256Routes==='string'&&m.sha256Routes.length===2*m.count&&/^[a-f0-9]+$/.test(m.sha256Routes)){
      const entries=m.workIds.map((id,i)=>[id,m.sha256Routes.slice(2*i,2*i+2)]);
      if(entries.every(([,k])=>Object.hasOwn(m.metadata,k)&&Object.hasOwn(m.ratings,k)))routeDirectory=new Map(entries);
    }
    return {...m,ids:knownIds};
  }).catch(e=>{manifestPromise=null;throw e;});
  const table=()=>tablePromise??=(async()=>{
    const m=await manifest(),t=await read(m.queryRatings,{bootstrap:true});
    check(t.schema==='galpedia-query-ratings-v2'&&JSON.stringify(t.fields)===JSON.stringify(['workId',...scores])
      &&Array.isArray(t.rows)&&t.rows.length===m.count&&Array.isArray(t.present)&&t.present.length===m.count,'查询评分列错误');
    const raw=t.externalRaw??{};
    check(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).every(id=>m.ids.has(id)),'外部评分目录无效');
    for(const value of Object.values(raw)){
      check(value&&typeof value==='object'&&Object.keys(value).every(k=>['vndb','bangumi'].includes(k)),'外部评分平台无效');
      for(const [platform,r]of Object.entries(value)){
        const field=platform==='vndb'?'rawRating':'rawScore',score=r?.[field],scale=platform==='vndb'?100:10;
        check(r&&Object.keys(r).every(k=>['rawRating','rawScore','voteCount','rawScale','retrievedAt','subjectId','selectionStatus','title'].includes(k)
          &&(r.title===undefined||typeof r.title==='string'&&r.title.length<=4096))
          &&(score===null||typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=scale)
          &&Number.isInteger(r.voteCount)&&r.voteCount>=0&&typeof r.retrievedAt==='string'&&Number.isFinite(Date.parse(r.retrievedAt)), '外部评分原始值无效');
      }
    }
    return new Map(t.rows.map((row,i)=>{
      check(Array.isArray(row)&&row.length===8&&row[0]===m.workIds[i]&&row.slice(1).every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0)
        &&Number.isInteger(t.present[i])&&t.present[i]>=0&&t.present[i]<128,'查询评分身份错误');
      const values=Object.fromEntries(scores.map((f,j)=>[f,row[j+1]]));
      return [row[0],{values,present:t.present[i],externalRaw:raw[row[0]]??null}];
    }));
  })().catch(e=>{tablePromise=null;throw e;});
  async function part(family,k){
    const token=family+k;
    if(buckets.has(token)){const v=buckets.get(token);buckets.delete(token);buckets.set(token,v);return v;}
    if(pendingBuckets.has(token))return pendingBuckets.get(token);
    const pending=(async()=>{
      const m=await manifest(),value=await read(m[family][k]);
      check(value.schema==='galpedia-card-'+family+'-v2'&&value.bucket===k&&Array.isArray(value.rows),'资料桶身份错误');
      const rows=new Map();
      for(const row of value.rows){check(m.ids.has(row.workId)&&!rows.has(row.workId),'资料桶作品错误');
        check(Object.keys(row).every(f=>!['__proto__','constructor','prototype'].includes(f)
          &&(f==='workId'||(family==='metadata'?!ratingFields.has(f):ratingFields.has(f)))),'资料桶字段错误');
        rows.set(row.workId,row);}
      // Preserve every row's SHA route check without a serialized native-crypto
      // round trip per row. Bound each loaded bucket to 16 concurrent checks;
      // the verified directory still bounds the shared route/pending caches.
      for(let start=0;start<value.rows.length;start+=16)
        await Promise.all(value.rows.slice(start,start+16).map(async row=>
          check(await bucket(row.workId)===k,'资料桶作品错误')));
      return rows;
    })().then(rows=>remember(buckets,token,rows,maxCachedBuckets)).finally(()=>pendingBuckets.delete(token));
    pendingBuckets.set(token,pending);
    return pending;
  }
  const project=(work,t,card=false)=>{
    const r=t.get(work.workId);if(!r){check(String(work.workId).startsWith('custom-local-'),'评分目录缺失');return work;}
    return {...work,...Object.fromEntries(scores.flatMap((f,i)=>!card||r.present&2**i?[[f,r.values[f]]]:[])),...(work.fullWikiRatings&&r.externalRaw?{fullWikiRatings:{...work.fullWikiRatings,...r.externalRaw}}:{})};
  };
  async function ratingRows(ids){
    const m=await manifest();check(ids.every(id=>m.ids.has(id)),'未知作品评分');
    const rows=new Map(ids.filter(id=>ratingRowCache.has(id)).map(id=>[id,ratingRowCache.get(id)]));
    const missing=[...new Set(ids.filter(id=>!rows.has(id)))];
    const keys=await Promise.all(missing.map(bucket)),parts=new Map(await Promise.all([...new Set(keys)].map(async k=>[k,await part('ratings',k)])));
    // Hold this request's rows separately: callers may project more than the
    // cache budget (for example an imported board).
    missing.forEach((id,i)=>{const row=parts.get(keys[i]).get(id);check(row,'评分桶缺少作品');rows.set(id,row);});
    return ids.map(id=>remember(ratingRowCache,id,rows.get(id),512));
  }
  return Object.freeze({manifest,revision:config.sha256,
    async bind(ids){const m=await manifest();check(ids.length===m.count&&ids.every((id,i)=>id===m.workIds[i]),'卡片目录与查询不符');},
    async queryProjection(){const t=await table();return work=>project(work,t);},
    async queryRawProjection(){const t=await table();return id=>t.get(id)?.externalRaw??null;},
    async projectRows(rows){const publicRows=rows.filter(w=>!String(w.workId).startsWith('custom-local-'));
      const [raw,t]=await Promise.all([ratingRows(publicRows.map(w=>w.workId)),table()]);const byId=new Map(raw.map(r=>[r.workId,r]));
      return rows.map(w=>{const r=byId.get(w.workId);return r?project({...w,...r,...(w.fullWikiRatings&&r.egsSnapshotAt?{fullWikiRatings:{...w.fullWikiRatings,egsRetrievedAt:r.egsSnapshotAt}}:{})},t,true):w;});},
    async get(ids,{isCurrent=()=>true,priority='foreground'}={}){
      check(Array.isArray(ids)&&ids.length<=48&&new Set(ids).size===ids.length,'卡片请求错误');
      const m=await manifest();check(ids.every(id=>m.ids.has(id)),'未知作品卡片');
      const found=new Map(ids.filter(id=>cardRows.has(id)||prefetchedRows.has(id)).map(id=>[id,cardRows.get(id)??prefetchedRows.get(id)]));
      const missing=ids.filter(id=>!found.has(id));
      if(missing.length){
        const keys=await Promise.all(missing.map(bucket));const parts=new Map(await Promise.all([...new Set(keys)].map(async k=>[k,await part('metadata',k)])));
        const rows=missing.map((id,i)=>{const row=parts.get(keys[i]).get(id);check(row,'资料桶缺少作品');return row;});
        for(const row of await this.projectRows(rows))found.set(row.workId,row);
      }
      if(!isCurrent())throw new DOMException('作品结果已变化','AbortError');
      check(['foreground','prefetch'].includes(priority),'卡片优先级错误');
      const projected=ids.map(id=>{
        const row=found.get(id);
        if(priority==='prefetch'){if(!cardRows.has(id))remember(prefetchedRows,id,row,48);return row;}
        prefetchedRows.delete(id);return remember(cardRows,id,row,96);
      });
      return structuredClone(projected);
    },prune(){},stats:()=>({cachedBuckets:buckets.size,pendingBuckets:pendingBuckets.size,cachedCardRows:cardRows.size,cachedRatingRows:ratingRowCache.size,cachedRoutes:routes.size,directoryRoutes:routeDirectory?.size??0,pendingRoutes:pendingRoutes.size,cachedPrefetchRows:prefetchedRows.size})
  });
}

// Select the usable rating revision before any query or card is exposed.
// A rejected update never changes an already selected session snapshot.
export function createAvailableSplitWorkCards(config,options={}) {
  let selected,pending,usingFallback=false,forcedRevision=null;
  const choose=()=>pending??=(async()=>{
    if(forcedRevision){
      const pinned=forcedRevision===config.sha256?config:config.fallback;
      check(pinned.count===config.count&&pinned.sourceManifestSha256===config.sourceManifestSha256
        &&pinned.sourceDirectorySha256===config.sourceDirectorySha256,'查询线程历史版本目录不符');
      const reader=createSplitWorkCards(pinned,options);await reader.queryProjection();
      selected=reader;usingFallback=pinned!==config;return selected;
    }
    const primary=createSplitWorkCards(config,{...options,bootstrapRequestPolicy:config.fallback?{timeoutMs:2500,maxAttempts:1,...options.requestPolicy}:null});
    try{await primary.queryProjection();selected=primary;return selected;}
    catch(error){
      const fallback=config.fallback;
      if(!fallback)throw error;
      check(fallback.path!==config.path&&fallback.count===config.count
        &&fallback.sourceManifestSha256===config.sourceManifestSha256
        &&fallback.sourceDirectorySha256===config.sourceDirectorySha256,'评分更新不可用且未配置同目录历史版本');
      const previous=createSplitWorkCards(fallback,options);
      await previous.queryProjection();usingFallback=true;selected=previous;
      try{options.onFallback?.({error,revision:previous.revision});}catch{}
      return selected;
    }
  })().catch(error=>{pending=null;throw error;});
  return Object.freeze({
    get revision(){return selected?.revision??config.sha256;},
    get usingFallback(){return usingFallback;},
    pinRevision(revision){
      check(/^[a-f0-9]{64}$/.test(revision)&&(revision===config.sha256||revision===config.fallback?.sha256),'查询线程评分版本不在本次发布中');
      check(!pending||selected?.revision===revision||forcedRevision===revision,'查询线程不能切换已选择的评分版本');forcedRevision=revision;
    },
    manifest:async()=>(await choose()).manifest(),bind:async ids=>(await choose()).bind(ids),
    queryProjection:async()=>(await choose()).queryProjection(),queryRawProjection:async()=>(await choose()).queryRawProjection(),projectRows:async rows=>(await choose()).projectRows(rows),
    get:async(...args)=>(await choose()).get(...args),prune(){selected?.prune();},
    stats:()=>({...selected?.stats(),usingFallback})
  });
}

export async function withSplitRatingWorkData(store,split){
  const project=await split.queryProjection(),cache=new Map();
  const wrapped={...store,ratingDataRevision:split.revision};
  const remember=rows=>{for(const row of rows)cache.set(row.workId,row);while(cache.size>512)cache.delete(cache.keys().next().value);return rows;};
  for(const method of ['get','getList'])if(typeof store[method]==='function')wrapped[method]=async(...args)=>{
    const rows=remember(await split.projectRows([...(await store[method](...args)).values()]));return new Map(rows.map(row=>[row.workId,row]));
  };
  for(const method of ['hydrate','hydrateList'])if(typeof store[method]==='function')wrapped[method]=async(...args)=>remember(await split.projectRows(await store[method](...args)));
  if(store.peek)wrapped.peek=id=>cache.get(id)??(store.peek(id)?project(store.peek(id)):null);
  return Object.freeze(wrapped);
}
