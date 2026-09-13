import { WORK_STATIC } from './work-static-config.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { createResourceRequest } from './resource-request.js';
import { createWorkbenchStore, readWorkbenchFile, validateWorkbenchManifest, restoreWorkbenchContext } from './workbench-demand-data.js';
import { validateWorkbenchUISummary } from './workbench-ui-summary.js';
import { withFullWikiWorkMedia } from './full-wiki-work-data.js';

const same = (a,b) => a===b || (a && b && typeof a==='object' && typeof b==='object'
  && Array.isArray(a)===Array.isArray(b) && Object.keys(a).length===Object.keys(b).length
  && Object.keys(a).every(key=>Object.hasOwn(b,key)&&same(a[key],b[key])));

export function createStaticWorkData({config=WORK_STATIC,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream,requestPolicy={},maxCacheBytes=32*1024*1024}={}) {
  const manifestUrl=new URL(config.url,import.meta.url),base=new URL('./',manifestUrl);
  const request=createResourceRequest({...requestPolicy,fetchImpl});
  const cache=new Map();let manifestPromise,cacheBytes=0;
  const sha=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const pinned=(url,descriptor,validate)=>{
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||!Number.isSafeInteger(descriptor?.bytes)
      ||descriptor.bytes<1||descriptor.bytes>16*1024*1024||!/^[a-f0-9]{64}$/u.test(descriptor.sha256??''))throw Error('作品静态描述无效');
    return request(url,{label:'作品资料',validationKey:descriptor.sha256,validate:async bytes=>{
      if(bytes.byteLength!==descriptor.bytes||await sha(bytes)!==descriptor.sha256)throw Error('作品静态摘要不符');
      return validate(bytes);
    }});
  };
  const manifest=()=>manifestPromise??=pinned(manifestUrl,config,bytes=>{
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(value.schema!=='galpedia-work-static-manifest-v1'||value.revision!==config.revision
      ||value.sourceManifestSha256!==config.sourceManifestSha256||!Number.isSafeInteger(value.count)||value.count<1
      ||Object.keys(value.metadata??{}).length!==16)throw Error('作品静态清单不符');
    return value;
  }).catch(error=>{manifestPromise=null;throw error;});
  async function read(descriptor,expectedPath) {
    if(descriptor?.path!==expectedPath||!/^(?:startup|default-results|metadata-[0-9a-f])\.json\.gz$/u.test(expectedPath))throw Error('作品静态路径无效');
    if(cache.has(expectedPath)){const entry=cache.get(expectedPath);cache.delete(expectedPath);cache.set(expectedPath,entry);return entry.promise;}
    const entry={bytes:0,promise:null};
    entry.promise=pinned(new URL(expectedPath,base),descriptor,async bytes=>{
      const expected=descriptor.rawBytes;
      if(!Number.isSafeInteger(expected)||expected<1||expected>16*1024*1024||typeof decompress!=='function')throw Error('作品解压预算无效');
      const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>expected)throw Error('作品解压超过预算');chunks.push(value);}
        if(length!==expected)throw Error('作品解压长度不符');
      }finally{await reader.cancel().catch(()=>{});}
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(value.schema!=='galpedia-work-static-v1'||value.revision!==config.revision)throw Error('作品静态版本不符');
      entry.bytes=length;return value;
    }).then(value=>{cacheBytes+=entry.bytes;for(const [key,item]of cache){if(cacheBytes<=maxCacheBytes)break;if(item.bytes){cache.delete(key);cacheBytes-=item.bytes;}}return value;})
      .catch(error=>{cache.delete(expectedPath);throw error;});
    cache.set(expectedPath,entry);return entry.promise;
  }
  return Object.freeze({
    manifest,
    async startup(){const site=await manifest();const value=await read(site.startup,'startup.json.gz');
      validateWorkbenchUISummary(value.uiSummary,site.count);
      if(value.uiData?.schema!=='galpedia-owned-ui-v1'||value.uiData.sample?.works?.length!==0||value.uiData.ratedDisplayWorks?.length!==0)throw Error('作品UI投影无效');
      return {...value,uiData:restoreWorkbenchContext(value.uiData)};
    },
    async defaults(){const site=await manifest(),value=await read(site.defaults,'default-results.json.gz');
      if(!Array.isArray(value.workIds)||new Set(value.workIds).size!==value.workIds.length||!Array.isArray(value.pages)||!value.filterState)throw Error('默认作品结果无效');
      let position=0;
      for(const [i,row]of value.pages.entries()){
        if(row.page?.start!==position||row.page.end<=position||row.page.pageNumber!==i+1||row.page.total!==value.workIds.length
          ||row.page.pageCount!==value.pages.length||!same(row.workIds,value.workIds.slice(position,row.page.end)))throw Error('默认作品分页无效');
        position=row.page.end;
      }
      if(position!==value.workIds.length)throw Error('默认作品分页不完整');return value;
    },
    async metadata(ids,kind){
      if(!['aliases','titles','person-summary'].includes(kind)||!Array.isArray(ids)||ids.length>50000||ids.some(id=>typeof id!=='string'||!/^\d+$/u.test(id)))throw Error('作品元数据请求无效');
      const site=await manifest(),routes=await Promise.all(ids.map(async id=>({id,bucket:(await sha(new TextEncoder().encode(id)))[0]})));
      const groups=await Promise.all([...new Set(routes.map(row=>row.bucket))].map(async bucket=>{
        const value=await read(site.metadata[bucket],`metadata-${bucket}.json.gz`);
        if(value.bucket!==bucket||!value.records)throw Error('作品元数据分块无效');return [bucket,value.records];
      }));
      const records=new Map(groups);
      return routes.map(({id,bucket})=>{
        const row=records.get(bucket)[id];if(row?.workId!==id||!Array.isArray(row.aliases))throw Error('作品元数据身份无效');
        return kind==='aliases'?{workId:id,aliases:[...row.aliases]}:kind==='titles'?{workId:id,title:row.title}:{...row};
      });
    }
  });
}

// Default browsing and detail metadata have pinned projections. Any other
// query delegates to the existing complete engine with its original inputs.
export function createStaticWorkQueryClient({data,workerFactory,count,sourceSha256}) {
  let real,realPromise,payload,terminated=false,sequence=0,mode=null,virtualRevision=0,activeRevision=null,disabled=false;
  const alive=()=>{if(terminated)throw Error('作品查询已结束');};
  const engine=()=>{alive();return realPromise??=Promise.resolve().then(async()=>{real??=await workerFactory();if(terminated){real.terminate();alive();}await real.init(payload);return real;})
    .catch(error=>{realPromise=null;throw error;});};
  const delegate=async(method,...args)=>(await engine())[method](...args);
  const invalidate=()=>{activeRevision=null;mode='changed';sequence++;};
  return Object.freeze({
    preload(){alive();},
    async init(next){alive();if(next?.workbenchSource?.sha256!==sourceSha256)throw Error('作品查询源不符');payload=next;return {status:'ready',workCount:count};},
    async query(input){
      alive();const ticket=++sequence;const defaults=!disabled&&input.paged&&!input.includeProjectedCounts?await data.defaults():null;
      if(ticket!==sequence)return {status:'stale'};
      if(defaults&&same(input.filterState,defaults.filterState)){
        if(!Number.isSafeInteger(input.pageNumber)||input.pageNumber<1)throw Error('作品页码无效');
        const changed=mode!==null&&mode!=='static';if(mode!=='static')virtualRevision++;
        mode='static';activeRevision=`static:${virtualRevision}`;
        const index=changed?0:Math.min(input.pageNumber,defaults.pages.length)-1,row=defaults.pages[index];
        const selected=new Set(input.selectedWorkIds??[]),selectedCount=defaults.workIds.reduce((n,id)=>n+Number(selected.has(id)),0);
        return {status:'ok',workIds:[...row.workIds],counts:defaults.counts,page:{...row.page,resultRevision:activeRevision,
          selectAllState:selectedCount===0?'none':selectedCount===defaults.workIds.length?'all':'some',unselectedCount:defaults.workIds.length-selectedCount}};
      }
      mode='worker';activeRevision=null;const result=await delegate('query',input);return ticket===sequence?result:{status:'stale'};
    },
    async resultIds(revision){alive();if(typeof revision==='string'&&revision.startsWith('static:')){
      if(revision!==activeRevision)throw Error('作品结果已变化');const rows=await data.defaults();if(revision!==activeRevision)throw Error('作品结果已变化');return [...rows.workIds];
    }if(mode!=='worker')throw Error('作品结果已变化');return delegate('resultIds',revision);},
    async workMetadata(ids,kind){alive();return ['aliases','titles','person-summary'].includes(kind)?data.metadata(ids,kind):delegate('workMetadata',ids,kind);},
    searchWorks:query=>delegate('searchWorks',query),companyWorkIds:(id,options)=>delegate('companyWorkIds',id,options),personCatalog:()=>delegate('personCatalog'),
    warmSearch:()=>delegate('warmSearch'),installPersonWorkIndex(value){invalidate();return delegate('installPersonWorkIndex',value);},installSearchText(value){invalidate();return delegate('installSearchText',value);},
    update(next){disabled=true;payload=next;invalidate();return delegate('update',next);},
    terminate(){if(terminated)return false;terminated=true;sequence++;real?.terminate();return true;}
  });
}

export async function loadStaticWorkbench({fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}) {
  if(WORK_STATIC.sourceManifestSha256!==WORKBENCH_DEMAND.sha256)throw Error('作品静态源已变化');
  const client=createStaticWorkData({fetchImpl,cryptoRef}),url=new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url);
  const [{uiData,uiSummary},manifest]=await Promise.all([client.startup(),readWorkbenchFile(url,WORKBENCH_DEMAND.sha256,{fetchImpl,cryptoRef}).then(value=>validateWorkbenchManifest(value))]);
  const workData=withFullWikiWorkMedia(createWorkbenchStore(manifest,uiSummary.workIds,{baseUrl:url,fetchImpl,cryptoRef}),null);
  const staticQueryClient=createStaticWorkQueryClient({data:client,count:manifest.count,sourceSha256:WORKBENCH_DEMAND.sha256,
    workerFactory:async()=> (await import('./workbench-worker-session.js')).getOwnedWorkbenchClient()});
  return {...uiData,uiSummary,workerOwned:true,workData,staticQueryClient};
}
