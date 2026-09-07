import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceRequest, retryAfterMs} from './resource-request.js';

function clock() {
  let time=1700000000000;const waits=[];
  return {now:()=>time,random:()=>0.5,sleep:async ms=>{waits.push(ms);time+=ms;},advance:ms=>time+=ms,waits};
}
const json=bytes=>JSON.parse(new TextDecoder().decode(bytes));

test('non-Error validation rejection still receives validation cooldown',async()=>{
  const c=clock();let calls=0;
  const read=createResourceRequest({...c,fetchImpl:async()=>{calls++;return new Response('ok');}});
  await assert.rejects(read('null',{validate:()=>{throw null;}}),e=>e.kind==='validation'&&e.retryAt>c.now());
  await assert.rejects(read('null'),e=>e.kind==='validation');assert.equal(calls,1);
});
test('20 concurrent observers share success and one transient-failure recovery budget',async()=>{
  const c=clock();let calls=0;const modes=[];
  const read=createResourceRequest({...c,fetchImpl:async(_url,options)=>{modes.push(options.cache);return ++calls===1?new Response('',{status:503}):new Response('{"ok":true}');}});
  const tasks=Array.from({length:20},()=>read('same',{validate:json}));
  assert.ok(tasks.every(p=>p===tasks[0]));assert.deepEqual(await tasks[0],{ok:true});await Promise.all(tasks);
  assert.equal(calls,2);assert.deepEqual(modes,['force-cache','reload']);assert.deepEqual(c.waits,[200]);
});
test('persistent failure has two attempts, a cooldown, then can recover without reload',async()=>{
  const c=clock();let calls=0,broken=true;const modes=[];
  const read=createResourceRequest({...c,fetchImpl:async(_url,o)=>{calls++;modes.push(o.cache);return broken?new Response('',{status:503}):new Response('ok');}});
  await assert.rejects(read('a'),e=>e.status===503);assert.equal(calls,2);
  broken=false;await Promise.all(Array.from({length:20},()=>assert.rejects(read('a'),e=>e.retryAt>c.now())));assert.equal(calls,2);
  c.advance(3001);assert.equal(new TextDecoder().decode(await read('a')),'ok');assert.equal(calls,3);assert.equal(modes.at(-1),'reload');
});
test('failure of one URL does not block unrelated data',async()=>{
  const c=clock();const read=createResourceRequest({...c,fetchImpl:async url=>new Response('',{status:url==='a'?503:200})});
  await assert.rejects(read('a'));assert.equal((await read('b')).byteLength,0);
});
for(const status of [400,403,404,410,501])test(`HTTP ${status} is not automatically retried or treated as empty data`,async()=>{
  const c=clock();let calls=0;const read=createResourceRequest({...c,fetchImpl:async()=>{calls++;return new Response('',{status});}});
  await assert.rejects(read('missing'),e=>e.kind==='http'&&e.status===status);assert.equal(calls,1);assert.deepEqual(c.waits,[]);
});
test('429 Retry-After seconds prevents early retries and short waits remain single-flight',async()=>{
  const c=clock();let calls=0;const starts=[];
  const read=createResourceRequest({...c,fetchImpl:async()=>{starts.push(c.now());return ++calls===1?new Response('',{status:429,headers:{'Retry-After':'2'}}):new Response('ok');}});
  await read('a');assert.equal(starts[1]-starts[0],2000);assert.equal(calls,2);
});
test('long Retry-After does not sleep in the background and survives repeated user retries',async()=>{
  const c=clock();let calls=0;const read=createResourceRequest({...c,fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'60'}});}});
  const deadline=c.now()+60000;await assert.rejects(read('a'),e=>e.retryAt===deadline);assert.equal(calls,1);assert.deepEqual(c.waits,[]);
  c.advance(59000);await assert.rejects(read('a'));assert.equal(calls,1);
  c.advance(1000);await assert.rejects(read('a'));assert.equal(calls,2);
});
test('Retry-After supports HTTP dates and ignores malformed/expired values',()=>{
  const now=Date.parse('2026-09-07T00:00:00Z');
  assert.equal(retryAfterMs('Mon, 07 Sep 2026 00:00:02 GMT',now),2000);
  for(const value of [null,'','bad','Sun, 06 Sep 2026 00:00:00 GMT'])assert.equal(retryAfterMs(value,now),0);
});
test('network and response-body errors recover within the same two-attempt budget',async()=>{
  for(const bodyFailure of [false,true]){
    const c=clock();let calls=0;const read=createResourceRequest({...c,fetchImpl:async()=>{if(++calls>1)return new Response('ok');if(bodyFailure)return {ok:true,arrayBuffer:async()=>{throw TypeError('body interrupted');}};throw TypeError('network interrupted');}});
    assert.equal(new TextDecoder().decode(await read('a')),'ok');assert.equal(calls,2);
  }
});
test('timeout includes body reading and aborts the resource-owned request',async()=>{
  const signals=[];let calls=0;
  const read=createResourceRequest({timeoutMs:5,baseDelayMs:0,fetchImpl:async(_url,{signal})=>{calls++;signals.push(signal);return {ok:true,arrayBuffer:()=>new Promise(()=>{})};}});
  await assert.rejects(read('a'),e=>e.kind==='timeout');assert.equal(calls,2);assert.ok(signals.every(s=>s.aborted));
});
test('validation failures have no automatic retries, cool down, and later bypass bad HTTP cache',async()=>{
  const c=clock();let calls=0,bad=true;const modes=[];
  const read=createResourceRequest({...c,fetchImpl:async(_url,o)=>{calls++;modes.push(o.cache);return new Response(bad?'not-json':'{}');}});
  await assert.rejects(read('a',{validate:json}),e=>e.kind==='validation');assert.equal(calls,1);
  bad=false;await assert.rejects(read('a',{validate:json}));c.advance(3001);
  assert.deepEqual(await read('a',{validate:json}),{});assert.equal(calls,2);assert.deepEqual(modes,['force-cache','reload']);
});
test('validation identity separates different expected content at the same address',async()=>{
  let calls=0;const read=createResourceRequest({fetchImpl:async()=>{calls++;return new Response('x');}});
  await Promise.all([read('a',{validationKey:'one',validate:()=>1}),read('a',{validationKey:'two',validate:()=>2})]).then(v=>assert.deepEqual(v,[1,2]));assert.equal(calls,2);
});
test('transport does not retain successful payloads as a second data cache',async()=>{
  let calls=0;const read=createResourceRequest({fetchImpl:async()=>{calls++;return new Response('x');}});
  await read('a');await read('a');assert.equal(calls,2);
});
test('failure records have a bounded capacity',async()=>{
  const c=clock();let calls=0;const read=createResourceRequest({...c,maxFailures:2,fetchImpl:async()=>{calls++;return new Response('',{status:404});}});
  for(const key of ['a','b','c'])await assert.rejects(read(key));
  await assert.rejects(read('c'));assert.equal(calls,3);await assert.rejects(read('a'));assert.equal(calls,4);
});
test('invalid recovery policy is rejected before any network activity',()=>{
  for(const options of [{maxAttempts:0},{maxAttempts:4},{timeoutMs:0},{cooldownMs:-1},{maxFailures:0}])assert.throws(()=>createResourceRequest(options),TypeError);
});
