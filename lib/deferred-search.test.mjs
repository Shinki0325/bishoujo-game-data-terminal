import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createQueryIndex,createSearchTextCarrier,installQuerySearchText,queryIndexedCatalog,warmQuerySearchText} from './query-index.js';
import {createFilterWorkerRuntime} from './filter-worker-runtime.js';
import {createFilterWorkerClient} from './filter-worker-client.js';
import {loadWorkbenchData,WORKBENCH_SCHEMA,WORKBENCH_COLUMNS,workbenchSourcePins,validateWorkbenchManifest} from './workbench-demand-data.js';
import {createDefaultState} from './state.js';
const works=[{workId:'1',title:'original',brandId:'brand',brandName:'brand',releaseDate:'2000-01-01',median:80,voteCount:80,filterIds:[],genreFilterIds:[]}];
const filterState=createDefaultState('test').filterState;
const carrier=createSearchTextCarrier(createQueryIndex({works,knownFilterIds:[],workAliasesById:new Map([['1',['成濑未亚']]])}));

test('late search installation is atomic, preserves numeric index and matches inline text',()=>{
 const index=createQueryIndex({works,knownFilterIds:[]}),numeric=index.backendIndexes;
 assert.deepEqual(queryIndexedCatalog(index,{...filterState,titleQuery:'成濑'}),[]);
 installQuerySearchText(index,carrier);
 assert.equal(queryIndexedCatalog(index,{...filterState,titleQuery:'成濑'}).length,1);
 assert.equal(index.backendIndexes,numeric);
 const prior=index.normalizedTitles;
 assert.throws(()=>installQuerySearchText(index,{...carrier,workIds:['wrong']}));
 assert.throws(()=>installQuerySearchText(index,{...carrier,rows:[['broken']]}));
 assert.throws(()=>installQuerySearchText({},carrier));
 assert.equal(index.normalizedTitles,prior);
 assert.deepEqual(index.pinyinTitles,createQueryIndex({works,knownFilterIds:[],searchText:carrier}).pinyinTitles);
});

test('worker carrier protocol validates identities and retains a good index after failure',()=>{
 const worker=createFilterWorkerRuntime();
 assert.equal(worker.handle({type:'search-text',payload:{searchText:carrier}}).type,'error');
 assert.equal(worker.handle({type:'init',payload:{works,knownFilterIds:[]}}).type,'ready');
 assert.equal(worker.handle({type:'search-text',payload:{searchText:carrier}}).type,'ready');
 assert.equal(worker.handle({type:'search-text',payload:{searchText:{...carrier,workIds:['bad']}}}).type,'error');
 assert.deepEqual(worker.handle({type:'query',payload:{filterState:{...filterState,titleQuery:'成濑'}}}).workIds,['1']);
});

test('client sends only carrier to an existing worker and restores it after a crash',async()=>{
 const spawned=[];
 const client=createFilterWorkerClient({workerFactory:()=>{
  const runtime=createFilterWorkerRuntime(),listeners={},messages=[];
  const w={messages,addEventListener:(kind,fn)=>listeners[kind]=fn,postMessage:m=>{messages.push(m);queueMicrotask(()=>listeners.message({data:runtime.handle(m)}));},terminate(){},crash:()=>listeners.error({error:Error('test crash')})};spawned.push(w);return w;
 }});
 await client.init({works,knownFilterIds:[]});await client.installSearchText(carrier);
 assert.deepEqual(Object.keys(spawned[0].messages[1].payload),['searchText']);
 spawned[0].crash();assert.deepEqual((await client.query({filterState:{...filterState,titleQuery:'成濑'}})).workIds,['1']);
 assert.deepEqual(spawned[1].messages[0].payload.searchText,carrier);
 client.terminate();
});

test('deferred file is not fetched during boot; concurrent reads share, validate and retry',async()=>{
 const hash=b=>createHash('sha256').update(b).digest('hex'),files=new Map();
 const emit=(name,value)=>{const bytes=Buffer.from(JSON.stringify(value)),sha256=hash(bytes),path=`${name}.${sha256.slice(0,16)}.json`;files.set(path,bytes);return{path,sha256};};
 const bootstrap=emit('bootstrap',{schema:WORKBENCH_SCHEMA,columns:WORKBENCH_COLUMNS,rows:works.map(w=>WORKBENCH_COLUMNS.map(k=>w[k]??null)),context:{brands:[],sampleSource:{}},sample:{sampleId:'test'}});
 const searchText=emit('search-text',carrier),first=emit('first-page',works);
 const m={schema:WORKBENCH_SCHEMA,sourceDigest:'a'.repeat(64),dataRevision:'wb-'+'a'.repeat(64),sourcePins:workbenchSourcePins(),count:1,blockSize:1,bootstrap,searchText,shards:[first],firstPage:{...first,ids:['1']}};
 const manifest=emit('manifest',m);let calls=0,fail='http';
 const config={enabled:true,manifestPath:manifest.path,sha256:manifest.sha256};
 const data=await loadWorkbenchData({config,locationRef:{search:''},fetchImpl:async url=>{
  const key=new URL(url).pathname.split('/').at(-1);
  if(key===searchText.path){calls++;if(fail==='http')return new Response('',{status:503});if(fail==='hash')return new Response('{}');}
  return new Response(files.get(key));
 }});
 assert.equal(data.searchText,null);assert.equal(calls,0);
 const httpError=await data.loadSearchText().catch(error=>error);
 assert.match(httpError.message,/503/);assert.equal(calls,2,'transient HTTP failure retries once');
 await assert.rejects(data.loadSearchText(),/503/);assert.equal(calls,2,'cooldown suppresses repeated transport');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,httpError.retryAt-Date.now())+20));
 fail='hash';const integrityError=await data.loadSearchText().catch(error=>error);
 assert.match(integrityError.message,/校验/);assert.equal(calls,3,'invalid bytes are not automatically retried');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,integrityError.retryAt-Date.now())+20));fail=null;
 const [a,b]=await Promise.all([data.loadSearchText(),data.loadSearchText()]);assert.equal(a,b);assert.equal(calls,4);
 assert.throws(()=>validateWorkbenchManifest({...m,searchText:{...searchText,path:'../escape.json'}}));
});

test('batched search preparation yields to numeric queries and equals inline carrier',async()=>{
 const rows=Array.from({length:7},(_,i)=>({...works[0],workId:String(i),title:`成瀬未亜 ${i}`}));
 const options={works:rows,knownFilterIds:[]};
 const expected=createSearchTextCarrier(createQueryIndex(options)),index=createQueryIndex(options);
 let yields=0;
 await warmQuerySearchText(index,{batchSize:2,yieldTask:async()=>{
  yields++;
  assert.equal(queryIndexedCatalog(index,filterState).length,rows.length);
 }});
 assert.equal(yields,4);
 assert.deepEqual(createSearchTextCarrier(index),expected);
 assert.throws(()=>warmQuerySearchText(index,{batchSize:0}));
});

test('search or explicit installation during a paused batch cannot be overwritten',async()=>{
 let resume;
 const index=createQueryIndex({works,knownFilterIds:[]});
 const pending=warmQuerySearchText(index,{yieldTask:()=>new Promise(r=>{resume=r;})});
 // A real title query still completes synchronously with the exact full index.
 assert.equal(queryIndexedCatalog(index,{...filterState,titleQuery:'original'}).length,1);
 installQuerySearchText(index,carrier);
 const installed=index.normalizedTitles;
 resume();await pending;
 assert.equal(index.normalizedTitles,installed);
 assert.equal(queryIndexedCatalog(index,{...filterState,titleQuery:'成濑'}).length,1);
});

test('cancelled warming can restart and runtime updates isolate the previous index',async()=>{
 const index=createQueryIndex({works,knownFilterIds:[]});let read=0;
 await warmQuerySearchText(index,{cancelled:()=>true,yieldTask:async()=>{read++;}});
 assert.equal(read,1);
 await warmQuerySearchText(index,{yieldTask:async()=>{}});
 assert.equal(queryIndexedCatalog(index,{...filterState,titleQuery:'original'}).length,1);
 const runtime=createFilterWorkerRuntime();
 assert.equal((await runtime.warmSearch({id:1})).type,'error');
 runtime.handle({type:'init',payload:{works,knownFilterIds:[]}});
 const job=runtime.warmSearch({id:2});
 runtime.handle({type:'update',payload:{works:[{...works[0],workId:'new',title:'updated'}],knownFilterIds:[]}});
 await job;
 assert.deepEqual(runtime.handle({type:'query',payload:{filterState:{...filterState,titleQuery:'updated'}}}).workIds,['new']);
});

test('optional warm timeout does not destroy a responsive query worker',async()=>{
 let spawns=0;
 const client=createFilterWorkerClient({timeoutMs:25,workerFactory:()=>{
  spawns++;const runtime=createFilterWorkerRuntime(),listeners={};
  return {addEventListener:(kind,fn)=>listeners[kind]=fn,terminate(){},postMessage:m=>{
   if(m.type==='warm-search')return;
   queueMicrotask(()=>listeners.message({data:runtime.handle(m)}));
  }};
 }});
 await client.init({works,knownFilterIds:[]});
 await assert.rejects(client.warmSearch(),error=>error.code==='WORKER_TIMEOUT');
 assert.equal((await client.query({filterState})).workIds.length,1);
 assert.equal(spawns,1);
 client.terminate();
});
