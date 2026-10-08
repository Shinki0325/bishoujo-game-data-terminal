import {bindImageSafety} from './image-safety.js';
const revisions=new WeakMap();
// Person work lists and comparison trays use compact covers outside the main
// adaptive loader. Keep every source assignment behind the same safety gate.
export function setManagedWorkThumbnail(image,url){
 if(!url)return;const revision=(revisions.get(image)??0)+1;revisions.set(image,revision);
 image.removeAttribute('src');
 queueMicrotask(()=>{
  if(!image.isConnected||revisions.get(image)!==revision)return;
  image.hidden=false;
  if(!image.parentElement.classList.contains('managed-work-thumbnail')){
   const host=image.ownerDocument.createElement('span');host.className='managed-work-thumbnail';image.before(host);host.append(image);
  }
  // Detached images must not enter Chromium's broken-image viewport listener
  // after removal. Connected images still clear their source immediately.
  bindImageSafety(image,{urls:[url],show:(urls,active)=>{if(active()&&revisions.get(image)===revision){image.src=urls[0];image.closest('.is-image-missing')?.classList.remove('is-image-missing');}},hide:()=>{if(image.isConnected)image.removeAttribute('src');}});
 });
}
