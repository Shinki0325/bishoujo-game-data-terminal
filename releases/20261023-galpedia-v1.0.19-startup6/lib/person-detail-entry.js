import {attachPersonDetailView,bindSharedDetailStack,openBoundDetail,installSharedDetailBehavior} from './shared-detail-runtime.js';
import {captureDialogState,restoreDialogState} from './detail-stack.js';
import {parseUiLocationHash,formatUiLocationHash} from './ui-location-state.js';
import {configuredAssetBase,PRESENTATION_FAMILIES_SIDECAR_SHA256} from './runtime-config.js';
import {setListState} from './list-state.js';

export function createPersonDetailEntry({activateFull,navigate}){
  const assetBase=configuredAssetBase();
  let directoryClient;
  const loadDirectoryClient=()=>directoryClient??=import('./person-static-client.js').then(m=>m.getStaticPersonDirectoryClient()).catch(e=>{directoryClient=null;throw e;});
  let personClient;
  const loadPersonClient=()=>personClient??=import('./person-sections-client.js').then(m=>m.getStaticPersonDetailClient()).catch(error=>{personClient=null;throw error;});
  let context,route,view,stack,sequence=0,families,suspended=false;
  let mediaResolver;
  const prepareMedia=()=>mediaResolver??=import('./asset-url.js').catch(error=>{mediaResolver=null;throw error;});
  const get=id=>document.getElementById(id);
  let contextPending;
  const prepare=()=>contextPending??=(async()=>{
    let data;
    try{
      const [small,decoder]=await Promise.all([import('./person-work-metadata-small.js'),import('./workbench-context.js')]);
      const value=await small.loadPersonFamilyContext();
      data=decoder.decodeWorkbenchContext(value.uiData,value.workIds.map(workId=>({workId})));
      data.populationContract={presentation:{workIds:value.workIds}};
    }catch{data=await (await import('./work-static-client.js')).getStaticWorkbench();}
    const source=data.presentationFamiliesSource;
    if(source){
      if(source.sha256!==(data.fullWiki?.familySha256??PRESENTATION_FAMILIES_SIDECAR_SHA256))throw Error('版本资料来源不符');
      const {createPersonFamilyLookup}=await import('./person-family-lookup.js');
      families=createPersonFamilyLookup(source.value,{catalogSnapshotId:data.sampleSource.snapshot?.snapshotId,catalogSha256:data.catalogSource.sha256,workIds:data.populationContract.presentation.workIds,bangumiSubjectByWorkId:null});
    }
  })().catch(error=>{contextPending=null;throw error;});

  let workEntry,workEntryPending;
  const ensureWorkEntry=initialWorkId=>workEntryPending??=import('./work-detail-entry.js').then(module=>module.createWorkDetailEntry({
    initialWorkId,activateFull,openEntity:(kind,id)=>stack.open(kind,id),
    onId:id=>{context.currentWorkDetailId=id;},
    onClose:()=>{if(stack.restoring||stack.close('work'))return;context.currentWorkDetailId=null;navigate('#works');}
  })).then(value=>workEntry=value).catch(error=>{workEntryPending=null;throw error;});
  async function openIndependentWork(id,options={}){
    try{const entry=await ensureWorkEntry(id);if(options.isCurrent?.()===false)return;return await entry.open(id,options);}
    catch(error){
      if(options.isCurrent?.()===false)return;
      // A missing optional entry retains the existing complete detail path.
      await activateFull();if(options.isCurrent?.()!==false)return openBoundDetail('work',id);
    }
  }
  let companyEntry,companyEntryPending,companySuspended=false;
  const ensureCompanyEntry=()=>companyEntryPending??=import('./company-detail-entry.js').then(m=>m.createCompanyDetailEntry({
    isCurrent:()=>!companySuspended,
    openEntity:(kind,id)=>stack.open(kind,id),onId:id=>{context.selectedCompanyId=id;},
    onClose:()=>{if(stack.restoring||stack.close('company'))return;context.selectedCompanyId=null;navigate('#companies');}
  })).then(value=>companyEntry=value).catch(error=>{companyEntryPending=null;throw error;});
  async function openIndependentCompany(id,options={}){
    const entry=await ensureCompanyEntry();if(options.isCurrent?.()===false)return;return entry?.open(id,options);
  }
  let viewPending,resolveAssetUrl;
  const ensurePersonView=()=>viewPending??=attachPersonDetailView({
    root:get('person-view'),
    familyForWork:id=>families?.familyForWork(String(id))??null,
    imageUrlForWork:credit=>credit.workThumbnailPath&&resolveAssetUrl?resolveAssetUrl(credit.workThumbnailPath,assetBase):null,
    onLoadPerson:async (id, summary, options)=>{
      const pending=loadPersonClient().then(client=>client.loadPerson(id, {...options,onFull:prepare}));
      pending.catch(()=>{});
      await prepareMedia().then(module=>{resolveAssetUrl=module.resolveAssetUrl;});
      if (!options?.section || options.section==='full') {
        const [person]=await Promise.all([pending,prepare()]);return person;
      }
      const person=await pending;
      if (!person?.detailSections && options.section==='overview') await prepare();
      return person;
    },
    onSelect(id){
      if(id!==null){void stack.open('person',id);return false;}
      if(id===null&&stack.close('person'))return;
      context.selectedPersonId=id;
      if(id===null)navigate(formatUiLocationHash({...route,personId:null}));
    },
    onSearch:query=>navigate(formatUiLocationHash({...route,personId:null,query,pageNumber:1})),
    onRoleChange:role=>{route={...route,role};context.personRole=role;if(!get('person-detail-dialog').open)navigate(formatUiLocationHash({...route,personId:null,pageNumber:1}));},
    onLoadRepresentativeCharacters:async(id,person)=>(await import('./credit-scope-client.js')).creditScopeClient.representatives(id,person.representativeCharacters??[]),
    onPageChange:pageNumber=>navigate(formatUiLocationHash({...route,personId:null,pageNumber})),
    onOpenWork:id=>void stack.open('work',id),
    onOpenPerson:id=>void stack.open('person',id),
    onOpenCompany:id=>void stack.open('company',id)
  }).then(value=>{view=value;return view;}).catch(error=>{viewPending=null;throw error;});
  stack=bindSharedDetailStack({
    readContext:()=>({...context}),
    restoreContext:value=>{context={...value};if(context.personDirectoryOpen)route={page:'persons',personId:null,query:context.personQuery,role:context.personRole,pageNumber:context.staticPersonPage};},
    onError:error=>{
      setListState({status:get('person-detail-load-status'),state:'error',layout:'text',message:'关联详情暂时没能打开，已保留当前人物。'});
      console.error(error);
    },
    adapters:{
      work:{dialog:()=>get('work-details'),id:()=>get('work-details').dataset.entityId,
        open:openIndependentWork,
        capture:()=>workEntry?.capture(),restore:s=>workEntry?.restore(s),cancel:()=>workEntry?.cancel()},company:{dialog:()=>get('company-detail-dialog'),id:()=>get('company-detail-dialog')?.dataset.entityId,open:openIndependentCompany,capture:()=>companyEntry?.capture(),restore:s=>companyEntry?.restore(s),cancel:()=>companyEntry?.cancel()},
      person:{
        dialog:()=>get('person-detail-dialog'),id:()=>get('person-detail-dialog').dataset.entityId,
        open:async(id,{isCurrent=()=>true}={})=>{const personView=await ensurePersonView();if(!isCurrent())return;personView.setRoleFilter(context.personRole);context.selectedPersonId=id;await personView.openPerson(id);},
        capture:()=>({view:view?.captureState(),dom:captureDialogState(get('person-detail-dialog'))}),
        restore:async state=>{if(state){await (await ensurePersonView()).restoreState(state.view);await restoreDialogState(get('person-detail-dialog'),state.dom);}},
        cancel:()=>view?.suspend()
      }
    }
  },{earlyEntry:true});
  installSharedDetailBehavior();
  get('person-search-clear').addEventListener('click',()=>{if(suspended||!context?.personDirectoryOpen)return;navigate(formatUiLocationHash({...route,personId:null,query:'',pageNumber:1}));});
  return {
    suspendCompany(){suspended=true;sequence++;companySuspended=true;companyEntry?.cancel();},
    async show(hash){
      const ticket=++sequence;
      route=parseUiLocationHash(hash);
      const workMatch=/^#(?:works\/)?work\/([1-9][0-9]*)(?:\?|$)/u.exec(hash);
      if(workMatch){
        context={companyDirectoryOpen:false,personDirectoryOpen:false,selectedCompanyId:null,selectedPersonId:null,currentWorkDetailId:workMatch[1],companyQuery:'',companySort:'totalVoteCount-desc',companyHasImage:true,companyDetailSortKey:'releaseDate',companyDetailSortDirection:'asc',personQuery:'',personRole:'all',staticPersonPage:1};
        if(ticket===sequence)await openIndependentWork(workMatch[1],{isCurrent:()=>ticket===sequence&&location.hash===hash});return;
      }

      if(route?.page==='companies'&&route.companyId){
        context={companyDirectoryOpen:true,personDirectoryOpen:false,selectedCompanyId:route.companyId,selectedPersonId:null,currentWorkDetailId:null,companyQuery:route.query,companySort:route.sort,companyHasImage:route.hasImage,companyDetailSortKey:'releaseDate',companyDetailSortDirection:'asc',personQuery:'',personRole:'all',staticPersonPage:1};
        await openIndependentCompany(route.companyId,{isCurrent:()=>ticket===sequence&&location.hash===hash});return;
      }
      if(route?.page!=='persons')return;
      context={companyDirectoryOpen:false,personDirectoryOpen:true,selectedCompanyId:null,selectedPersonId:route.personId,
        currentWorkDetailId:null,companyQuery:'',companySort:'totalVoteCount-desc',companyHasImage:true,
        companyDetailSortKey:'releaseDate',companyDetailSortDirection:'asc',personQuery:route.query,personRole:route.role,staticPersonPage:route.pageNumber};
      get('person-directory-search').value=route.query;
      const requestRoute={...route};
      const listing=!route.personId?loadDirectoryClient().then(client=>client.getPage(requestRoute)):null;
      listing?.catch(()=>{});
      await ensurePersonView();if(ticket!==sequence||location.hash!==hash)return;
      view.setRoleFilter(route.role);
      if(!route.personId){
        const current=()=>ticket===sequence&&location.hash===hash,loading=get('person-directory-loading');
        get('person-view').setAttribute('aria-busy','true');
        get('person-search-clear').hidden=!route.query;
        setListState({status:loading,state:'loading',layout:'panel',message:'正在加载人物列表'});
        try{
          const page=await listing;if(!current())return;
          route.pageNumber=page.remotePage.pageNumber;context.staticPersonPage=route.pageNumber;
          get('person-directory-total').textContent=page.totalPersonCount.toLocaleString('zh-CN')+' 位人物';
          view.render(page);setListState({status:loading,state:'ready'});
          get('person-view').setAttribute('aria-busy','false');
        }catch(error){if(!current())return;get('person-view').setAttribute('aria-busy','false');setListState({status:loading,state:'ready'});throw error;}
        return;
      }
      await view.openPerson(route.personId);
      if(ticket!==sequence)return;
    },
    openEntityDetail:(kind,id)=>{
      // A home/search link can open the same detail layer before any directory.
      // Seed its origin without changing the route or restoring hidden lists.
      if(!context){
        route=parseUiLocationHash('#persons');
        context={companyDirectoryOpen:false,personDirectoryOpen:false,selectedCompanyId:null,selectedPersonId:null,
          currentWorkDetailId:null,companyQuery:'',companySort:'totalVoteCount-desc',companyHasImage:true,
          companyDetailSortKey:'releaseDate',companyDetailSortDirection:'asc',personQuery:'',personRole:route.role,staticPersonPage:route.pageNumber};
        view?.setRoleFilter(route.role);
      }
      return stack.open(kind,id);
    }
  };
}
