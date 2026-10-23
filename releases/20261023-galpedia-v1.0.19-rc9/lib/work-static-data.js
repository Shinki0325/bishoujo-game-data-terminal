import {WORK_STATIC} from './work-static-config.js';
import {createResourceRequest} from './resource-request.js';
import {restoreWorkbenchContext} from './workbench-demand-data.js';
import {validateWorkbenchUISummary} from './workbench-ui-summary.js';
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

