import {representativeCardTags} from './card-tag-selection.js';
// Only visible list cards ask for their current edition's small tag shard.
const selector=':is(#catalog-grid,#workbench-first-page-grid,#mobile-library-grid)>.selection-card-full';
const watched=new Set(),visible=new Set(),queued=new Set(),done=new WeakSet(),attempted=new WeakSet();
let installed=false,frame=0,active=0,loader;
const list=()=>document.documentElement.dataset.workCardLayout==='list';
function render(card,tags){
 const row=document.createElement('ul');row.className='selection-card-tags';row.setAttribute('aria-label','作品标签');
 const add=(label,group,id)=>{const item=document.createElement('li');item.textContent=label;item.title=label;item.dataset.tagGroup=group;if(id)item.dataset.tagId=id;row.append(item);};
 // Character and adult facets stay behind the detail page's disclosure.
 for(const tag of representativeCardTags(tags,4))add(tag.displayTitle,'content',tag.filterId);
 card.querySelector('.selection-card-tags')?.remove();
 if(row.children.length)card.append(row);
}
function pump(){
 if(!list())return;
 for(const card of queued){
  if(active>=4)break;
  queued.delete(card);
  if(!card.isConnected||!visible.has(card)||done.has(card)||attempted.has(card))continue;
  attempted.add(card);active++;const id=card.dataset.workId;
  loader??=import('./reviewed-tags.js').catch(error=>{loader=null;throw error;});
  loader.then(m=>m.reviewedWorkTags(id)).then(tags=>{
   if(card.isConnected&&card.dataset.workId===id){render(card,tags);done.add(card);observer.unobserve(card);watched.delete(card);visible.delete(card);}
  }).catch(()=>{/* A failed optional tag request must not block reading or opening cards. */})
    .finally(()=>{active--;pump();});
 }
}
const observer=new IntersectionObserver(entries=>{
 for(const {target,isIntersecting}of entries){
  if(isIntersecting){visible.add(target);queued.add(target);}else{visible.delete(target);queued.delete(target);attempted.delete(target);}
 }
 pump();
},{rootMargin:'0px'});
function scan(){
 frame=0;
 for(const card of watched)if(!card.isConnected||!card.matches(selector)||!list()){observer.unobserve(card);watched.delete(card);visible.delete(card);queued.delete(card);attempted.delete(card);}
 if(!list())return;
 for(const card of document.querySelectorAll(selector))if(!done.has(card)&&!watched.has(card)){watched.add(card);observer.observe(card);}
 pump();
}
const schedule=()=>{if(!frame)frame=requestAnimationFrame(scan);};
export function installWorkCardTags(){
 if(!installed){
  installed=true;
  new MutationObserver(changes=>{
   if(changes.some(c=>c.target.closest?.('#catalog-grid,#workbench-first-page-grid,#mobile-library-grid')||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#catalog-grid,#workbench-first-page-grid,#mobile-library-grid')||n.querySelector?.(selector)))))schedule();
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('galpedia-work-card-layout',schedule);
  window.addEventListener('online',()=>{for(const card of watched)attempted.delete(card);for(const card of visible)queued.add(card);pump();});
 }
 schedule();
}
