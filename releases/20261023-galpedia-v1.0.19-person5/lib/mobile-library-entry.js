import {createWorkCardLayoutControl} from './work-card-layout.js';
import {createMobileLibraryData} from './mobile-library-data.js';
import {parseUiLocationHash,formatUiLocationHash} from './ui-location-state.js';
import {mobileLibraryRoute,mobileLibraryFilters} from './mobile-library-policy.js';
import {createSelectionCard} from '../views/selection-card.js';
import {createSelectionCardPresentation} from './selection-card-presentation.js';
import {configuredAssetBase} from './runtime-config.js';
import {resolveAssetUrl,installExternalCoverImageRecovery} from './asset-url-core.js';
import {setListState} from './list-state.js';

export function createMobileLibrary({navigate,openWork,openTools,openFilter=openTools,queryFiltered}){
 const data=createMobileLibraryData(),root=document.createElement('section');root.id='mobile-library';root.hidden=true;
 root.setAttribute('aria-label','作品库');
 root.innerHTML=`<header class="gp-page-heading"><h1>作品库</h1><span id="mobile-library-count" class="gp-page-total"></span><button id="mobile-library-tools" class="toolbar-button" type="button" aria-controls="filter-drawer">筛选</button></header>
 <form class="mobile-library-search" role="search"><label class="visually-hidden" for="mobile-library-query">搜索作品名称、译名或会社</label><input id="mobile-library-query" type="search" placeholder="搜索作品、译名或会社" maxlength="120" autocomplete="off"><button class="toolbar-button" type="submit">搜索</button></form>
 <div class="mobile-library-order"><label for="mobile-library-sort">排序</label><select id="mobile-library-sort"></select><button id="mobile-library-direction" class="toolbar-button" type="button"></button></div>
 <div id="mobile-library-filter-state" hidden><span>已应用筛选</span><button type="button" class="toolbar-button" id="mobile-library-clear-filters">清除筛选</button></div><div id="mobile-library-status" role="status"></div><div id="mobile-library-grid" class="catalog-grid"></div>
 <nav class="mobile-library-pages" aria-label="作品分页"><button id="mobile-library-prev" class="toolbar-button" type="button">上一页</button><span id="mobile-library-page"></span><button id="mobile-library-next" class="toolbar-button" type="button">下一页</button></nav>`;
 document.querySelector('#workspace').prepend(root);
 const options=document.createElement('div');options.className='mobile-library-options';
 const order=root.querySelector('.mobile-library-order');order.before(options);options.append(order,createWorkCardLayoutControl());
 const el=id=>root.querySelector('#mobile-library-'+id),grid=el('grid'),status=el('status'),input=el('query'),sort=el('sort'),direction=el('direction');
 const labels={voteCount:'EGS 票数',median:'EGS 评分',vndbVoteCount:'VNDB 票数',vndbScore:'VNDB 评分',bangumiVoteCount:'Bangumi 票数',bangumiScore:'Bangumi 评分',releaseDate:'发售日期',title:'作品名称',brandName:'会社名称'};
 for(const [value,label]of Object.entries(labels)){const option=document.createElement('option');option.value=value;option.textContent=label;sort.append(option);}
 const assetBase=configuredAssetBase(),presentation=()=>createSelectionCardPresentation({read:k=>{try{return localStorage.getItem(k);}catch{return null;}},write:()=>{}}).inspect();
 installExternalCoverImageRecovery(document);
 let sequence=0,timer,composing=false,shownHash=null,shownDisplay=null,state=null,page=null,scrolls=new Map(),activeHash=null;
 // Keep only three successful pages (at most 72 complete works) for this
 // immutable release. Rebuild DOM so current display and image safety apply.
 const recentPages=new Map();
 const current=ticket=>ticket===sequence&&mobileLibraryRoute()&&location.hash===activeHash&&!root.hidden;
 const move=patch=>{let hash=formatUiLocationHash({...state,...patch,workId:null});const filters=new URLSearchParams(location.hash.split('?')[1]).get('filters');if(filters)hash+=(hash.includes('?')?'&':'?')+'filters='+encodeURIComponent(filters);navigate(hash);};
 el('clear-filters').addEventListener('click',()=>navigate(formatUiLocationHash({...state,pageNumber:1,workId:null}))); 
 function search(){clearTimeout(timer);if(!composing&&state)move({query:input.value,pageNumber:1});}
 root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();search();});
 input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);});
 input.addEventListener('compositionend',()=>{composing=false;timer=setTimeout(search,180);});
 input.addEventListener('input',e=>{clearTimeout(timer);if(!composing&&!e.isComposing)timer=setTimeout(search,input.value?180:0);});
 sort.addEventListener('change',()=>move({sort:sort.value+'-'+(state.sort.endsWith('-asc')?'asc':'desc'),pageNumber:1}));
 direction.addEventListener('click',()=>move({sort:sort.value+'-'+(state.sort.endsWith('-asc')?'desc':'asc'),pageNumber:1}));
 el('prev').addEventListener('click',()=>move({pageNumber:page.pageNumber-1}));
 el('next').addEventListener('click',()=>move({pageNumber:page.pageNumber+1}));
 el('tools').addEventListener('click',async()=>{const button=el('tools'),label=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='正在打开…';try{await openFilter();}finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=label;}});
 const save=()=>{if(activeHash&&!root.hidden&&root.getClientRects().length){scrolls.set(activeHash,{x:scrollX,y:scrollY});while(scrolls.size>20)scrolls.delete(scrolls.keys().next().value);}};
 window.addEventListener('scroll',save,{passive:true});
 return {root,suspend(){save();activeHash=null;root.hidden=true;sequence++;clearTimeout(timer);},async show(hash){
  root.hidden=false;document.querySelector('#selection-view').hidden=true;
  if(activeHash!==hash){save();activeHash=hash;}
  const ticket=++sequence;state=parseUiLocationHash(hash);input.value=state.query;
  const hasFilters=new URLSearchParams(hash.split('?')[1]).has('filters');el('filter-state').hidden=!hasFilters;el('tools').textContent=hasFilters?'筛选 · 已选':'筛选';
  const [key,dir]=state.sort.split('-');sort.value=key==='egsScore'?'median':key;direction.textContent=dir==='asc'?'升序 ↑':'降序 ↓';direction.setAttribute('aria-label','切换排序方向，当前'+(dir==='asc'?'升序':'降序'));
  const display=presentation(),displayKey=JSON.stringify(display);
  if(shownHash===hash&&shownDisplay===displayKey){el('prev').disabled=page.pageNumber<=1;el('next').disabled=page.pageNumber>=page.pageCount;grid.inert=false;root.setAttribute('aria-busy','false');setListState({status,state:'ready'});const saved=scrolls.get(hash);if(saved)requestAnimationFrame(()=>scrollTo(saved.x,saved.y));return;}
  root.setAttribute('aria-busy','true');grid.inert=true;el('prev').disabled=el('next').disabled=true;
  setListState({status,state:'loading',layout:'text',message:'正在查找作品…'});
  try{
   let cached=recentPages.get(hash),result,works;
   if(cached){
    recentPages.delete(hash);recentPages.set(hash,cached);
    ({result,works}=cached);
   }else{
    result=hasFilters?await queryFiltered({...state,filters:mobileLibraryFilters(hash)}):await data.query(state);if(!current(ticket)||location.hash!==hash)return;
    if(result.status!=='ok')throw Error('作品查询未完成');
    works=await data.cards(result.workIds);
    if(!current(ticket)||location.hash!==hash)return;
    recentPages.set(hash,{result:{status:result.status,page:result.page,workIds:result.workIds},works});
    while(recentPages.size>3)recentPages.delete(recentPages.keys().next().value);
   }
   if(!current(ticket)||location.hash!==hash)return;
   const fragment=document.createDocumentFragment();
   works.forEach((work,i)=>fragment.append(createSelectionCard(document,work,{view:'full',selected:false,selectionEnabled:false,assetBase,display,eagerCover:i<4,priorityCover:i===0,
    coverUrl:resolveAssetUrl(work.projectedThumbnailPath??work.thumbnailPath??work.coverPath,assetBase),previewUrl:work.projectedPreviewPath?resolveAssetUrl(work.projectedPreviewPath,assetBase):null,
    mobileSortKey:key,onToggle:()=>{},onOpenDetails:()=>{save();void openWork(work.workId);}})));
   grid.replaceChildren(fragment);grid.inert=false;shownHash=hash;shownDisplay=displayKey;page=result.page;
   el('count').textContent=page.total.toLocaleString()+' 部作品';el('page').textContent=page.pageNumber+' / '+page.pageCount;
   el('prev').disabled=page.pageNumber<=1;el('next').disabled=page.pageNumber>=page.pageCount;
   root.setAttribute('aria-busy','false');setListState({status,state:works.length?'ready':'empty',layout:'text',message:'没有找到相关作品'});
   const saved=scrolls.get(hash);requestAnimationFrame(()=>scrollTo(saved?.x??0,saved?.y??0));
  }catch(error){if(ticket!==sequence||location.hash!==hash)return;root.setAttribute('aria-busy','false');grid.inert=true;setListState({status,state:'error',layout:'text',message:'作品暂时没能加载',retry:()=>this.show(hash)});console.warn('mobile library',error);}
 }};
}
