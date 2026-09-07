// Serial worker dispatcher owns query inputs; UI receives display data once.
export function createWorkbenchWorkerHandler({runtime,loadSource,projectWork,onData}) {
  let owned=null;
  return async message=>{
    if(!['init','update'].includes(message?.type)||!message.payload?.workbenchSource)return runtime.handle(message);
    const source=message.payload.workbenchSource;
    try {
      const replacing=!owned||owned.sha256!==source.sha256;
      const bundle=replacing?await loadSource(source):null,data=bundle?.data;
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
      owned={sha256:source.sha256,options:updated};
      return data&&!onData?{...result,manifestSha256:source.sha256,workbenchBytes:bundle.bytes}:result;
    }catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message,code:error.code}};}
  };
}
