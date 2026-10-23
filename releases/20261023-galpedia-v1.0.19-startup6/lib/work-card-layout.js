import {syncSelectionCardImageSizes} from './selection-card-image-sizes.js';
// Presentation preferences are independent of query, sort and result membership.
const media=matchMedia('(max-width:899px)'),key='galpedia:work-card-layout:v1:',memory=new Map(),controls=new Set();
const device=()=>media.matches?'mobile':'desktop';
export function workCardLayout(){
 const scope=device();let value=memory.get(scope);
 if(!value){try{value=localStorage.getItem(key+scope);}catch{} }
 return ['list','grid'].includes(value)?value:media.matches?'list':'grid';
}
function sync(){
 const value=workCardLayout();document.documentElement.dataset.workCardLayout=value;
 syncSelectionCardImageSizes();
 if(value==='list')import('./work-card-tags.js').then(m=>m.installWorkCardTags()).catch(()=>{});
 window.dispatchEvent(new Event('galpedia-work-card-layout'));
 for(const group of controls)for(const b of group.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.workLayout===value));
}
function select(value){
 memory.set(device(),value);try{localStorage.setItem(key+device(),value);}catch{}
 sync();
}
export function createWorkCardLayoutControl(){
 const group=document.createElement('div');group.className='work-card-layout-control';group.setAttribute('role','group');group.setAttribute('aria-label','作品显示方式');
 for(const [value,label]of [['list','列表'],['grid','网格']]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.workLayout=value;b.addEventListener('click',()=>select(value));group.append(b);
 }
 controls.add(group);sync();return group;
}
export function installWorkCardLayout(){
 sync();const anchor=document.querySelector('.selection-card-display-shell');
 if(anchor&&!document.getElementById('catalog-layout-control')){const control=createWorkCardLayoutControl();control.id='catalog-layout-control';anchor.before(control);}
}
media.addEventListener('change',sync);
window.addEventListener('storage',event=>{if(event.key===null||event.key?.startsWith(key)){memory.clear();sync();}});
