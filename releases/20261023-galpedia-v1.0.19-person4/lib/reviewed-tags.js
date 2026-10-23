import {REVIEWED_TAGS as config} from './reviewed-tags-config.js';
import {createResourceRequest} from './resource-request.js';

const attributes=new Set(['game-type','platform','length']);
export const reviewedTagDefinitions=config.filters;
const ids=config.filters.map(f=>f.filterId), byId=new Map(config.filters.map(f=>[f.filterId,f]));
const request=createResourceRequest({fetchImpl:globalThis.fetch}),cache=new Map();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function read(d){
 if(!d||!/^\w+-[a-f0-9]{20}\.json\.gz$/u.test(d.path)||d.bytes>4e6||d.rawBytes>16e6)throw Error('标签包描述无效');
 if(cache.has(d.path))return cache.get(d.path);
 const pending=request(new URL(config.basePath+d.path,import.meta.url),{label:'标签资料',validationKey:d.sha256,validate:async bytes=>{
  if(bytes.byteLength!==d.bytes||hex(await crypto.subtle.digest('SHA-256',bytes))!==d.sha256)throw Error('标签包摘要不符');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let n=0;const chunks=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>d.rawBytes)throw Error('标签包超出预算');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(n!==d.rawBytes)throw Error('标签包长度不符');const raw=new Uint8Array(n);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(value.schema!==config.schema||!value.records)throw Error('标签包身份不符');
  for(const [id,row] of Object.entries(value.records))if(!/^\d+$/u.test(id)||!Array.isArray(row)||row.length!==3||row.some(a=>!Array.isArray(a)||a.some(j=>!Number.isInteger(j)||j<0||j>=ids.length)))throw Error('标签包内容无效');
  return value.records;
 }}).catch(e=>{cache.delete(d.path);throw e;});
 cache.set(d.path,pending);while(cache.size>12)cache.delete(cache.keys().next().value);return pending;
}
export function reviewedFilterDefinitions(filters){return [...filters.filter(f=>attributes.has(f.groupId)),...config.filters.filter(f=>f.filterEnabled)];}
export function installReviewedTagVocabulary(data){data.sample={...data.sample,filters:reviewedFilterDefinitions(data.sample.filters)};return data;}
export async function reviewedWorkTags(id){
 id=String(id);if(!/^\d+$/u.test(id))return [];
 const rows=await read(config.shards[String(Number(id)%256)]),row=rows[id];
 if(!row)return [];
 const selected=new Set(row[0].map(j=>ids[j]));
 // Collapse redundant broad tags only in presentation, never in predicates.
 for(const [child,parent]of config.edges)if(selected.has(child))selected.delete(parent);
 return [...selected].map(id=>byId.get(id));
}
// Only called after explicit filter intent; shares the validated query read.
export const prepareReviewedTagQuery=()=>read(config.query);
export async function installReviewedTagQuery(data){
 const old=new Map(data.sample.filters.map(f=>[f.filterId,f])),rows=await read(config.query);
 const keep=id=>attributes.has(old.get(id)?.groupId);
 const works=data.ratedDisplayWorks.map(w=>{
  const row=rows[w.workId]??[[],[],[]];
  return {...w,filterIds:[...(w.filterIds??[]).filter(keep),...row[0].map(j=>ids[j]).filter(id=>byId.get(id).filterEnabled)],
   tagExcludedFilterIds:[...(w.filterIds??[]).filter(keep),...row[2].map(j=>ids[j])],isNukige:row[2].some(j=>ids[j]==='adult-nukige')};
 });
 installReviewedTagVocabulary(data);data.ratedDisplayWorks=works;data.sample={...data.sample,works,backendIndexes:null};return data;
}

