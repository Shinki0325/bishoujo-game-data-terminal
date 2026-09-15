const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function withRemoteWorkQueries(local,config,{fetchImpl=globalThis.fetch,now=()=>Date.now(),timeoutMs=1800}={}){
 const entries=new Map(config.entries.map(e=>[canonical(e.filter),e]));
 const pages=new Map();
 let sequence=0,active=null,revision=0,closed=false,cooldown=0,controller,available=true;
 const invalidate=()=>{sequence++;active=null;controller?.abort();controller=null;};
 return Object.freeze({...local,
  async query(value,options={}){
   controller?.abort();const ticket=++sequence,input=structuredClone(value),signature=canonical(input.filterState),entry=entries.get(signature),previous=active;
   active=null;
   if(closed)throw Error('作品查询已结束');
   const day=new Date(now()).toISOString().slice(0,10);
   const eligible=available&&entry&&input.paged&&!input.includeProjectedCounts&&!input.selectedWorkIds?.length&&Number.isSafeInteger(input.pageNumber)&&input.pageNumber>0&&now()>=cooldown&&(!entry.validFrom||day>=entry.validFrom)&&(!entry.validUntil||day<entry.validUntil);
   if(eligible){
    const abort=new AbortController();controller=abort;const timer=setTimeout(()=>abort.abort(),timeoutMs);
    try{
     options.onProgress?.('querying');
     const page=previous&&previous.signature!==signature?1:input.pageNumber;
     const cacheKey=entry.key+':'+page;let result=pages.get(cacheKey);
     if(!result){
     const response=await fetchImpl(`${config.endpoint}?build=${config.buildSha}&key=${entry.key}&page=${page}`,{signal:abort.signal,credentials:'omit'});
     if(!response.ok)throw Error('query unavailable');
     const reader=response.body.getReader(),chunks=[];let length=0;
     try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384)throw Error('query response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
     const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
     }
     const pageCount=Math.max(1,Math.ceil(entry.total/48)),number=Math.min(page,pageCount);
     if(result.schema!==config.schema||result.buildSha!==config.buildSha||result.key!==entry.key||result.total!==entry.total||result.pageNumber!==number||result.pageCount!==pageCount||!Array.isArray(result.workIds)||result.workIds.length!==Math.min(48,entry.total-(number-1)*48)||new Set(result.workIds).size!==result.workIds.length||result.workIds.some(id=>typeof id!=='string'||!/^\d{1,8}$/.test(id)))throw Error('query response mismatch');
     if(ticket!==sequence)return {status:'stale'};
     pages.delete(cacheKey);pages.set(cacheKey,result);while(pages.size>64)pages.delete(pages.keys().next().value);
     const id=previous?.signature===signature?previous.revision:`remote:${++revision}`;
     active={signature,revision:id,input,total:result.total};
     return {status:'ok',workIds:result.workIds,counts:null,page:{start:(number-1)*48,end:Math.min(number*48,result.total),total:result.total,pageNumber:number,pageCount,resultRevision:id,selectAllState:'none',unselectedCount:result.total}};
    }catch{if(ticket!==sequence)return {status:'stale'};cooldown=now()+30000;}
    finally{clearTimeout(timer);if(controller===abort)controller=null;}
   }
   const result=await local.query(input,options);return ticket===sequence?result:{status:'stale'};
  },
  async resultIds(id){
   if(!String(id).startsWith('remote:'))return local.resultIds(id);
   const snapshot=active,ticket=sequence;if(!snapshot||id!==snapshot.revision)throw Error('作品结果已变化');
   const result=await local.query({...snapshot.input,pageNumber:1});
   if(ticket!==sequence||active!==snapshot)throw Error('作品结果已变化');
   const ids=await local.resultIds(result.page.resultRevision);
   if(ticket!==sequence||active!==snapshot||ids.length!==snapshot.total)throw Error('作品结果已变化');return ids;
  },
  update(value){available=false;pages.clear();invalidate();return local.update(value);},
  installPersonWorkIndex(value){invalidate();return local.installPersonWorkIndex(value);},
  installSearchText(value){invalidate();return local.installSearchText(value);},
  terminate(){closed=true;pages.clear();invalidate();return local.terminate();}
 });
}
