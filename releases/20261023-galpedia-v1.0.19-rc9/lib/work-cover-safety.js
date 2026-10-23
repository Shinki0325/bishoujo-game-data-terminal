// Optional, lossless subset of the existing public image classification table.
import {createResourceRequest} from './resource-request.js';
const shaPattern=/^[a-f0-9]{64}$/u;
const check=(value,message)=>{if(!value)throw Error(message);};
export function safetyHash(path,seed=2166136261){let h=seed;for(const c of new TextEncoder().encode(path))h=Math.imul(h^c,16777619)>>>0;return h;}
export function createCoverSafetyIndex({config,sourceManifest,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,baseUrl=import.meta.url,maxCacheBytes=8*1024*1024,requestPolicy={}}={}){
  check(Number.isSafeInteger(maxCacheBytes)&&maxCacheBytes>0&&maxCacheBytes<=16*1024*1024,'图片分级缓存预算无效');
  const request=createResourceRequest({...requestPolicy,fetchImpl}),cache=new Map(),pending=new Map();
  let manifestPromise,disabled=false,cacheBytes=0;
  const sha=async bytes=>[...new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  async function read(d){
    check(d&&/^(?:manifest|covers-[a-f0-9]{2})\.[a-f0-9]{64}\.json\.gz$/u.test(d.path)&&d.path.includes('.'+d.sha256+'.')
      &&shaPattern.test(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=1024*1024
      &&Number.isSafeInteger(d.rawBytes)&&d.rawBytes>0&&d.rawBytes<=4*1024*1024,'图片分级描述无效');
    return request(new URL(config.basePath+d.path,baseUrl),{label:'图片分级投影',validationKey:d.sha256,validate:async bytes=>{
      check(bytes.byteLength===d.bytes&&await sha(bytes)===d.sha256,'图片分级投影摘要不符');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;check(size<=d.rawBytes,'图片分级解压超限');chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});}
      check(size===d.rawBytes,'图片分级解压长度不符');const raw=new Uint8Array(size);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }});
  }
  const manifest=()=>manifestPromise??=(async()=>{
    check(config?.schema==='galpedia-cover-safety-transport-v1'&&config.basePath==='../runtime-data/work-cover-safety-v1/','图片分级投影配置无效');
    const [value,source]=await Promise.all([read(config),sourceManifest()]);
    const bindings=Object.entries(source.files??{}).filter(([name])=>/^safety\/[a-f0-9]{2}\.json\.gz$/u.test(name))
      .sort(([a],[b])=>a.localeCompare(b)).map(([name,d])=>[name,d.sha256,d.bytes]);
    check(bindings.length===256&&value.schema==='galpedia-cover-safety-v1'
      &&shaPattern.test(value.sourceSafetyBindingsSha256)&&value.sourceSafetyBindingsSha256===await sha(new TextEncoder().encode(JSON.stringify(bindings))),
      '图片分级投影来源已变化');
    check(Array.isArray(value.statuses)&&value.statuses.length>0&&value.statuses.length<32&&value.statuses.every(s=>typeof s==='string')
      &&value.parts&&Object.keys(value.parts).length<=256&&Object.keys(value.parts).every(k=>/^[a-f0-9]{2}$/u.test(k)), '图片分级投影格式无效');
    const m=value.membership;
    check(Number.isSafeInteger(m?.bits)&&m.bits>=64&&m.bits<=8*1024*1024&&m.bits%8===0&&m.hashes===7&&typeof m.base64==='string','图片分级成员筛选格式无效');
    const filter=Uint8Array.from(atob(m.base64),c=>c.charCodeAt(0));check(filter.length*8===m.bits,'图片分级成员筛选长度不符');
    return {...value,filter};
  })();
  function member(m,path){const a=safetyHash(path),b=safetyHash(path,2654435761)|1;
    for(let i=0;i<7;i++){const bit=((a+Math.imul(i,b))>>>0)%m.membership.bits;if(!(m.filter[bit>>>3]&(1<<(bit&7))))return false;}return true;}
  async function part(m,key){
    if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry.value;}
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{const d=m.parts[key];check(d?.path?.startsWith('covers-'+key+'.'),'图片分级分片不符');const value=await read(d);
      check(value&&typeof value==='object'&&!Array.isArray(value),'图片分级分片无效');
      for(const [path,row]of Object.entries(value))check(path.startsWith('/')&&path.length<=2048
        &&(safetyHash(path)%256).toString(16).padStart(2,'0')===key&&Array.isArray(row)&&row.length===3
        &&row.every(v=>typeof v==='string'&&v.length<=2048)&&m.statuses.includes(row[0]),'图片分级条目无效');
      if(!disabled){cache.set(key,{value,bytes:d.rawBytes});cacheBytes+=d.rawBytes;
        while(cacheBytes>maxCacheBytes&&cache.size){const first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes;cache.delete(first);}}
      return value;
    })().finally(()=>pending.delete(key));pending.set(key,task);return task;
  }
  return Object.freeze({async lookup(path){
    if(disabled||typeof path!=='string'||!path.startsWith('/')||path.length>2048)return null;
    try{const m=await manifest();if(!member(m,path))return null;const key=(safetyHash(path)%256).toString(16).padStart(2,'0');
      if(!m.parts[key])return null;return (await part(m,key))[path]??null;
    }catch{disabled=true;cache.clear();cacheBytes=0;return null;}
  },stats:()=>({disabled,cachedParts:cache.size,pendingParts:pending.size,cacheBytes})});
}
