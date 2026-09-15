
import {createStaticCompanyClient as originalClient} from './company-static-client-baseline.js';
import {restoreCompanySummary} from './company-directory.js';
import {createReviewedCompanyClient} from './company-reviewed-runtime.js';
const descriptor={"path":"f6125acd0ecc9ffc9b1f27cadda6efbf90e88aaece9dad74eb7681db22e53c88.json.gz","sha256":"f6125acd0ecc9ffc9b1f27cadda6efbf90e88aaece9dad74eb7681db22e53c88","bytes":2222694,"rawBytes":25324094};
export function createStaticCompanyClient(options={}){
 const original=originalClient(options),fetchImpl=options.fetchImpl??globalThis.fetch;
 const reviewed=createReviewedCompanyClient({restoreCompanySummary,loadPayload:async()=>{
  const response=await fetchImpl(new URL('../runtime-data/reviewed-company-v1/'+descriptor.path,import.meta.url));if(!response.ok)throw Error('会社资料加载失败');
  const packed=await response.arrayBuffer();if(packed.byteLength!==descriptor.bytes||await (async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''))(packed)!==descriptor.sha256)throw Error('会社资料校验失败');
  const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let n=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>descriptor.rawBytes)throw Error('会社资料长度异常');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(n!==descriptor.rawBytes)throw Error('会社资料不完整');const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }});
 let workspace;
 return Object.freeze({...reviewed,loadWorkspace:()=>workspace??=original.loadWorkspace().then(w=>reviewed.attachWorkspace(w)).catch(e=>{workspace=null;throw e;})});
}
let shared;export const getStaticCompanyClient=()=>shared??=createStaticCompanyClient();
