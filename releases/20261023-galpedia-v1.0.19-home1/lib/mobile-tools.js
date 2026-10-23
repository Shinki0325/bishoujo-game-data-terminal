import {createActionIcon} from './action-icons.js';
import {mobileLibraryViewport,mobileLibraryRoute} from './mobile-library-policy.js';
export function installMobileTools({navigate,openTool=navigate}){
 const button=document.createElement('button');button.id='mode-tools';button.type='button';button.className='workspace-tab';button.dataset.ui='nav';button.textContent='工具箱';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
 const icon=createActionIcon(document,'ellipsis');icon.classList.add('workspace-tab-icon');const label=document.createElement('span');label.textContent=button.textContent;button.replaceChildren(icon,label);
 document.querySelector('#workspace-mode').append(button);
 const dialog=document.createElement('dialog');dialog.id='mobile-tools-dialog';dialog.setAttribute('aria-labelledby','mobile-tools-title');
 dialog.innerHTML=`<header><h2 id="mobile-tools-title">工具箱</h2><button class="mobile-tools-close" data-close type="button" aria-label="关闭工具箱" autofocus></button></header><p class="mobile-tools-intro">找到想玩的作品，整理自己的喜好。</p><div class="mobile-tools-links"></div><p class="mobile-tool-status" role="status" hidden></p>`;
 dialog.querySelector('[data-close]').append(createActionIcon(document,'x'));
 function addTool(element,title,description,iconName){
  element.className='mobile-tool-link';
  const icon=document.createElement('span');icon.className='mobile-tool-icon';icon.append(createActionIcon(document,iconName));
  const copy=document.createElement('span');copy.className='mobile-tool-copy';
  const name=document.createElement('strong');name.textContent=title;
  const hint=document.createElement('span');hint.textContent=description;copy.append(name,hint);
  const arrow=document.createElement('span');arrow.className='mobile-tool-arrow';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');
  element.replaceChildren(icon,copy,arrow);dialog.querySelector('.mobile-tools-links').append(element);
 }
 for(const [id,title,hint,icon] of [['filter','筛选作品','按标签、评分、平台组合查找','filter'],['compare','比较作品','选择作品，并排查看资料与评分','layers-2'],['ranking','作品排榜','添加作品、调整顺序，继续已有草稿','ranking']]){
  const item=document.createElement('button');item.type='button';item.dataset.tool=id;addTool(item,title,hint,icon);
 }
 const analysis=document.querySelector('.analysis-nav');
 if(analysis){const link=analysis.cloneNode(false);link.removeAttribute('id');addTool(link,'数据分析','查看趋势与多维统计','layers-2');link.addEventListener('click',()=>dialog.close());}
 document.body.append(dialog);
 let focus,attempt=0,navigating=false,origin='#works';
 const context=document.createElement('nav');context.id='mobile-tool-context';context.setAttribute('aria-label','工具导航');context.hidden=true;
 context.innerHTML='<button type="button" class="toolbar-button mobile-tool-return">‹ <span>返回作品库</span></button><span class="mobile-tool-context-label">筛选与整理</span>';
 document.querySelector('#workspace').prepend(context);
 const toolRoute=hash=>/^#ranking(?:\?|$)/u.test(hash)||/^#works(?:\?|$)/u.test(hash)&&!mobileLibraryRoute(hash);
 function sync(){
  context.hidden=!mobileLibraryViewport()||!toolRoute(location.hash);
  context.querySelector('.mobile-tool-return span').textContent=origin.startsWith('#persons')?'返回人物库':origin.startsWith('#companies')?'返回会社库':origin==='#home'?'返回首页':'返回作品库';
  context.querySelector('.mobile-tool-context-label').textContent=location.hash.startsWith('#ranking')?'作品排榜':document.querySelector('#compare-mode-toggle')?.getAttribute('aria-pressed')==='true'?'比较作品':/[?&]select=1(?:&|$)/u.test(location.hash)?'选择排榜作品':'筛选作品';
 }
 context.querySelector('button').addEventListener('click',()=>navigate(origin));
 window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);window.addEventListener('galpedia:tool-context',sync);
 globalThis.matchMedia('(max-width:899px)').addEventListener('change',sync);
 const busyStatus=dialog.querySelector('.mobile-tool-status');
 function reset(){dialog.removeAttribute('aria-busy');for(const item of dialog.querySelectorAll('[data-tool]'))item.disabled=false;busyStatus.hidden=true;busyStatus.textContent='';}
 function open(){focus=document.activeElement;button.setAttribute('aria-expanded','true');if(!dialog.open)dialog.showModal();}
 button.addEventListener('click',open);dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{if(!navigating)attempt++;reset();button.setAttribute('aria-expanded','false');if(!navigating)focus?.focus?.({preventScroll:true});navigating=false;});
 async function activate(action){
  const item=dialog.querySelector(`[data-tool="${action}"]`);if(!item||dialog.getAttribute('aria-busy')==='true')return;
  if(!toolRoute(location.hash))origin=location.hash||'#home';
  const ticket=++attempt;dialog.setAttribute('aria-busy','true');for(const action of dialog.querySelectorAll('[data-tool]'))action.disabled=true;
  busyStatus.hidden=false;busyStatus.textContent=`正在打开${item.querySelector('strong').textContent}…`;
  const query=location.hash.startsWith('#works?')?new URLSearchParams(location.hash.split('?')[1]):new URLSearchParams();
  query.delete('select');query.set('tools','1');const route=action==='filter'?(mobileLibraryRoute()?location.hash:'#works'):action==='ranking'?'#ranking':'#works?'+query;
  try{
   const enter=await openTool(route,action,()=>ticket===attempt);
   if(ticket!==attempt)return;
   if(dialog.open){navigating=true;dialog.close();}else reset();
   if(location.hash===route)await enter?.();sync();
  }catch{if(ticket!==attempt)return;reset();if(!dialog.open)open();busyStatus.hidden=false;busyStatus.textContent='暂时没能打开，点击上方入口重试。';}
 }
 dialog.addEventListener('click',e=>{const item=e.target.closest('[data-tool]');if(item)void activate(item.dataset.tool);});
 return {open,activate,sync};
}
