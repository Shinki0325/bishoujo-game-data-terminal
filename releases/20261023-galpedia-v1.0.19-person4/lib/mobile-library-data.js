import {querySearchService,supportsLibrarySearch} from './search-service-client.js';
import {createCurrentWorkLists} from './current-work-lists.js';
import {WORK_FULL_LIST} from './work-full-list-config.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {splitWorkCards} from './work-full-cards.js';
import {withFullWikiWorkMedia} from './full-wiki-work-data.js';
import {SELECTION_PAGE_SIZE} from './selection-pages.js';
export const MOBILE_LIBRARY_PAGE_SIZE=24;
function mobilePage(total,requested,size=MOBILE_LIBRARY_PAGE_SIZE){
 const pageCount=Math.max(1,Math.ceil(total/size));
 const pageNumber=Math.min(Math.max(1,requested),pageCount),start=(pageNumber-1)*size;
 return {start,end:Math.min(total,start+size),pageNumber,pageCount,total};
}
function pageIds(ids,requested,size){const page=mobilePage(ids.length,requested,size);return {status:'ok',allWorkIds:ids,workIds:ids.slice(page.start,page.end),page};}

export function createMobileLibraryData({pageSize=MOBILE_LIBRARY_PAGE_SIZE}={}){
 if(![24,48].includes(pageSize))throw Error("作品分页尺寸无效");
 const lists=createCurrentWorkLists(),split=splitWorkCards();let fallback;
 const full=()=>fallback??=import('./work-static-client.js').then(m=>m.getStaticWorkbench()).catch(e=>{fallback=null;throw e;});
 let basisPending,familyLookup;
 const reading=()=>basisPending??=import('./work-reading-data.js').then(m=>m.getWorkReadingData()).catch(e=>{basisPending=null;throw e;});
 let cardStore;
 const cards=()=>cardStore??=(async()=>{
  if(pageSize===48)return (await reading()).workData;
  if(!split)return (await full()).workData;
  const url=new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url);
  // Both authorities are pinned independently. Do not serialize their reads.
  const [{createWorkbenchStore,manifest},{withSplitRatingWorkData},snapshot]=await Promise.all([
   import('./workbench-demand-data.js').then(async m=>({...m,manifest:m.validateWorkbenchManifest(await m.readWorkbenchFile(url,WORKBENCH_DEMAND.sha256))})),
   import('./split-work-cards.js'),split.manifest()]);
  if(snapshot.sourceManifestSha256!==WORKBENCH_DEMAND.sha256||snapshot.count!==manifest.count)throw Error('作品卡片来源不符');
  // The compact split card rows are not complete edition facts. Use the same
  // source rows, review/media passes and rating projection as the full library.
  const source=withFullWikiWorkMedia(createWorkbenchStore(manifest,snapshot.workIds,{baseUrl:url,maxCached:8,maxRecords:96}),null);
  return withFullWikiWorkMedia(await withSplitRatingWorkData(source,split),null);
 })().catch(error=>{cardStore=null;throw error;});
 // Query-shard transport already has a bounded cache. Do not retain a second
 // set of large candidate rows across mobile searches.
 const candidates=query=>import('./query-search-entry.js').then(m=>m.searchByQuery(query,{workCandidates:true})).catch(()=>null);
 async function original(route,filterState){
  const data=await full(),client=data.staticQueryClient;
  await client.init({workbenchSource:{sha256:WORKBENCH_DEMAND.sha256,media:'on-demand-v1'}});
  // Reuse the authoritative 48-ID query window; fetch complete cards only for
  // the requested 24-ID half. No second grouping or shortened search corpus.
  if(SELECTION_PAGE_SIZE%pageSize)throw Error('分页窗口不兼容');
  const nativePage=Math.floor((route.pageNumber-1)*pageSize/SELECTION_PAGE_SIZE)+1;
  const request={filterState:{...filterState,titleQuery:route.query},selectedWorkIds:[],paged:true,pageNumber:nativePage,includeProjectedCounts:false};
  let result=await client.query(request);
  if(result.status==='ok'&&result.page.pageNumber!==Math.min(nativePage,result.page.pageCount))result=await client.query(request);
  if(result.status!=='ok')return result;
  const page=mobilePage(result.page.total,route.pageNumber,pageSize),offset=page.start-result.page.start;
  if(offset<0||offset+page.end-page.start>result.workIds.length)throw Error('分页结果范围不符');
  return {status:'ok',workIds:result.workIds.slice(offset,offset+page.end-page.start),page};
 }
 return {async query(route){
  route={...route,query:String(route.query??'').normalize('NFKC').trim().slice(0,120)};
  if(route.query&&supportsLibrarySearch(route.sort))return querySearchService('/library',{q:route.query,sort:route.sort,page:route.pageNumber,pageSize});
  // Browsing always renders a page of complete cards. Prepare their verified
  // store beside the independent list read, without fetching another page.
  if(!route.query)void cards().catch(()=>{});
  const [sortKey,sortDirection]=route.sort.split('-'),filterState={...WORK_FULL_LIST.filterState,sortKey,sortDirection};
  // Every non-empty search needs the authoritative family context, including
  // the complete-engine fallback. Prepare it alongside query candidates.
  const [snapshot,rows,subset,basis]=await Promise.all([split?.manifest(),route.query?null:lists.query(filterState).catch(()=>null),route.query?candidates(route.query):null,route.query?reading():null]);
  if(split?.usingFallback||!snapshot)return original(route,filterState);
  if(route.query){
   // Release-date ordering uses the earliest date of every group member,
   // including unmatched editions. Keep that full-group ordering authoritative.
   if(sortKey==='releaseDate'||!subset?.works||!subset?.companies)return original(route,filterState);
   const [{prepareGlobalWorkSearch},{createQueryIndex,queryIndexedCatalog},{createWorkbenchResultWindow},works]=await Promise.all([
    import('./galpedia-search.js'),import('./query-index.js'),import('./workbench-result-window.js'),split.projectRows(subset.works)]);
   // The library's company search carries reviewed aliases/pinyin not identical
   // to the global ranking fields. Delegate those queries to the original
   // complete query engine instead of treating the global surfaces as facts.
   const {normalizeLooseSearchText}=await import('./search-normalization.js');
   const q=normalizeLooseSearchText(route.query);
   if(subset.companies.some(c=>normalizeLooseSearchText(c._searchText??c.brandName).includes(q)))return original(route,filterState);
   const searchText=prepareGlobalWorkSearch(works,subset.companies);
   const brands=subset.companies.map(c=>({...c,brandId:c.brandId??c.companyId}));
   const index=createQueryIndex({works,brands,companyAliasesById:new Map(brands.map(b=>[b.brandId,b.searchAliases??b.aliases??[]])),companyPinyinById:new Map(brands.map(b=>[b.brandId,b.searchPinyin??b.pinyin??[]])),knownFilterIds:[...new Set(works.flatMap(w=>[...(w.filterIds??[]),...(w.genreFilterIds??[]),w.platformFilterId].filter(Boolean)))],searchText});
   const matching=queryIndexedCatalog(index,{...filterState,titleQuery:route.query});
   if(!familyLookup&&basis.presentationFamiliesSource){
    const {createPersonFamilyLookup}=await import('./person-family-lookup.js');
    familyLookup=createPersonFamilyLookup(basis.presentationFamiliesSource.value,{catalogSnapshotId:basis.sampleSource.snapshot?.snapshotId,catalogSha256:basis.catalogSource.sha256,workIds:basis.populationContract.presentation.workIds,bangumiSubjectByWorkId:null});
   }
   const window=createWorkbenchResultWindow({...basis,ratedDisplayWorks:works},{familyLookup});
   const result=window.project({status:'ok',workIds:matching.map(w=>w.workId)},{filterState,pageNumber:route.pageNumber,selectedWorkIds:[]});
   return pageIds(window.ids(result.page.resultRevision),route.pageNumber,pageSize);
  }
  if(!rows)return original(route,filterState);
  return pageIds(rows.workIds,route.pageNumber,pageSize);
 },async cards(ids){
  // This page needs these exact ratings. Start their existing verified read
  // alongside source cards; discard the partial rows and expose only getList's
  // complete edition/media projection. No next-page speculative downloads.
  const ratings=split?split.projectRows(ids.map(workId=>({workId}))):null;
  const [rows]=await Promise.all([cards().then(store=>store.getList(ids)),ratings]);
  if(pageSize!==48)return [...rows.values()];
  // Desktop keeps the existing public-version badge. The shared reading basis
  // is also reused by detail links; no filter engine or saved board is loaded.
  const basis=await reading();
  if(!familyLookup&&basis.presentationFamiliesSource){
   const {createPersonFamilyLookup}=await import('./person-family-lookup.js');
   familyLookup=createPersonFamilyLookup(basis.presentationFamiliesSource.value,{catalogSnapshotId:basis.sampleSource.snapshot?.snapshotId,catalogSha256:basis.catalogSource.sha256,workIds:basis.populationContract.presentation.workIds,bangumiSubjectByWorkId:null});
  }
  return [...rows.values()].map(work=>{const family=familyLookup?.familyForWork(work.workId);return family?{...work,presentationFamily:family,presentationMemberCount:family.members.length}:work;});
 }};
}
