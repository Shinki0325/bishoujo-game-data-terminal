// Enabled by an explicit, version-pinned local/candidate configuration only.
// A failed enabled service is an error, never a reason to download the entire index.
const cache=new Map();
export function searchServiceConfig(){const c=globalThis.__GALPEDIA_SEARCH_SERVICE__;return c?.schema===3&&/^[a-f0-9]{64}$/.test(c.revision)&&c.endpoint==='/__search'?c:null;}
export async function querySearchService(path,parameters){
 const c=searchServiceConfig();if(!c)return null;
 const url=c.endpoint+path+'?'+new URLSearchParams({...parameters,revision:c.revision}),key=c.revision+url;
 if(!cache.has(key)){
  const pending=fetch(url,{signal:AbortSignal.timeout(20000)}).then(async r=>{if(!r.ok)throw Error('搜索服务暂时不可用');const v=await r.json();if(v.revision!==c.revision)throw Error('搜索资料版本不符');return v;}).catch(e=>{cache.delete(key);throw e;});
  cache.set(key,pending);while(cache.size>24)cache.delete(cache.keys().next().value);
 }
 return cache.get(key);
}
export async function serviceGlobalSearch(query){
 const value=await querySearchService('/query',{q:query});
 return value?Object.fromEntries(Object.entries(value.groups).map(([k,g])=>[k,g.items.map(({kind,...r})=>r)])):null;
}
export function supportsLibrarySearch(sort){return Boolean(searchServiceConfig())&&/^(voteCount|median|vndbVoteCount|vndbScore|bangumiVoteCount|bangumiScore|title|brandName)-(asc|desc)$/.test(sort);}
export function supportsLibraryFilter(filter){
 const c=searchServiceConfig();if(!c||!filter?.titleQuery?.trim()||!supportsLibrarySearch(filter.sortKey+'-'+filter.sortDirection))return false;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 return Object.entries(c.libraryFilter??{}).every(([k,v])=>['titleQuery','sortKey','sortDirection','mode'].includes(k)||same(filter[k]??v,v))
  &&Object.keys(filter).every(k=>Object.hasOwn(c.libraryFilter,k));
}
