import { createWorkbenchResultWindow } from './workbench-result-window.js';

// Serial worker dispatcher owns query inputs; UI receives display data once.
export function createWorkbenchWorkerHandler({runtime,loadSource,projectWork,onData}) {
  let owned=null, window=null, search=null;
  return async message=>{
    if (message?.type === 'work-search') {
      try {
        if (!owned) throw new TypeError('owned work search has not been initialized');
        if (typeof message.payload?.query !== 'string' || message.payload.query.length > 1000) throw new TypeError('invalid work search query');
        if (!search) {
          const [{createGalpediaSearch},{buildCompanyDirectory}] = await Promise.all([
            import('./galpedia-search.js'), import('./company-directory.js')
          ]);
          const data=owned.data;
          search=createGalpediaSearch({works:data.ratedDisplayWorks,
            companyDirectory:buildCompanyDirectory({brands:data.brands,works:data.ratedDisplayWorks,
              companyAliasesById:data.enrichment?.companyAliasesById,companyPinyinById:data.enrichment?.companyPinyinById}),
            enrichment:{workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,workDisplayTitlesById:data.workDisplayTitlesById},
            loadPersons:async()=>[]});
        }
        return {id:message.id,type:'work-search',works:(await search(message.payload.query)).works};
      } catch(error) {return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if (message?.type === 'result-ids' || (message?.type === 'query' && message.payload?.paged)) {
      try {
        if (!window) throw new TypeError('owned result window has not been initialized');
        if (message.type === 'result-ids') return {id:message.id,type:'result-ids',workIds:window.ids(message.payload.resultRevision)};
        const result = runtime.handle(message);
        return result.type === 'result' ? window.project(result, message.payload) : result;
      } catch (error) { return {id:message.id,type:'error',error:{name:error.name,message:error.message}}; }
    }
    if(!['init','update'].includes(message?.type)||!message.payload?.workbenchSource) {
      const result=runtime.handle(message);
      if(result.type==='ready'&&['init','update'].includes(message?.type)){owned=null;window=null;search=null;}
      if(result.type==='ready'&&message?.type==='search-text')window?.invalidate();
      return result;
    }
    const source=message.payload.workbenchSource;
    try {
      const replacing=!owned||owned.sha256!==source.sha256;
      const bundle=replacing?await loadSource(source):null,data=bundle?.data;
      const nextWindow = replacing ? createWorkbenchResultWindow(data) : window;
      if(data&&onData)onData({id:message.id,type:'workbench-data',manifestSha256:source.sha256,workbenchBytes:bundle.bytes});
      const options=replacing?{
        works:data.ratedDisplayWorks.map(projectWork),
        knownFilterIds:data.sample.filters.map(filter=>filter.filterId),brands:data.brands,
        workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,
        companyAliasesById:data.enrichment?.companyAliasesById,
        companyPinyinById:data.enrichment?.companyPinyinById,searchText:data.searchText
      }:owned.options;
      const updated={...options};
      if(Object.hasOwn(message.payload,'personWorkIndex'))updated.personWorkIndex=message.payload.personWorkIndex;
      if(Object.hasOwn(message.payload,'searchText'))updated.searchText=message.payload.searchText;
      const result=runtime.handle({...message,payload:updated});
      if(result.type==='error')return result;
      if (!replacing) nextWindow.invalidate();
      if(replacing)search=null;
      owned={sha256:source.sha256,options:updated,data:replacing?data:owned.data};
      window=nextWindow;
      return data&&!onData?{...result,manifestSha256:source.sha256,workbenchBytes:bundle.bytes}:result;
    }catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message,code:error.code}};}
  };
}
