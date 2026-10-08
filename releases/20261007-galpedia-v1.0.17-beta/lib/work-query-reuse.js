import {createResourceRequest} from './resource-request.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>a===b||Boolean(a&&b&&typeof a==='object'&&typeof b==='object'
  &&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length
  &&Object.keys(a).every(key=>Object.hasOwn(b,key)&&same(a[key],b[key])));
const safeSort=/^(?:voteCount|median|releaseDate)-(?:asc|desc)$/;
const hex=/^[a-f0-9]{64}$/;

// The current producer grants exact result IDs, never old rating/card data.
// A later score batch must renew the grant, even when its narrow dependencies
// are unchanged; an old grant cannot float across an unverified query table.
export function validateQueryReuse(value,{sourceSha256,splitManifest,familySha256}) {
  const source=value?.source;
  check(value?.schema==='galpedia-query-reuse-v1'&&source
    &&source.workbenchSha256===sourceSha256
    &&source.sourceManifestSha256===splitManifest.sourceManifestSha256
    &&source.sourceDirectorySha256===splitManifest.sourceDirectorySha256
    &&source.ratingRevision===splitManifest.ratingRevision
    &&source.queryRatingsSha256===splitManifest.queryRatings.sha256
    &&source.familySha256===familySha256,'预计算依赖版本不符');
  check(hex.test(source.egsDependencySha256)&&Array.isArray(value.grants)&&value.grants.length<=12,'预计算依赖证明无效');
  const seen=new Set();
  for(const row of value.grants) {
    const key=row.group+':'+row.sort;
    check(['full','egs30'].includes(row.group)&&safeSort.test(row.sort)&&!seen.has(key)
      &&hex.test(row.querySha256)&&hex.test(row.idsSha256)&&Number.isSafeInteger(row.total)&&row.total>0
      &&row.filterState?.releaseStatus==='all'&&row.filterState?.selectedOnly===false
      &&same(row.dependencyFields,['workId','median','voteCount','egsScore'])
      &&row.dependencySha256===source.egsDependencySha256,'预计算授权无效');
    seen.add(key);
  }
  return value;
}

export function createQueryReuse({descriptor,sourceSha256,splitManifest,familySha256,
  fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,decompress=globalThis.DecompressionStream,
  requestPolicy={},baseUrl=import.meta.url,connection=globalThis.navigator?.connection}={}) {
  const request=createResourceRequest({timeoutMs:2500,maxAttempts:1,...requestPolicy,fetchImpl});
  let pending;
  const load=()=>pending??=(async()=>{
    check(descriptor&&/^\.\.\/runtime-data\/work-query-reuse-v1\/reuse\.[a-f0-9]{64}\.json\.gz$/.test(descriptor.path)
      &&descriptor.path.includes('.'+descriptor.sha256+'.')&&hex.test(descriptor.sha256)
      &&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&descriptor.bytes<=64*1024
      &&Number.isSafeInteger(descriptor.rawBytes)&&descriptor.rawBytes>0&&descriptor.rawBytes<=256*1024,'预计算凭据描述无效');
    return request(new URL(descriptor.path,baseUrl),{label:'作品列表索引',validationKey:descriptor.sha256,validate:async bytes=>{
      const digest=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      check(bytes.byteLength===descriptor.bytes&&digest===descriptor.sha256,'预计算凭据摘要不符');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
      try {for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;check(length<=descriptor.rawBytes,'预计算凭据解压超限');chunks.push(value);}}
      finally {await reader.cancel().catch(()=>{});}
      check(length===descriptor.rawBytes,'预计算凭据解压不完整');
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      return validateQueryReuse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),{sourceSha256,splitManifest,familySha256});
    }});
  })().catch(error=>{pending=null;throw error;});
  return Object.freeze({async permits(group,config,filterState) {
    // These modes deliberately disable independent engine initialization in
    // main.js. An early ID page would move its startup wait to first search.
    if(connection?.saveData||/^(?:slow-)?2g$/.test(connection?.effectiveType??''))return false;
    const sort=filterState?.sortKey+'-'+filterState?.sortDirection;
    if(!safeSort.test(sort)||!same(filterState,{...config.filterState,sortKey:filterState.sortKey,sortDirection:filterState.sortDirection}))return false;
    const preset=config.queries?.[sort];if(!preset)return false;
    try {const value=await load();return value.grants.some(row=>row.group===group&&row.sort===sort
      &&row.querySha256===preset.sha256&&same(row.filterState,filterState));}
    catch {return false;} // Optional reuse failure always falls back to the full query.
  }});
}
