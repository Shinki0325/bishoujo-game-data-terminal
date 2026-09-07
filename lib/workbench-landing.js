import {loadWorkbenchLanding} from './workbench-demand-data.js';
import {createSelectionCard} from '../views/selection-view.js';

// Default results must never stand in for a saved filter, shared query or detail.
export function canShowWorkbenchLanding(locationRef, storage) {
  if(locationRef.hash!=='#works')return false;
  if([...new URLSearchParams(locationRef.search??'').keys()].some(key=>!['startupMetrics','interactionMetrics','workerWorkbench'].includes(key)))return false;
  try {
    for(let i=0;i<(storage?.length??0);i++) {
      const key=storage.key(i);
      if(key?.startsWith('egs-tier-terminal:')&&key!=='egs-tier-terminal:theme-v1')return false;
    }
  }catch{return false;}
  return true;
}

export function createWorkbenchLanding({documentRef=document,locationRef=location,storage=localStorage,isReady,navigate,onVisible}) {
  let generation=0,preview=null,style=null,held=[],pending=null;
  function remove() {
    generation++;
    const focusedId=preview?.contains(documentRef.activeElement)?documentRef.activeElement.closest('[data-work-id]')?.dataset.workId:null;
    preview?.remove();style?.remove();preview=null;style=null;
    for(const [node,inert] of held)node.inert=inert;
    held=[];delete documentRef.documentElement.dataset.workbenchPreview;
    if(focusedId&&locationRef.hash==='#works'&&documentRef.documentElement.dataset.workbenchReady==='true') {
      const card=[...documentRef.querySelectorAll('#catalog-grid [data-work-id]')].find(node=>node.dataset.workId===focusedId);
      card?.querySelector('[data-control-type="details"]')?.focus({preventScroll:true});
    }
  }
  const suspend=()=>{if(locationRef.hash!=='#works')remove();};
  const windowRef=documentRef.defaultView;
  windowRef.addEventListener('hashchange',suspend);
  async function show() {
    if(isReady()||preview||!canShowWorkbenchLanding(locationRef,storage))return;
    if(pending)return pending;
    const request=++generation;
    pending=(async()=>{
      const payload=await loadWorkbenchLanding();
      if(!payload||request!==generation||isReady()||!canShowWorkbenchLanding(locationRef,storage))return;
      const grid=documentRef.querySelector('#catalog-grid');if(!grid)return;
      preview=documentRef.createElement('section');preview.id='workbench-first-page';
      preview.setAttribute('aria-label','默认排序的首屏作品');
      const note=documentRef.createElement('p');note.className='workbench-landing-note';note.setAttribute('role','status');
      note.textContent='先展示默认排序前 28 部作品 · 全库搜索与筛选正在准备，详情可点击后等待打开。';
      const cards=documentRef.createElement('div');cards.className='catalog-grid';cards.id='workbench-first-page-grid';
      const assetBase=documentRef.querySelector('meta[name="egs-tier-asset-base"]')?.content;
      for(const work of payload.works.slice(0,28))cards.append(createSelectionCard(documentRef,work,{
        view:'full',selected:false,selectionEnabled:false,assetBase,mobileSortKey:'voteCount',
        onToggle:()=>{},onOpenDetails:()=>navigate(`#work/${encodeURIComponent(work.workId)}`)
      }));
      preview.append(note,cards);
      style=documentRef.createElement('style');
      style.textContent='[data-workbench-preview="true"] #catalog-grid,[data-workbench-preview="true"] #catalog-list-state,[data-workbench-preview="true"] #selection-pagination,[data-workbench-preview="true"] #quick-ranking-entry{display:none!important}.workbench-landing-note{margin:12px 18px;color:var(--muted-text,currentColor);font-size:14px}[data-workbench-preview="true"] .catalog-controls,[data-workbench-preview="true"] .catalog-primary-actions{opacity:.55}';
      for(const node of documentRef.querySelectorAll('#selection-view .results-toolbar,#mobile-selection-view')){held.push([node,node.inert]);node.inert=true;}
      documentRef.head.append(style);grid.before(preview);
      documentRef.documentElement.dataset.workbenchPreview='true';
      onVisible?.();
    })().catch(error=>{console.warn('early workbench page unavailable; normal loading continues',error);}).finally(()=>{pending=null;});
    return pending;
  }
  return {show,remove,dispose(){remove();windowRef.removeEventListener('hashchange',suspend);}};
}
