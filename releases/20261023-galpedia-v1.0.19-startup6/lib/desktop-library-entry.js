import {createMobileLibraryData} from './mobile-library-data.js';
import {parseUiLocationHash,formatUiLocationHash} from './ui-location-state.js';
import {createSelectionCard} from '../views/selection-card.js';
import {createSelectionCardPresentation} from './selection-card-presentation.js';
import {configuredAssetBase} from './runtime-config.js';
import {resolveAssetUrl,installExternalCoverImageRecovery} from './asset-url-core.js';
import {createActionIcon} from './action-icons.js';
import {setListState} from './list-state.js';

// Own the existing desktop browse controls until an explicit workbench action.
// No alternate markup, query corpus, persisted board state or mobile owner.
export function createDesktopLibrary({navigate,openWork,activateWorkbench,isActive}){
 const root=document.getElementById('selection-view'),el=id=>document.getElementById(id),grid=el('catalog-grid'),status=el('catalog-list-state');
 const data=createMobileLibraryData({pageSize:48}),assetBase=configuredAssetBase(),events=new AbortController();
 const listen=(node,type,fn,options={})=>node?.addEventListener(type,fn,{...options,signal:events.signal});
 const storageRead=key=>{try{return localStorage.getItem(key);}catch{return null;}};
 const presentation=createSelectionCardPresentation({read:storageRead,write:(k,v)=>localStorage.setItem(k,v)});
 const restoreImages=installExternalCoverImageRecovery(document);
 const selected=new Set((()=>{try{return JSON.parse(storageRead('egs-tier-terminal:egs-tier-100-v1'))?.selectedWorkIds??[];}catch{return [];}})());
 let state=null,page=null,activeHash=null,shownHash=null,shownDisplay=null,sequence=0,timer,composing=false,disposed=false;
 const recent=new Map(),scrolls=new Map();
 // The heading is the whole-library count; the result summary belongs to the
 // current query. Reuse the pinned default list, never count editions or matches.
 let totalPending;
 const libraryTotal=()=>totalPending??=data.query({query:'',sort:'voteCount-desc',pageNumber:1}).then(r=>{if(r.status!=='ok')throw Error('作品总数未就绪');return r.page.total;}).catch(e=>{totalPending=null;throw e;});
 const current=ticket=>!disposed&&ticket===sequence&&isActive()&&location.hash===activeHash&&!root.hidden;
 const save=()=>{if(activeHash&&!root.hidden&&root.getClientRects().length){scrolls.set(activeHash,{x:scrollX,y:scrollY});while(scrolls.size>20)scrolls.delete(scrolls.keys().next().value);}};
 const move=patch=>navigate(formatUiLocationHash({...state,...patch,workId:null}));
 function search(){clearTimeout(timer);if(!composing&&state)move({query:el('title-search').value,pageNumber:1});}
 listen(el('title-search'),'input',e=>{clearTimeout(timer);el('title-search-clear').hidden=!e.target.value;if(!composing&&!e.isComposing)timer=setTimeout(search,e.target.value?180:0);});
 listen(el('title-search'),'compositionstart',()=>{composing=true;clearTimeout(timer);});
 listen(el('title-search'),'compositionend',()=>{composing=false;timer=setTimeout(search,180);});
 listen(el('title-search'),'keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
 listen(el('title-search-clear'),'click',()=>{el('title-search').value='';search();});
 listen(el('sort-key'),'change',e=>move({sort:e.target.value+'-'+state.sort.split('-')[1],pageNumber:1}));
 listen(el('sort-direction-toggle'),'click',()=>move({sort:state.sort.split('-')[0]+'-'+(state.sort.endsWith('-asc')?'desc':'asc'),pageNumber:1}));
 listen(el('selection-page-next'),'click',()=>move({pageNumber:page.pageNumber+1}));
 listen(el('selection-page-previous'),'click',()=>move({pageNumber:page.pageNumber-1}));
 const jump=()=>{const v=Number(el('selection-page-input').value),valid=Number.isSafeInteger(v)&&v>=1&&v<=page.pageCount;el('selection-page-error').hidden=valid;if(valid&&v!==page.pageNumber)move({pageNumber:v});};
 listen(el('selection-page-input'),'change',jump);listen(el('selection-page-input'),'keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();}});
 const menu=el('selection-card-display-menu'),menuButton=el('card-view-toggle');
 const closeMenu=()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');};
 listen(menuButton,'click',()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));});
 listen(document,'click',e=>{if(!e.target.closest('.selection-card-display-shell'))closeMenu();});
 listen(document,'keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeMenu();menuButton.focus();}});
 for(const [name,key]of Object.entries({title:'showTitle',company:'showCompany',egs:'showEgs',vndb:'showVndb',bangumi:'showBangumi',year:'showYear'})){
  const input=el('selection-card-show-'+name);input.checked=presentation.inspect()[key];listen(input,'change',()=>{presentation.setDisplay({[key]:input.checked});if(activeHash)void api.show(activeHash);});
 }
 const filterIcon=el('filter-toggle').querySelector('[data-icon]');if(filterIcon&&!filterIcon.children.length)filterIcon.append(createActionIcon(document,'filter'));
 async function handoff(button){
  save();clearTimeout(timer);const hash=location.hash;button.disabled=true;button.setAttribute('aria-busy','true');
  try{await activateWorkbench(button.id,hash);}finally{button.disabled=false;button.removeAttribute('aria-busy');}
 }
 for(const id of ['filter-toggle','selection-mode-toggle','compare-mode-toggle','quick-ranking-entry'])listen(el(id),'click',()=>void handoff(el(id)));
 // Saved filtering remains an explicit action; opening the library never restores it.
 const saved=storageRead('egs-tier-terminal:previous-work-filter-v1');let resume;
 if(saved){try{const value=JSON.parse(saved);if(value.schema===1&&value.filterState){resume=document.createElement('button');resume.id='desktop-resume-work-filter';resume.type='button';resume.className='gp-resume-work-filter';resume.textContent='恢复上次筛选';el('catalog-title').parentElement.append(resume);listen(resume,'click',()=>void handoff(resume));}}catch{}}
 const analysis=document.createElement('details');analysis.id='site-analysis-bar';analysis.className='analysis-link-bar analysis-tools-menu';
 const analysisHeading=document.createElement('summary');analysisHeading.id='desktop-analysis-open';analysisHeading.textContent='数据分析';analysis.append(analysisHeading);
 (el('catalog-results').querySelector('.gh-actions')??el('catalog-results').querySelector('.catalog-controls')).append(analysis);
 listen(analysisHeading,'click',e=>{e.preventDefault();void handoff(analysisHeading);});
 listen(window,'scroll',save,{passive:true});
 const api={
  suspend(){save();activeHash=null;sequence++;clearTimeout(timer);closeMenu();},
  dispose(){api.suspend();disposed=true;events.abort();restoreImages?.();resume?.remove();analysis.remove();grid.inert=false;grid.setAttribute('aria-busy','false');setListState({status,state:'ready'});},
  async show(hash){
   if(disposed)return;root.hidden=false;if(activeHash!==hash){save();activeHash=hash;}const ticket=++sequence;state=parseUiLocationHash(hash);
   el('title-search').value=state.query;el('title-search-clear').hidden=!state.query;
   const [key,direction]=state.sort.split('-');el('sort-key').value=key;el('sort-direction-label').textContent=direction==='asc'?'升序':'降序';el('sort-direction-toggle').setAttribute('aria-label',`排序：${direction==='asc'?'升序':'降序'}，点击切换`);el('sort-direction-toggle').setAttribute('aria-pressed',String(direction==='asc'));el('sort-direction-icon').replaceChildren(createActionIcon(document,direction==='asc'?'arrow-up-a-z':'arrow-down-a-z'));
   el('browse-mode-toggle').setAttribute('aria-pressed','true');el('selection-mode-toggle').setAttribute('aria-pressed','false');el('compare-mode-toggle').setAttribute('aria-pressed','false');
   const display=presentation.inspect(),displayKey=JSON.stringify(display);
   if(shownHash===hash&&shownDisplay===displayKey){const pos=scrolls.get(hash);if(pos)requestAnimationFrame(()=>{if(current(ticket))scrollTo(pos.x,pos.y);});return;}
   grid.inert=true;grid.setAttribute('aria-busy','true');el('selection-page-next').disabled=el('selection-page-previous').disabled=true;
   setListState({status,state:'loading',layout:'text',message:'正在查找作品…'});
   try{
    let cached=recent.get(hash);if(!cached){const [result,total]=await Promise.all([data.query(state),libraryTotal()]);if(!current(ticket))return;if(result.status!=='ok')throw Error('作品查询未完成');const works=await data.cards(result.workIds);if(!current(ticket))return;cached={result,works,total};recent.set(hash,cached);while(recent.size>3)recent.delete(recent.keys().next().value);}
    if(!current(ticket))return;const {result,works}=cached;page=result.page;
    const fragment=document.createDocumentFragment();works.forEach((work,i)=>fragment.append(createSelectionCard(document,work,{view:'full',selected:selected.has(work.workId),selectionEnabled:false,assetBase,display,eagerCover:i<12,priorityCover:i===0,
     coverUrl:resolveAssetUrl(work.projectedThumbnailPath??work.thumbnailPath??work.coverPath,assetBase),previewUrl:work.projectedPreviewPath?resolveAssetUrl(work.projectedPreviewPath,assetBase):null,mobileSortKey:key,onToggle:()=>{},onOpenDetails:()=>{save();void openWork(work.workId);}})));
    grid.replaceChildren(fragment);document.documentElement.dataset.desktopBrowseReady="true";grid.inert=false;grid.setAttribute('aria-busy','false');shownHash=hash;shownDisplay=displayKey;
    el('catalog-total-count').textContent=cached.total.toLocaleString()+' 部作品';el('catalog-result-count').textContent=page.total.toLocaleString()+' 项';el('active-filter-summary').textContent=state.query?'搜索：'+state.query:'全部作品';
    el('selection-pagination').hidden=!page.total;el('selection-page-input').value=String(page.pageNumber);el('selection-page-total').textContent=page.pageCount;el('selection-page-next').disabled=page.pageNumber>=page.pageCount;el('selection-page-previous').disabled=page.pageNumber<=1;
    setListState({status,state:works.length?'ready':'empty',layout:'text',message:'没有找到相关作品'});
    const pos=scrolls.get(hash);requestAnimationFrame(()=>{if(current(ticket))scrollTo(pos?.x??0,pos?.y??0);});
   }catch(error){if(!current(ticket))return;grid.setAttribute('aria-busy','false');grid.inert=false;setListState({status,state:'error',layout:'text',message:'作品暂时没能加载',retry:()=>api.show(hash)});console.warn('desktop library',error);}
  }
 };return api;
}
