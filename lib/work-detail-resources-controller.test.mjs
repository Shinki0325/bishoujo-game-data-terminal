import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkCreditsController, createWorkStatsController } from './work-detail-resources-controller.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function creditsFixture(overrides={}) {
  const calls=[],dialog={open:true},contentRoot={dataset:{}};
  const loader={load:async id=>({workId:id,cast:[]}),loadCharacterImages:async()=>null};
  const view={renderLoading:()=>calls.push('loading'),clear:()=>calls.push('clear'),renderWork:v=>calls.push(v),renderError:retry=>calls.push({retry})};
  const controller=createWorkCreditsController({loader,view,dialog,contentRoot,ensureProjectRuntime:async()=>{},getProjectRuntime:()=>null,
    loadIdentityCrosswalk:async()=>null,characterAssetBase:'/characters/',characterAssetFallbackBase:'/fallback/',logger:{warn(){}},...overrides});
  // Real dialogs have a dataset; kept explicit to catch accidental global element access.
  dialog.dataset={};
  return {controller,calls,dialog,loader,contentRoot};
}
test('detail credits reject stale work completion and preserve the newer dialog',async()=>{
  const a=deferred();const f=creditsFixture({loader:{load:id=>id==='a'?a.promise:Promise.resolve({workId:id,cast:[]}),loadCharacterImages:async()=>null}});
  const old=f.controller.start({workId:'a'});await f.controller.start({workId:'b'});
  a.resolve({workId:'a',cast:[]});await old;
  assert.equal(f.calls.at(-1).workId,'b');assert.equal(f.calls.filter(v=>v?.workId==='a').length,0);
});
test('suspending a detail suppresses late failure instead of clearing shared loader caches',async()=>{
  const wait=deferred();const f=creditsFixture({loader:{load:()=>wait.promise}});
  const loading=f.controller.start({workId:'a'});f.controller.suspend();wait.reject(Error('late'));await loading;
  assert.deepEqual(f.calls,['loading']);
});
test('optional character image failure keeps text, while current credits failure offers a working retry',async()=>{
  let broken=true;const f=creditsFixture({loader:{load:async()=>{if(broken)throw Error('offline');return {workId:'a',cast:[]};},loadCharacterImages:async()=>{throw Error('image');}}});
  await f.controller.start({workId:'a'});assert.equal(typeof f.calls.at(-1).retry,'function');
  broken=false;f.calls.at(-1).retry();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.at(-1).workId,'a');
});
test('missing credits clears only that detail and explicitly resets relation counters',async()=>{
  const f=creditsFixture({loader:{load:async()=>null}});await f.controller.start({workId:'a'});
  assert.equal(f.calls.at(-1),'clear');assert.deepEqual(f.contentRoot.dataset,{projectEntityPeople:'0',projectEntityCharacters:'0'});
});
function statsFixture(overrides={}) {
  const row={},output={};const controller=createWorkStatsController({row,output,endpointUrl:'https://site.test/stats',pageOrigin:'https://site.test',isOpen:()=>true,
    fetchImpl:async()=>new Response(JSON.stringify({entityType:'work',entityId:'a',views:123})),...overrides});
  return {controller,row,output};
}
test('statistics retain public same-origin reads and local-preview no-fetch policy',async()=>{
  const f=statsFixture();await f.controller.load({workId:'a'});assert.equal(f.output.textContent,'123 次');
  let calls=0;const local=statsFixture({pageOrigin:'http://127.0.0.1:4182',fetchImpl:()=>{calls++;}});
  await local.controller.load({workId:'a'});assert.equal(calls,0);assert.equal(local.output.textContent,'本地预览不显示统计');
  const remote=statsFixture({pageOrigin:'https://preview.test',fetchImpl:()=>{calls++;}});
  await remote.controller.load({workId:'a'});assert.equal(calls,0);assert.equal(remote.row.hidden,true);
});
test('statistics abort private request on close and never apply a late or mismatched result',async()=>{
  const pending=deferred();let signal;
  const f=statsFixture({fetchImpl:(_url,options)=>{signal=options.signal;return pending.promise;}});
  const read=f.controller.load({workId:'a'});f.controller.suspend();assert.equal(signal.aborted,true);
  pending.resolve(new Response(JSON.stringify({entityType:'work',entityId:'a',views:99})));await read;
  assert.notEqual(f.output.textContent,'99 次');
  const mismatch=statsFixture();await mismatch.controller.load({workId:'other'});assert.notEqual(mismatch.output.textContent,'123 次');
});
