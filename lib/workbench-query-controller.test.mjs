import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkbenchQueryController } from './workbench-query-controller.js';
import { projectWorkbenchResults } from './workbench-results-model.js';
import { createWorkbenchResultsView } from '../views/workbench-results-view.js';
import { createRankingWorkspaceView } from '../views/ranking-workspace-view.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const request = (changes={}) => ({state:{workspaceMode:'selection',filterState:{query:'a'},selectedWorkIds:['s']},directoryOpen:false,comparisonIds:['s','c'],pageNumber:2,includeFilterCounts:true,visibleBrands:[{brandId:'b'}],...changes});
function fixture(overrides={}) {
  const calls=[], stages=[];
  const deps={
    workerOwned:true,
    workData:{get:async ids=>{calls.push(['hydrate',ids]);return new Map(ids.map(id=>[id,{workId:id}]));},peek:id=>id==='cached'?{workId:id}:undefined},
    ensureFilterWorker:async()=>calls.push(['filter']),ensureRankingView:async()=>calls.push(['ranking']),
    query:async input=>{calls.push(['query',input]);return {status:'success',workIds:['p','s'],page:{resultRevision:7,total:2,selectAllState:'mixed'}};},
    resultIds:async revision=>{calls.push(['ids',revision]);return ['p','s'];},
    metrics:{cancel:(...args)=>stages.push(['cancel',...args]),stage:(...args)=>stages.push(['stage',...args])},
    ...overrides
  };
  return {controller:createWorkbenchQueryController(deps),calls,stages,deps};
}
test('paged query preserves Worker protocol and deduplicates selected/comparison/page hydration',async()=>{
  const f=fixture(), input=request(), before=structuredClone(input), result=await f.controller.run(input,'i');
  assert.equal(result.status,'ready');assert.deepEqual(input,before);
  assert.deepEqual(f.calls.map(v=>v[0]),['filter','query','hydrate']);
  assert.deepEqual(f.calls[1][1],{paged:true,pageNumber:2,filterState:input.state.filterState,selectedWorkIds:['s'],includeProjectedCounts:true,visibleBrands:[{brandId:'b'}],companyLimit:24});
  assert.deepEqual(f.calls[2][1],['s','c','p']);
  assert.equal(f.controller.lookup('p').workId,'p');assert.equal(f.controller.lookup('cached').workId,'cached');
  assert.deepEqual(await f.controller.currentResultIds(),['p','s']);assert.deepEqual(f.calls.at(-1),['ids',7]);
  assert.equal(result.generation.isCurrent(),true);
});
test('legacy hydration precedes unpaged filtering; no-data fallback does not require a data loader',async()=>{
  const f=fixture({workerOwned:false});await f.controller.run(request());
  assert.deepEqual(f.calls.map(v=>v[0]),['hydrate','filter','query']);assert.equal('paged' in f.calls[2][1],false);
  const noData=fixture({workerOwned:false,workData:null});assert.equal((await noData.controller.run(request())).status,'ready');
  assert.equal(noData.controller.lookup('x'),undefined);
});
test('ranking loads only its lazy view; directories do not initialize filtering or ranking',async()=>{
  const f=fixture();await f.controller.run(request({state:{workspaceMode:'ranking',selectedWorkIds:['s'],filterState:{}}}));
  assert.deepEqual(f.calls.map(v=>v[0]),['ranking','hydrate']);
  f.calls.length=0;await f.controller.run(request({directoryOpen:true}));
  assert.deepEqual(f.calls.map(v=>v[0]),['hydrate']);
});
test('leaving while lazy initialization is pending prevents query dispatch',async()=>{
  const hold=deferred(),f=fixture({ensureFilterWorker:()=>hold.promise});
  const pending=f.controller.run(request(),'old');f.controller.suspend();hold.resolve();
  assert.equal((await pending).status,'stale');assert.deepEqual(f.calls,[]);
  assert.equal(await f.controller.currentResultIds(),null);
});
test('a late Worker response cannot hydrate its old page or replace current pinned data',async()=>{
  const old=deferred();let count=0;
  const f=fixture({query:()=>++count===1?old.promise:Promise.resolve({status:'success',workIds:['new'],page:{resultRevision:2}})});
  const pending=f.controller.run(request());await Promise.resolve();
  await f.controller.run(request());old.resolve({status:'success',workIds:['old']});
  assert.equal((await pending).status,'stale');
  assert.equal(f.controller.lookup('old'),undefined);assert.equal(f.controller.lookup('new').workId,'new');
  assert.equal(f.calls.filter(v=>v[0]==='hydrate').length,1);
});
test('late hydration never replaces the latest pinned page',async()=>{
  const old=deferred(), entered=deferred();let count=0;
  const f=fixture({workData:{peek:()=>undefined,get:()=>++count===1?(entered.resolve(),old.promise):Promise.resolve(new Map([['new',{workId:'new'}]]))}});
  const pending=f.controller.run(request());await entered.promise;
  await f.controller.run(request());old.resolve(new Map([['old',{workId:'old'}]]));
  assert.equal((await pending).status,'stale');assert.equal(f.controller.lookup('old'),undefined);assert.equal(f.controller.lookup('new').workId,'new');
});
test('stale Worker outcomes never hydrate or expose a result revision',async()=>{
  const f=fixture({query:async()=>({status:'stale'})});assert.equal((await f.controller.run(request())).status,'stale');
  assert.equal(f.calls.some(v=>v[0]==='hydrate'),false);
});
test('current failures are retryable while abandoned failures stay silent',async()=>{
  let count=0;const error=Error('offline');
  const f=fixture({query:async()=>{if(++count===1)throw error;return {status:'success',workIds:[]};}});
  const failed=await f.controller.run(request());assert.equal(failed.status,'error');assert.equal(failed.error,error);
  f.controller.suspend();assert.equal(failed.generation.isCurrent(),false);
  assert.equal((await f.controller.run(request())).status,'ready');
  const hold=deferred(),g=fixture({query:()=>hold.promise});const pending=g.controller.run(request());await Promise.resolve();g.controller.suspend();hold.reject(error);
  assert.equal((await pending).status,'stale');
});
test('select-all result IDs are invalidated immediately by new queries, even when revision repeats',async()=>{
  const hold=deferred(), f=fixture({resultIds:()=>hold.promise});
  await f.controller.run(request());const ids=f.controller.currentResultIds();
  await f.controller.run(request());hold.resolve(['old']);assert.equal(await ids,null);
});
test('select-all late errors stay silent after navigation; current errors propagate; dispose invalidates work',async()=>{
  const hold=deferred(),f=fixture({resultIds:()=>hold.promise});await f.controller.run(request());
  const ids=f.controller.currentResultIds();f.controller.suspend();hold.reject(Error('stale revision'));assert.equal(await ids,null);
  const g=fixture({resultIds:async()=>{throw Error('current revision');}});await g.controller.run(request());
  await assert.rejects(g.controller.currentResultIds(),/current revision/);
  g.controller.dispose();assert.equal(await g.controller.currentResultIds(),null);await assert.rejects(g.controller.run(request()),/disposed/);
});

const model=()=>({visibleWorks:[{workId:'a'},{workId:'b'}],selectedCount:2,rankedCount:1,unrankedCount:1,selectAllState:'mixed',state:{filterState:{sortKey:'score',sortDirection:'desc'},selectedWorkIds:['a','x']}});
const projection=(changes={})=>({model:model(),outcome:{},families:null,worksById:new Map([['a',{workId:'a',title:'hydrated'}]]),catalogSize:10,decorate:false,selectionLimit:5,selectionMode:true,compareMode:false,comparedWorkIds:[],...changes});
test('result projection keeps hydrated titles, catalog/result counts and selection capacity distinct',()=>{
  const args=projection(),before=structuredClone(args.model),p=projectWorkbenchResults(args);
  assert.equal(p.works[0].title,'hydrated');assert.equal(p.catalogTotal,10);assert.equal(p.resultTotal,2);assert.equal(p.selection.selectionCapacity,3);
  assert.equal(p.selection.selectAllState,'mixed');assert.deepEqual(args.model,before);
  const compare=projectWorkbenchResults(projection({compareMode:true,selectionLimit:1}));assert.equal(compare.selection.selectionMode,false);assert.equal(compare.selection.selectionCapacity,0);
});
test('paged family results never collapse twice; legacy families retain original projection options',()=>{
  const calls=[], families={memberCount:3,familyCount:1,projectVisibleWorks:(works,options)=>{calls.push(options);return [works[0]];},presentationSelectionState:()=>{calls.push('selection');return 'family';}};
  const page={total:8,selectAllState:'page'};
  const paged=projectWorkbenchResults(projection({families,outcome:{page}}));
  assert.equal(paged.catalogTotal,8);assert.equal(paged.resultTotal,8);assert.equal(paged.works.length,2);assert.equal(paged.selection.selectAllState,'page');assert.deepEqual(calls,[]);
  const legacy=projectWorkbenchResults(projection({families}));assert.equal(legacy.resultTotal,1);assert.equal(legacy.selection.selectAllState,'family');
  assert.equal(calls[0].presorted,true);assert.equal(calls[0].decorate,false);
});
test('filter view owns its rendering key and can reset without mutating any filter state',()=>{
  const calls=[],view=createWorkbenchResultsView({elements:{},getFilterView:()=>({render:(...args)=>calls.push(['full',...args]),renderSummary:(...args)=>calls.push(['summary',...args])})});
  const args={model:model(),visibleBrands:[{brandId:'b'}],includeFilterCounts:true,counts:{filters:[],brands:[],yearCounts:{2000:3}},resultTotal:2,selectionActive:true};
  view.renderFilters(args);view.renderFilters(args);assert.deepEqual(calls.map(v=>v[0]),['full','summary']);
  view.renderFilters({...args,visibleBrands:[{brandId:'c'}]});assert.equal(calls.at(-1)[0],'full');
  view.reset();view.renderFilters(args);assert.equal(calls.at(-1)[0],'full');
  const size=calls.length;view.renderFilters({...args,includeFilterCounts:false,selectionActive:false});assert.equal(calls.length,size);
});
test('result counters use company ranking when active without turning filtered count into catalog size',()=>{
  const elements=Object.fromEntries(['selectedCount','rankedCount','unrankedCount','rankingHeadingCount','catalogTotalCount','filterResultCount','catalogResultCount'].map(key=>[key,{textContent:'',parentElement:{}}]));
  const view=createWorkbenchResultsView({elements,getFilterView:()=>null});
  view.renderCounts({model:model(),companyState:{selectedCompanyIds:['x','y','z'],rankedCount:2,candidateCompanyIds:['z']},catalogTotal:10,resultTotal:2});
  assert.equal(elements.selectedCount.textContent,'3');assert.equal(elements.rankedCount.textContent,'2');assert.equal(elements.catalogResultCount.textContent,'2 / 10 项');assert.equal(elements.catalogResultCount.parentElement.hidden,false);
  view.renderCounts({model:model(),companyState:null,catalogTotal:10,resultTotal:10});assert.equal(elements.catalogResultCount.parentElement.hidden,true);
});
test('ranking view projects the active subject and mirrors display settings without resetting the tray',()=>{
  const calls=[],field={},node=()=>({setAttribute:(...args)=>calls.push(args)});
  const elements={root:{classList:{toggle:(...args)=>calls.push(args)}},showCounts:{},showTitles:{},subjectWork:node(),subjectCompany:node(),candidatesTitle:{},candidateSearch:{closest:()=>field}};
  const view={setShowCounts:v=>calls.push(['counts',v]),setShowTitles:v=>calls.push(['titles',v]),setAnnotations:v=>calls.push(['annotations',v]),render:(...v)=>calls.push(['render',...v]),setMobileDragEnabled:v=>calls.push(['drag',v])};
  const adapter=createRankingWorkspaceView({elements,getView:()=>view,syncCandidateTray:()=>calls.push(['tray'])});
  adapter.render({subject:'company',model:'board',coverUrls:null,presentation:{showCounts:true,showTitles:false,annotations:{}}});
  assert.equal(elements.candidatesTitle.textContent,'候选会社');assert.equal(field.hidden,true);assert.equal(elements.showTitles.checked,false);assert.equal(calls.filter(v=>v[0]==='tray').length,1);
  adapter.render({subject:'work',model:'works',coverUrls:null,presentation:{showCounts:false,showTitles:true,annotations:{}}});assert.equal(field.hidden,false);
});
test('query/result modules do not acquire application state, routing or persistence ownership',async()=>{
  for(const path of ['workbench-query-controller.js','workbench-results-model.js','../views/workbench-results-view.js','../views/ranking-workspace-view.js']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/import.*main\.js|localStorage|history\.|location\.|addEventListener|controller\.(setFilterState|selectWorks|clear)/);
  }
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/let (activeHydratedWorks|lastResultPage|renderTicket|renderedFilterKey)|const renderSession/);
  assert.match(main,/workbenchQuery\.currentResultIds\(\)/);
});
