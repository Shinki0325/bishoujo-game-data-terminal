import {createDetailStack,installDetailBackdropDismiss} from './detail-stack.js';
import {installExternalCoverImageRecovery} from './asset-url-core.js';
import {initializeDirectoryHeaders} from './company-ui/__player_v51/directory-header.js';

// A cold entity entry and the full workbench bind to the same live objects.
// No second DOM owner or history session is created during handoff.
let bindings,stack,view,viewBindings,early=false,installed=false;
const generations={work:0,person:0,company:0};
export function installSharedDetailBehavior(){
  if(installed)return;
  installed=true;
  // Keep each detail's existing dismissal/history owner; only add a mobile affordance.
  for(const [id,selector] of [['work-details','[aria-label="关闭详情"]'],['person-detail-dialog','#person-detail-close']]){
    const root=document.getElementById(id),heading=root?.querySelector('.dialog-heading'),close=root?.querySelector(selector);
    if(!heading||!close||heading.querySelector('.detail-mobile-back'))continue;
    const kind=id==='work-details'?'work':'person';
    const returnBeforeClose=event=>{
      if(stack?.close(kind)){event.preventDefault();event.stopImmediatePropagation();}
    };
    // Native close controls and Escape must preserve the same live snapshot.
    root.addEventListener('click',event=>{if(event.target.closest?.(selector))returnBeforeClose(event);},true);
    root.addEventListener('cancel',returnBeforeClose,true);
    const back=document.createElement('button');back.type='button';back.className='detail-mobile-back';back.setAttribute('aria-label','返回');
    back.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
    back.addEventListener('click',()=>{
      // Capture the still-open page before native close handlers clear its content.
      if(!stack?.close(id==='work-details'?'work':'person'))close.click();
    });heading.prepend(back);
  }
  initializeDirectoryHeaders();installDetailBackdropDismiss(document);installExternalCoverImageRecovery(document);
}
let personViewModule;
export async function attachPersonDetailView(options){
  viewBindings=options;
  const {createPersonDirectoryView}=await (personViewModule??=import('../views/person-directory-view.js').catch(error=>{personViewModule=null;throw error;}));
  if(!view){
    const live={...options};
    for(const key of ['onSearch','onRoleChange','onSelect','onLoadPerson','onLoadRepresentativeCharacters','loadImageForWork','onOpenWork','onOpenPerson','onOpenCompany','onPageChange','imageUrlForWork','familyForWork']){
      live[key]=(...args)=>viewBindings[key]?.(...args);
    }
    view=createPersonDirectoryView(live);
  }
  return view;
}
export function bindSharedDetailStack(options,{earlyEntry=false}={}){
  bindings=options;early=earlyEntry;
  if(!stack){
    const adapters=Object.fromEntries(['work','person','company'].map(kind=>[kind,{
      dialog:()=>bindings.adapters[kind].dialog(),
      id:()=>bindings.adapters[kind].id(),
      open:(id)=>{
        const ticket=generations[kind];
        return bindings.adapters[kind].open(id,{isCurrent:()=>ticket===generations[kind]});
      },
      capture:()=>bindings.adapters[kind].capture?.(),
      restore:state=>bindings.adapters[kind].restore?.(state),
      cancel:()=>{generations[kind]++;bindings.adapters[kind].cancel?.();}
    }]));
    stack=createDetailStack({adapters,readContext:()=>bindings.readContext(),
      restoreContext:state=>bindings.restoreContext(state),onError:error=>bindings.onError?.(error)});
  }
  return stack;
}
export const earlyDetailContext=()=>early&&bindings?bindings.readContext():null;
export const openBoundDetail=(kind,id)=>bindings.adapters[kind].open(id);

let companyView,companyBindings,companyModule;
const companyDismiss=new WeakSet();
export async function attachCompanyDetailView(options){
 companyBindings=options;
 const {createCompanyDirectoryView}=await (companyModule??=import('../views/company-directory-view.js').catch(e=>{companyModule=null;throw e;}));
 if(!companyView){
  const live={...options};
  for(const key of ['onSearch','onSort','onSelectCompany','onToggleCompany','onOpenWork','familyForWork','onDetailWorkSort','onCloseDetail','onPageChange','onDetailSection'])live[key]=(...args)=>companyBindings[key]?.(...args);
  companyView=createCompanyDirectoryView(live);
 }
 const dialog=document.getElementById('company-detail-dialog');
 if(dialog&&!companyDismiss.has(dialog)){
  companyDismiss.add(dialog);
  const heading=dialog.querySelector('.company-detail-heading'),close=dialog.querySelector('#company-detail-close');
  if(heading&&close&&!heading.querySelector('.detail-mobile-back')){
   const button=document.createElement('button');button.type='button';button.className='detail-mobile-back';button.setAttribute('aria-label','返回');
   button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
   button.addEventListener('click',()=>{if(!stack?.close('company'))close.click();});heading.prepend(button);
  }

  const back=e=>{if(stack?.close('company')){e.preventDefault();e.stopImmediatePropagation();}};
  dialog.addEventListener('click',e=>{if(e.target.closest?.('#company-detail-close'))back(e);},true);
  dialog.addEventListener('cancel',back,true);
 }
 return companyView;
}
