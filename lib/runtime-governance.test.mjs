import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createBudgetCache } from './budget-cache.js';
import { createRuntimeDiagnostics } from './runtime-diagnostics.js';
import { createRuntimeSourceCache } from './runtime-source-cache.js';
import { createWorkbenchMediaSources } from './workbench-media-sources.js';
import { createWorkspaceSession } from './workspace-session.js';
import { createViewLifetime } from './view-lifetime.js';
import { createWorkbenchResultWindow } from './workbench-result-window.js';
import { createInteractionMetrics } from './interaction-metrics.js';

test('LRU evicts settled entries, never pending work; settlement returns within budget', () => {
  const c = createBudgetCache({ maxEntries: 2, maxBytes: 10 });
  c.set('a',1);c.settle('a',1,3);c.set('b',2);c.settle('b',2,3);c.get('a');
  c.set('c',3); assert.equal(c.has('b'),false);assert.equal(c.has('a'),true);
  c.settle('c',3,9);assert.equal(c.has('a'),false);assert.equal(c.inspect().bytes,9);
  c.set('d',4);c.set('e',5);c.set('f',6);
  assert.equal(c.inspect().pending,3);assert.equal(c.size,3);
  c.settle('d',4,1);c.settle('e',5,1);c.settle('f',6,1);
  assert.ok(c.size<=2);assert.equal(c.inspect().pending,0);
});
test('oversized values are returned by callers but not retained; stale settlement cannot overwrite new entry', () => {
  const c=createBudgetCache({maxEntries:1,maxBytes:2});c.set('x',1);c.delete('x');c.set('x',2);
  assert.equal(c.settle('x',1,1),false);assert.equal(c.get('x'),2);
  c.settle('x',2,3);assert.equal(c.size,0);c.clear();assert.equal(c.inspect().bytes,0);
  for(const options of [{maxEntries:0},{maxBytes:-1}])assert.throws(()=>createBudgetCache(options));
});
test('source cache actually re-fetches evicted values and still shares pending requests',async()=>{
  let calls=0;
  const load=createRuntimeSourceCache({cryptoRef:webcrypto,cacheBudget:{maxEntries:1},fetchImpl:async()=>{calls++;return new Response('{"ok":true}');}});
  const a=load('a');assert.equal(load('a'),a);await a;await load('b');const again=await load('a');
  assert.equal(again.value.ok,true);assert.equal(calls,3);
});
test('media eviction re-resolves metadata without deleting user media or invalidating authority',async()=>{
  let calls=0;const store={replacementFor:async()=>{calls++;return null;},urlForCustom:async()=> 'blob:user'};
  const media=createWorkbenchMediaSources({getMediaStore:()=>store,assetBase:'https://test.invalid/',highDensityPreviewsEnabled:false,cacheBudget:{maxEntries:1}});
  const a={workId:'a',coverPath:'a.webp'};
  const first=await media.coverSourcesForWork(a);await media.coverSourcesForWork({workId:'b',coverPath:'b.webp'});
  assert.deepEqual(await media.coverSourcesForWork(a),first);assert.equal(calls,3);
  assert.equal((await media.coverSourcesForWork({workId:'local',localMediaKind:'custom'})).thumbnailUrl,'blob:user');
});
test('diagnostics are disabled by default; opt-in discards arbitrary strings and returns detached bounded snapshots',()=>{
  const off=createRuntimeDiagnostics();off.event('request-start');assert.deepEqual(off.snapshot().events,[]);
  const d=createRuntimeDiagnostics({enabled:true,maxEvents:2,now:()=>1});
  d.event('request-error',{url:'secret',query:'secret',kind:'http',status:503,message:'secret'});
  assert.equal(JSON.stringify(d.snapshot()).includes('secret'),false);
  d.event('not-allowed');d.event('request-ready');d.event('request-start');
  d.identify({runtimeRelease:'v1-beta',dataSnapshot:'contains private spaces'});
  assert.equal(d.snapshot().events.length,2);assert.equal(d.snapshot().metadata.dataSnapshot,undefined);
  d.gauge('listeners',2);const snap=d.snapshot();snap.gauges.listeners=999;assert.equal(d.snapshot().gauges.listeners,2);
  d.clear();assert.equal(d.snapshot().events.length,0);assert.equal(d.snapshot().gauges.listeners,2);
});
test('public lifetime/session interfaces are executable contracts, including negative inputs and repeated cleanup',()=>{
  const scope=createViewLifetime();for(const name of ['add','listen','dispose'])assert.equal(typeof scope[name],'function');
  let cleaned=0;scope.add(()=>cleaned++);scope.dispose();scope.dispose();assert.equal(cleaned,1);
  assert.throws(()=>scope.add(null));const s=createWorkspaceSession();
  for(const name of ['inspect','isActive','begin','suspend','dispose'])assert.equal(typeof s[name],'function');
  assert.throws(()=>s.begin(''));const old=s.begin('works'), next=s.begin('works');
  assert.equal(old.complete(),false);assert.equal(old.fail(Error()),false);next.complete({empty:true});
  assert.equal(s.inspect().status,'empty');s.suspend();assert.equal(next.isCurrent(),false);
  const retry=s.begin('works');retry.fail(Error('test'));assert.equal(s.inspect().status,'error');
  s.begin('works').complete();assert.equal(s.inspect().status,'ready');s.dispose();assert.throws(()=>s.begin('works'));
});
test('result count, page IDs and revision remain coherent across empty and restored results',()=>{
  const works=Array.from({length:250},(_,i)=>({workId:String(i)}));
  const window=createWorkbenchResultWindow({ratedDisplayWorks:works});
  const project=(ids,pageNumber)=>window.project({workIds:ids},{pageNumber,filterState:{},selectedWorkIds:[]});
  const ids=works.map(w=>w.workId),first=project(ids,1),second=project(ids,2);
  assert.equal(first.page.total,250);assert.equal(first.page.resultRevision,second.page.resultRevision);
  assert.equal(second.workIds.length,second.page.end-second.page.start);
  assert.deepEqual(second.workIds,ids.slice(second.page.start,second.page.end));
  const empty=project([],2);assert.equal(empty.page.total,0);assert.equal(empty.page.pageNumber,1);assert.deepEqual(empty.workIds,[]);
  assert.throws(()=>window.ids(first.page.resultRevision));
  const restored=project(ids,2);assert.equal(restored.page.pageNumber,1);assert.equal(restored.page.total,250);
  assert.throws(()=>project(['unknown'],1));assert.throws(()=>project(ids,0));
});
test('interaction records and their performance marks are bounded and clearable',()=>{
  const marks=new Set();const m=createInteractionMetrics({globalRef:{},locationRef:{href:'https://test.invalid/?interactionMetrics=1'},performanceRef:{now:()=>1,mark:n=>marks.add(n),clearMarks:n=>marks.delete(n)}});
  for(let i=0;i<400;i++){const t=m.begin('search');m.stage(t,'next-frame');}
  assert.equal(m.snapshot().records.length,128);assert.equal(marks.size,256);m.clear();assert.equal(marks.size,0);
});
