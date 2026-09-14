import {createResourceRequest} from './resource-request.js';

export async function loadPrecomputedSearchText(config,{fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,requestPolicy={}}={}) {
  if(config?.schema!=='galpedia-search-transport-v1'||config.path!=='../runtime-data/work-search-v1/search.json.gz'
    ||!Number.isSafeInteger(config.bytes)||config.bytes<1||config.bytes>8*1024*1024
    ||!Number.isSafeInteger(config.rawBytes)||config.rawBytes<1||config.rawBytes>32*1024*1024
    ||![config.sha256,config.rawSha256,config.sourceManifestSha256,config.sourceWorkerSha256].every(v=>/^[a-f0-9]{64}$/u.test(v??'')))
    throw Error('搜索资料描述无效');
  const sha=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const request=createResourceRequest({...requestPolicy,fetchImpl});
  return request(new URL(config.path,import.meta.url),{label:'搜索索引',validationKey:config.sha256,validate:async bytes=>{
    if(bytes.byteLength!==config.bytes||await sha(bytes)!==config.sha256)throw Error('搜索压缩摘要不符');
    if(typeof decompress!=='function')throw Error('搜索解压不可用');
    const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>config.rawBytes)throw Error('搜索解压超过预算');chunks.push(value);
    }}finally{await reader.cancel().catch(()=>{});}
    if(length!==config.rawBytes)throw Error('搜索解压长度不符');
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
    if(await sha(raw)!==config.rawSha256)throw Error('搜索原文摘要不符');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }});
}
