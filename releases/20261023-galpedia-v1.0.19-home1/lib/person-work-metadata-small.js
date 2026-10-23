import {PERSON_WORK_METADATA} from './person-work-metadata-config.js';
import {reviewedEditionWork,withReviewedObservation} from './reviewed-edition-work.js';
import {createResourceRequest} from './resource-request.js';

export function createPersonWorkMetadataReader({config=PERSON_WORK_METADATA,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}){
 const base=new URL('../runtime-data/person-work-metadata-v1/',import.meta.url),request=createResourceRequest({fetchImpl,timeoutMs:30000,maxAttempts:1});
 const hash=async b=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
 const read=async d=>{
  if(!/^(?:rows|manifest|context|dictionary|catalog)-[a-f0-9]{64}\.json\.gz$/.test(d?.path??'')||!/^[a-f0-9]{64}$/.test(d.sha256??'')
   ||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>4*1024*1024||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>8*1024*1024)throw Error('人物作品摘要描述不符');
  return request(new URL(d.path,base),{label:'人物关联作品',validationKey:d.sha256,validate:async b=>{
   if(b.byteLength!==d.bytes||await hash(b)!==d.sha256)throw Error('人物作品摘要校验失败');
   const reader=new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>d.rawBytes)throw Error('人物作品摘要解压超限');parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
   if(size!==d.rawBytes)throw Error('人物作品摘要长度错误');const raw=new Uint8Array(size);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length}
   const value=JSON.parse(new TextDecoder().decode(raw));if(value.schema!==config.schema)throw Error('人物作品摘要版本错误');return value;
  }});
 };
 let pending;const manifest=()=>pending??=read(config.manifest).catch(e=>{pending=null;throw e});
 const cache=new Map();
 const load=async(ids,source,{signal}={})=>{
  if(source.revision!==config.sourceSha256||source.usingFallback)throw Error('人物作品摘要来源已更新');
  const current=()=>{if(signal?.aborted)throw new DOMException('人物读取已取消','AbortError')};current();
  const m=await manifest();
  if(m.sourceSha256!==source.revision)throw Error('人物作品摘要身份不符');
  const keys=await Promise.all(ids.map(async id=>(await hash(new TextEncoder().encode('egs:'+id))).slice(0,3)));
  const loaded=new Map(await Promise.all([...new Set(keys)].map(async key=>{
   if(!cache.has(key)){
    const promise=read(m.buckets[key]).then(async value=>{
     if(value.bucket!==key||!Array.isArray(value.rows)||new Set(value.rows.map(r=>r.workId)).size!==value.rows.length)throw Error('人物作品摘要分块不符');
     const routes=await Promise.all(value.rows.map(r=>hash(new TextEncoder().encode('egs:'+r.workId))));if(routes.some(route=>route.slice(0,3)!==key))throw Error('人物作品摘要错桶');
     return new Map(value.rows.map(r=>[r.workId,reviewedEditionWork(withReviewedObservation({...r,...(r.fullWikiRatings&&value.observations?.[r.workId]?{fullWikiRatings:{...r.fullWikiRatings,...value.observations[r.workId]}}:{})},value.observations?.[r.workId]??null))]));
    }).catch(e=>{cache.delete(key);throw e});cache.set(key,promise);while(cache.size>256)cache.delete(cache.keys().next().value);
   }
   return [key,await cache.get(key)];
  })));
  current();return ids.map((id,i)=>{const row=loaded.get(keys[i]).get(id);if(!row)throw Error('人物关联作品缺失');return structuredClone(row)});
 };
 load.familyContext=async()=>{const {WORK_BROWSE}=await import('./work-browse-config.js');if(config.sourceStartupSha256!==WORK_BROWSE.startup.sha256)throw Error('人物版本来源已更新');const v=await read(config.familyContext);if(v.sourceStartupSha256!==config.sourceStartupSha256||!Array.isArray(v.workIds))throw Error('人物版本来源不符');return v;};
 const dictionaries=new Map();let catalogPending;
 const catalog=()=>catalogPending??=read(config.catalog).catch(e=>{catalogPending=null;throw e});
 load.prepare=()=>Promise.all([manifest(),catalog()]);
 const subset=async(field,keys,descriptors)=>{
  const wanted=[...new Set(keys.filter(Boolean).map(String))],routes=await Promise.all(wanted.map(async id=>(await hash(new TextEncoder().encode(id))).slice(0,2)));
  const parts=new Map(await Promise.all([...new Set(routes)].map(async key=>{
   const token=field+key;if(!descriptors[key])return [key,{}];
   if(!dictionaries.has(token)){const job=read(descriptors[key]).then(v=>{if(v.field!==field||v.bucket!==key||!v.rows)throw Error('人物关联字典身份不符');return v.rows}).catch(e=>{dictionaries.delete(token);throw e});dictionaries.set(token,job);while(dictionaries.size>128)dictionaries.delete(dictionaries.keys().next().value);}
   return [key,await dictionaries.get(token)];
  })));
  return Object.fromEntries(wanted.flatMap((id,i)=>Object.hasOwn(parts.get(routes[i]),id)?[[id,parts.get(routes[i])[id]]]:[]));
 };
 load.catalog=async({id,model,ledger,summary,context,publisher,commonSha256})=>{
  if(commonSha256!==config.commonSha256)throw Error('人物目录来源已更新');
  const m=await catalog();if(m.commonSha256!==commonSha256)throw Error('人物目录来源不符');
  const facts=[...(ledger?.credits??[]),...(context.personCreditRepairs??[]),...publisher];
  if(facts.some(f=>f.nativeReleaseIdentity))throw Error('原生版本沿用完整名称目录');
  const refs=[...(ledger?.representativeCharacters??[]),...(model.representativeCharacters??[]),...(summary.representativeWorkRefs??summary.representativeWorks??model.representativeWorks??[])];
  const workIds=[...facts.flatMap(f=>f.scope?.editionIds??[]),...refs.map(r=>r.workId)].filter(Boolean).map(String);
  if(workIds.some(w=>!m.workFamilies[w]))throw Error('人物作品未登记');
  const familyIds=[...facts.map(f=>f.presentationWorkId),...workIds.map(w=>m.workFamilies[w])];
  const characterKeys=facts.map(f=>f.egsCharacterId?`egs:${f.egsCharacterId}`:f.bangumiCharacterId?`bangumi:${f.bangumiSubjectId}:${f.bangumiCharacterId}`:f.vndbCharacterId?`vndb:${f.vndbCharacterId}`:null);
  const brands=context.personCompanyRepairs??ledger?.coBrands??[];
  const [groups,characterSources,companyNames]=await Promise.all([subset('families',familyIds,m.dictionaries.families),subset('characterSources',characterKeys,m.dictionaries.characterSources),subset('companyNames',brands.map(b=>b.companyId),m.dictionaries.companyNames)]);
  return {works:Object.assign({},...Object.values(groups).map(g=>g.works)),families:Object.fromEntries(Object.entries(groups).filter(([,g])=>g.title!=null).map(([fid,g])=>[fid,g.title])),characterSources,companyNames,nativeWorks:m.nativeWorks};
 };
 load.peers=async(id,revision)=>{if(revision!==config.songRevision)throw Error('合作关系来源已更新');return (await subset('peers',[id],config.peers))[id]??{vocal:[],music:[]};};
 return load;
}
let reader;
export const loadSmallPersonWorkMetadata=(ids,source,options)=>(reader??=createPersonWorkMetadataReader())(ids,source,options);

export const loadPersonFamilyContext=()=>(reader??=createPersonWorkMetadataReader()).familyContext();

export const loadSmallPersonCatalog=options=>(reader??=createPersonWorkMetadataReader()).catalog(options);
export const loadSmallPersonPeers=(id,revision)=>(reader??=createPersonWorkMetadataReader()).peers(id,revision);

export const prepareSmallPersonData=()=>(reader??=createPersonWorkMetadataReader()).prepare();
