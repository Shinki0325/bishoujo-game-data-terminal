import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createM2PersonPerformanceRuntime} from './m2-person-performance-runtime.js';

const fixture=new URL('../data/terminal-wiki-m2-person-source-only-v1/performance-candidate/',import.meta.url);
function setup() {
  let now=0,mode='healthy';const requests=[];
  const runtime=createM2PersonPerformanceRuntime({
    manifestUrl:new URL('https://fixture/performance-manifest.json'),indexUrl:new URL('https://fixture/directory-index.json'),cryptoRef:webcrypto,
    requestPolicy:{now:()=>now,random:()=>0,sleep:async ms=>{now+=ms;}},
    fetchImpl:async(url,options)=>{
      const path=new URL(url).pathname.slice(1);requests.push({path,cache:options.cache});
      if(path.startsWith('relations/')&&mode==='fail')return new Response('',{status:503});
      if(path.startsWith('relations/')&&mode==='corrupt')return new Response('{}');
      return new Response(await readFile(new URL(path,fixture)));
    }
  });
  return {runtime,requests,setMode:v=>mode=v,advance:ms=>now+=ms};
}
test('failed person shard expires instead of permanently retaining the rejected Promise',async()=>{
  const f=setup();await f.runtime.loadDirectory();f.setMode('fail');
  const results=await Promise.allSettled(Array.from({length:20},()=>f.runtime.loadPerson('per_0000000009a6')));
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(f.requests.filter(r=>r.path.startsWith('relations/')).length,2);
  f.setMode('healthy');await assert.rejects(f.runtime.loadPerson('per_0000000009a6'));
  assert.equal(f.requests.length,4);f.advance(3001);
  const detail=await f.runtime.loadPerson('per_0000000009a6');assert.ok(detail.credits.length>0);
  assert.equal(f.requests.length,5);assert.equal(f.requests.at(-1).cache,'reload');
  await f.runtime.loadPerson('per_0000000009a6');assert.equal(f.requests.length,5);
});
test('corrupt person shard is rejected without automatic retry or weakening SHA checks',async()=>{
  const f=setup();await f.runtime.loadDirectory();f.setMode('corrupt');
  await assert.rejects(f.runtime.loadPerson('per_0000000009a6'),e=>e.kind==='validation'&&/integrity/.test(e.message));
  assert.equal(f.requests.length,3);f.advance(3001);f.setMode('healthy');
  assert.ok((await f.runtime.loadPerson('per_0000000009a6')).credits.length>0);
});
test('unknown person returns missing without attempting a shard request',async()=>{
  const f=setup();await f.runtime.loadDirectory();assert.equal(await f.runtime.loadPerson('not-present'),null);assert.equal(f.requests.length,2);
});
test('clearing during an in-flight directory read does not poison the next generation',async()=>{
  const f=setup();const one=f.runtime.loadDirectory();f.runtime.clear();const two=f.runtime.loadDirectory();
  await Promise.all([one,two]);const before=f.requests.length;assert.ok((await f.runtime.loadDirectory()).records.length>0);assert.equal(f.requests.length,before);
});
test('UI consumer does not permanently disable the person service after one failed shard',async()=>{
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  const source=await readFile(new URL('./person-workspace-controller.js',import.meta.url),'utf8');
  assert.match(main,/onLoadPerson: \(personId, summary\) => personWorkspace\.loadPerson\(personId, summary\)/);
  assert.match(main,/ensurePersonRuntime = \(\) => personWorkspace\.loadDirectory\(\)/);
  assert.doesNotMatch(source,/performanceRuntime = null;/);
  assert.match(source,/summary remains visible', error\);\s*throw error;/);
  assert.match(source,/retry the configured source', error\);\s*throw error;/);
});
