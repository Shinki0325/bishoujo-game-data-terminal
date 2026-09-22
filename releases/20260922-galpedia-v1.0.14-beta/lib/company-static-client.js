
import {createStaticCompanyClient as originalClient} from './company-static-client-baseline.js';
import {restoreCompanySummary} from './company-directory.js';
import {createReviewedCompanyClient} from './company-reviewed-runtime.js';
import {createResourceRequest} from './resource-request.js';
const descriptor={"path":"f6125acd0ecc9ffc9b1f27cadda6efbf90e88aaece9dad74eb7681db22e53c88.json.gz","sha256":"f6125acd0ecc9ffc9b1f27cadda6efbf90e88aaece9dad74eb7681db22e53c88","bytes":2222694,"rawBytes":25324094};
const directoryDescriptor={"path":"directory.8cb2d05acae6dc207ae994f2194460a554191b3895f85df95e47ca1776da036a.json.gz","sha256":"8cb2d05acae6dc207ae994f2194460a554191b3895f85df95e47ca1776da036a","bytes":760135,"rawBytes":5095022};
async function readCompressed(request,descriptor,message){
 return request(new URL('../runtime-data/reviewed-company-v1/'+descriptor.path,import.meta.url),{label:message,validationKey:descriptor.sha256,validate:async packed=>{
 if(packed.byteLength!==descriptor.bytes||await (async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''))(packed)!==descriptor.sha256)throw Error(message+'校验失败');
 const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>descriptor.rawBytes)throw Error(message+'长度异常');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 if(n!==descriptor.rawBytes)throw Error(message+'不完整');const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }});
}
export function createStaticCompanyClient(options={}){
 const original=originalClient(options),fetchImpl=options.fetchImpl??globalThis.fetch;
 const request=createResourceRequest({fetchImpl,...options.requestPolicy});
 const reviewed=createReviewedCompanyClient({restoreCompanySummary,
  loadDirectoryPayload:()=>readCompressed(request,directoryDescriptor,'会社目录资料'),
  loadPayload:()=>readCompressed(request,descriptor,'会社资料')
 });
 let workspace;
 return Object.freeze({...reviewed,loadWorkspace:()=>workspace??=original.loadWorkspace().then(w=>reviewed.attachWorkspace(w)).catch(e=>{workspace=null;throw e;})});
}
let shared;export const getStaticCompanyClient=()=>shared??=createStaticCompanyClient();
