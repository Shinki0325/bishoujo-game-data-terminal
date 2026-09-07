import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadWorkerWorkbenchSource,loadWorkbenchData,workbenchQueryWork} from './workbench-demand-data.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {createWorkbenchWorkerHandler} from './workbench-worker-handler.js';
import {createFilterWorkerRuntime} from './filter-worker-runtime.js';
import {createFilterWorkerClient} from './filter-worker-client.js';
import {ownedWorkbenchEnabled} from './workbench-worker-session.js';
const source={sha256:WORKBENCH_DEMAND.sha256},fetchImpl=async url=>new Response(await readFile(url));
const state={mode:'basic',titleQuery:'',minimumScore:0,minimumVoteCount:30,releaseYearStart:1987,releaseYearEnd:2026,brandIds:[],attributeSelections:{'game-type':[],platform:[],length:[]},basicOperator:'AND',positiveFilterIds:[],excludedFilterIds:[],excludeNukige:false,advancedExpression:'',sortKey:'voteCount',sortDirection:'desc',personIds:[]};
const data=await loadWorkerWorkbenchSource(source,{fetchImpl});
const options={works:data.ratedDisplayWorks.map(workbenchQueryWork),knownFilterIds:data.sample.filters.map(f=>f.filterId),brands:data.brands,workAliasesById:data.workAliasesById,workPinyinById:data.workPinyinById,companyAliasesById:data.enrichment.companyAliasesById,companyPinyinById:data.enrichment.companyPinyinById};

test('worker source checks the same hashes, preserves all UI fields, and never fetches card packs',async()=>{
 const calls=[];
 const actual=await loadWorkerWorkbenchSource(source,{fetchImpl:async url=>{calls.push(String(url));return fetchImpl(url);}});
 const legacy=await loadWorkbenchData({config:WORKBENCH_DEMAND,locationRef:{search:''},fetchImpl});
 const {workData,loadSearchText,...plain}=legacy;
 assert.deepEqual(actual,plain);assert.deepEqual(structuredClone(actual),plain);
 assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('cards-')&&!url.includes('first-page')));
 await assert.rejects(loadWorkerWorkbenchSource({sha256:'0'.repeat(64)},{fetchImpl}),/数据版本/);
 await assert.rejects(loadWorkerWorkbenchSource(source,{fetchImpl:async()=>new Response('{}')}),/校验/);
 await assert.rejects(loadWorkerWorkbenchSource(source,{fetchImpl:async()=>new Response('',{status:503})}),/503/);
});
test('owned source queries equal old object initialization for aliases, sorting, filters and histograms',async()=>{
 const old=createFilterWorkerRuntime();old.handle({id:1,type:'init',payload:options});
 const runtime=createFilterWorkerRuntime(),handle=createWorkbenchWorkerHandler({runtime,loadSource:async()=>({data,bytes:new ArrayBuffer(2)}),projectWork:workbenchQueryWork});
 const reply=await handle({id:1,type:'init',payload:{workbenchSource:source}});
 assert.equal(reply.type,'ready');assert.equal(reply.workbenchBytes.byteLength,2);assert.equal(reply.workbenchData,undefined);
 const cases=[state,...['濑里奈','linai','crosschannel','壳之少女','zznever'].map(titleQuery=>({...state,titleQuery})),...['title','brandName','releaseDate','median','vndbScore','bangumiVoteCount'].flatMap(sortKey=>['asc','desc'].map(sortDirection=>({...state,sortKey,sortDirection}))),{...state,minimumVoteCount:100000},{...state,releaseYearStart:2000,releaseYearEnd:2005},...options.knownFilterIds.slice(0,8).map(id=>({...state,positiveFilterIds:[id]}))];
 for(const filterState of cases){const message={id:2,type:'query',payload:{filterState,includeProjectedCounts:true}};const a=old.handle(message),b=await handle(message);assert.equal(b.type,'result');assert.deepEqual(b.workIds,a.workIds);assert.deepEqual(b.counts,a.counts);}
});
test('person-index update reuses owned source, failed source switch does not replace the valid query index',async()=>{
 let reads=0;const handle=createWorkbenchWorkerHandler({runtime:createFilterWorkerRuntime(),loadSource:async s=>{reads++;if(s.sha256!==source.sha256)throw Error('pin mismatch');return {data,bytes:new ArrayBuffer(2)};},projectWork:workbenchQueryWork});
 await handle({id:1,type:'init',payload:{workbenchSource:source}});
 const personWorkIndex={format:'egs-tier-person-work-index-v1',persons:{per_test:{scenario:[data.ratedDisplayWorks[0].workId]}}};
 const updated=await handle({id:2,type:'update',payload:{workbenchSource:source,personWorkIndex}});
 assert.equal(updated.type,'ready',JSON.stringify(updated));assert.equal(reads,1);assert.equal(updated.workbenchData,undefined);
 const personResult=await handle({id:5,type:'query',payload:{filterState:{...state,minimumVoteCount:0,personIds:['per_test']}}});
 assert.deepEqual(personResult.workIds,[data.ratedDisplayWorks[0].workId]);
 await handle({id:6,type:'update',payload:{workbenchSource:source,personWorkIndex:null}});
 assert.deepEqual((await handle({id:7,type:'query',payload:{filterState:{...state,personIds:['per_test']}}})).workIds,[]);
 assert.equal((await handle({id:3,type:'init',payload:{workbenchSource:{sha256:'bad'}}})).type,'error');
 const reply=await handle({id:4,type:'query',payload:{filterState:state}});assert.equal(reply.type,'result');assert.ok(reply.workIds.length>0);
});
test('client rebuild retains only the pinned descriptor and acknowledged person relationships',async()=>{
 const workers=[];
 function factory(){const listeners={},worker={sent:[],addEventListener(type,fn){listeners[type]=fn;},terminate(){},postMessage(message){this.sent.push(message);queueMicrotask(()=>listeners.message({data:message.type==='query'?{id:message.id,type:'result',workIds:['x'],counts:{}}:{id:message.id,type:'ready',workCount:1,...(message.type==='init'?{manifestSha256:source.sha256,workbenchBytes:new ArrayBuffer(2)}:{})}}));},crash(){listeners.error({error:Error('crash')});}};workers.push(worker);return worker;}
 const client=createFilterWorkerClient({workerFactory:factory,timeoutMs:1000,initTimeoutMs:2000});
 const init=await client.init({workbenchSource:source,prepareSearch:true});assert.equal(init.workbenchBytes.byteLength,2);
 await client.update({workbenchSource:source,prepareSearch:true,personWorkIndex:{persons:{}}});
 workers[0].crash();assert.equal((await client.query({filterState:state})).status,'ok');
 const rebuilt=workers[1].sent[0];assert.equal(rebuilt.payload.workbenchSource.sha256,source.sha256);assert.equal(rebuilt.payload.works,undefined);assert.deepEqual(rebuilt.payload.personWorkIndex,{persons:{}});assert.equal(rebuilt.payload.prepareSearch,true);
 client.terminate();
});
test('display transfer arrives before index construction; readiness stays separate',async()=>{
 const events=[],runtime={handle(){events.push('index');return {id:1,type:'ready',workCount:1};}};
 const bytes=new ArrayBuffer(8);
 const handle=createWorkbenchWorkerHandler({runtime,loadSource:async()=>({data,bytes}),projectWork:workbenchQueryWork,onData:message=>{
   events.push('display');const clone=structuredClone(message,{transfer:[message.workbenchBytes]});assert.equal(clone.workbenchBytes.byteLength,8);assert.equal(bytes.byteLength,0);
 }});
 const result=await handle({id:1,type:'init',payload:{workbenchSource:source}});
 assert.deepEqual(events,['display','index']);assert.equal(result.type,'ready');assert.equal(result.workbenchBytes,undefined);
});
test('intermediate display reply does not resolve query initialization',async()=>{
 let emit,display=false,ready=false;
 const worker={addEventListener(type,fn){if(type==='message')emit=data=>fn({data});},postMessage(){},terminate(){}};
 const client=createFilterWorkerClient({workerFactory:()=>worker,timeoutMs:1000,onWorkbenchData:()=>{display=true;}});
 const initialized=client.init({workbenchSource:source}).then(()=>{ready=true;});
 emit({id:1,type:'workbench-data',workbenchBytes:new ArrayBuffer(1)});await Promise.resolve();
 assert.equal(display,true);assert.equal(ready,false);
 emit({id:1,type:'ready',workCount:1});await initialized;assert.equal(ready,true);client.terminate();
});
test('experimental ownership is opt-in on localhost works, never on public URLs or direct ranking',()=>{
 const original=globalThis.Worker;globalThis.Worker=function(){};
 try{
   const location={hostname:'127.0.0.1',hash:'#works',search:''};
   assert.equal(ownedWorkbenchEnabled(location),false);
   assert.equal(ownedWorkbenchEnabled({...location,search:'?workerWorkbench=1'}),true);
   assert.equal(ownedWorkbenchEnabled({...location,hostname:'favorite.bishojo.date',search:'?workerWorkbench=1'}),false);
   assert.equal(ownedWorkbenchEnabled({...location,hash:'#ranking',search:'?workerWorkbench=1'}),false);
   assert.equal(ownedWorkbenchEnabled({...location,search:'?workerWorkbench=1&legacyWorkbench=1'}),false);
 }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
