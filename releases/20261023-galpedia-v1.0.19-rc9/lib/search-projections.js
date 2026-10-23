import {SEARCH_PROJECTIONS} from './search-projections-config.js';
const pending=new Map();
const sha=async(bytes,cryptoRef)=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
// Optional derived bytes. A stale source or failed derivative uses the original
// reader; a successful shortcut must pass both packed and unpacked checks.
export async function loadSearchProjection(kind,source,{fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,timeoutMs=0,descriptor=null}={}) {
 if(!Number.isFinite(timeoutMs)||timeoutMs<0)throw new TypeError('invalid optional projection budget');
 const d=descriptor??SEARCH_PROJECTIONS[kind];
 if(!d||JSON.stringify(d.source)!==JSON.stringify(source))return null;
 const load=async()=>{
   if(!/^\.\.\/runtime-data\/search-projections-v1\/[a-z]+-[a-f0-9]{64}\.json\.gz$/.test(d.url)
     ||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>16*1024*1024
     ||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>32*1024*1024)throw Error('搜索投影描述无效');
   const controller=new AbortController();let timer;
   let packed;
   try {
     const read=async()=>{const response=await fetchImpl(new URL(d.url,import.meta.url),{signal:controller.signal});if(!response.ok)throw Error('搜索投影读取失败');return response.arrayBuffer();};
     packed=timeoutMs?await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('optional search projection budget exceeded'));},timeoutMs);})]):await read();
   }finally{clearTimeout(timer);}

   if(packed.byteLength!==d.bytes||await sha(packed,cryptoRef)!==d.sha256)throw Error('搜索投影摘要不符');
   const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>d.rawBytes)throw Error('搜索投影超限');chunks.push(value);}}finally{await reader.cancel().catch(()=>{})}
   const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.byteLength}
   if(size!==d.rawBytes||await sha(raw,cryptoRef)!==d.rawSha256)throw Error('搜索投影内容不符');
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 };
 // Injected transports are isolated from the browser singleton and its failures.
 if(descriptor||timeoutMs||fetchImpl!==globalThis.fetch||cryptoRef!==globalThis.crypto)return load().catch(()=>null);
 if(!pending.has(kind))pending.set(kind,load().catch(()=>{pending.delete(kind);return null}));
 return pending.get(kind);
}
