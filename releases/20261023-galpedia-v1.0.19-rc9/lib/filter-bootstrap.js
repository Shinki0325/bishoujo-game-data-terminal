import {FILTER_BOOTSTRAP as config} from './filter-bootstrap-config.js';
import {createResourceRequest} from './resource-request.js';
const request=createResourceRequest({fetchImpl:globalThis.fetch,timeoutMs:30000,maxAttempts:1});
// Optional acceleration only: a stale projection falls back to the complete
// pinned carrier. It never admits a different source revision.
export async function readFilterBootstrap(sourceManifestSha256,sourceSha256){
 if(config.sourceManifestSha256!==sourceManifestSha256||config.sourceSha256!==sourceSha256)return null;
 if(!/^\.\.\/runtime-data\/filter-bootstrap-v1\/query-[a-f0-9]{20}\.json\.gz$/.test(config.url)
   ||!Number.isSafeInteger(config.bytes)||config.bytes<1||config.bytes>8e6
   ||!Number.isSafeInteger(config.rawBytes)||config.rawBytes<1||config.rawBytes>32e6)throw Error('筛选启动包描述错误');
 return request(new URL(config.url,import.meta.url),{label:'筛选索引',validationKey:config.sha256,validate:async bytes=>{
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==config.bytes||hash!==config.sha256)throw Error('筛选启动包摘要错误');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>config.rawBytes)throw Error('筛选启动包超限');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(size!==config.rawBytes)throw Error('筛选启动包不完整');const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
  const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
  if(value.schema!==config.schema||value.sourceManifestSha256!==sourceManifestSha256||value.sourceSha256!==sourceSha256)throw Error('筛选启动包来源错误');
  const body=value.body,refs=body?.queryWorkIdReferences,ids=body?.table?.columns?.[0];
  if(!Array.isArray(refs)||refs.length>4||new Set(refs).size!==refs.length||body.columns?.[0]!=='workId'||ids?.kind!=='raw'||!Array.isArray(ids.values))throw Error('筛选目录引用错误');
  for(const key of refs){const scope=body.context?.populationContract?.[key];
    if(!['admissions','core','presentation','runtime'].includes(key)||!scope||Object.hasOwn(scope,'workIds'))throw Error('筛选范围引用错误');scope.workIds=ids.values;
  }
  delete body.queryWorkIdReferences;return body;
 }});
}
