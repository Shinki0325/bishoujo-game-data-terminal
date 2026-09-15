export const COMPANY_ROLES = ['all', 'development', 'publishing', 'both', 'brand', 'other'];
export const COMPANY_SCOPES = ['work', 'edition'];
export const COMPANY_SORTS = ['voteCount_asc', 'voteCount_desc', 'median_asc', 'median_desc', 'releaseDate_asc', 'releaseDate_desc'];
export const COMPANY_ROLE_LABELS = {all:'全部关联',development:'制作',publishing:'发行',both:'制作与发行',brand:'品牌记录',other:'其他参与'};
export function companyOptions({role='all',scope='work',sortKey='releaseDate',direction='asc'}={}) {
  if(!COMPANY_ROLES.includes(role)||!COMPANY_SCOPES.includes(scope)||!COMPANY_SORTS.includes(`${sortKey}_${direction}`))throw new TypeError('invalid company filter');
  return {role,scope:role==='all'?'work':scope,sort:`${sortKey}_${direction}`};
}
export const companyListKey=(id,scope,role)=>JSON.stringify([id,scope,role]);

// Browser-safe adapter. Orders are generated once, then sorting/role switching
// only selects an array. Original work cards remain in the existing card store.
export function createReviewedCompanyClient({loadPayload,restoreCompanySummary}) {
  let pending;
  const load=()=>pending??=Promise.resolve().then(loadPayload).then(payload=>{
    if(payload.schema!=='galpedia-company-integration-v1'||!Array.isArray(payload.companies)||!Array.isArray(payload.lists))throw new TypeError('invalid company payload');
    const directory=restoreCompanySummary(payload.companies),companies=new Map(directory.companies.map(c=>[c.companyId,c]));
    const aliases=new Map(payload.aliases),lists=new Map();
    if(aliases.size!==payload.aliases.length)throw new TypeError('duplicate company alias');
    for(const [alias,id]of aliases)if(typeof alias!=='string'||!companies.has(id))throw new TypeError('unknown alias owner');
    for(const list of payload.lists){
      const key=companyListKey(list.companyId,list.scope,list.role);
      if(lists.has(key)||!companies.has(list.companyId))throw new TypeError('duplicate company list');
      for(const sort of COMPANY_SORTS)if(!Array.isArray(list.orders[sort])||list.orders[sort].length!==list.total)throw new TypeError('invalid company order');
      lists.set(key,list);
    }
    return {payload,directory:Object.freeze({...directory,companyIdByAlias:aliases}),companies,aliases,lists};
  }).catch(error=>{pending=null;throw error;});
  const resolve=(state,id)=>{if(typeof id!=='string'||!state.aliases.has(id))throw new TypeError('unknown company ID');return state.aliases.get(id);};
  async function selection(id,options){const state=await load(),companyId=resolve(state,id),o=companyOptions(options);return {state,companyId,o,list:state.lists.get(companyListKey(companyId,o.scope,o.role))};}
  return Object.freeze({
    async loadDirectory(){return (await load()).directory;},
    async resolveCompanyId(id){const state=await load();return resolve(state,id);},
    async attachWorkspace(workspace){const state=await load();return {...state.directory,works:workspace.works,reviewedCompanyLists:state.lists,reviewedWorks:new Map(workspace.works.map(w=>[w.workId,w]))};},
    async workIds(id,options){const {list,o}=await selection(id,options);return [...(list?.orders[o.sort]??[])];},
    async page(id,options={}){
      const {pageNumber=1,pageSize=48}=options;
      if(!Number.isSafeInteger(pageNumber)||pageNumber<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>48)throw new TypeError('invalid company page');
      const {list,o,companyId}=await selection(id,options),total=list?.total??0;
      const page=Math.min(pageNumber,Math.max(1,Math.ceil(total/pageSize))),start=(page-1)*pageSize;
      return {companyId,total,pageNumber:page,ids:(list?.orders[o.sort]??[]).slice(start,start+pageSize),hasMore:start+pageSize<total};
    },
    async selectedWorkIds(ids,options){
      if(!Array.isArray(ids)||ids.length>32)throw new TypeError('invalid company selection');
      if(!ids.length)return null;
      return new Set((await Promise.all([...new Set(ids)].map(id=>this.workIds(id,options)))).flat());
    }
  });
}

export function worksForReviewedCompany(model,id,options){
  const companyId=model.companyIdByAlias.get(id);if(!companyId)throw new TypeError('unknown company ID');
  const o=companyOptions(options),list=model.reviewedCompanyLists.get(companyListKey(companyId,o.scope,o.role));
  return (list?.orders[o.sort]??[]).map(id=>model.reviewedWorks.get(id));
}

// Reuse the site's real detail controller and its request lifetime handling.
// A role change creates a new controller so its one-result cache cannot reuse
// works from another role. Suspending the old session prevents stale rendering.
export function createReviewedCompanyController({createController,client,...dependencies}) {
  let controller,key,latest;
  return Object.freeze({
    async render(options){
      const filter=companyOptions({role:options.companyRole,scope:options.companyScope});
      const next=JSON.stringify([filter.role,filter.scope]);latest=options;
      if(!controller||next!==key){controller?.suspend();key=next;
        controller=createController({...dependencies,loadWorkIds:(id,sort)=>client.workIds(id,{...sort,role:filter.role,scope:filter.scope}),
          renderView:args=>dependencies.renderView({...args,companyRole:filter.role,companyScope:filter.scope,
            companyRoleNote:filter.role==='all'?'':filter.scope==='work'?'按作品各版本的参与记录筛选，具体版本可能不同。':'仅显示能对应当前版本的参与记录。'})});
      }
      return controller.render(options);
    },
    suspend(){controller?.suspend();},
    retry(){return this.render(latest);}
  });
}
