import {createWorkCreditCatalog} from './work-credit-catalog.js';
import {CREDIT_SCOPE} from './credit-scope-config.js';
import {getWorkReadingData} from './work-reading-data.js';
import {createStaticWorkData} from './work-static-data.js';
import {createWorkDetailView,createWorkVersionView,createWorkDetailCreditsView,setEarlyWorkCleanup} from './shared-work-views.js';
import {createFullWikiWorkDetailLoader} from './full-wiki-work-detail-loader.js';
import {createWorkDetailCreditsLoader} from './work-detail-credits.js';
import {createPageDataClient} from './page-data-client.js';
import {createPreparedWorkLoader} from './work-detail-preparation.js';
import {createWorkCreditsController,createWorkStatsController} from './work-detail-resources-controller.js';
import {createPersonFamilyLookup as createFamilyLookup} from './person-family-lookup.js';
import {creditScopeClient} from './credit-scope-client.js';
import {resolveAssetUrl} from './asset-url.js';
import {ATTRIBUTE_GROUP_IDS,FILTER_GROUP_ORDER} from './attribute-filters.js';
import {captureDialogState,restoreDialogState} from './detail-stack.js';
import {createTelemetryClient} from './telemetry-client.js';
import {configuredAssetBase,PRESENTATION_FAMILIES_SIDECAR_SHA256,DATA_URLS,RUNTIME_DATA_CACHE_MODE,CHARACTER_IMAGE_MAP_SNAPSHOT_ID,CHARACTER_IMAGE_MAP_SHA256,CHARACTER_IMAGE_ALIAS_MAP_SHA256,CHARACTER_IMAGE_ASSET_BASE,CHARACTER_IMAGE_ASSET_FALLBACK_BASE,TELEMETRY_ENDPOINT,TELEMETRY_RELEASE_ID,TELEMETRY_PUBLIC_STATS_ENDPOINT} from './runtime-config.js';

export async function createWorkDetailEntry({openEntity,activateFull,onClose,onId,initialWorkId}){
 const dataReady=getWorkReadingData(),staticDataClient=createPageDataClient(),metadata=createStaticWorkData();
 let data,legacy;
 const contextWarm=createWorkCreditCatalog({source:CREDIT_SCOPE});
 const prepareContext=id=>{void contextWarm.load(String(id)).catch(()=>{});};
 const loader=createPreparedWorkLoader(createFullWikiWorkDetailLoader({scopeClient:creditScopeClient,staticDataClient,
  fallbackLoader:{load:async id=>{data=await dataReady;return (legacy??=legacyLoader()).load(id);}}}));
 if(initialWorkId){prepareContext(initialWorkId);void loader.load(initialWorkId).catch(()=>{});void metadata.metadata([initialWorkId],'aliases').catch(()=>{});}
 data=await dataReady;
 const get=id=>document.getElementById(id),assetBase=configuredAssetBase();
 const ids=['dialog','title','brand','aliases','cover','cover-image','release','score','tags','version-toggle','version-shelf','version-list','version-current'];
 const elements=Object.fromEntries(ids.map(id=>['details'+id.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(''),get(id==='dialog'?'work-details':'details-'+id)]));
 const dialog=elements.detailsDialog,source=data.presentationFamiliesSource;
 if(source&&source.sha256!==(data.fullWiki?.familySha256??PRESENTATION_FAMILIES_SIDECAR_SHA256))throw Error('版本资料来源不符');
 const families=source?createFamilyLookup(source.value,{catalogSnapshotId:data.sampleSource.snapshot?.snapshotId,catalogSha256:data.catalogSource.sha256,workIds:data.populationContract.presentation.workIds,bangumiSubjectByWorkId:null}):null;
 const filters=new Map(data.sample.filters.map(f=>[f.filterId,f])),order=new Map(FILTER_GROUP_ORDER.map((v,i)=>[v,i]));
 const presentation=createWorkDetailView({elements,documentRef:document,attributeGroupIds:new Set(ATTRIBUTE_GROUP_IDS),partitionFilters:work=>{
  const rows=[...new Set([...(work.filterIds??[]),...(work.genreFilterIds??[]),work.platformFilterId])].map(id=>filters.get(id)).filter(Boolean)
   .sort((a,b)=>(order.get(a.groupId)??FILTER_GROUP_ORDER.length)-(order.get(b.groupId)??FILTER_GROUP_ORDER.length)||a.displayOrder-b.displayOrder||a.displayTitle.localeCompare(b.displayTitle,'zh-CN')||a.filterId.localeCompare(b.filterId));
  return {visible:rows.filter(f=>!['character','adult'].includes(f.groupId)),collapsed:rows.filter(f=>['character','adult'].includes(f.groupId))};
 }});
 const versions=createWorkVersionView({elements,documentRef:document,familyForWork:id=>families?.familyForWork(id)??null,onSelectWork:id=>open(id,{keepVersionShelf:true})});
 const view=createWorkDetailCreditsView({root:get('details-credits'),status:get('details-credits-status'),tabs:get('details-credits-tabs'),content:get('details-credits-content')});
 function legacyLoader(){return createWorkDetailCreditsLoader({indexUrl:DATA_URLS.workDetailCreditsIndex,catalogSnapshotId:'egs-tier-vote-30-2026-08-05-full-v1',catalogSha256:'50ae65d350e8671cc2e48af02e48522364c0aeb16e6667a9abe64d3878ac96c6',workIds:new Set(data.uiSummary.workIds),fetchImpl:fetch,cryptoRef:crypto,cacheMode:RUNTIME_DATA_CACHE_MODE,characterImageMapSnapshotId:CHARACTER_IMAGE_MAP_SNAPSHOT_ID,characterImageMapSha256:CHARACTER_IMAGE_MAP_SHA256,characterImageAliasMapSha256:CHARACTER_IMAGE_ALIAS_MAP_SHA256});}
 const resources=createWorkCreditsController({loader,view,dialog,contentRoot:get('details-credits'),ensureProjectRuntime:async()=>null,getProjectRuntime:()=>null,loadIdentityCrosswalk:async()=>null,characterAssetBase:CHARACTER_IMAGE_ASSET_BASE,characterAssetFallbackBase:CHARACTER_IMAGE_ASSET_FALLBACK_BASE});
 const stats=createWorkStatsController({row:get('details-views-row'),output:get('details-views'),endpointUrl:TELEMETRY_PUBLIC_STATS_ENDPOINT,pageOrigin:location.origin,isOpen:()=>dialog.open});
 const telemetry=createTelemetryClient({endpoint:TELEMETRY_ENDPOINT,releaseId:TELEMETRY_RELEASE_ID});
 let sequence=0,active=true,current=null;
 const suspend=()=>{sequence++;resources.suspend();stats.suspend();presentation.suspend();};
 setEarlyWorkCleanup(()=>{active=false;suspend();});
 dialog.addEventListener('close',()=>{if(!active||dialog.open)return;suspend();view.clear();onClose();});
 // Native dialog forms retain their existing close/cancel behavior.
 async function fullAction(id,selector){
  await activateFull();await (await import('./shared-detail-runtime.js')).openBoundDetail('work',id);
  get(selector).click();
 }
 async function open(id,{keepVersionShelf=false,isCurrent=()=>true}={}){
  id=String(id);const ticket=++sequence;
  if(!data.uiSummary.workIds.includes(id))throw Error('作品不存在');
  prepareContext(id);void loader.load(id).catch(()=>{});
  const [records,aliases]=await Promise.all([data.workData.get([id]),metadata.metadata([id],'aliases')]);
  const work=records.get(id);if(!work)throw Error('作品资料缺失');
  if(!active||ticket!==sequence||!isCurrent())return;
  current=id;onId(id);dialog.dataset.entityId=id;
  presentation.render(work,{workAliasesById:new Map(aliases.map(row=>[row.workId,row.aliases])),onOpenCompany:id=>openEntity('company',id),egsSnapshotAt:data.catalogSource.value.snapshot?.generatedAt,detailMedia:{
   coverSources:async work=>({thumbnailUrl:resolveAssetUrl(work.projectedThumbnailPath??work.coverPath,assetBase),previewUrl:work.projectedPreviewPath?resolveAssetUrl(work.projectedPreviewPath,assetBase):null}),
   fallbackUrl:resolveAssetUrl('assets/cover-unavailable.webp',assetBase),open:()=>fullAction(id,'details-cover')
  }});
  versions.render(work,{keepExpanded:keepVersionShelf});telemetry.recordWorkOpen(id);void stats.load(work);void resources.start(work);
  get('details-compare-button').onclick=()=>{void fullAction(id,'details-compare-button');};
 }
 return {dialog:()=>dialog,id:()=>dialog.dataset.entityId,open,capture:()=>captureDialogState(dialog),restore:s=>restoreDialogState(dialog,s),cancel:suspend};
}
