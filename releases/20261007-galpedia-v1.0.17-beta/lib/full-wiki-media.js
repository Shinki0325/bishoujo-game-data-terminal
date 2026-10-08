import { resolveSharedDataURL } from './shared-data-url.js';
import {isLocalPreviewOrigin} from './detail-view-stats.js';
import {approvedPublicMediaPath,approvedPublicMediaUrl} from './asset-url.js';
const SHA=/^[a-f0-9]{64}$/u;
export function localMediaPreviewAllowed(locationRef=globalThis.location) {
  return isLocalPreviewOrigin(locationRef?.origin)&&new URLSearchParams(locationRef?.search??'').get('localMedia')==='1';
}
async function digest(bytes,cryptoRef){return Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
export function validateMediaRecord(row,{local=false}={}) {
  if(!row||typeof row.id!=='string'||!row.id)throw new TypeError('图片角色或作品标识无效');
  for(const key of ['thumbnail','preview']) {
    const d=row[key];if(!d)continue;
    if(!SHA.test(d.sha256)||!Number.isSafeInteger(d.bytes)||d.bytes<1||!Number.isInteger(d.width)||d.width<1||!Number.isInteger(d.height)||d.height<1)throw new TypeError('图片文件描述无效');
    if(!local&&d.publicUrl){
      try { approvedPublicMediaUrl(d.publicUrl,d); } catch { throw new TypeError('图片外链证据无效'); }
      if(!d.publicEvidence||d.publicEvidence.path!==new URL(d.publicUrl).pathname.replace(/^\//u,'')||d.publicEvidence.family===undefined)throw new TypeError('图片外链证据缺失');
    }
    if(local) {
      if(d.path!==`/__wiki-local/images/${d.sha256}.webp`)throw new TypeError('本地图片路径无效');
    } else if(row.publicationEligible!==true||typeof d.path!=='string'||!d.path.startsWith('covers/')&&!d.path.startsWith('characters/')||d.path.includes('..')||d.path.includes('\\')||d.path.includes(':')||!d.path.endsWith('.webp'))throw new TypeError('图片缺少公开依据或包含私有路径');
  }
  return row;
}
export function createFullWikiMedia({manifestUrl,manifestSha256,localPreview=false,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,maxBuckets=48,maxRecords=2048}={}) {
  if(!(manifestUrl instanceof URL)||!SHA.test(manifestSha256??''))throw new TypeError('图片入口配置无效');
  if(localPreview&&!isLocalPreviewOrigin(manifestUrl.origin))throw new TypeError('本地图片预览仅限本机');
  if(!Number.isSafeInteger(maxRecords)||maxRecords<1)throw new TypeError('图片记录缓存容量无效');
  const cache=new Map(),pending=new Map(),recordCache=new Map(),recordPending=new Map();
  let generation=0,manifestPromise=null,characterAvailabilityPromise=null;
  async function read(url,sha){const response=await fetchImpl(resolveSharedDataURL(url));if(!response.ok)throw new Error(`图片索引读取失败 (${response.status})`);const bytes=await response.arrayBuffer();if(sha&&await digest(bytes,cryptoRef)!==sha)throw new Error('图片索引校验失败');return JSON.parse(new TextDecoder().decode(bytes));}
  async function manifest(){return manifestPromise??=read(manifestUrl,manifestSha256).then(m=>{if(m.schema!=='terminal-wiki-public-media-index-v1')throw new TypeError('图片清单版本不兼容');return m;}).catch(e=>{manifestPromise=null;throw e;});}
  // Local preview media is served from a private, generated selection.  Keep
  // only the character IDs with an actual thumbnail; never expose its paths
  // or source objects through the public projection.
  async function characterAvailability(){
    if(!localPreview)return null;
    if(!characterAvailabilityPromise)characterAvailabilityPromise=read(new URL('/__wiki-local/character-image-availability.json',manifestUrl)).then(payload=>{
      const ids=Array.isArray(payload)?payload:payload?.characterIds;
      if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw new TypeError('本地角色图片可用清单格式无效');
      return new Set(ids);
    }).catch(e=>{characterAvailabilityPromise=null;throw e;});
    return characterAvailabilityPromise;
  }
  async function bucket(kind,bucketId) {
    const key=kind+':'+bucketId;if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    if(pending.has(key))return pending.get(key);
    const requestGeneration=generation;
    const task=(async()=>{
      let body;
      if(localPreview)body=await read(new URL(`/__wiki-local/${kind}/${bucketId}.json`,manifestUrl));
      else {
        const m=await manifest();const d=m.collections?.[kind]?.find(item=>item.bucket===bucketId);
        if(!d||!SHA.test(d.sha256)||!/^shards\/(editions|presentations|characters)\/[a-f0-9]{2}\.json$/u.test(d.path))throw new TypeError('图片分片描述无效');
        body=await read(new URL(d.path,manifestUrl),d.sha256);
      }
      if(!Array.isArray(body.records))throw new TypeError('图片分片格式无效');
      const map=new Map();
      for(const row of body.records){validateMediaRecord(row,{local:localPreview});if(map.has(row.id))throw new TypeError('图片标识重复');map.set(row.id,row);}
      if(generation===requestGeneration){cache.set(key,map);while(cache.size>maxBuckets)cache.delete(cache.keys().next().value);}
      return map;
    })().finally(()=>{if(pending.get(key)===task)pending.delete(key);});pending.set(key,task);return task;
  }
  function recordKey(kind,id){return `${kind}:${id}`;}
  function rememberRecord(key,value,requestGeneration){
    if(generation!==requestGeneration)return;
    recordCache.delete(key);recordCache.set(key,value);
    while(recordCache.size>maxRecords)recordCache.delete(recordCache.keys().next().value);
  }
  function readRecord(kind,id){
    const key=recordKey(kind,id);
    if(recordCache.has(key)){
      const value=recordCache.get(key);recordCache.delete(key);recordCache.set(key,value);return Promise.resolve(value);
    }
    const existing=recordPending.get(key);if(existing)return existing;
    const requestGeneration=generation;
    const task=(async()=>{
      const bucketId=(await digest(new TextEncoder().encode(id),cryptoRef)).slice(0,2);
      const rows=await bucket(kind,bucketId);const value=rows.get(id)??null;
      rememberRecord(key,value,requestGeneration);return value;
    })().finally(()=>{if(recordPending.get(key)===task)recordPending.delete(key);});
    recordPending.set(key,task);return task;
  }
  async function getMany(kind,ids) {
    if(!['editions','presentations','characters'].includes(kind))throw new TypeError('未知图片实体类型');
    const unique=[...new Set(ids.map(String))];
    const rows=await Promise.all(unique.map(id=>readRecord(kind,id)));
    return new Map(unique.map((id,index)=>[id,rows[index]]));
  }
  const url=d=>d?(localPreview?new URL(d.path,manifestUrl).href:(d.publicUrl?approvedPublicMediaUrl(d.publicUrl,d):new URL(`./${d.path}`,manifestUrl).href)):null;
  async function projectWorks(works,{presentation=false}={}) {
    const familyId=w=>w.presentationWorkId??w.presentationFamily?.presentationWorkId??w.workGroupId;
    let editions=null,presentations=null;
    if(presentation) {
      // The presentation family is the confirmed list source.  Read it first
      // and request edition rows only for records that really need fallback;
      // this avoids a second full page of media shard requests while keeping
      // the existing presentation-over-edition precedence exact.  A row with
      // no family identity has no presentation candidate, so its edition can
      // start alongside the family lookup instead of waiting behind it.
      const familyIds=works.map(familyId).filter(Boolean);
      const directEditionIds=works.filter(work=>!familyId(work)).map(work=>work.workId);
      const [loadedPresentations,directEditions]=await Promise.all([
        getMany('presentations',familyIds),
        directEditionIds.length?getMany('editions',directEditionIds):Promise.resolve(new Map())
      ]);
      presentations=loadedPresentations;
      const fallbackIds=works.filter(work=>familyId(work)&&presentations.get(familyId(work))===null).map(work=>work.workId);
      const fallbackEditions=fallbackIds.length?await getMany('editions',fallbackIds):new Map();
      editions=new Map([...directEditions,...fallbackEditions]);
    } else editions=await getMany('editions',works.map(w=>w.workId));
    return works.map(work=>{const row=presentations?.get(familyId(work))??editions.get(work.workId);if(!row)return work;
      const workPath=d=>d?(localPreview?d.path.slice(1):(d.publicUrl?approvedPublicMediaPath(d.publicUrl,d):`data/terminal-wiki-media-v1/${d.path}`)):null;
      return {...work,fullWikiMediaStatus:row.status,projectedThumbnailPath:workPath(row.thumbnail),projectedPreviewPath:workPath(row.preview),
        coverPath:workPath(row.thumbnail)??'assets/cover-unavailable.webp',thumbnailPath:workPath(row.thumbnail)??'assets/cover-unavailable.webp',previewPath:workPath(row.preview),
        coverWidth:row.thumbnail?.width??null,coverHeight:row.thumbnail?.height??null,previewWidth:row.preview?.width??null,previewHeight:row.preview?.height??null};});
  }
  return Object.freeze({getMany,projectWorks,characterAvailability,characterImage(row){return row?.thumbnail?{url:url(row.thumbnail),fallbackUrl:url(row.preview),source:row.source,width:row.thumbnail.width,height:row.thumbnail.height}:null;},clear(){generation+=1;cache.clear();pending.clear();recordCache.clear();recordPending.clear();manifestPromise=null;characterAvailabilityPromise=null;}});
}
