import {loadCompanyScope} from '../../public-experience-client.js';
export const loadScope=(id,role)=>loadCompanyScope(String(id),role);
export function createCompanyCard(host){
 if(!document.getElementById('company-card-v20-style')){const l=document.createElement('link');l.id='company-card-v20-style';l.rel='stylesheet';l.href=new URL('./card.css',import.meta.url).href;document.head.append(l);}
 let current=null,company=null,role='development',status='idle',sequence=0,cleanups=[],section='honors',payload=null,modules=null;
 const mounted=new Set();
 function clear(){sequence++;cleanups.forEach(fn=>fn?.());cleanups=[];mounted.clear();payload=null;host.replaceChildren();host.removeAttribute('data-ready-company');}
 function paint(){
  host.hidden=section==='works';if(!payload)return;
  for(const el of host.querySelectorAll(':scope > [data-profile-panel]'))el.hidden=el.dataset.profilePanel!==section;
  if(section==='works'||mounted.has(section))return;
  const panel=host.querySelector(`[data-profile-panel="${section}"]`);if(!panel)return;
  if(role==='other'){const p=document.createElement('p');p.className='cp-scope-empty';p.textContent='这些记录尚未明确制作或发行职责。可在作品目录查看关联依据，暂不据此生成高分代表作或画像。';panel.append(p);}
  else if(section==='honors')cleanups.push(modules.mountHonors(panel,payload.honors,{...payload.company,role}));
  else cleanups.push(modules.mountRadar(panel,payload.radar,{...payload.company,role}));
  mounted.add(section);
 }
 async function show(value,scope='development',retry=false){
  company=value;role=scope;if(!value){clear();current=null;status='idle';return;}
  const id=String(value.companyId),key=JSON.stringify([id,scope]);if(!retry&&key===current&&['loading','ready'].includes(status))return;
  clear();current=key;status='loading';const token=sequence;host.setAttribute('aria-busy','true');host.innerHTML='<p class="company-card-message" role="status">正在加载当前范围…</p>';
  try{
   const result=await Promise.all([import('./renderers.js'),loadScope(id,scope)]);if(sequence!==token)return;[modules,payload]=result;host.replaceChildren();
   for(const name of ['honors','radar']){const panel=document.createElement('section');panel.id=`cp-panel-${name}`;panel.dataset.profilePanel=name;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`cp-tab-${name}`);panel.tabIndex=0;host.append(panel);}
   status='ready';paint();host.dataset.readyCompany=id;host.dataset.readyRole=scope;
  }catch(e){if(sequence!==token)return;status='error';host.innerHTML='<p class="company-card-message">当前范围暂时没能加载。</p><button type="button">重试</button>';host.querySelector('button').addEventListener('click',()=>show(company,role,true));}
  finally{if(sequence===token)host.setAttribute('aria-busy','false');}
 }
 return {show,setSection(value){section=value;paint();},suspend(){clear();current=null;status='idle';host.setAttribute('aria-busy','false');},dispose(){clear();host.remove();}};
}
