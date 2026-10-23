import {createCompanyWorkspaceController as original} from './company-workspace-controller-baseline.js';
import {companyRoleCounts} from './company-ui/__company_v30/presentation.js';
import {loadCompanyDirectory as loadScope} from './public-experience-client.js';

export function createCompanyWorkspaceController(dependencies){
 const choices=new Map(),contracts=new Map();let latest=null,controller=null,controllerKey=null,currentId=null,generation=0;
 const box=document.querySelector('.cp-scope-bar')??document.createElement('div');box.className='cp-scope-bar';
 if(!box.querySelector('select'))box.innerHTML='<label for="company-reviewed-role">参与范围</label><select id="company-reviewed-role" aria-label="会社参与范围"><option value="development">制作</option><option value="publishing">发行</option><option value="other">其他关联</option></select><span class="cp-scope-caption"></span>';
 if(!box.isConnected)document.querySelector('.company-detail-works-heading').before(box);
 const select=box.querySelector('select');
 async function defaultRole(id){if(dependencies.defaultRole)return dependencies.defaultRole(id);const {defaults}=await import('./company-ui/__company_v41/runtime-config.js');if(defaults[id])return defaults[id];const c=companyRoleCounts(id);return c[1]?'development':c[2]?'publishing':'other';}
 async function render(options){
  const ticket=++generation;latest=options;currentId=String(options.selectedCompanyId??'');const role=choices.get(currentId)||await defaultRole(currentId);if(ticket!==generation)return;select.value=role;
  const key=JSON.stringify([currentId,role]);
  if(key!==controllerKey){controller?.suspend();controllerKey=key;
   controller=original({...dependencies,
    loadWorkIds:async(id,sort)=>{const p=await loadScope(String(id),role);contracts.set(JSON.stringify([String(id),role]),p.contract||null);if(contracts.size>24)contracts.delete(contracts.keys().next().value);const sortKey=sort.sortKey??'releaseDate',direction=sort.direction??'asc';return p.directory.orders[sortKey+'_'+direction]||[];},
    renderView:model=>dependencies.renderView({...model,companyRole:role,companyScope:'work',companyContract:contracts.get(key)||null,selectedCompanyRecord:dependencies.directory.companies.find(c=>String(c.companyId)===String(model.selectedCompanyId))||null})});
  }
  return controller.render(options);
 }
 select.onchange=()=>{choices.set(currentId,select.value);if(latest)void render(latest);};
 return Object.freeze({render,suspend(){generation++;controller?.suspend();}});
}
