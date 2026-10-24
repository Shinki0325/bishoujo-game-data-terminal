import {attachCompanyDetailView} from './shared-detail-runtime.js';
import {loadCompanyDetail} from './company-detail-client.js';
import {getStaticWorkbench} from './work-static-client.js';
import {createCompanyWorkspaceController} from './company-workspace-controller.js';
import {companyImageUrl} from '../views/company-directory-view.js';
import {preparePresentationFamiliesSidecar} from './presentation-families.js';
import {configuredAssetBase,PRESENTATION_FAMILIES_SIDECAR_SHA256} from './runtime-config.js';
import {resolveAssetUrl} from './asset-url.js';
import {captureDialogState,restoreDialogState} from './detail-stack.js';

export async function createCompanyDetailEntry({openEntity,onId,onClose,isCurrent=()=>true}){
 const data=await getStaticWorkbench(),directory={companies:[],works:[]};let defaultRole='development';
 if(!isCurrent())return null;
 const assetBase=configuredAssetBase(),get=id=>document.getElementById(id);
 const source=data.presentationFamiliesSource;
 if(source&&source.sha256!==(data.fullWiki?.familySha256??PRESENTATION_FAMILIES_SIDECAR_SHA256))throw Error('版本资料来源不符');
 const families=source?preparePresentationFamiliesSidecar(source.value,{catalogSnapshotId:data.sampleSource.snapshot?.snapshotId,catalogSha256:data.catalogSource.sha256,workIds:data.populationContract.presentation.workIds,bangumiSubjectByWorkId:null}):null;
 let view,current=null,active=false,wanted=false,sequence=0,sortKey='releaseDate',direction='asc';
 const workspace=createCompanyWorkspaceController({directory,defaultRole:()=>defaultRole,
  elements:{search:get('company-directory-search'),count:get('company-directory-count'),total:get('company-directory-total')},
  renderView:model=>view.render({...model,companies:[],selectedCompanyRecord:directory.companies.find(c=>String(c.companyId)===String(model.selectedCompanyId))}),
  isActive:()=>active,shouldLoadWorks:()=>wanted,
  loadWorks:ids=>data.workData.get(ids),onSelectionResolved:id=>{current=id;onId(id);},
  onError:message=>{get('company-detail').dataset.loadError=message;},syncSearchClears:()=>{},
  imageUrlForCompany:company=>companyImageUrl(company,assetBase),
  imageUrlForWork:work=>({thumbnailUrl:resolveAssetUrl(work.projectedThumbnailPath??work.coverPath,assetBase),previewUrl:work.projectedPreviewPath?resolveAssetUrl(work.projectedPreviewPath,assetBase):null})
 });
 const render=()=>workspace.render({query:'',sort:'totalVoteCount-desc',hasImage:false,selectedCompanyId:current,detailSortKey:sortKey,detailSortDirection:direction,selectedCompanyIds:new Set(),selectionMode:false});
 view=await attachCompanyDetailView({root:get('company-view'),selectionMode:false,familyForWork:id=>families?.familyForWork(String(id))??null,
  onSearch:()=>{},onSort:()=>{},onSelectCompany:id=>openEntity('company',id),onToggleCompany:()=>{},
  onOpenWork:work=>void openEntity('work',work.workId),
  onCloseDetail:()=>{active=false;workspace.suspend();onClose();},
  onDetailWorkSort:patch=>{sortKey=patch.sortKey??sortKey;direction=patch.direction??direction;wanted=true;void render();},
  onDetailSection:section=>{if(active&&section==='works'&&!wanted){wanted=true;queueMicrotask(()=>{if(active)void render();});}}
 });
 return {
  async open(id,{isCurrent=()=>true}={}){
   const ticket=++sequence,record=await loadCompanyDetail(String(id));
   if(ticket!==sequence||!isCurrent())return;
   current=record.companyId;defaultRole=record.defaultRole;directory.companies=record.directory.companies;
   active=true;wanted=false;delete get('company-detail').dataset.loadError;await render();
   if(ticket!==sequence||!isCurrent())return;
   if(!get('company-detail-dialog')?.open)throw Error('会社详情未能打开');
  },
  capture:()=>({view:view.captureState(),dom:captureDialogState(get('company-detail-dialog')),sortKey,direction}),
  async restore(state){if(!state)return;sortKey=state.sortKey??sortKey;direction=state.direction??direction;if(state.view?.browseMode==='all')wanted=true;await render();await view.restoreState(state.view);await restoreDialogState(get('company-detail-dialog'),state.dom);},
  cancel(){sequence++;active=false;workspace.suspend();view.suspend();}
 };
}
