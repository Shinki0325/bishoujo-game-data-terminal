import {createActionIcon} from './action-icons.js';
const THEME_KEY='egs-tier-terminal:theme-v1';
export function installSiteShell({analysis=false}={}){
 const root=document.documentElement,button=document.getElementById('theme-toggle');
 const render=()=>{const dark=root.dataset.theme==='dark';button.replaceChildren(createActionIcon(document,dark?'sun':'moon'));button.setAttribute('aria-label',dark?'切换到亮色界面':'切换到暗色界面');button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(!dark));};
 if(analysis){
  for(const [id,icon] of [['mode-selection','library'],['mode-company','building'],['mode-person','person'],['mode-ranking','ranking']]){
   const link=document.getElementById(id),label=document.createElement('span');label.textContent=link.textContent.trim();const svg=createActionIcon(document,icon);svg.classList.add('workspace-tab-icon');link.replaceChildren(svg,label);
  }
  for(const [id,icon,intent] of [['global-search-open','search','search'],['site-info-button','book','help']]){
   const control=document.getElementById(id);control.replaceChildren(createActionIcon(document,icon));if(intent==='help'){const label=document.createElement('span');label.className='handbook-label';label.textContent='庭守手册';control.append(label);}control.addEventListener('click',()=>location.assign('/?siteAction='+intent));
  }
  button.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY,root.dataset.theme);}catch{}render();});
 }
 addEventListener('storage',event=>{if(event.key===THEME_KEY){root.dataset.theme=event.newValue==='dark'?'dark':'light';render();}});
 render();
 if(!analysis){const url=new URL(location.href),intent=url.searchParams.get('siteAction');if(['search','help'].includes(intent)){url.searchParams.delete('siteAction');history.replaceState(history.state,'',url);document.getElementById(intent==='search'?'global-search-open':'site-info-button').click();}}
}
