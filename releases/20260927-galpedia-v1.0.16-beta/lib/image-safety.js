import {resolvePublicImageSafety} from './public-data-client.js';
const STORAGE='galpedia-image-safety-v1';
const revealed=new Set(), bindings=new Set(), byImage=new WeakMap(), cache=new Map(), waiting=new Map();
const MODES=[['hide','隐藏敏感图片','点击单张图片后查看'],['blur','模糊显示','遮挡细节，点击后查看'],['show','直接显示','敏感图片也直接展示']];
const normalizeMode=value=>MODES.some(([mode])=>mode===value)?value:'hide';
let flushTimer=null,mode='hide';
try { mode=normalizeMode(localStorage.getItem(STORAGE)); } catch {}
const safeStates=new Set(['unflagged','reviewed-approved','exempt-by-work']);
const MISSING_COVER_PATH='/egs-tier/v2/objects/sha256/58/58e13b4a0b2c570a210f98bb4da69c4d3fcffd5f58f580a0ddf38fbc7ce91394.webp';
function missingImage(url) {
  const parsed=new URL(url,document.baseURI);
  if(parsed.origin===location.origin&&/(?:^|\/)cover-unavailable\.webp$/.test(parsed.pathname))return true;
  return !parsed.search&&!parsed.hash&&(
    ['https://assets.bishojo.date','https://wiki-assets.bishojo.date'].includes(parsed.origin)&&parsed.pathname===MISSING_COVER_PATH
    ||parsed.origin==='https://raw.githubusercontent.com'&&parsed.pathname==='/Shinki0325/bishoujo-game-cover-assets/main'+MISSING_COVER_PATH);
}
function ownImage(url) { return url.startsWith('blob:'); }
export function resolveSafety(url) {
  if(ownImage(url))return Promise.resolve({status:'local',family:url,url});
  if(missingImage(url))return Promise.resolve({status:'missing',family:url,url:null});
  const absolute=new URL(url,document.baseURI).href;
  if(cache.has(absolute))return Promise.resolve(cache.get(absolute));
  return new Promise(resolve=>{
    if(!waiting.has(absolute))waiting.set(absolute,[]);waiting.get(absolute).push(resolve);
    if(!flushTimer)flushTimer=setTimeout(flush,0);
  });
}
async function flush() {
  flushTimer=null;const jobs=[...waiting.entries()].slice(0,128);for(const [url]of jobs)waiting.delete(url);
  try {
    const items=Object.fromEntries(await Promise.all(jobs.map(async([url])=>[url,await resolvePublicImageSafety(url)])));
    const data={items};
    for(const [url,list]of jobs){const info=data.items[url];if(!info?.status)throw Error('missing classification');cache.set(url,info);for(const resolve of list)resolve(info);}
  } catch {for(const [url,list]of jobs)for(const resolve of list)resolve({status:'unavailable',family:url,url});}
  if(waiting.size&&!flushTimer)flushTimer=setTimeout(flush,0);
}
function notify(){for(const item of [...bindings])item.update();syncControl();}
export function setImageSafetyMode(value){mode=normalizeMode(value);revealed.clear();try{localStorage.setItem(STORAGE,mode);}catch{}notify();}
export function getImageSafetyMode(){return mode;}
export function setImageSafetyHidden(value){setImageSafetyMode(value?'hide':'show');}
export function isImageSafetyHidden(){return mode!=='show';}
export async function exportImageUrl(url){const info=await resolveSafety(url);return safeStates.has(info.status)||info.status==='local'?info.url:null;}

export function bindImageSafety(image,{urls,show,hide=()=>{},getImage=()=>image}){
  byImage.get(image)?.dispose();let disposed=false,infos=null,active=false,host=null,badge=null,revisionId=0,mounted=false;
  function clear(){const current=getImage();if(!current)return;current.removeAttribute('src');current.removeAttribute('srcset');current.dataset.safetyBlocked='true';}
  clear();
  function mount(){
    if(disposed)return;
    const current=getImage();if(!current?.isConnected)return;
    mounted=true;
    if(!host){host=current.parentElement;if(!host)return;host.classList.add('nsfw-image-host');
      // span role=button avoids nesting native buttons in existing cover buttons.
      badge=document.createElement('span');badge.className='nsfw-image-control';badge.tabIndex=0;badge.setAttribute('role','button');
      badge.addEventListener('click',toggle);badge.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();toggle(event);}});
      host.append(badge);
    }
  }
  function toggle(event){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(!infos||infos.every(x=>x.status==='missing'))return;
    const risky=infos.filter(x=>!safeStates.has(x.status)&&!['local','missing'].includes(x.status));
    if(risky.every(info=>revealed.has(info.family)))for(const info of risky)revealed.delete(info.family);else for(const info of risky)revealed.add(info.family);
    notify();
  }
  function update(){
    if(disposed)return;const current=getImage();
    if(mounted&&!current?.isConnected){dispose();return;}mount();
    const missing=!!infos&&infos.every(x=>x.status==='missing');
    const risky=infos?.filter(x=>!safeStates.has(x.status)&&!['local','missing'].includes(x.status))??[];
    const unavailable=infos?.some(x=>x.status==='unavailable');
    const individuallyRevealed=risky.length>0&&risky.every(x=>revealed.has(x.family));
    const blurred=!!infos&&!unavailable&&mode==='blur'&&risky.length>0&&risky.every(x=>x.status==='nsfw')&&!individuallyRevealed;
    const allowed=!!infos&&!missing&&!unavailable&&(mode==='show'||risky.length===0||individuallyRevealed||blurred);
    current?.toggleAttribute('data-safety-blurred',blurred);
    if(!allowed){revisionId++;if(active){hide();active=false;}clear();}
    if(badge){
      badge.hidden=!!infos&&!missing&&!unavailable&&(risky.length===0||mode==='show');
      badge.classList.toggle('is-revealed',allowed&&!blurred);badge.classList.toggle('is-blurred',blurred);badge.classList.toggle('is-loading',!infos||unavailable);
      badge.classList.toggle('is-missing',missing);badge.setAttribute('role',missing?'img':'button');badge.tabIndex=missing?-1:0;
      const message=!infos?'正在检查图片…':missing?'暂无图片':unavailable?'图片暂不可用':blurred?'敏感图片已模糊\n点击查看':allowed?(mode==='blur'&&risky.every(x=>x.status==='nsfw')?'重新模糊':'重新遮挡'):risky.some(x=>x.status==='nsfw')?'敏感图片\n点击显示':'图片未分级\n点击显示';
      if(badge.textContent!==message)badge.textContent=message;
      badge.setAttribute('aria-label',badge.textContent.replace('\n','，'));badge.setAttribute('aria-disabled',String(!infos||missing||!!unavailable));
      host?.classList.toggle('nsfw-is-blocked',!allowed);host?.classList.toggle('nsfw-is-blurred',blurred);
    }
    if(allowed){getImage().removeAttribute('data-safety-blocked');if(!active){active=true;const token=++revisionId;show(infos.map(x=>x.url??infos.find(x=>x.url)?.url),()=>!disposed&&active&&revisionId===token);}}
  }
  function dispose(){if(disposed)return;disposed=true;revisionId++;hide();bindings.delete(binding);badge?.remove();getImage()?.removeAttribute('data-safety-blurred');host?.classList.remove('nsfw-is-blocked','nsfw-is-blurred','nsfw-image-host');}
  const binding={update,dispose};byImage.set(image,binding);bindings.add(binding);queueMicrotask(update);
  Promise.all(urls.filter(Boolean).map(resolveSafety)).then(data=>{if(!disposed){infos=data;update();}});
  return binding;
}
let toolbar,openDialogs=[];
function scheduleControlPosition(){if(toolbar)toolbar.style.removeProperty('bottom');}
function syncControl(){if(toolbar){
  for(const input of toolbar.querySelectorAll('input'))input.checked=input.value===mode;
  if(toolbar.dataset.mode!==mode){
    toolbar.dataset.mode=mode;const summary=toolbar.querySelector('summary'),label=MODES.find(([value])=>value===mode)[1];
    summary.setAttribute('aria-label','图片显示：'+label);summary.title='图片显示：'+label;
    summary.querySelector('span').textContent=label;
    summary.querySelector('svg').innerHTML='<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(mode==='hide'?'<path d="m3 3 18 18"/>':'');
  }
  openDialogs=openDialogs.filter(x=>x.isConnected&&x.open);
  const dialog=openDialogs.at(-1);
  const parent=dialog ? (dialog.querySelector('.details-heading-actions')??dialog.querySelector('.dialog-heading,.company-detail-heading,.pp-explorer')??dialog) : (document.querySelector('.header-actions')??document.body);
  toolbar.inert=false;
  if(toolbar.parentElement!==parent){toolbar.open=false;const close=parent.querySelector(':scope > form,:scope > #company-detail-close');if(close)parent.insertBefore(toolbar,close);else parent.append(toolbar);}
  scheduleControlPosition();
}}
function installControl(){
  if(toolbar)return;toolbar=document.createElement('details');toolbar.className='nsfw-preference';const summary=document.createElement('summary');summary.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span>图片设置</span>';summary.setAttribute('aria-label','图片显示设置');summary.title='图片显示设置';toolbar.append(summary);
  for(const type of ['click','pointerdown','pointerup','keydown','wheel'])toolbar.addEventListener(type,event=>{if(type==='keydown'&&['Escape','Tab'].includes(event.key)){if(event.key==='Escape'&&toolbar.open){toolbar.open=false;event.preventDefault();event.stopPropagation();toolbar.querySelector('summary').focus();}return;}event.stopPropagation();});
  const panel=document.createElement('fieldset');panel.className='nsfw-preference-panel';
  const legend=document.createElement('legend');legend.textContent='敏感图片显示';panel.append(legend);
  for(const [value,title,description] of MODES){
    const label=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
    label.className='nsfw-mode-option';input.type='radio';input.name='nsfw-display-mode';input.value=value;input.checked=value===mode;input.addEventListener('change',()=>{if(input.checked)setImageSafetyMode(value);});
    name.textContent=title;hint.textContent=description;copy.append(name,hint);label.append(input,copy);panel.append(label);
  }
  toolbar.append(panel);document.body.append(toolbar);syncControl();
  const resize=new ResizeObserver(scheduleControlPosition);
  for(const node of document.querySelectorAll('#workspace-mode,#mobile-ranking-dock,#ranking-candidates'))resize.observe(node);
  new MutationObserver(scheduleControlPosition).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',scheduleControlPosition);document.addEventListener('transitionend',scheduleControlPosition);scheduleControlPosition();
}
if(typeof document!=='undefined'){
  window.addEventListener('storage',event=>{if(event.key===STORAGE||event.key===null){mode=normalizeMode(event.newValue);revealed.clear();notify();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installControl,{once:true});else installControl();
  new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&record.target.tagName==='DIALOG'){openDialogs=openDialogs.filter(x=>x!==record.target);if(record.target.open)openDialogs.push(record.target);}}for(const item of [...bindings])item.update();syncControl();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
}
