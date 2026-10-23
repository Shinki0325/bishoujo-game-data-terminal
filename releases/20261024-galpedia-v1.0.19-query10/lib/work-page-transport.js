import {workRowTransport} from './work-row-transport.js';
import {WORK_PAGE_TRANSPORT} from './work-page-transport-config.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {createResourceRequest} from './resource-request.js';

// Exact default windows use one page file; arbitrary windows use small ID chunks.
// Ratings, media and reviewed identities are still projected by their owners.
export function withWorkPageTransport(store,{config=WORK_PAGE_TRANSPORT,fetchImpl=globalThis.fetch}={}){
 const request=createResourceRequest({fetchImpl,maxAttempts:1}),cache=new Map(),records=new Map();let manifest;
 const read=d=>{
  if(!d||d.path!==d.sha256+'.json.gz'||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>2*1024*1024||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>8*1024*1024)throw Error('作品页面包描述无效');
  if(cache.has(d.sha256))return cache.get(d.sha256);
  const pending=request(new URL('../runtime-data/work-page-transport-v1/'+d.path,import.meta.url),{label:'作品页面资料',priority:'visible',validationKey:d.sha256,validate:async bytes=>{
   const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength!==d.bytes||h!==d.sha256)throw Error('作品页面包摘要不符');
   const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>d.rawBytes)throw Error('作品页面包超过预算');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   if(length!==d.rawBytes)throw Error('作品页面包长度不符');const raw=new Uint8Array(length);let pos=0;for(const b of chunks){raw.set(b,pos);pos+=b.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }}).catch(e=>{cache.delete(d.sha256);throw e;});cache.set(d.sha256,pending);while(cache.size>4)cache.delete(cache.keys().next().value);return pending;
 };
 const prepare=()=>manifest??=read(config.manifest).then(m=>{if(m.schema!==config.schema||m.sourceManifestSha256!==WORKBENCH_DEMAND.sha256||!m.pages)throw Error('作品页面包来源不符');return m;}).catch(e=>{manifest=null;throw e;});
 const eligible=config.sourceManifestSha256===WORKBENCH_DEMAND.sha256;
 return {...store,async preparePageRatings(ids,split){
  // An arbitrary page's shared chunk already carries its exact ratings. Do not
  // start the older rating buckets in parallel with that same page download.
  if(eligible&&ids.length>1&&ids.length<=48){try{const m=await prepare();if(!m.pages[ids.join(',')])await workRowTransport().get('source',ids,WORKBENCH_DEMAND.sha256);}catch{}}
  return split.projectRows(ids.map(workId=>({workId})),{priority:'visible'});
 },peek:id=>records.get(id)??store.peek(id),async get(ids){
  if(ids.every(id=>records.has(id)))return new Map(ids.map(id=>[id,structuredClone(records.get(id))]));
  if(eligible&&ids.length>1&&ids.length<=48){try{
   const m=await prepare(),d=m.pages[ids.join(',')];if(d){const rows=await read(d);if(!Array.isArray(rows)||rows.length!==ids.length||rows.some((r,i)=>r.workId!==ids[i]))throw Error('作品页面包身份不符');for(const row of rows){records.delete(row.workId);records.set(row.workId,row);}while(records.size>192)records.delete(records.keys().next().value);return new Map(structuredClone(rows).map(r=>[r.workId,r]));}
  }catch(e){console.warn('作品页面包暂不可用，读取原始分片',e);}}
  if(ids.length>1&&ids.length<=48){const rows=await workRowTransport().get('source',ids,WORKBENCH_DEMAND.sha256);if(rows){for(const row of rows){records.delete(row.workId);records.set(row.workId,row);}while(records.size>192)records.delete(records.keys().next().value);return new Map(rows.map(r=>[r.workId,r]));}}
  return store.get(ids);
 }};
}
