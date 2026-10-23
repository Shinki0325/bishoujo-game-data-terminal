import {COMPANY_DETAIL} from './company-detail-config.js';
import {createResourceRequest} from './resource-request.js';
import {restoreCompanySummary} from './company-directory-baseline.js';
import {registerCompanyDisplay,registerCompanyScopeReader} from './company-display-registry.js';
const SCHEMA='galpedia-company-detail-v1',hex=/^[a-f0-9]{64}$/;
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
export function createCompanyDetailClient({head=COMPANY_DETAIL,fetchImpl=globalThis.fetch,baseUrl=new URL('./',import.meta.url),requestPolicy={}}={}){
 const request=createResourceRequest({fetchImpl,...requestPolicy}),cache=new Map();
 async function read(d){
  if(!d||!hex.test(d.sha256)||!new RegExp(String.raw`^\.\./runtime-data/company-detail-v1/(?:company|index|scope)-${d.sha256}\.json\.gz$`).test(d.url)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>2*1024*1024||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>8*1024*1024)throw Error('会社详情描述无效');
  if(!cache.has(d.sha256)){
   const p=request(new URL(d.url,baseUrl),{validationKey:d.sha256,label:'会社详情',validate:async packed=>{
    if(packed.byteLength!==d.bytes||await digest(packed)!==d.sha256)throw Error('会社详情摘要不符');
    const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>d.rawBytes)throw Error('会社详情解压超限');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    if(size!==d.rawBytes)throw Error('会社详情不完整');const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));if(value.schema!==SCHEMA)throw Error('会社详情格式不符');return value;
   }}).catch(e=>{cache.delete(d.sha256);throw e;});cache.set(d.sha256,p);if(cache.size>32)cache.delete(cache.keys().next().value);
  }return cache.get(d.sha256);
 }
 async function loadRow(id){
  id=String(id);if(!id||id.length>160||head?.schema!==SCHEMA)throw Error('会社详情索引无效');
  const key=(await digest(new TextEncoder().encode(id))).slice(0,2),index=await read(head.buckets[key]);
  if(index.bucket!==key||!Object.hasOwn(index.aliases,id))throw Error('会社身份不在已审核索引中');
  const cid=index.aliases[id],row=await read(index.companies[cid]);
  if(row.id!==cid||row.summary?.companyId!==cid||!Array.isArray(row.counts)||!['development','publishing','other'].includes(row.defaultRole))throw Error('会社身份对应不符');
  registerCompanyDisplay([[cid,row.name,row.counts]]);
  return row;
 }
 return {async load(id){const row=await loadRow(id);return {companyId:row.id,defaultRole:row.defaultRole,directory:restoreCompanySummary([row.summary])};},async scope(id,role){const row=await loadRow(id),value=await read(row.scopes?.[role]);if(value.id!==row.id||value.role!==role||value.scope?.company?.companyId!==row.id||value.scope?.role!==role)throw Error('会社范围身份不符');return value.scope;}};
}
const client=createCompanyDetailClient();
registerCompanyScopeReader(async(id,role)=>{try{return await client.scope(id,role);}catch{return null;}});
export async function loadCompanyDetail(id){
 try{return await client.load(id);}
 catch(error){
  // Preserve the established complete reader on unavailable/corrupt optional packs.
  const [{getStaticCompanyClient},{defaults},{companyRoleCounts}]=await Promise.all([import('./company-static-client.js'),import('./company-ui/__company_v41/runtime-config.js'),import('./company-display-registry.js')]);
  const old=getStaticCompanyClient(),directory=await old.loadDirectory(),companyId=await old.resolveCompanyId(String(id)),c=companyRoleCounts(companyId);
  return {directory,companyId,defaultRole:defaults[companyId]||(c[1]?'development':c[2]?'publishing':'other'),fallback:true};
 }
}
