import {createActionIcon} from './action-icons.js';
const THEME_KEY='egs-tier-terminal:theme-v1';
// Keep the existing route controls and listeners; only group global navigation.
function installPrimaryNavigation(){
 const header=document.querySelector('.galpedia-header'),tabs=document.getElementById('workspace-mode');
 const workbench=header?.querySelector('.analysis-nav'),handbook=document.getElementById('site-info-button');
 if(!header||!tabs||!workbench||!handbook||header.querySelector('.site-primary-navigation'))return;
 const navigation=document.createElement('nav');navigation.className='site-primary-navigation';navigation.setAttribute('aria-label','主导航');
 tabs.before(navigation);navigation.append(tabs);
 const extras=document.createElement('div');extras.className='site-navigation-extras';navigation.append(extras);extras.append(workbench);
 const explore=document.createElement('details');explore.className='site-explore';
 const summary=document.createElement('summary');summary.textContent='探索';
 const panel=document.createElement('div');panel.className='site-explore-panel';
 explore.append(summary,panel);extras.append(explore);panel.append(handbook);
 const room=document.createElement('div');room.className='site-explore-upcoming';
 const title=document.createElement('span');title.textContent='收藏室';
 const status=document.createElement('small');status.textContent='开发中';room.append(title,status);panel.append(room);
 explore.addEventListener('keydown',event=>{if(event.key==='Escape'&&explore.open){event.preventDefault();event.stopPropagation();explore.open=false;summary.focus();}});
 document.addEventListener('click',event=>{if(!explore.contains(event.target))explore.open=false;});
 // The handbook uses document capture, so close before its click handler.
 addEventListener('click',event=>{if(handbook.contains(event.target))explore.open=false;},true);
 navigation.addEventListener('focusout',event=>{if(!navigation.contains(event.relatedTarget))explore.open=false;});
 addEventListener('hashchange',()=>{explore.open=false;});
}
export function installSiteShell({analysis=false}={}){
 installPrimaryNavigation();
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
