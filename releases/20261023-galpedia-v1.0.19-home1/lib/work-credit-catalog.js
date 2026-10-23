import { WORK_CREDIT_CATALOG } from './work-credit-catalog-config.js';
import { createResourceRequest } from './resource-request.js';

export function createWorkCreditCatalog({source,config=WORK_CREDIT_CATALOG,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}){
  const current=config.revision===source?.revision&&config.sourceSha256===source?.catalog?.sha256;
  const request=createResourceRequest({fetchImpl}),cache=new Map();let cacheBytes=0;
  const sizes=new Map();
  const hash=async b=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
  async function read(d,kind){
    if(!d||!new RegExp(String.raw`^${kind}-[a-f0-9]{64}\.json\.gz$`,'u').test(d.path)
      ||d.path!==`${kind}-${d.sha256}.json.gz`||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>16*1024*1024
      ||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>32*1024*1024)throw Error('作品署名目录描述无效');
    if(cache.has(d.path))return cache.get(d.path);
    const promise=request(new URL('../runtime-data/work-credit-catalog-v1/'+d.path,import.meta.url),{
      label:'作品署名目录',validationKey:d.sha256,validate:async bytes=>{
        if(bytes.byteLength!==d.bytes||await hash(bytes)!==d.sha256)throw Error('作品署名目录摘要不符');
        const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>d.rawBytes)throw Error('作品署名目录超过预算');chunks.push(value);}}
        finally{await reader.cancel().catch(()=>{});}
        if(size!==d.rawBytes)throw Error('作品署名目录长度不符');
        const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
        const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        if(v.schema!=='galpedia-work-credit-catalog-v1'||v.kind!==kind||!v.rows||typeof v.rows!=='object'||Array.isArray(v.rows))throw Error('作品署名目录格式不符');
        return v.rows;
      }
    }).catch(error=>{if(cache.get(d.path)===promise){cacheBytes-=sizes.get(d.path)??0;sizes.delete(d.path);cache.delete(d.path);}throw error;});
    cache.set(d.path,promise);
    sizes.set(d.path,d.rawBytes);cacheBytes+=d.rawBytes;
    for(const key of cache.keys())if(cache.size>96||cacheBytes>8*1024*1024){cacheBytes-=sizes.get(key)??0;sizes.delete(key);cache.delete(key);}
    return promise;
  }
  async function load(wid){
    if(!current)return null; // stale projection falls back to current authority
    const id=String(wid),bucket=(await hash(new TextEncoder().encode(id))).slice(0,2);
    const [identity,rows]=await Promise.all([read(config.common,'identity'),read(config.shards?.[bucket],'works')]);
    if(!Object.hasOwn(rows,id))return null;
    return {...identity,...rows[id]};
  }
  return Object.freeze({load,async project(wid,project){
    const context=await load(wid);if(!context)return null;
    if(!config.identities)return project(context); // prior compatible projection
    const fields=['characterSources','personAliases','creditPersonLinks'],loaded=new Set();
    const values=Object.fromEntries(fields.map(k=>[k,Object.create(null)]));
    const enumerated=Symbol('requires-complete-dictionary'),seen=new Set();
    // The unchanged pure projector discovers keys from all actual inputs.
    // Repeat only when a newly resolved identity reveals another lookup.
    for(let pass=0;pass<8;pass++){
      const pending=new Map(),maps={};
      for(const field of fields)maps[field]=new Proxy(values[field],{
        get(target,key){if(typeof key!=='string')return Reflect.get(target,key);const token=field+'\0'+key;
          if(!seen.has(token))pending.set(token,{field,key});return Object.hasOwn(target,key)?target[key]:undefined;},
        has(target,key){if(typeof key==='string'&&!seen.has(field+'\0'+key))pending.set(field+'\0'+key,{field,key});return Object.hasOwn(target,key);},
        getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&!seen.has(field+'\0'+key))pending.set(field+'\0'+key,{field,key});return Object.getOwnPropertyDescriptor(target,key);},
        ownKeys(){throw enumerated;}
      });
      let value;try{value=project({...context,...maps});}catch(e){if(e===enumerated)return null;throw e;}
      if(!pending.size)return value;
      const keys=await Promise.all([...pending].map(async([token,k])=>({...k,token,bucket:(await hash(new TextEncoder().encode(token))).slice(0,2)})));
      const buckets=[...new Set(keys.map(k=>k.bucket))].filter(b=>!loaded.has(b));
      await Promise.all(buckets.map(async b=>{
        const rows=await read(config.identities[b],'identity-keys');
        for(const field of fields)Object.assign(values[field],rows[field]??{});
        loaded.add(b);
      }));
      for(const k of keys)seen.add(k.token);
    }
    return null; // future nonlocal projection safely falls back to authority
  }});
}
