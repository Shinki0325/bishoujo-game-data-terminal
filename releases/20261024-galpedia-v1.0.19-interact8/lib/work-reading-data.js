import {WORK_STATIC} from './work-static-config.js';
import {WORK_BROWSE} from './work-browse-config.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {createStaticWorkData} from './work-static-data.js';
import {createBrowseStartupData} from './work-browse-data.js';
import {createWorkbenchStore,readWorkbenchFile,validateWorkbenchManifest,restoreWorkbenchContext} from './workbench-demand-data.js';
import {validateWorkbenchUISummary} from './workbench-ui-summary.js';
import {installReviewedTagVocabulary} from './reviewed-tags.js';
import {withFullWikiWorkMedia} from './full-wiki-work-data.js';
import {splitWorkCards} from './work-full-cards.js';
import {withSplitRatingWorkData} from './split-work-cards.js';
// Reading a work or folding search results does not need the workbench query
// client, saved lists, company filters or a Worker. Keep the same source pins,
// complete rows and media/rating projections as loadStaticWorkbench.
let pending;
export function getWorkReadingData(){return pending??=load().catch(e=>{pending=null;throw e;});}
async function load(){
 if(WORK_STATIC.sourceManifestSha256!==WORKBENCH_DEMAND.sha256||WORK_BROWSE.sourceManifestSha256!==WORKBENCH_DEMAND.sha256)throw Error('作品静态源已变化');
 const client=createStaticWorkData(),browse=createBrowseStartupData({config:WORK_BROWSE}),url=new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url),split=splitWorkCards();
 const [{uiData,uiSummary},manifest,site,splitManifest]=await Promise.all([browse.startup(),readWorkbenchFile(url,WORKBENCH_DEMAND.sha256).then(validateWorkbenchManifest),client.manifest(),split?.manifest()]);
 if(site.startup.sha256!==WORK_BROWSE.sourceStartupSha256)throw Error('浏览投影来源已变化');
 validateWorkbenchUISummary(uiSummary,site.count);
 if(uiData?.schema!=='galpedia-owned-ui-v1'||uiData.sample?.works?.length!==0||uiData.ratedDisplayWorks?.length!==0)throw Error('作品UI投影无效');
 restoreWorkbenchContext(uiData);installReviewedTagVocabulary(uiData);
 if(splitManifest&&(splitManifest.sourceManifestSha256!==WORKBENCH_DEMAND.sha256||splitManifest.count!==manifest.count))throw Error('作品卡片来源不符');
 let workData=withFullWikiWorkMedia(createWorkbenchStore(manifest,uiSummary.workIds,{baseUrl:url}),null);
 if(split)workData=await withSplitRatingWorkData(workData,split);
 return {...uiData,bangumiPublicBindings:null,uiSummary,workData:withFullWikiWorkMedia(workData,null)};
}
