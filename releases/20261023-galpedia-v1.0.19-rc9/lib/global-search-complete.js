import {createGalpediaSearch} from './galpedia-search.js';
import {loadSearchProjection} from './search-projections.js';
import {loadPersonSearchDirectory} from './person-search-directory.js';
import {COMPANY_SEARCH_SOURCE} from './company-static-client.js';
import {WORK_FULL_CARDS} from './work-full-cards-config.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {CREDIT_SCOPE} from './credit-scope-config.js';
import {nativeEntryHref} from './native-entry-route.js';
import {getOwnedWorkbenchClient} from './workbench-worker-session.js';

const workSource={workbench:WORKBENCH_DEMAND.sha256,ratings:WORK_FULL_CARDS.split?.sha256??null};
const companySource={directory:COMPANY_SEARCH_SOURCE,ratings:workSource.ratings};
const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
let prepared;
async function prepare(){
 return prepared??=(async()=>{
  // Only explicit search intent loads these complete, source-pinned indexes.
  // Share the work Worker and person reader with the later full workbench.
  const worker=getOwnedWorkbenchClient();
  worker.prepareGlobalSearch(workSource);
  const [companies,persons,native]=await Promise.all([
   loadSearchProjection('companies',companySource),loadPersonSearchDirectory(),
   loadSearchProjection('native',{catalog:CREDIT_SCOPE.catalog.sha256})
  ]);
  if(!companies||!native)throw Error('独立搜索投影暂不可用');
  const search=createGalpediaSearch({works:[],companyDirectory:{companies:companies.companies},
   companySearch:new Map(companies.ranks),loadPersons:async()=>persons.records,
   searchWorks:async query=>{
    const works=await worker.searchProjectedWorks(query,workSource);
    if(!Array.isArray(works))throw Error('作品搜索投影暂不可用');
    return works;
   }});
  return {search,native};
 })().catch(error=>{prepared=null;throw error;});
}
export async function searchComplete(query){
 const {search,native}=await prepare(),groups=await search(query),q=norm(query);
 const matches=q?native.filter(w=>[w.title,w.originalTitle].some(n=>norm(n).includes(q)))
  .sort((a,b)=>Number(norm(b.title)===q)-Number(norm(a.title)===q)||a.title.localeCompare(b.title,'zh-Hans'))
  .map(w=>({id:w.entityId,name:w.title,href:nativeEntryHref(w.entityId)})):[];
 return {...groups,works:[...matches,...groups.works].slice(0,5)};
}

