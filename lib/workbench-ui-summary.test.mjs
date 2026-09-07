import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadWorkerWorkbenchSource,loadWorkerWorkbenchBundle,workbenchQueryWork,decodeWorkbenchPayload} from './workbench-demand-data.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {buildCompanyDirectory,restoreCompanySummary,searchCompanyDirectory,worksForCompany} from './company-directory.js';
import {createWorkbenchUISummary,validateWorkbenchUISummary} from './workbench-ui-summary.js';
import {createWorkbenchWorkerHandler} from './workbench-worker-handler.js';
import {createFilterWorkerRuntime} from './filter-worker-runtime.js';
import {createFilterWorkerClient} from './filter-worker-client.js';

const source={sha256:WORKBENCH_DEMAND.sha256};
const fetchImpl=async url=>new Response(await readFile(url));
// Use the ordinary decoded source as authority, not the new summary.
const data=await loadWorkerWorkbenchSource(source,{fetchImpl});
const summary=createWorkbenchUISummary(data);
const old=buildCompanyDirectory({brands:data.brands,works:data.ratedDisplayWorks,
  companyAliasesById:data.enrichment.companyAliasesById,companyPinyinById:data.enrichment.companyPinyinById,
  avatarByCompanyId:data.companyProfile?.avatarByCompanyId});
const makeHandler=()=>createWorkbenchWorkerHandler({runtime:createFilterWorkerRuntime(),
  loadSource:async()=>({data,bytes:new ArrayBuffer(0)}),projectWork:workbenchQueryWork});

test('cloned UI summary exactly preserves company search, statistics, identity and year buckets',()=>{
  const clone=validateWorkbenchUISummary(structuredClone(summary),data.ratedDisplayWorks.length);
  const restored=restoreCompanySummary(clone.companies);
  assert.deepEqual(restored.companies,old.companies);
  assert.ok(restored.companies.every(c=>Object.isFrozen(c.searchAliases)));
  assert.deepEqual(restored.works,[]);
  assert.deepEqual(clone.workIds,data.ratedDisplayWorks.map(w=>w.workId));
  assert.deepEqual(clone.workGroupByEditionWorkId,Object.fromEntries(data.ratedDisplayWorks.map(w=>[w.workId,w.workGroupId||w.workId])));
  assert.deepEqual(clone.releaseYearCounts,data.sample.works.reduce((out,w)=>{const year=Number(w.releaseDate.slice(0,4));out[year]=(out[year]??0)+1;return out;},{}));
  const queries=['','TYPE-MOON','key','叶子社',...old.companies.slice(0,10).map(c=>c.brandName),...[...data.enrichment.companyPinyinById.values()].flat().slice(0,5)];
  for(const query of queries)for(const sortKey of ['brandName','totalVoteCount','workCount','averageVoteCount','releaseYearStart'])for(const direction of ['asc','desc']) {
    const options={sortKey,direction};
    assert.deepEqual(searchCompanyDirectory(restored,query,options),searchCompanyDirectory(old,query,options));
  }
});

test('malformed startup summaries fail closed',()=>{
  for(const mutate of [s=>delete s.workIds,s=>s.workIds[1]=s.workIds[0],s=>delete s.workGroupByEditionWorkId[s.workIds[0]],s=>s.releaseYearCounts.bad=-1,s=>s.companies=null]) {
    const s=structuredClone(summary);mutate(s);assert.throws(()=>validateWorkbenchUISummary(s,data.ratedDisplayWorks.length));
  }
  assert.throws(()=>restoreCompanySummary([{companyId:'1',searchText:'a'},{companyId:'1',searchText:'b'}]));
  assert.throws(()=>restoreCompanySummary([{companyId:'1'}]));
});

test('company IDs preserve every company and supported sort; person catalog only exposes joining fields',async()=>{
  const handle=makeHandler();
  assert.equal((await handle({id:0,type:'person-catalog'})).type,'error');
  const ready=await handle({id:1,type:'init',payload:{workbenchSource:source}});
  assert.deepEqual(ready.uiSummary,summary);
  for(const company of old.companies)for(const sortKey of ['releaseDate','median','voteCount'])for(const direction of ['asc','desc']) {
    const reply=await handle({id:2,type:'company-work-ids',payload:{companyId:company.companyId,sortKey,direction}});
    assert.equal(reply.type,'company-work-ids');
    assert.deepEqual(reply.workIds,worksForCompany(old,company.companyId,{sortKey,direction}).map(w=>w.workId));
  }
  for(const payload of [{companyId:'missing'},{companyId:old.companies[0].companyId,sortKey:'bad'},{companyId:old.companies[0].companyId,direction:'bad'}])assert.equal((await handle({id:3,type:'company-work-ids',payload})).type,'error');
  assert.deepEqual((await handle({id:4,type:'person-catalog'})).works,data.ratedDisplayWorks.map(({workId,title,releaseDate})=>({workId,title,releaseDate})));
  assert.equal((await handle({id:5,type:'init',payload:{works:[],knownFilterIds:[],brands:[]}})).type,'ready');
  for(const type of ['person-catalog','company-work-ids'])assert.equal((await handle({id:6,type,payload:{companyId:old.companies[0].companyId}})).type,'error');
});

test('new client messages retain validated source and rebuild after Worker failure',async()=>{
  const workers=[];
  const client=createFilterWorkerClient({workerFactory:()=>{
    const listeners={},handle=makeHandler();
    const worker={addEventListener(type,fn){listeners[type]=fn;},terminate(){},postMessage(message){handle(message).then(data=>listeners.message({data}));},crash(){listeners.error({error:Error('test crash')});}};
    workers.push(worker);return worker;
  }});
  try {
    await client.init({workbenchSource:source});
    const id=old.companies[0].companyId;
    assert.deepEqual(await client.companyWorkIds(id),worksForCompany(old,id).map(w=>w.workId));
    await assert.rejects(client.companyWorkIds('unknown'));
    workers[0].crash();
    assert.equal((await client.personCatalog()).length,data.ratedDisplayWorks.length);
    assert.equal(workers.length,2);
  }finally{client.terminate();}
});

test('owned UI decode omits the compatibility catalog copy without changing default data',async()=>{
  const manifest=JSON.parse(await readFile(new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url)));
  // Reuse the verified source loader to obtain the exact original compact bytes.
  const {bytes}=await loadWorkerWorkbenchBundle(source,{fetchImpl});
  const body=JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(Object.hasOwn(body.context.sampleSource,'works'),false);
  const normal=decodeWorkbenchPayload(structuredClone(body),manifest);
  const slim=decodeWorkbenchPayload(structuredClone(body),manifest,{includePersonCatalog:false});
  assert.equal(Object.hasOwn(slim.sampleSource,'works'),false);
  assert.deepEqual(slim.ratedDisplayWorks,normal.ratedDisplayWorks);
  assert.equal(normal.sampleSource.works.length,manifest.count);
});
