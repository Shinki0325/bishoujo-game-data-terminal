import {CURRENT_WORK_LISTS} from './current-work-lists-config.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {WORK_FULL_CARDS} from './work-full-cards-config.js';
import {CREDIT_SCOPE} from './credit-scope-config.js';
import {createResourceRequest} from './resource-request.js';
import {selectionPages} from './selection-pages.js';

export const CURRENT_LIST_ALGORITHM=1;
export const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const currentListSource=()=>canonical({
  algorithm:CURRENT_LIST_ALGORITHM,workbench:WORKBENCH_DEMAND.sha256,
  ratings:WORK_FULL_CARDS.split?.sha256,ratingRevision:WORK_FULL_CARDS.split?.ratingRevision,
  editionOverrides:CREDIT_SCOPE.editionOverrides??{},familyCorrections:CREDIT_SCOPE.familyCorrections??{},
  sourceBindingOverrides:CREDIT_SCOPE.sourceBindingOverrides??{}
});
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function createCurrentWorkLists({config=CURRENT_WORK_LISTS,source=currentListSource(),fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}){
  const current=equal(config.source,source),request=createResourceRequest({fetchImpl}),cache=new Map();
  return Object.freeze({current,async query(filter){
    if(!current)return null;
    const key=JSON.stringify(canonical(filter)),d=config.queries?.[key];
    if(!d)return null;
    if(cache.has(d.sha256))return cache.get(d.sha256);
    if(d.path!==`query-${d.sha256}.json.gz`||!/^[a-f0-9]{64}$/u.test(d.sha256)
      ||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>1024*1024
      ||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>4*1024*1024)throw Error('当前列表描述无效');
    const promise=request(new URL('../runtime-data/current-work-lists-v1/'+d.path,import.meta.url),{
      label:'作品列表',validationKey:d.sha256,validate:async bytes=>{
        const sha=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
        if(bytes.byteLength!==d.bytes||sha!==d.sha256)throw Error('当前列表摘要不符');
        const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let n=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>d.rawBytes)throw Error('当前列表超过预算');chunks.push(value);}}
        finally{await reader.cancel().catch(()=>{});}
        if(n!==d.rawBytes)throw Error('当前列表长度不符');
        const raw=new Uint8Array(n);let pos=0;for(const v of chunks){raw.set(v,pos);pos+=v.length;}
        const row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        if(row.schema!=='galpedia-current-work-list-v1'||!equal(row.filterState,filter)
          ||!Array.isArray(row.workIds)||row.workIds.some(id=>typeof id!=='string'||!/^[1-9]\d*$/u.test(id))
          ||new Set(row.workIds).size!==row.workIds.length||!row.counts)throw Error('当前列表身份不符');
        const pages=selectionPages(row.workIds.length);
        return {...row,pages:pages.map((p,i)=>({page:{...p,pageNumber:i+1,pageCount:pages.length,total:row.workIds.length}}))};
      }
    }).catch(error=>{cache.delete(d.sha256);throw error;});
    cache.set(d.sha256,promise);while(cache.size>4)cache.delete(cache.keys().next().value);return promise;
  }});
}
