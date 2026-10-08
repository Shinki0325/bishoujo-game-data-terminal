import {projectCompanyRatingRow,loadCompanyRatingScope} from './rating-consumers.js';
import {names} from './company-ui/__company_v30/display-data.js';
import {loadPublicPart,bucket} from './public-data-client.js';
async function companyRow(id,role){const data=await loadPublicPart('companies/'+bucket(id)+'.json.gz');const row=data[id+':'+role];if(!row)throw Error('会社范围不存在');return row;}
export async function loadCompanyCredits(id){return (await loadPublicPart('credits/'+bucket(id)+'.json.gz'))[id]??[];}
export async function loadCompanyAnalysis(id,role){const [row,config]=await Promise.all([companyRow(id,role),loadPublicPart('profile-config.json.gz')]);if(!row.view)throw Error('此职责无统计画像');return {...config,schema:'company-rollout-v41',views:{[id+':'+role]:row.view},people:row.people,prototype:{version:'v57',coverage:'all companies',dateMeaning:'冻结v41数据；界面更新不代表来源更新'}};}
export async function loadCompanyDirectory(id,role){const row=await projectCompanyRatingRow(await companyRow(id,role),id,role);return {directory:row.contract.directory,contract:row.contract};}
export async function loadCompanyScope(id,role){
 const [snapshot,editions,config]=await Promise.all([companyRow(id,role).then(row=>loadCompanyRatingScope(row,id,role,()=>loadPublicPart('honors.json.gz'))),loadPublicPart('edition-presentation.json.gz'),loadPublicPart('profile-config.json.gz')]);
 const {row,honors:pack}=snapshot;
 const directory=row.contract.directory,allowed=new Set(directory.orders.releaseDate_asc),works={};
 if(role!=='other')for(const [wid,w] of Object.entries(pack.works)){
  const matches=w.allEditionIds.filter(e=>allowed.has(e));if(!matches.length)continue;
  const chosen=matches.includes(w.displayEditionId)?w.displayEditionId:matches[0],c=editions[chosen];
  works[wid]={...w,presentation:{editionId:chosen,coverUrl:c.coverPath?'https://assets.bishojo.date/'+c.coverPath:null,workUrl:'/#works/work/'+chosen,editionTitle:c.title},directoryFamilyId:row.contract.familyByWork[chosen]};
 }
 const boards=pack.boards.filter(b=>b.minimumVotes===100&&b.entries.some(e=>e.tier&&works[e.workId])).map(b=>({...b,entries:b.entries.map(e=>({...e,companyIds:works[e.workId]?[id]:[]}))}));
 const company={companyId:id,name:names[id]?.originalName??row.view?.sourceName??row.contract.sourceName??id};
 return {schema:'galpedia-company-scope-v35',company,role,directory,contract:row.contract,radar:{profiles:[],baselines:{},time:config.time,contract:{time:config.time},companies:[company]},honors:{contract:pack.contract,years:pack.years,boards,works,allCompanyNames:pack.allCompanyNames,companies:[company]}};
}
async function workRow(id){const row=(await loadPublicPart('works/'+bucket(id)+'.json.gz'))[id];if(!row)throw Error('作品资料不存在');return row;}
async function personRow(id){return (await loadPublicPart('people/'+bucket(id)+'.json.gz'))[id]??{name:id,scenario:[],artwork:[]};}
export async function queryCompanyExplore(params){
 const id=params.get('work'),edition=params.get('edition'),company=params.get('company'),scope=params.get('scope')??'all',role=params.get('role')??'all',person=params.get('person')??'',offset=Number(params.get('offset')??0);
 if(!['all','company'].includes(scope)||!['all','scenario','artwork'].includes(role)||!Number.isInteger(offset)||offset<0)throw Error('筛选参数无效');
 const row=await workRow(id),source=edition?row.variants[edition]:row.work;if(!source)throw Error('代表版本不存在');
 const known=[...new Set([...source.staff.scenario,...source.staff.artwork])];if(person&&!known.includes(person))throw Error('人物不在来源署名中');
 const peopleRows=await Promise.all(known.map(personRow)),ids=new Set();
 for(let i=0;i<known.length;i++)for(const r of ['scenario','artwork'])if(source.staff[r].includes(known[i]))for(const wid of peopleRows[i][r])ids.add(wid);
 ids.delete(source.id);const facts=Object.assign({},...peopleRows.map(row=>row.candidates));const targets=[...ids].map(id=>facts[id]);
 let matches=[];
 for(const w of targets){
  if(scope==='company'&&!w.companyIds.includes(company))continue;
  const shared=Object.fromEntries(['scenario','artwork'].map(r=>[r,source.staff[r].filter(pid=>w.staff[r].includes(pid)).sort()]));
  if(person&&!Object.values(shared).some(ids=>ids.includes(person)))continue;matches.push({w,...shared});
 }
 const counts={all:matches.length,...Object.fromEntries(['scenario','artwork'].map(r=>[r,matches.filter(x=>person?x[r].includes(person):x[r].length).length]))};
 if(role!=='all')matches=matches.filter(x=>person?x[role].includes(person):x[role].length);
 const cmp=(a,b)=>a<b?-1:a>b?1:0;
 matches.sort((a,b)=>new Set([...b.scenario,...b.artwork]).size-new Set([...a.scenario,...a.artwork]).size||cmp(b.w.date??'',a.w.date??'')||cmp(a.w.id,b.w.id));
 const items=await Promise.all(matches.slice(offset,offset+30).map(async x=>({...x,w:(await workRow(x.w.id)).work}))),pids=[...new Set([...known,...items.flatMap(x=>[...x.scenario,...x.artwork])])],labels=await Promise.all(pids.map(async pid=>[pid,(await personRow(pid)).name]));
 return {source,items,total:matches.length,counts,nextOffset:offset+items.length<matches.length?offset+items.length:null,people:Object.fromEntries(labels),scope,years:'all',time:'2026-08-31'};
}
