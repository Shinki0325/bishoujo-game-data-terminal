import { createResourceRequest } from './resource-request.js';
import { createResourcePriorityQueue } from './resource-priority-queue.js';

// One cache per source/release. Concurrent pages share verified shard reads;
// display-only queries do not need to initialize the full filtering Worker.
export function createShardedWorkCards(config, {
  fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,maxCacheBytes=32*1024*1024,
  requestPolicy={},concurrency=8
}={}) {
  if(!Number.isSafeInteger(maxCacheBytes)||maxCacheBytes<1||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>16)throw Error('卡片缓存预算无效');
  const url=new URL(config.shards.url,import.meta.url),base=new URL('./',url);
  const request=createResourceRequest({fetchImpl,...requestPolicy});
  const cache=new Map(),scheduler=createResourcePriorityQueue({concurrency,prefetchConcurrency:Math.min(4,concurrency)});let manifestPending,cacheBytes=0;
  const sha=async value=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',value)),n=>n.toString(16).padStart(2,'0')).join('');
  async function read(descriptor,target){
    if(!/^[a-z0-9-]+\.[a-f0-9]{64}\.json\.gz$/u.test(descriptor.path)||target.origin!==base.origin||!target.pathname.startsWith(base.pathname)
      ||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>2*1024*1024
      ||!Number.isSafeInteger(descriptor.rawBytes)||descriptor.rawBytes<1||descriptor.rawBytes>4*1024*1024
      ||!/^[a-f0-9]{64}$/u.test(descriptor.sha256))throw Error('卡片分片描述无效');
    return request(target,{label:'作品卡片',validationKey:descriptor.sha256,validate:async packed=>{
      if(packed.byteLength!==descriptor.bytes||await sha(packed)!==descriptor.sha256)throw Error('卡片分片摘要不符');
      const reader=new Blob([packed]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>descriptor.rawBytes)throw Error('卡片解压超过预算');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      if(length!==descriptor.rawBytes)throw Error('卡片解压长度不符');const raw=new Uint8Array(length);let at=0;for(const part of chunks){raw.set(part,at);at+=part.length;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }});
  }
  function validateManifest(value){
    if(value.schema!=='galpedia-work-card-shards-v1'||value.sourceManifestSha256!==config.sourceManifestSha256
      ||value.sourceDirectorySha256!==config.sourceDirectorySha256||value.count!==config.count
      ||value.shardSize!==128||!Array.isArray(value.fields)||value.fields.length<1||value.fields.length>31
      ||value.fields.some(f=>typeof f!=='string'||['__proto__','prototype','constructor'].includes(f))||new Set(value.fields).size!==value.fields.length
      ||!value.fields.includes('workId')||!Array.isArray(value.workIds)||value.workIds.length!==config.count
      ||value.workIds.some(id=>typeof id!=='string'||!/^\d+$/u.test(id))||new Set(value.workIds).size!==config.count
      ||!Array.isArray(value.shards)||value.shards.length!==Math.ceil(config.count/value.shardSize))throw Error('卡片目录身份不符');
    const seen=new Set();for(const [i,d] of value.shards.entries()){
      if(d.count!==Math.min(value.shardSize,config.count-i*value.shardSize)||!d.path?.startsWith('part-'+i+'.')||seen.has(d.path))throw Error('卡片分片范围不符');seen.add(d.path);
    }
    return {...value,positions:new Map(value.workIds.map((id,i)=>[id,i]))};
  }
  const manifest=()=>manifestPending??=read(config.shards,url).then(validateManifest).catch(error=>{manifestPending=null;throw error;});
  function trim(){for(const [key,entry] of cache){if(cacheBytes<=maxCacheBytes)break;if(entry.bytes){cache.delete(key);cacheBytes-=entry.bytes;}}}
  function shard(index,m,options){
    const previous=cache.get(index);if(previous){cache.delete(index);if(!previous.job||previous.job.join(options)){cache.set(index,previous);return previous.promise;}}
    const descriptor=m.shards[index],entry={bytes:0,promise:null};
    entry.job=scheduler.schedule(()=>read(descriptor,new URL(descriptor.path,base)),options);
    entry.promise=entry.job.promise.then(value=>{
      if(value.schema!=='galpedia-work-card-shard-v1'||value.sourceManifestSha256!==config.sourceManifestSha256||value.index!==index
        ||!Array.isArray(value.rows)||value.rows.length!==descriptor.count)throw Error('卡片分片身份不符');
      const rows=new Map();for(const [i,row] of value.rows.entries()){
        if(!Array.isArray(row)||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=2**m.fields.length)throw Error('卡片字段无效');
        let at=1;const pairs=[];for(let c=0;c<m.fields.length;c++)if(row[0]&2**c)pairs.push([m.fields[c],row[at++]]);
        const card=Object.fromEntries(pairs);if(at!==row.length||card.workId!==m.workIds[index*m.shardSize+i])throw Error('卡片编号不符');rows.set(card.workId,card);
      }
      entry.job=null;entry.bytes=descriptor.rawBytes;cacheBytes+=entry.bytes;trim();return rows;
    }).catch(error=>{if(cache.get(index)===entry)cache.delete(index);throw error;});
    cache.set(index,entry);return entry.promise;
  }
  return Object.freeze({
    async bind(ids){const m=await manifest();if(ids.length!==m.count||ids.some((id,i)=>id!==m.workIds[i]))throw Error('卡片目录与查询范围不符');},
    async get(ids,{priority='foreground',isCurrent=()=>true}={}){
      if(!Array.isArray(ids)||ids.length>48||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('卡片请求无效');
      if(!ids.length)return [];
      const m=await manifest();if(!isCurrent())throw new DOMException('作品结果已变化','AbortError');if(ids.some(id=>!m.positions.has(id)))throw Error('未知作品卡片');
      const indices=[...new Set(ids.map(id=>Math.floor(m.positions.get(id)/m.shardSize)))];
      const chunks=new Map(await Promise.all(indices.map(async index=>[index,await shard(index,m,{priority,isCurrent})])));
      return ids.map(id=>structuredClone(chunks.get(Math.floor(m.positions.get(id)/m.shardSize)).get(id)));
    },
    prune:()=>scheduler.prune(),
    stats:()=>({cacheBytes,cachedShards:cache.size,...scheduler.stats()})
  });
}
