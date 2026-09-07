import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAppController } from './app-controller.js';
import { createDefaultState } from './state.js';
import { selectionPages } from './selection-pages.js';
import { loadWorkerWorkbenchSource, workbenchQueryWork, createWorkbenchStore } from './workbench-demand-data.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { createWorkbenchWorkerHandler } from './workbench-worker-handler.js';
import { createFilterWorkerRuntime } from './filter-worker-runtime.js';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { createGalpediaSearch } from './galpedia-search.js';
import { buildCompanyDirectory } from './company-directory.js';

const makeController = (extra = {}) => createAppController({
  sample: {sampleId:'id-controller', filters:[]},
  catalogAuthority: {workIds:['1','2'], workGroupByEditionWorkId:{'1':'family','2':'family'}},
  resolveWork: () => {throw Error('unexpected catalog read');},
  storage:null, confirm:()=>true, announce:()=>{}, now:()=>new Date('2026-09-07'), downloadJson:()=>{}, ...extra
});

test('ID-only selection, undo/redo, persistence and export never read catalog cards', () => {
  const app = makeController();
  app.selectWorks(['2']);
  assert.deepEqual(app.inspectState().selectedWorkRefs, [{workGroupId:'family',editionWorkId:'2'}]);
  app.undo(); assert.deepEqual(app.inspectState().selectedWorkIds, []);
  app.redo(); assert.deepEqual(app.inspectState().selectedWorkIds, ['2']);
  const saved = app.exportJson().text;
  const restored = makeController(); restored.importJson(saved);
  assert.deepEqual(restored.inspectState().selectedWorkRefs, app.inspectState().selectedWorkRefs);
  restored.toggleCurrentResults(['2']); assert.deepEqual(restored.inspectState().selectedWorkIds, []);
  restored.toggleCurrentResults(['1']); assert.deepEqual(restored.inspectState().selectedWorkIds, ['1']);
});

test('ID controller reads only inspected page; missing cards do not weaken identity checks', () => {
  const reads = [], app = makeController({resolveWork:id=>{reads.push(id);return {workId:id,title:id};}});
  assert.equal(app.inspect(['2']).visibleWorks.length, 1); assert.deepEqual(reads, ['2']);
  for (const ids of [['unknown'], ['1','1'], new Array(1)]) assert.throws(()=>app.inspect(ids));
  assert.deepEqual(reads, ['2']);
  assert.throws(()=>app.inspect(), /Worker result/);
  assert.throws(()=>app.prospectiveCount({}), /Worker projected/);
  assert.throws(()=>app.prospectiveCounts([]), /Worker projected/);
  assert.throws(()=>makeController({resolveWork:()=>null}).inspect(['1']), /not loaded/);
  assert.throws(()=>makeController({catalogAuthority:{workIds:['1','1'],workGroupByEditionWorkId:{'1':'family'}}}));
});

test('ID authority snapshots ownership and keeps local custom works out of public export', () => {
  const authority = {workIds:['1','2'],workGroupByEditionWorkId:{'1':'family','2':'family'}};
  const app = makeController({catalogAuthority:authority});
  authority.workIds.push('bad'); authority.workGroupByEditionWorkId['2']='changed';
  assert.throws(()=>app.selectWorks(['bad']));
  app.selectWorks(['2']); assert.equal(app.inspectState().selectedWorkRefs[0].workGroupId, 'family');
  app.registerLocalWorks([{workId:'custom-local-x',workGroupId:'custom-local-x',localMediaKind:'custom',title:'自定义'}]);
  assert.equal(app.exportJson().omittedCustomCount, 1);
  assert.equal(app.inspect(['custom-local-x']).visibleWorks[0].title, '自定义');
});

test('shared balanced pages cover each result exactly once through 25,000 works', () => {
  for (const total of [0,1,59,60,99,100,101,119,120,121,199,200,201,7025,25000]) {
    const pages = selectionPages(total);
    assert.equal(pages[0].start, 0); assert.equal(pages.at(-1).end, total);
    for (let i=1;i<pages.length;i++) assert.equal(pages[i-1].end,pages[i].start);
    assert.ok(Math.max(...pages.map(p=>p.end-p.start))-Math.min(...pages.map(p=>p.end-p.start))<=1);
  }
  assert.deepEqual(selectionPages(119), [{start:0,end:119}]);
  assert.deepEqual(selectionPages(120), [{start:0,end:60},{start:60,end:120}]);
  for(const value of [-1,0.5,NaN,'100']) assert.throws(()=>selectionPages(value));
});

const source={sha256:WORKBENCH_DEMAND.sha256};
const data=await loadWorkerWorkbenchSource(source,{fetchImpl:async url=>new Response(await readFile(url))});
const options={works:data.ratedDisplayWorks.map(workbenchQueryWork),knownFilterIds:data.sample.filters.map(f=>f.filterId),brands:data.brands,workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,companyAliasesById:data.enrichment.companyAliasesById,companyPinyinById:data.enrichment.companyPinyinById};
const state={...createDefaultState('pages').filterState,excludeNukige:false};
const families=preparePresentationFamiliesSidecar(data.presentationFamiliesSource.value,{
  catalogSnapshotId:data.sampleSource.snapshot.snapshotId,catalogSha256:data.catalogSource.sha256,
  workIds:data.populationContract.presentation.workIds,
  bangumiSubjectByWorkId:new Map(data.bangumiPublicBindings.bindings.map(b=>[b.egsWorkId,b.bangumiSubjectId]))
});
const byId=new Map(data.ratedDisplayWorks.map(w=>[w.workId,w]));
const baseline=createFilterWorkerRuntime(); baseline.handle({type:'init',payload:options});
async function handler() {
  const handle=createWorkbenchWorkerHandler({runtime:createFilterWorkerRuntime(),loadSource:async()=>({data,bytes:new ArrayBuffer(1)}),projectWork:workbenchQueryWork});
  assert.equal((await handle({type:'init',payload:{workbenchSource:source}})).type,'ready');
  return handle;
}
function expected(filterState, selectedWorkIds=[]) {
  const result=baseline.handle({type:'query',payload:{filterState,selectedWorkIds}});
  assert.equal(result.type,'result');
  return families.projectVisibleWorks(result.workIds.map(id=>byId.get(id)),{
    workById:byId,sortKey:filterState.sortKey,sortDirection:filterState.sortDirection,presorted:true,decorate:false
  }).map(w=>w.workId);
}

test('Worker pages equal legacy folding for all sort keys, aliases, year/person filters and empty results', async () => {
  const handle=await handler();
  const cases=[state,...['title','brandName','releaseDate','median','voteCount','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount'].flatMap(sortKey=>['asc','desc'].map(sortDirection=>({...state,sortKey,sortDirection}))),
    ...['うたわれるもの','加奈','成濑未亚','crosschannel','zzmissing'].map(titleQuery=>({...state,titleQuery})),
    {...state,releaseYearStart:2000,releaseYearEnd:2001}, {...state,minimumVoteCount:100000}, {...state,personIds:['per_missing']}];
  for(const filterState of cases) {
    const all=expected(filterState), pages=selectionPages(all.length);
    const first=await handle({id:2,type:'query',payload:{filterState,paged:true,pageNumber:1,includeProjectedCounts:true}});
    assert.equal(first.type,'result',JSON.stringify(first)); assert.equal(first.page.total,all.length);
    assert.deepEqual(first.workIds,all.slice(0,pages[0].end));
    const last=await handle({id:3,type:'query',payload:{filterState,paged:true,pageNumber:pages.length}});
    assert.deepEqual(last.workIds,all.slice(pages.at(-1).start));
    const full=await handle({id:4,type:'result-ids',payload:{resultRevision:last.page.resultRevision}});
    assert.deepEqual(full.workIds,all);
  }
});

test('Worker returns bounded IDs, preserves pages on selection, resets changed results, rejects stale actions', async () => {
  const handle=await handler();
  const query=payload=>handle({id:2,type:'query',payload:{filterState:state,paged:true,...payload}});
  const a=await query({pageNumber:2});
  assert.equal(a.page.pageNumber,2); assert.ok(a.workIds.length<=119); assert.ok(a.page.total>1000);
  assert.equal(a.works,undefined);
  const b=await query({pageNumber:2,selectedWorkIds:[a.workIds[0]]});
  assert.equal(b.page.pageNumber,2); assert.equal(b.page.selectAllState,'some');
  const c=await query({pageNumber:2,filterState:{...state,titleQuery:'zzmissing'}});
  assert.equal(c.page.pageNumber,1); assert.equal(c.page.total,0); assert.equal(c.page.selectAllState,'none');
  assert.equal((await handle({type:'result-ids',payload:{resultRevision:b.page.resultRevision}})).type,'error');
  const d=await query({pageNumber:2}); assert.equal(d.page.pageNumber,1); assert.ok(d.page.total>1000);
  await handle({type:'update',payload:{workbenchSource:source,personWorkIndex:null}});
  assert.equal((await handle({type:'result-ids',payload:{resultRevision:d.page.resultRevision}})).type,'error');
  assert.equal((await query({pageNumber:-1})).type,'error');
});

test('card shard router accepts identity-only input without retaining catalog objects', async () => {
  const manifest=JSON.parse(await readFile(new URL(WORKBENCH_DEMAND.manifestPath,new URL('./workbench-demand-data.js',import.meta.url))));
  const store=createWorkbenchStore(manifest,data.ratedDisplayWorks.map(w=>w.workId),{
    baseUrl:new URL(WORKBENCH_DEMAND.manifestPath,new URL('./workbench-demand-data.js',import.meta.url)),
    fetchImpl:async url=>new Response(await readFile(url))
  });
  const rows=await store.get(manifest.firstPage.ids.slice(0,2));
  assert.equal(rows.size,2); assert.ok([...rows.values()].every(w=>w.title));
});

test('Worker command-search matches existing names, aliases, pinyin, order and hints with at most five summaries', async () => {
  const handle=await handler();
  const legacy=createGalpediaSearch({works:data.ratedDisplayWorks,
    companyDirectory:buildCompanyDirectory({brands:data.brands,works:data.ratedDisplayWorks,
      companyAliasesById:data.enrichment.companyAliasesById,companyPinyinById:data.enrichment.companyPinyinById}),
    enrichment:{workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,workDisplayTitlesById:data.workDisplayTitlesById},
    loadPersons:async()=>[]});
  for(const query of ['壳之少女','殻ノ少女','うたわれるもの','crosschannel','whitealbum','feng','成濑未亚','chenglai','zzmissing','']) {
    const result=await handle({type:'work-search',payload:{query}});
    assert.equal(result.type,'work-search',JSON.stringify(result));
    assert.deepEqual(result.works,(await legacy(query)).works);
    assert.ok(result.works.length<=5); assert.ok(result.works.every(w=>!Object.hasOwn(w,'filterIds')));
  }
  assert.equal((await handle({type:'work-search',payload:{query:'a'.repeat(1001)}})).type,'error');
});

test('delegated command search needs no main-thread catalog and preserves company/person results', async () => {
  let calls=0;
  const works=[{id:'1',name:'代理结果',subtitle:'2000'}];
  const companies=buildCompanyDirectory({brands:[{brandId:'a',brandName:'Leaf'}],works:[]});
  const search=createGalpediaSearch({works:null,companyDirectory:companies,loadPersons:async()=>[],
    searchWorks:async()=>{calls++;return works;}});
  assert.deepEqual(await search(''),{works:[],companies:[],persons:[]}); assert.equal(calls,0);
  const result=await search('Leaf'); assert.deepEqual(result.works,works); assert.equal(result.companies[0].name,'Leaf');
  const failed=createGalpediaSearch({companyDirectory:companies,loadPersons:async()=>[],searchWorks:async()=>{throw Error('worker failed');}});
  await assert.rejects(failed('test'),/worker failed/);
});

test('classic reinitialization invalidates owned page and search protocols', async () => {
  const handle=await handler();
  await handle({type:'init',payload:options});
  assert.equal((await handle({type:'query',payload:{filterState:state,paged:true}})).type,'error');
  assert.equal((await handle({type:'work-search',payload:{query:'Leaf'}})).type,'error');
  assert.equal((await handle({type:'query',payload:{filterState:state}})).type,'result');
});
