import {resolvePublicImageSafety} from './public-data-client.js';
const STORAGE='galpedia-image-safety-v1';
const revealed=new Set(), bindings=new Set(), byImage=new WeakMap(), cache=new Map(), waiting=new Map();
let flushTimer=null,revision=null,obscure=true;
try { obscure=localStorage.getItem(STORAGE)!=='show'; } catch {}
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
export function setImageSafetyHidden(value){obscure=Boolean(value);revealed.clear();try{localStorage.setItem(STORAGE,obscure?'hide':'show');}catch{}notify();}
export function isImageSafetyHidden(){return obscure;}
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
    if(active)for(const info of risky)revealed.delete(info.family);else for(const info of risky)revealed.add(info.family);
    notify();
  }
  function update(){
    if(disposed)return;const current=getImage();
    if(mounted&&!current?.isConnected){dispose();return;}mount();
    const missing=!!infos&&infos.every(x=>x.status==='missing');
    const risky=infos?.filter(x=>!safeStates.has(x.status)&&!['local','missing'].includes(x.status))??[];
    const unavailable=infos?.some(x=>x.status==='unavailable');
    const allowed=!!infos&&!missing&&!unavailable&&(!obscure||risky.length===0||risky.every(x=>revealed.has(x.family)));
    if(!allowed){revisionId++;if(active){hide();active=false;}clear();}
    if(badge){
      badge.hidden=!!infos&&!missing&&!unavailable&&(risky.length===0||!obscure);
      badge.classList.toggle('is-revealed',allowed);badge.classList.toggle('is-loading',!infos||unavailable);
      badge.classList.toggle('is-missing',missing);badge.setAttribute('role',missing?'img':'button');badge.tabIndex=missing?-1:0;
      const message=!infos?'正在检查图片…':missing?'暂无图片':unavailable?'图片暂不可用':allowed?'重新遮挡':risky.some(x=>x.status==='nsfw')?'敏感图片\n点击显示':'图片未分级\n点击显示';
      if(badge.textContent!==message)badge.textContent=message;
      badge.setAttribute('aria-label',badge.textContent.replace('\n','，'));badge.setAttribute('aria-disabled',String(!infos||missing||!!unavailable));
      host?.classList.toggle('nsfw-is-blocked',!allowed);
    }
    if(allowed){getImage().removeAttribute('data-safety-blocked');if(!active){active=true;const token=++revisionId;show(infos.map(x=>x.url??infos.find(x=>x.url)?.url),()=>!disposed&&active&&revisionId===token);}}
  }
  function dispose(){if(disposed)return;disposed=true;revisionId++;hide();bindings.delete(binding);badge?.remove();host?.classList.remove('nsfw-is-blocked','nsfw-image-host');}
  const binding={update,dispose};byImage.set(image,binding);bindings.add(binding);queueMicrotask(update);
  Promise.all(urls.filter(Boolean).map(resolveSafety)).then(data=>{if(!disposed){infos=data;update();}});
  return binding;
}
let toolbar,openDialogs=[],positionFrame=null;
function scheduleControlPosition(){if(toolbar)toolbar.style.removeProperty('bottom');}
function syncControl(){if(toolbar){
  toolbar.querySelector('input').checked=obscure;
  openDialogs=openDialogs.filter(x=>x.isConnected&&x.open);
  const dialog=openDialogs.at(-1);
  const parent=dialog ? (dialog.querySelector('.details-heading-actions')??dialog.querySelector('.dialog-heading,.company-detail-heading,.pp-explorer')??dialog) : (document.querySelector('.header-actions')??document.body);
  toolbar.inert=false;
  if(toolbar.parentElement!==parent){toolbar.open=false;const close=parent.querySelector(':scope > form,:scope > #company-detail-close');if(close)parent.insertBefore(toolbar,close);else parent.append(toolbar);}
  scheduleControlPosition();
}}
function installControl(){
  if(toolbar)return;toolbar=document.createElement('details');toolbar.className='nsfw-preference';const summary=document.createElement('summary');summary.textContent='图片';summary.setAttribute('aria-label','图片显示设置');toolbar.append(summary);
  for(const type of ['click','pointerdown','pointerup','keydown','wheel'])toolbar.addEventListener(type,event=>{if(type==='keydown'&&['Escape','Tab'].includes(event.key)){if(event.key==='Escape'&&toolbar.open){toolbar.open=false;event.preventDefault();event.stopPropagation();toolbar.querySelector('summary').focus();}return;}event.stopPropagation();});
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=obscure;input.addEventListener('change',()=>setImageSafetyHidden(input.checked));
  label.append(input,document.createTextNode('遮挡敏感图片'));toolbar.append(label);document.body.append(toolbar);syncControl();
  const resize=new ResizeObserver(scheduleControlPosition);
  for(const node of document.querySelectorAll('#workspace-mode,#mobile-ranking-dock,#ranking-candidates'))resize.observe(node);
  new MutationObserver(scheduleControlPosition).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',scheduleControlPosition);document.addEventListener('transitionend',scheduleControlPosition);scheduleControlPosition();
}
if(typeof document!=='undefined'){
  window.addEventListener('storage',event=>{if(event.key===STORAGE){obscure=event.newValue!=='show';revealed.clear();notify();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installControl,{once:true});else installControl();
  new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&record.target.tagName==='DIALOG'){openDialogs=openDialogs.filter(x=>x!==record.target);if(record.target.open)openDialogs.push(record.target);}}for(const item of [...bindings])item.update();syncControl();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
}
