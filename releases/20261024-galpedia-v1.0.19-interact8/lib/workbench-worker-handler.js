import {installReviewedTagQuery,installReviewedTagVocabulary,prepareReviewedTagQuery} from './reviewed-tags.js';
import {usesCoreSearchText} from './work-search-data.js';
import {normalizeLooseSearchText} from './search-normalization.js';
import {loadCompanyWorkFilter} from './company-work-filter-loader.js';
import { createWorkbenchResultWindow } from './workbench-result-window.js';
import {createWorkbenchUISummary,createOwnedWorkbenchUI,projectPersonWorkMetadata} from './workbench-ui-summary.js';
import {worksForCompany} from './company-directory.js';
import {FULL_WIKI_RUNTIME} from './full-wiki-runtime-config.js';

// Serial worker dispatcher owns query inputs; UI receives display data once.
export function createWorkbenchWorkerHandler({runtime,loadSource,projectWork,onData}) {
  let owned=null, window=null, search=null, cardsPromise=null, companyPromise=null, searchPromise=null;
  const ensureCards=async()=>{
    if(owned?.cards)return owned.cards;
    if(!owned)throw new TypeError('owned catalog has not been initialized');
    cardsPromise??=import('./work-full-cards.js').then(module=>module.loadFullWorkCards(owned.sha256)).then(async cards=>{
      await cards.bind(owned.data.ratedDisplayWorks.map(work=>work.workId));return cards;
    }).catch(error=>{cardsPromise=null;throw error;});
    const cards=await cardsPromise;
    owned={...owned,cards};
    return cards;
  };
  const ensureSearch=async(query="")=>{
    const kind=owned?.data?.searchCoreAvailable&&usesCoreSearchText(query)?(normalizeLooseSearchText(query)?'core':'symbols'):'full';
    if(owned?.options?.searchText&&(owned.options.searchTextKind==='full'||owned.options.searchTextKind===kind))return owned.options.searchText;
    if(!owned?.data?.loadSearchText)return null;
    return searchPromise??=Promise.resolve().then(()=>owned.data.loadSearchText(query)).then(async searchText=>{
    let result=runtime.handle({type:'search-text',payload:{searchText}});
    if(result.type==='error'&&searchText.transportKind!=='full'){
      searchText=await owned.data.loadSearchText('');
      result=runtime.handle({type:'search-text',payload:{searchText}});
    }
    if(result.type==='error')throw new Error(result.error?.message??'搜索索引安装失败');
    owned={...owned,options:{...owned.options,searchText,searchTextKind:searchText.transportKind??kind}};
    searchPromise=null;return searchText;
    }).catch(error=>{searchPromise=null;throw error;});
  };
  const ensureCompany=async()=>{
    if(owned?.options?.companyWorkIndex)return owned.options.companyWorkIndex;
    return companyPromise??=Promise.resolve().then(loadCompanyWorkFilter).then(companyWorkIndex=>{
    const result=runtime.handle({type:'update',payload:{...owned.options,companyWorkIndex}});
    if(result.type==='error')throw new Error(result.error?.message??'会社筛选索引安装失败');
    owned={...owned,options:{...owned.options,companyWorkIndex}}; window?.invalidate();
    return companyWorkIndex;
    }).catch(error=>{companyPromise=null;throw error;});
  };
  const ensureTags=async message=>{
    if(!owned||owned.tagsReady)return;
    const f=message.payload?.filterState;
    const needed=f&&(f.positiveFilterIds?.length||f.excludedFilterIds?.length||f.excludeNukige||f.advancedExpression?.trim())||message.type==='query-counts'||message.payload?.includeProjectedCounts;
    if(!needed)return;
    await installReviewedTagQuery(owned.data);
    const options={...owned.options,works:owned.data.ratedDisplayWorks.map(w=>({...projectWork(w),tagExcludedFilterIds:w.tagExcludedFilterIds}))};
    const result=runtime.handle({type:'update',payload:options});if(result.type==='error')throw Error(result.error.message);
    owned={...owned,options,tagsReady:true};window?.invalidate();
  };
  return async message=>{
    if(message?.type==='warm-search') {
      try {if(owned?.data?.searchCoreAvailable)return {id:message.id,type:'ready',workCount:owned.data.ratedDisplayWorks.length};await ensureSearch();return await runtime.warmSearch(message);}
      catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if(message?.type==='work-list-cards') {
      try {
        const cards=await ensureCards();
        return {id:message.id,type:'work-list-cards',rows:await cards.get(message.payload?.workIds)};
      }catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if (message?.type === 'work-metadata') {
      try {
        if(!owned)throw new TypeError('owned catalog has not been initialized');
        const {workIds,kind}=message.payload??{};
        if(!['person','person-summary','aliases','titles'].includes(kind)||!Array.isArray(workIds)||workIds.length>50000||workIds.some(id=>typeof id!=='string'))throw new TypeError('invalid work metadata request');
        const ids=new Set(workIds);
        const complete=owned.data.loadCompleteData?await owned.data.loadCompleteData():owned.data;
        const matching=complete.ratedDisplayWorks.filter(work=>ids.has(work.workId));
        const media=kind==='person'&&owned.data.mediaData ? await owned.data.mediaData.get(matching.map(work=>work.workId)) : null;
        const rows=matching.map(work=>kind==='person'||kind==='person-summary'
          ? projectPersonWorkMetadata(media?.get(work.workId)??work)
          : kind==='titles' ? {workId:work.workId,title:work.title}
          : {workId:work.workId,aliases:complete.workAliasesById?.get?.(work.workId)??[]});
        return {id:message.id,type:'work-metadata',rows};
      } catch(error) {return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if (['company-work-ids','person-catalog'].includes(message?.type)) {
      try {
        if(!owned)throw new TypeError('owned catalog has not been initialized');
        if(message.type==='person-catalog')return {id:message.id,type:'person-catalog',works:owned.data.ratedDisplayWorks.map(({workId,title,releaseDate})=>({workId,title,releaseDate}))};
        const {companyId,sortKey='releaseDate',direction='asc'}=message.payload??{};
        if(!owned.data.brands.some(b=>b.brandId===companyId)||!['releaseDate','median','voteCount'].includes(sortKey)||!['asc','desc'].includes(direction))throw new TypeError('invalid company works request');
        return {id:message.id,type:'company-work-ids',workIds:worksForCompany({works:owned.data.ratedDisplayWorks},companyId,{sortKey,direction}).map(w=>w.workId)};
      }catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if (message?.type === 'work-search') {
      try {
        if (!owned) throw new TypeError('owned work search has not been initialized');
        if (typeof message.payload?.query !== 'string' || message.payload.query.length > 1000) throw new TypeError('invalid work search query');
        if (!search) {
          const [{createGalpediaSearch},{buildCompanyDirectory}] = await Promise.all([
            import('./galpedia-search.js'), import('./company-directory.js')
          ]);
          const data=owned.data.loadCompleteData?await owned.data.loadCompleteData():owned.data;
          const {loadSearchProjection}=await import('./search-projections.js');
          const {splitWorkCards}=await import('./work-full-cards.js');
          const projected=await loadSearchProjection('workSearch',{workbench:owned.sha256,ratings:splitWorkCards()?.revision??null});
          search=createGalpediaSearch({works:data.ratedDisplayWorks,
            workSearchText:projected?.searchText??null,
            companySearch:projected?new Map(projected.companyRanks):null,
            companyDirectory:projected?.companies?{companies:projected.companies}:buildCompanyDirectory({brands:data.brands,works:data.ratedDisplayWorks,
              companyAliasesById:data.enrichment?.companyAliasesById,companyPinyinById:data.enrichment?.companyPinyinById,includeWorks:false}),
            enrichment:{workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,workDisplayTitlesById:data.workDisplayTitlesById},
            loadPersons:async()=>[]});
        }
        return {id:message.id,type:'work-search',works:(await search(message.payload.query)).works};
      } catch(error) {return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if(message?.type==='query-counts'&&window){
      try {
      await ensureTags(message);
      const filter=message.payload?.filterState;
      if (filter?.titleQuery) await ensureSearch(filter.titleQuery);
      if (filter?.brandIds?.length) await ensureCompany();
      const result=runtime.handle(message);
      return result.type==='counts'?window.project(result,{...message.payload,countsOnly:true}):result;
      } catch(error) {return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
    }
    if (message?.type === 'result-ids' || (message?.type === 'query' && message.payload?.paged)) {
      try {
        if (!window) throw new TypeError('owned result window has not been initialized');
        await ensureTags(message);
      const filter=message.payload?.filterState;
        if (filter?.titleQuery) await ensureSearch(filter.titleQuery);
        if (filter?.brandIds?.length) await ensureCompany();
        if (message.type === 'result-ids') return {id:message.id,type:'result-ids',workIds:window.ids(message.payload.resultRevision)};
        const result = runtime.handle(message);
        return result.type === 'result' ? window.project(result, message.payload) : result;
      } catch (error) { return {id:message.id,type:'error',error:{name:error.name,message:error.message}}; }
    }
    if(!['init','update'].includes(message?.type)||!message.payload?.workbenchSource) {
      if(message?.type==='query'){
        try {await ensureTags(message);}
        catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message}};}
      }
      const result=runtime.handle(message);
      if(result.type==='ready'&&['init','update'].includes(message?.type)){owned=null;window=null;search=null;}
      if(result.type==='ready'&&['search-text','person-index'].includes(message?.type)) {
        window?.invalidate();
        if(owned&&message.type==='person-index')owned.options={...owned.options,personWorkIndex:message.payload.personWorkIndex};
      }
      return result;
    }
    const source=message.payload.workbenchSource;
    try {
      if(message.payload.includeWorkbenchUI!==undefined&&typeof message.payload.includeWorkbenchUI!=='boolean')throw new TypeError('invalid workbench UI delivery option');
      if(message.payload.includeWorkCards!==undefined&&typeof message.payload.includeWorkCards!=='boolean')throw new TypeError('invalid workbench card delivery option');
      // Static pages already loaded their pinned UI projection. Keep the
      // legacy delivery path for callers that need the worker to supply it.
      const includeUI=message.payload.includeWorkbenchUI!==false;
      const replacing=!owned||owned.sha256!==source.sha256||owned.media!==source.media||owned.queryOnly!==Boolean(source.queryOnly);
      // Query rows and tag evidence are independently pinned. Fetch together,
      // then install only after both validated successfully.
      const [bundle]=await Promise.all([replacing?loadSource(source):null,
        replacing&&message.payload.reviewedTags===true?prepareReviewedTagQuery():null]);
      const data=bundle?.data;
      if(data){if(message.payload.reviewedTags===true)await installReviewedTagQuery(data);else installReviewedTagVocabulary(data);}
      const cards=owned?.cards??null;
      const uiSummary=replacing&&includeUI?createWorkbenchUISummary(data,{includeCompanies:!(FULL_WIKI_RUNTIME.enabled&&Boolean(data.fullWiki))}):null;
      const uiData=replacing&&includeUI?createOwnedWorkbenchUI(data):null;
      if(data&&onData&&includeUI)onData({id:message.id,type:'workbench-data',manifestSha256:source.sha256,uiData,uiSummary});
      // UI metadata is independent of the query window. Let the main thread
      // validate/prepare it while this Worker validates families and builds its
      // window. Queries still require all validation below to succeed.
      const nextWindow = replacing ? createWorkbenchResultWindow(data) : window;
      const options=replacing?{
        works:data.ratedDisplayWorks.map(w=>({...projectWork(w),tagExcludedFilterIds:w.tagExcludedFilterIds})),
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
      owned={sha256:source.sha256,media:source.media,queryOnly:Boolean(source.queryOnly),options:updated,data:replacing?data:owned.data,cards,tagsReady:replacing?message.payload.reviewedTags===true:owned.tagsReady};
      cardsPromise=null; companyPromise=null; searchPromise=null;
      window=nextWindow;
      return data&&!onData&&includeUI?{...result,manifestSha256:source.sha256,uiData,uiSummary}:result;
    }catch(error){return {id:message.id,type:'error',error:{name:error.name,message:error.message,code:error.code,
      ...(Number.isFinite(error.retryAt)?{retryAt:error.retryAt}:{})}};}
  };
}
