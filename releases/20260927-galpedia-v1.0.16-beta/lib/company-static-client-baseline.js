import {COMPANY_STATIC} from './company-static-config.js';
import {createResourceRequest} from './resource-request.js';
import {restoreCompanySummary,worksForCompany} from './company-directory.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';

export function createStaticCompanyClient({config=COMPANY_STATIC,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,decompress=globalThis.DecompressionStream,requestPolicy={},expectedSourceSha256=WORKBENCH_DEMAND.sha256}={}) {
  if(config.sourceManifestSha256!==expectedSourceSha256)throw Error('会社作品源版本不符');
  const base=new URL(config.basePath,import.meta.url),request=createResourceRequest({...requestPolicy,fetchImpl});
  let directoryPromise,workspacePromise;
  const read=(descriptor,name)=>{
    if(descriptor?.path!==name||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>16*1024*1024
      ||!Number.isSafeInteger(descriptor.rawBytes)||descriptor.rawBytes<1||descriptor.rawBytes>64*1024*1024||!/^[a-f0-9]{64}$/u.test(descriptor.sha256??''))throw Error('会社静态描述无效');
    return request(new URL(name,base),{label:'会社资料',validationKey:descriptor.sha256,validate:async bytes=>{
      const digest=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      if(bytes.byteLength!==descriptor.bytes||digest!==descriptor.sha256)throw Error('会社静态摘要不符');
      if(typeof decompress!=='function')throw Error('当前浏览器不支持会社资料解压');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>descriptor.rawBytes)throw Error('会社解压超过预算');chunks.push(value);}if(length!==descriptor.rawBytes)throw Error('会社解压长度不符');}finally{await reader.cancel().catch(()=>{});}
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));if(value.schema!=='galpedia-company-static-v1'||value.revision!==config.revision)throw Error('会社版本不符');return value;
    }});
  };
  const loadDirectory=()=>directoryPromise??=read(config.directory,'directory.json.gz').then(value=>{
    if(value.companies?.length!==config.companyCount)throw Error('会社目录数量不符');return restoreCompanySummary(value.companies);
  }).catch(error=>{directoryPromise=null;throw error;});
  const loadWorkspace=()=>workspacePromise??=Promise.all([loadDirectory(),read(config.works,'works.json.gz')]).then(([directory,value])=>{
    if(!Array.isArray(value.works)||value.works.length!==config.workCount||!Array.isArray(value.relations)||value.relations.length!==config.companyCount)throw Error('会社关系数量不符');
    const ids=new Set(value.works.map(w=>w.workId)),companies=new Set(directory.companies.map(c=>c.companyId)),relations=new Map();
    if(ids.size!==config.workCount)throw Error('会社作品身份重复');
    for(const row of value.relations){if(!Array.isArray(row)||row.length!==2||!companies.has(row[0])||relations.has(row[0])||!Array.isArray(row[1])||new Set(row[1]).size!==row[1].length||row[1].some(id=>!ids.has(id)))throw Error('会社关系身份不符');relations.set(row[0],new Set(row[1]));}
    return {...directory,works:value.works,workIdsByCompany:relations};
  }).catch(error=>{workspacePromise=null;throw error;});
  return Object.freeze({loadDirectory,loadWorkspace,async workIds(id,options){return worksForCompany(await loadWorkspace(),id,options).map(w=>w.workId);}});
}
let shared;
export const getStaticCompanyClient=()=>shared??=createStaticCompanyClient();
