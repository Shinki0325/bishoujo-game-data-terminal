import {PERSON_SECTIONS} from './person-sections-config.js';
import {personSectionSourceKey} from './person-section-sources.js';
import {createEntityReader} from './entity-load-service.js';
import {createLoadCoordinator} from './load-coordinator.js';
import {createResourceRequest} from './resource-request.js';
const SCHEMA='galpedia-person-sections-v1';
export function createPersonSectionsClient({config=PERSON_SECTIONS,fetchImpl=globalThis.fetch,
  currentSourceKey=personSectionSourceKey,fullLoader,cryptoRef=globalThis.crypto}={}){
  const request=createResourceRequest({fetchImpl});
  const base=new URL('../runtime-data/person-sections-v1/',import.meta.url);
  let sourceKey;
  const indexPins=new WeakMap();
  const usable=async id=>Boolean(config.schema===SCHEMA&&config.persons[id]&&
    config.sourceKey===await (sourceKey??=currentSourceKey()));
  const loadFull=fullLoader??(async(id,options)=>(await import('./person-static-detail-client.js')).getStaticPersonDetailClient().loadPerson(id,options));
  const full=async(id,options)=>{const {onFull,...readOptions}=options;const [person]=await Promise.all([loadFull(id,{...readOptions,section:'full'}),onFull?.()]);return person;};
  const hash=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const reader=createEntityReader({
    releaseKey:base.href,sourcePins:{source:config.sourceKey??'uninstalled'},kind:'person-sections',
    coordinator:createLoadCoordinator({concurrency:6,backgroundConcurrency:1,maxCacheBytes:32*1024*1024}),
    sections:{document:async(id,{scope})=>{
      const descriptor=scope.descriptor,url=new URL(descriptor.url,import.meta.url);
      if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||
        !/^[a-f0-9]{64}$/u.test(descriptor.sha256??'')||
        !Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>16*1024*1024||
        !Number.isSafeInteger(descriptor.rawBytes)||descriptor.rawBytes<1||descriptor.rawBytes>32*1024*1024)
        throw Error('人物资料分节描述无效');
      return request(url,{label:'人物资料',validationKey:descriptor.sha256,validate:async bytes=>{
        if(bytes.byteLength!==descriptor.bytes||await hash(bytes)!==descriptor.sha256)throw Error('人物资料分节摘要不符');
        const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const chunks=[];let size=0;
        try{
          while(true){const {value,done}=await stream.read();if(done)break;size+=value.length;
            if(size>descriptor.rawBytes)throw Error('人物资料分节超过预算');chunks.push(value);}
        }finally{await stream.cancel().catch(()=>{});}
        if(size!==descriptor.rawBytes)throw Error('人物资料分节长度不符');
        const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
        return JSON.parse(new TextDecoder().decode(raw));
      }});
    }},
    validate(value,{id,scope}){
      if(scope.kind==='overview'){
        if(value?.entityId!==id||value.detailSections?.schema!==SCHEMA||'credits' in value)
          throw Error('人物概览结构无效');
      }else if(value?.schema!==SCHEMA||value.personId!==id||
        (scope.kind==='index'?!value.rows||!value.locations:scope.kind==='manifest'?!value.index||!value.records:!value.records))throw Error('人物年表结构无效');
    }
  });
  const read=async(id,kind,descriptor,options)=>(await reader.read(id,{
    section:'document',scope:{kind,descriptor},signal:options.signal,priority:options.priority??'visible'})).data;
  return {
    async loadPerson(id,options={}){
      const {section='full'}=options;
      if(section==='full')return full(id,options);
      if(section==='overview'){
        if(!await usable(id))return full(id,options);
        try{return await read(id,'overview',config.persons[id].overview,options);}
        catch(error){if(options.signal?.aborted||error.name==='AbortError')throw error;return full(id,options);}
      }
      if(!await usable(id))throw Error('人物年表来源已更新，请重新打开人物');
      const route=config.persons[id];
      const entry=route.manifest?await read(id,'manifest',route.manifest,options):route;
      const index=await read(id,'index',entry.index,options);
      if(section==='index'){indexPins.set(index,entry.index.sha256);return index;}
      if(section!=='records'||!Array.isArray(options.ids))throw Error('不支持的人物分节');
      // Record IDs are snapshot-local. Never resolve an old index against new chunks.
      if(indexPins.get(options.index)!==entry.index.sha256)throw Error('人物年表索引版本不符');
      const keys=[...new Set(options.ids.map(key=>{
        const location=index.locations[key];if(!location||!entry.records[location])throw Error('人物年表记录缺失');return location;
      }))];
      const chunks=await Promise.all(keys.map(key=>read(id,'records',entry.records[key],options)));
      const all=Object.assign({},...chunks.map(c=>c.records));
      return options.ids.map(key=>{if(!Object.hasOwn(all,key))throw Error('人物年表记录不完整');return all[key];});
    },
    inspect:()=>reader.inspect()
  };
}
let singleton;
export const getStaticPersonDetailClient=()=>singleton??=createPersonSectionsClient();
