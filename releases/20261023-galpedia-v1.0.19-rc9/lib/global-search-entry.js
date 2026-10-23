import {serviceGlobalSearch,searchServiceConfig} from './search-service-client.js';
const searchByQuery=(...args)=>import('./query-search-entry.js').then(m=>m.searchByQuery(...args));
// The complete index is a fallback for broad queries and unavailable shards.
// Do not load its Worker/person-directory dependencies for ordinary queries.
const complete=query=>import('./global-search-complete.js').then(m=>m.searchComplete(query));
export async function searchGlobal(query){
 if(searchServiceConfig())return serviceGlobalSearch(query);

 try{const result=await searchByQuery(query);return result??complete(query);}
 catch(error){console.warn('按查询检索暂不可用，使用完整索引',error);return complete(query);}
}
