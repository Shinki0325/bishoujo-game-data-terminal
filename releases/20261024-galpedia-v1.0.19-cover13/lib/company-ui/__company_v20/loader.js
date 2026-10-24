import {loadCompanyScope} from '../../public-experience-client.js';
export const loadScope=(id,role)=>loadCompanyScope(String(id),role);
export function createCompanyCard(host){
 if(!document.getElementById('company-card-v20-style')){const l=document.createElement('link');l.id='company-card-v20-style';l.rel='stylesheet';l.href=new URL('./card.css',import.meta.url).href;document.head.append(l);}
 let current=null,company=null,role='development',status='idle',sequence=0,cleanups=[],section='honors',payload=null;
 const mounted=new Set();
 function clear(){sequence++;cleanups.forEach(fn=>fn?.());cleanups=[];mounted.clear();payload=null;host.replaceChildren();host.removeAttribute('data-ready-company');}
 async function paint(){
  host.hidden=section==='works';if(!payload)return;
  for(const el of host.querySelectorAll(':scope > [data-profile-panel]'))el.hidden=el.dataset.profilePanel!==section;
  if(section==='works'||mounted.has(section))return;
  const name=section,token=sequence,panel=host.querySelector(`[data-profile-panel="${name}"]`);if(!panel)return;
  mounted.add(name);
  try{
   if(role==='other'){const p=document.createElement('p');p.className='cp-scope-empty';p.textContent='这些记录尚未明确制作或发行职责。可在作品目录查看关联依据，暂不据此生成高分代表作或画像。';panel.append(p);return;}
   const module=await (name==='honors'?import('./honors.js'):import('./radar.js'));
   if(sequence!==token)return;
   if(section!==name){mounted.delete(name);return;}
   panel.replaceChildren();
   cleanups.push(name==='honors'?module.mountHonors(panel,payload.honors,{...payload.company,role}):module.mountRadar(panel,payload.radar,{...payload.company,role}));
  }catch(error){
   if(sequence!==token)return;mounted.delete(name);
   panel.textContent='当前栏目暂时没能加载。';const button=document.createElement('button');button.type='button';button.textContent='重试';button.onclick=()=>void paint();panel.append(button);
  }
 }
 async function show(value,scope='development',retry=false){
  company=value;role=scope;if(!value){clear();current=null;status='idle';return;}
  const id=String(value.companyId),key=JSON.stringify([id,scope]);if(!retry&&key===current&&['loading','ready'].includes(status))return;
  clear();current=key;status='loading';const token=sequence;host.setAttribute('aria-busy','true');host.innerHTML='<p class="company-card-message" role="status">正在加载当前范围…</p>';
  try{
   const result=await loadScope(id,scope);if(sequence!==token)return;payload=result;host.replaceChildren();
   for(const name of ['honors','radar']){const panel=document.createElement('section');panel.id=`cp-panel-${name}`;panel.dataset.profilePanel=name;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`cp-tab-${name}`);panel.tabIndex=0;host.append(panel);}
   status='ready';await paint();if(sequence!==token)return;host.dataset.readyCompany=id;host.dataset.readyRole=scope;
  }catch(e){if(sequence!==token)return;status='error';host.innerHTML='<p class="company-card-message">当前范围暂时没能加载。</p><button type="button">重试</button>';host.querySelector('button').addEventListener('click',()=>show(company,role,true));}
  finally{if(sequence===token)host.setAttribute('aria-busy','false');}
 }
 return {show,setSection(value){section=value;paint();},suspend(){clear();current=null;status='idle';host.setAttribute('aria-busy','false');},dispose(){clear();host.remove();}};
}
