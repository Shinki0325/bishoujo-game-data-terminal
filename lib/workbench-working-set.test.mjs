import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createWorkbenchStore } from './workbench-demand-data.js';

function fixture({ count=240, title='old', beforeRead=async()=>{}, corrupt=false }={}) {
  const ids=Array.from({length:count},(_,i)=>`w${i}`), bodies=ids.map(workId=>JSON.stringify([{workId,title}]));
  let reads=0;
  const manifest={count,blockSize:1,firstPage:{ids:[]},shards:bodies.map((body,i)=>({path:`cards-${i}.json`,sha256:createHash('sha256').update(body).digest('hex')}))};
  const store=createWorkbenchStore(manifest,ids,{baseUrl:'https://test.invalid/',cryptoRef:webcrypto,maxCached:2,fetchImpl:async url=>{
    reads++;await beforeRead();return new Response(corrupt?'[]':bodies[Number(url.pathname.match(/cards-(\d+)/)[1])]);
  }});
  return {store,ids,reads:()=>reads};
}

test('200 selected records survive shard eviction and repeated get/hydrate/reordering',async()=>{
  const f=fixture(), selected=f.ids.slice(0,200);f.store.retainWorkIds(selected);
  const original=await f.store.get(selected);assert.equal(f.reads(),200);
  for(let n=0;n<3;n++) {
    f.store.retainWorkIds([...selected].reverse());
    const rows=await f.store.get([...selected].reverse());
    const hydrated=await f.store.hydrate([...rows.values()]);
    assert.equal(hydrated.length,200);assert.equal(rows.get('w0'),original.get('w0'));
  }
  assert.equal(f.reads(),200);assert.equal(f.store.stats().retained,200);assert.equal(f.store.stats().cached,2);
});

test('working set prunes removed records, admits only bounded public identities and clears',async()=>{
  const f=fixture();f.store.retainWorkIds([...f.ids,'custom-local-x','unknown']);await f.store.get(f.ids);
  assert.equal(f.store.stats().retained,200);
  f.store.retainWorkIds(['w1','w239']);assert.equal(f.store.stats().retained,2);
  assert.equal(f.store.peek('w0'),null);assert.equal(f.store.peek('w1').workId,'w1');
  f.store.retainWorkIds([]);assert.equal(f.store.stats().retained,0);assert.equal(f.store.peek('w1'),null);
  await assert.rejects(f.store.get(['unknown']),/未知作品/);
});

test('late completion cannot resurrect a removed record',async()=>{
  let release;const hold=new Promise(r=>release=r);const f=fixture({beforeRead:()=>hold});
  f.store.retainWorkIds(['w0']);const loading=f.store.get(['w0']);
  f.store.retainWorkIds(['w1']);release();await loading;
  assert.equal(f.store.stats().retained,0);await f.store.get(['w1']);assert.equal(f.store.stats().retained,1);
});

test('revision instances and custom media/presentation objects remain isolated',async()=>{
  const a=fixture(),b=fixture({title:'new'});a.store.retainWorkIds(['w0']);b.store.retainWorkIds(['w0']);
  assert.equal((await a.store.get(['w0'])).get('w0').title,'old');
  assert.equal((await b.store.get(['w0'])).get('w0').title,'new');
  const custom={workId:'custom-local-a',title:'mine'}, decorated={workId:'w0',presentationFamily:{name:'family'},presentationMemberCount:2};
  const rows=await a.store.hydrate([decorated,custom]);assert.equal(rows[1],custom);
  assert.equal(rows[0].presentationMemberCount,2);assert.equal(a.store.peek('w0').presentationFamily,undefined);
});

test('invalid bytes are never retained',async()=>{
  const f=fixture({corrupt:true});f.store.retainWorkIds(['w0']);
  await assert.rejects(f.store.get(['w0']),/校验失败/);assert.equal(f.store.stats().retained,0);
});
