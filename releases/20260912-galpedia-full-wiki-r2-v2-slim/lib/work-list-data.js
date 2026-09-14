import { createResourceRequest } from './resource-request.js';

const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sameFields = (a,b) => a && b && Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every(key => Object.hasOwn(b,key) && equal(a[key],b[key]));
const listCard = Symbol('validated-list-card');

// List transport is an exact projection of pinned query results, never a new
// authority for details, selected editions, rankings or complex filters.
export function createWorkListData({config,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,requestPolicy={},maxCacheBytes=4*1024*1024,
  delivery=null,remoteTimeoutMs=2500,remoteCooldownMs=60000,now=Date.now}={}) {
  if(config?.schema!=='galpedia-work-list-config-v1'||config.basePath!=='../runtime-data/work-list-v1/'
    ||!/^[a-f0-9]{64}$/u.test(config.sourceManifestSha256??''))throw Error('列表资料配置无效');
  if(delivery&&(delivery.schema!=='galpedia-work-list-delivery-config-v1'
    ||delivery.sourceManifestSha256!==config.sourceManifestSha256||delivery.minPageNumber!==2
    ||delivery.publicBase!=='https://wiki-assets.bishojo.date/galpedia-static/v1/objects/sha256/'
    ||!delivery.querySha256||Object.entries(delivery.querySha256).some(([sort,sha])=>config.queries?.[sort]?.sha256!==sha)))
    throw Error('列表分发配置无效');
  if(!Number.isFinite(remoteCooldownMs)||remoteCooldownMs<0)throw Error('列表分发冷却无效');
  const request=createResourceRequest({...requestPolicy,fetchImpl}),cache=new Map(),grants=new Map(),remoteGrants=new Map();
  const warmRequest=createResourceRequest({...requestPolicy,maxAttempts:1,cooldownMs:0,
    fetchImpl:(url,init)=>fetchImpl(url,{...init,priority:'low'})});
  const remoteRequest=delivery?createResourceRequest({fetchImpl,timeoutMs:remoteTimeoutMs,maxAttempts:1,cooldownMs:0}):null;
  let cacheBytes=0,remoteRetryAt=0,remoteRequests=0,remoteFallbacks=0,warmed=false,foreground=0;
  function read(descriptor,kind,background=false) {
    const path=descriptor?.path;
    if(!/^(?:query-[A-Za-z]+-(?:asc|desc)|page-[a-f0-9]{64})\.json\.gz$/u.test(path??'')
      ||!path.startsWith(kind+'-')||!/^[a-f0-9]{64}$/u.test(descriptor.sha256??'')
      ||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>1024*1024
      ||!Number.isSafeInteger(descriptor.rawBytes)||descriptor.rawBytes<1||descriptor.rawBytes>4*1024*1024)
      throw Error('列表资料描述无效');
    const key=descriptor.sha256;
    if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry.promise;}
    const entry={bytes:0,promise:null};
    const options={label:'作品列表资料',validationKey:key,
      validate:async bytes=>{
        const hash=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        if(bytes.byteLength!==descriptor.bytes||hash!==key)throw Error('列表资料摘要不符');
        if(typeof decompress!=='function')throw Error('列表解压不可用');
        const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
        try {for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
          if(length>descriptor.rawBytes)throw Error('列表解压超过预算');chunks.push(value);
        }}finally{await reader.cancel().catch(()=>{});}
        if(length!==descriptor.rawBytes)throw Error('列表解压长度不符');
        const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        if(value.schema!=='galpedia-work-list-v1'||value.kind!==kind||value.sourceManifestSha256!==config.sourceManifestSha256)
          throw Error('列表资料来源不符');
        if(kind==='query') {
          if(!sameFields(value.filterState,{...config.filterState,sortKey:value.filterState?.sortKey,sortDirection:value.filterState?.sortDirection})
            ||config.queries?.[`${value.filterState.sortKey}-${value.filterState.sortDirection}`]?.sha256!==key
            ||!Array.isArray(value.workIds)||value.workIds.some(id=>typeof id!=='string'||!/^\d+$/u.test(id))
            ||new Set(value.workIds).size!==value.workIds.length||!Array.isArray(value.pages)||!value.pages.length)
            throw Error('列表查询身份无效');
          let position=0;
          for(const [i,row]of value.pages.entries()) {
            if(row.page?.start!==position||!Number.isSafeInteger(row.page.end)||row.page.end<=position
              ||row.page.end>value.workIds.length||row.page.pageNumber!==i+1||row.page.pageCount!==value.pages.length
              ||row.page.total!==value.workIds.length||row.page.end-position>119)throw Error('列表分页无效');
            position=row.page.end;
          }
          if(position!==value.workIds.length)throw Error('列表分页不完整');
          const first=config.firstPages?.[`${value.filterState.sortKey}-${value.filterState.sortDirection}`];
          if(first&&!sameFields(first,value.pages[0].listPage))throw Error('排序首屏描述不符');
          const remoteQuery=delivery?.querySha256[`${value.filterState.sortKey}-${value.filterState.sortDirection}`]===key;
          for(const row of value.pages){
            grants.set(row.listPage.path,row.listPage);
            remoteGrants.set(row.listPage.path,remoteQuery&&row.page.pageNumber>=delivery.minPageNumber);
          }
        } else {
          if(!Array.isArray(value.works)||value.works.length>119||value.works.some(w=>typeof w?.workId!=='string')
            ||new Set(value.works.map(w=>w.workId)).size!==value.works.length)throw Error('列表卡片身份无效');
          for(const row of value.works)Object.defineProperty(row,listCard,{value:true,enumerable:true});
        }
        entry.bytes=length;return value;
      }};
    entry.promise=Promise.resolve().then(async()=>{
      if(remoteRequest&&kind==='page'&&remoteGrants.get(path)&&now()>=remoteRetryAt){
        remoteRequests++;
        try{return await remoteRequest(new URL(`${key.slice(0,2)}/${key}.json.gz`,delivery.publicBase),options);}
        catch{remoteFallbacks++;remoteRetryAt=now()+remoteCooldownMs;}
      }
      // Both origins must satisfy the same pinned bytes, source and size checks.
      // A failed mirror never changes the query result or selects another release.
      return (background?warmRequest:request)(new URL(config.basePath+path,import.meta.url),options);
    }).then(value=>{
        cacheBytes+=entry.bytes;
        for(const [k,item]of cache){if(cacheBytes<=maxCacheBytes)break;if(item.bytes){cache.delete(k);cacheBytes-=item.bytes;}}
        return value;
      }).catch(error=>{if(cache.get(key)===entry)cache.delete(key);throw error;});
    cache.set(key,entry);return entry.promise;
  }
  return Object.freeze({
    async query(filterState,defaults) {
      foreground++;
      if(!sameFields(defaults,config.filterState))throw Error('列表默认条件来源已变化');
      if(!sameFields(filterState,{...defaults,sortKey:filterState?.sortKey,sortDirection:filterState?.sortDirection}))return null;
      const descriptor=config.queries?.[`${filterState.sortKey}-${filterState.sortDirection}`];
      const first=config.firstPages?.[`${filterState.sortKey}-${filterState.sortDirection}`];
      // Start both pinned files now; only a validated query grants display access.
      if(descriptor&&first)void Promise.resolve().then(()=>read(first,'page')).catch(()=>{});
      return descriptor?read(descriptor,'query'):null;
    },
    async prewarm(filterState,connection=globalThis.navigator?.connection) {
      if(warmed||connection?.saveData||/^(slow-2g|2g|3g)$/u.test(connection?.effectiveType??'')
        ||!sameFields(filterState,{...config.filterState,sortKey:filterState?.sortKey,sortDirection:filterState?.sortDirection}))return false;
      const sort=filterState.sortKey==='median'?'vndbScore-desc':'median-desc';
      const q=config.queries?.[sort],p=config.firstPages?.[sort];
      if(!q||!p||q.bytes+p.bytes>64*1024)return false;
      warmed=true;const ticket=foreground;
      await read(q,'query',true);
      if(ticket!==foreground)return false;
      await read(p,'page',true);return true;
    },
    async page(descriptor,ids) {
      if(!sameFields(grants.get(descriptor?.path),descriptor))throw Error('列表页面未获查询授权');
      const value=await read(descriptor,'page');
      if(!equal(value.works.map(w=>w.workId),ids))throw Error('列表页面次序不符');
      return new Map(value.works.map(w=>[w.workId,w]));
    },
    isListCard:work=>work?.[listCard]===true,
    stats:()=>({cacheBytes,cached:cache.size,remoteRequests,remoteFallbacks,remoteRetryAt})
  });
}

export function withWorkListData(full,list,cards=null) {
  const isListCard = work => list.isListCard(work) || cards?.isListCard(work) === true;
  return Object.freeze({...full,
    getList(ids,{listPage,isCurrent}={}) {return listPage?list.page(listPage,ids):cards?cards.get(ids,{isCurrent}):full.getList(ids);},
    async hydrateList(works) {
      const missing=works.filter(work=>!isListCard(work));
      if(!missing.length)return works;
      const rows=await full.hydrate(missing),byId=new Map(rows.map(row=>[row.workId,row]));
      return works.map(work=>isListCard(work)?work:byId.get(work.workId)??work);
    }
  });
}
