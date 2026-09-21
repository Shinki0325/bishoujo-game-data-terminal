
import {createCompanyWorkspaceController as original} from './company-workspace-controller-baseline.js';
import {getStaticCompanyClient} from './company-static-client.js';
import {createReviewedCompanyController} from './company-reviewed-runtime.js';
export function createCompanyWorkspaceController(dependencies){
 const controller=createReviewedCompanyController({...dependencies,createController:original,client:getStaticCompanyClient()});let latest;
 let box=document.getElementById('company-reviewed-role')?.parentElement?.parentElement;
 if(!box){box=document.createElement('div');box.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
  box.innerHTML='<label>参与职能 <select id="company-reviewed-role"><option value="all">全部关联</option><option value="development">制作</option><option value="publishing">发行</option><option value="both">制作与发行</option><option value="brand">品牌记录</option><option value="other">其他参与</option></select></label><label>记录范围 <select id="company-reviewed-scope"><option value="work">作品各版本</option><option value="edition">当前版本</option></select></label><p id="company-reviewed-note" class="muted" style="flex-basis:100%;margin:0;font-size:12px" hidden></p>';
  document.querySelector('.company-detail-works-heading').before(box);for(const label of box.querySelectorAll('label'))label.style.cssText='display:grid;gap:4px;flex:1 1 140px';for(const s of box.querySelectorAll('select'))s.style.cssText='min-width:0;width:100%';
 }
 const render=options=>{latest=options;const role=document.getElementById('company-reviewed-role').value,scope=document.getElementById('company-reviewed-scope').value,note=document.getElementById('company-reviewed-note');
  note.hidden=role==='all';note.textContent=scope==='work'?'按作品各版本的参与记录筛选，具体版本可能不同。':'仅显示能对应当前版本的参与记录。';return controller.render({...options,companyRole:role,companyScope:scope});};
 for(const s of box.querySelectorAll('select'))s.addEventListener('change',()=>{if(latest)void render(latest);});
 return Object.freeze({render,suspend:()=>controller.suspend()});
}
