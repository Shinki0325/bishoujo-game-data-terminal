// Entity details share one runtime. History records contain only an opaque key;
// the live frame cache retains UI state and focus for this page session.
export function createDetailStack({adapters,readContext,restoreContext,onError}){
 const session=crypto.randomUUID(),records=new Map();let frames=[],serial=0,sequence=0,restoring=false,pending=null,closing=false,activeKey=null;
 const current=()=>frames.at(-1),dialog=kind=>adapters[kind].dialog();
 function captureFocus(){const e=document.activeElement;return {element:e,id:e?.id,token:e?.dataset.detailFocusToken,href:e?.getAttribute('href'),work:e?.closest('[data-work-id]')?.dataset.workId};}
 function restoreFocus(focus){
  if(!focus)return;const root=current()?dialog(current().kind):document;
  const e=focus.element?.isConnected&&root?.contains(focus.element)?focus.element:focus.id?root?.querySelector('#'+CSS.escape(focus.id)):
   focus.token?[...root?.querySelectorAll('[data-detail-focus-token]')??[]].find(e=>e.dataset.detailFocusToken===focus.token):
   focus.href?[...root?.querySelectorAll('a[href]')??[]].find(e=>e.getAttribute('href')===focus.href&&e.className===focus.element?.className):
   focus.work?root?.querySelector(`[data-work-id="${CSS.escape(focus.work)}"]`):null;
  e?.focus({preventScroll:true});
 }
 function capture(frame){if(!frame)return;const a=adapters[frame.kind];if(a.dialog()?.open&&a.id())frame.id=String(a.id());frame.context=readContext();frame.view=adapters[frame.kind].capture?.();frame.activeFocus=captureFocus();}
 function remember(){const key=++serial;activeKey=key;records.set(key,frames.map(f=>({...f})));return {session,key};}
 function save(){if(activeKey&&records.has(activeKey))records.set(activeKey,frames.map(f=>({...f})));}
 function historyState(){return {...history.state,galpediaDetailStack:remember()};}
 function seed(){
  if(frames.length===1&&!dialog(current().kind)?.open)frames=[];
  if(frames.length)return;
  const open=Object.entries(adapters).find(([kind,a])=>a.dialog()?.matches(':modal')&&a.id());
  if(open){const [kind,a]=open;frames=[{kind,id:String(a.id()),base:true,focus:captureFocus()}];capture(current());history.replaceState(historyState(),'');}
 }
 async function reconcile(target){
  const token=++sequence;restoring=true;pending=null;document.documentElement.dataset.detailRestoring='true';
  try{
   const kinds=new Set(target.map(f=>f.kind));
   for(const kind of Object.keys(adapters))if(!kinds.has(kind)){adapters[kind].cancel?.();if(dialog(kind)?.open)dialog(kind).close();}
   frames=target.map(f=>({...f}));if(!frames.length)return;
   restoreContext(current().context);
   const latest=new Map();frames.forEach(f=>latest.set(f.kind,f));
   for(const frame of [...latest.values()].sort((a,b)=>frames.indexOf(a)-frames.indexOf(b))){
    const a=adapters[frame.kind];
    if(String(a.id())!==frame.id||!a.dialog()?.open)await a.open(frame.id);
    if(token!==sequence)return;
    await a.restore?.(frame.view);
    if(token!==sequence)return;
   }
   restoreContext(current().context);
   // Reusing the same entity type may reopen a lower frame above its parent.
   // Raise surviving dialogs in frame order without destroying their DOM.
   for(const frame of [...latest.values()].sort((a,b)=>frames.indexOf(a)-frames.indexOf(b))){const d=dialog(frame.kind);if(d?.open)d.close();d?.showModal();}
   // showModal() focuses its first control; restore positions only after that
   // native focus step and the view's queued layout updates have completed.
   await frame();await frame();if(token!==sequence)return;
   for(const item of latest.values())restoreDialogScroll(dialog(item.kind),item.view?.dom??item.view);
   const viewport=current().view?.dom?.viewport??current().view?.viewport;
   if(viewport)window.scrollTo({left:viewport.x,top:viewport.y,behavior:'instant'});

  }catch(error){onError?.(error);}finally{if(token===sequence){restoring=false;closing=false;document.documentElement.dataset.detailRestoring='false';}}
 }
 async function open(kind,id){
  if(restoring)return;
  id=String(id);seed();
  if(current()?.kind===kind&&current()?.id===id){return pending;}
  if(pending){adapters[current().kind].cancel?.();await reconcile(frames.slice(0,-1));}
  capture(current());save();const focus=captureFocus();
  const frame={kind,id,focus,base:!frames.length};frames.push(frame);const token=++sequence;
  pending=(async()=>{
   try{
    await adapters[kind].open(id);if(token!==sequence)return;
    const d=dialog(kind);if(d?.open){d.close();d.showModal();}
    capture(frame);history.pushState(historyState(),'');
   }catch(error){if(token===sequence){await reconcile(frames.slice(0,-1));restoreFocus(focus);onError?.(error);}}
   finally{if(token===sequence)pending=null;}
  })();return pending;
 }
 function close(kind){
  if(restoring)return true;
  if(pending&&current()?.kind!==kind){
   const focus=current().focus;adapters[current().kind].cancel?.();
   void reconcile(frames.slice(0,-1)).then(()=>restoreFocus(focus));return true;
  }
  if(current()?.kind!==kind||frames.length<2)return false;
  if(closing)return true;closing=true;
  if(pending){const focus=current().focus;adapters[kind].cancel?.();void reconcile(frames.slice(0,-1)).then(()=>restoreFocus(focus));}
  else history.back();return true;
 }
 window.addEventListener('popstate',event=>{
  const state=event.state?.galpediaDetailStack;
  if(state?.session===session&&records.has(state.key)){
   event.stopImmediatePropagation();const target=records.get(state.key),focus=target.length<frames.length?current()?.focus:target.at(-1)?.activeFocus;capture(current());save();activeKey=state.key;
   void reconcile(target).then(()=>restoreFocus(focus));
  }else if(frames.length){void reconcile([]);}
 },true);
 return {open,close,get restoring(){return restoring;},get active(){return frames.length>1;},isLayer:kind=>frames.length>1&&current()?.kind===kind,
  inspect:()=>frames.map(f=>({kind:f.kind,id:f.id})),reset(){if(frames.length>1)void reconcile([]);else frames=[];}};
}

// State keys survive rerendering; live element references are only a fast path.
function address(root,element){
 if(element===root)return ':scope';
 if(element.id)return '#'+CSS.escape(element.id);
 for(const name of ['data-detail-focus-token','data-choice','data-catalog-search','data-catalog-layout','data-section','data-person-detail-page','data-scope','data-period']){
  if(element.hasAttribute(name))return `[${name}="${CSS.escape(element.getAttribute(name))}"]`;
 }
 const parts=[];for(let node=element;node&&node!==root;node=node.parentElement){
  parts.unshift(`${node.localName}:nth-child(${[...node.parentElement.children].indexOf(node)+1})`);
 }
 return ':scope > '+parts.join(' > ');
}
function ref(root,element){return {element,selector:address(root,element)};}
function locate(root,item){return item.element?.isConnected&&root.contains(item.element)?item.element:root.querySelector(item.selector);}
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function settled(root){
 if(root.matches('[aria-busy="true"]')||root.querySelector('[aria-busy="true"]'))await new Promise(resolve=>{
  const done=()=>{observer.disconnect();clearTimeout(timer);resolve();};
  const observer=new MutationObserver(()=>{if(!root.matches('[aria-busy="true"]')&&!root.querySelector('[aria-busy="true"]'))done();});
  observer.observe(root,{subtree:true,attributes:true,childList:true});const timer=setTimeout(done,20000);
 });
 await frame();await frame();
}
export function captureDialogState(root){
 if(!root)return null;
 const managed=element=>!element.closest('.nsfw-preference,.nsfw-image-control');
 return {
  tabs:[...root.querySelectorAll('[role=tab][aria-selected=true]')].map(e=>ref(root,e)),
  controls:[...root.querySelectorAll('select,input')].filter(managed).map(e=>({...ref(root,e),value:e.value,checked:e.checked,scope:e.closest('[data-profile-panel]')?.id})),
  details:[...root.querySelectorAll('details')].map(e=>({...ref(root,e),open:e.open})),
  buttons:[...root.querySelectorAll('button[aria-expanded],button[aria-pressed]')].filter(managed).map(e=>({...ref(root,e),expanded:e.getAttribute('aria-expanded'),pressed:e.getAttribute('aria-pressed')})),
  scrolls:[root,...root.querySelectorAll('*')].filter(e=>e.scrollTop||e.scrollLeft||['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>({...ref(root,e),top:e.scrollTop,left:e.scrollLeft})),
  viewport:{x:scrollX,y:scrollY}
 };
}
export function restoreDialogScroll(root,state){
 if(!root||!state)return;
 for(const saved of state.scrolls){const element=locate(root,saved);if(element){element.scrollTop=saved.top;element.scrollLeft=saved.left;}}
}
export async function restoreDialogState(root,state){
 if(!root||!state)return;
 await settled(root);
 for(const scope of new Set(state.controls.map(s=>s.scope).filter(Boolean))){const panel=root.querySelector('#'+CSS.escape(scope));if(panel&&!panel.children.length){root.querySelector(`[aria-controls="${CSS.escape(scope)}"]`)?.click();await settled(root);}}
 for(const saved of state.controls){
  const element=locate(root,saved);if(!element)continue;
  if(element.value!==saved.value||element.checked!==saved.checked){
   element.value=saved.value;if(saved.checked!==undefined)element.checked=saved.checked;
   element.dispatchEvent(new Event(element.tagName==='INPUT'&&!['checkbox','radio'].includes(element.type)?'input':'change',{bubbles:true}));
   await settled(root);
  }
 }
 for(const saved of state.buttons){
  const element=locate(root,saved);if(!element||element.disabled||!element.getClientRects().length)continue;
  const expanded=saved.expanded!==null&&element.getAttribute('aria-expanded')!==saved.expanded;
  const pressed=saved.pressed!==null&&element.getAttribute('aria-pressed')!==saved.pressed;
  // False members of a choice group are restored by choosing the saved true member.
  const choice=element.hasAttribute('data-scope')||element.hasAttribute('data-catalog-layout');
  if(expanded||pressed&&(!choice||saved.pressed==='true')){element.click();await settled(root);}
 }
 for(const saved of state.tabs){const element=locate(root,saved);if(element?.getAttribute('aria-selected')!=='true'){element?.click();await settled(root);}}
 for(const saved of state.details){const element=locate(root,saved);if(element)element.open=saved.open;}
 await settled(root);restoreDialogScroll(root,state);
}
