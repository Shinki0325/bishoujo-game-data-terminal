import { WORK_FULL_CARDS } from './work-full-cards-config.js';
import { createResourceRequest } from './resource-request.js';
import { createShardedWorkCards } from './work-card-shards.js';

// Legacy full-payload decoder retained for compatibility. The sharded path
// below can serve display cards without starting the query Worker.
export function createFullWorkCardStore(value, config = WORK_FULL_CARDS) {
  if(value?.schema!==config.schema||value.sourceManifestSha256!==config.sourceManifestSha256
    ||value.sourceDirectorySha256!==config.sourceDirectorySha256||value.count!==config.count
    ||!Array.isArray(value.fields)||value.fields.length<1||value.fields.length>31
    ||value.fields.some(key=>typeof key!=='string')||new Set(value.fields).size!==value.fields.length
    ||!Array.isArray(value.rows)||value.rows.length!==config.count)throw Error('全库卡片资料身份不符');
  const idColumn=value.fields.indexOf('workId');if(idColumn<0)throw Error('全库卡片缺少作品编号');
  const positions=new Map(),ids=[];
  for(const row of value.rows){
    if(!Array.isArray(row)||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=2**value.fields.length)throw Error('全库卡片字段无效');
    let count=1,id;
    for(let i=0;i<value.fields.length;i++)if(row[0]&2**i){if(i===idColumn)id=row[count];count++;}
    if(count!==row.length||typeof id!=='string'||!/^\d+$/.test(id)||positions.has(id))throw Error('全库卡片编号无效');
    positions.set(id,row);ids.push(id);
  }
  return Object.freeze({
    bind(workIds){if(workIds.length!==ids.length||workIds.some((id,i)=>id!==ids[i]))throw Error('全库卡片与查询范围不符');},
    get(workIds){
      if(!Array.isArray(workIds)||workIds.length>48||new Set(workIds).size!==workIds.length||workIds.some(id=>!positions.has(id)))throw Error('全库卡片请求无效');
      return workIds.map(id=>{const row=positions.get(id);let at=1;return Object.fromEntries(value.fields.flatMap((key,i)=>row[0]&2**i?[[key,row[at++]]]:[]));});
    }
  });
}

let pending,sharded;
export function loadFullWorkCards(sourceSha256) {
  const config=WORK_FULL_CARDS;
  if(sourceSha256!==config.sourceManifestSha256)throw Error('全库卡片来源不符');
  if(config.shards)return sharded??=createShardedWorkCards(config);
  return pending??=createResourceRequest({timeoutMs:30000})(new URL(config.url,import.meta.url),{
    label:'全库浏览资料',validationKey:config.sha256,
    validate:async bytes=>{
      if(bytes.byteLength!==config.bytes)throw Error('全库卡片长度不符');
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      if(sha!==config.sha256)throw Error('全库卡片摘要不符');
      const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();const chunks=[];let length=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>config.rawBytes)throw Error('全库卡片解压超过预算');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      if(length!==config.rawBytes)throw Error('全库卡片解压长度不符');
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      return createFullWorkCardStore(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),config);
    }
  }).catch(error=>{pending=null;throw error;});
}
