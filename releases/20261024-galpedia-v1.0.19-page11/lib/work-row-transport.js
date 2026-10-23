import {WORK_ROW_TRANSPORT} from './work-row-transport-config.js';
import {createResourceRequest} from './resource-request.js';

export function createWorkRowTransport({config=WORK_ROW_TRANSPORT,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}){
 const request=createResourceRequest({fetchImpl,maxAttempts:1}),cache=new Map(),records=new Map(),routes=new Map();let manifest;
 const digest=async bytes=>[...new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const keyFor=id=>{if(!routes.has(id))routes.set(id,digest(new TextEncoder().encode('egs:'+id)).then(x=>x.slice(0,2)));return routes.get(id);};
 function read(d,priority){
  if(!Array.isArray(d)||d.length!==3||!/^[a-f0-9]{64}$/.test(d[0])||!Number.isSafeInteger(d[1])||d[1]<1||d[1]>2*1024*1024||!Number.isSafeInteger(d[2])||d[2]<1||d[2]>8*1024*1024)throw Error('作品小分片描述无效');
  if(cache.has(d[0])){request.promote?.(new URL('../runtime-data/work-row-transport-v1/'+d[0]+'.json.gz',import.meta.url),{validationKey:d[0],priority});return cache.get(d[0]);}
  const pending=request(new URL('../runtime-data/work-row-transport-v1/'+d[0]+'.json.gz',import.meta.url),{label:'当前页作品资料',priority,validationKey:d[0],validate:async bytes=>{
   if(bytes.byteLength!==d[1]||await digest(bytes)!==d[0])throw Error('作品小分片摘要不符');
   const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>d[2])throw Error('作品小分片超限');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   if(size!==d[2])throw Error('作品小分片长度不符');const raw=new Uint8Array(size);let at=0;for(const c of chunks){raw.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }}).catch(e=>{cache.delete(d[0]);throw e;});cache.set(d[0],pending);while(cache.size>160)cache.delete(cache.keys().next().value);return pending;
 }
 const families=['source','metadata','ratings'];
 const touch=(id,bundle)=>{for(let i=0;i<3;i++){const key=families[i]+':'+id;records.delete(key);records.set(key,bundle[i]);}};
 const retain=()=>{while(records.size>1536){const id=records.keys().next().value.split(':')[1];for(const family of families)records.delete(family+':'+id);}};
 const prepare=priority=>manifest??=read(config.manifest,priority).then(m=>{if(m.schema!==config.schema||m.chunkSize!==8||['source','metadata','ratings'].some(f=>m.sources?.[f]!==config.sources[f])||!m.directories)throw Error('作品小分片来源不符');return m;}).catch(e=>{manifest=null;throw e;});
 return {seedRatings(rows,revision){if(config.sources.ratings!==revision)return false;for(const row of rows){const id=row.workId,bundle=families.map(f=>records.get(f+':'+id));bundle[2]=structuredClone(row);for(const family of families)records.delete(family+':'+id);if(bundle.every(Boolean))touch(id,bundle);else records.set('ratings:'+id,bundle[2]);}retain();return true;},peek(family,ids,revision){if(config.sources[family]!==revision||ids.some(id=>!records.has(family+':'+id)))return null;return structuredClone(ids.map(id=>records.get(family+':'+id)));},async get(family,ids,revision,{priority='visible'}={}){
  if(!['source','metadata','ratings'].includes(family)||config.sources[family]!==revision||!Array.isArray(ids)||!ids.length||ids.length>48||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id)))return null;
  try{
   const bundles=new Map(ids.map(id=>[id,families.map(f=>records.get(f+':'+id))]).filter(([,row])=>row.every(Boolean))),found=new Map(ids.filter(id=>records.has(family+':'+id)).map(id=>[id,records.get(family+':'+id)])),missing=[...new Set(ids.filter(id=>!found.has(id)))];
   if(missing.length){const [m,keys]=await Promise.all([prepare(priority),Promise.all(missing.map(keyFor))]);
    const dirs=new Map([...new Set(keys)].map(k=>[k,m.directories[k]]));
    const jobs=new Map();for(let i=0;i<missing.length;i++){const dir=dirs.get(keys[i]),pos=dir.ids?.indexOf(missing[i]);if(!Number.isInteger(pos)||pos<0)throw Error('作品小分片缺少编号');const n=Math.floor(pos/8),descriptor=dir.parts?.[n];if(!descriptor)throw Error('作品小分片缺少资料');jobs.set(descriptor[0],{descriptor,ids:dir.ids.slice(n*8,n*8+8)});}
    const loaded=await Promise.all([...jobs.values()].map(async job=>{const rows=await read(job.descriptor,priority);if(!Array.isArray(rows)||rows.length!==job.ids.length||rows.some((r,i)=>!Array.isArray(r)||r.length!==3||r.some(value=>value.workId!==job.ids[i])))throw Error('作品小分片顺序不符');return rows;}));
    for(const rows of loaded)for(const row of rows){touch(row[0].workId,row);bundles.set(row[0].workId,row);found.set(row[0].workId,row[families.indexOf(family)]);}
    // Hold the requested rows before trimming: a page can touch many chunks.
    const result=ids.map(id=>found.get(id));if(result.some(x=>!x))throw Error('作品小分片结果不完整');for(const id of ids)if(bundles.has(id))touch(id,bundles.get(id));retain();return structuredClone(result);
   }
   for(const id of ids)if(bundles.has(id))touch(id,bundles.get(id));return structuredClone(ids.map(id=>found.get(id)));
  }catch(e){console.warn('当前页小分片暂不可用，使用原始资料',e);return null;}
 }};
}
let shared;
export function workRowTransport(){return shared??=createWorkRowTransport();}
