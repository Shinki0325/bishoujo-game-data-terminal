import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createM2PersonRuntime,M2_PERSON_ENTITIES_SHA256,M2_PERSON_RELATIONS_SHA256} from './m2-person-runtime.js';

// Small behavioral fixtures with an explicit digest test double. These do not
// replace the separate real-payload integrity test or alter production pins.
const envelope=(projection,records)=>JSON.stringify({schemaVersion:'terminal-wiki-m2-person-delta-v1',publicationStatus:'source-only',projection,records});
const entities=envelope('entities',[{entityType:'person',entityId:'per_1',canonicalName:'测试人物'}]);
const relations=envelope('relations',[{relationId:'r1',relationType:'work-credits-person',subject:'wk_1',object:'per_1',roleCode:'scenario',evidence:[{sourceRef:{source:'egs',id:'1:credit'}}]}]);
const cryptoStub={subtle:{async digest(_,bytes){
  const content=new TextDecoder().decode(bytes);
  const hex=content===entities?M2_PERSON_ENTITIES_SHA256:content===relations?M2_PERSON_RELATIONS_SHA256:'0'.repeat(64);
  return Uint8Array.from(Buffer.from(hex,'hex')).buffer;
}}};
const options={entitiesUrl:new URL('https://fixture/entities'),relationsUrl:new URL('https://fixture/relations'),
  fetchImpl:async url=>new Response(url.pathname==='/entities'?entities:relations),cryptoRef:cryptoStub};
const catalog=[{workId:'1',title:'测试作品',releaseDate:'2000-01-01'}];

test('person catalog is lazy, shared across concurrent loads, and matches eager titles/credits',async()=>{
  let calls=0;
  const runtime=createM2PersonRuntime({...options,loadCatalogWorks:async()=>{calls++;return catalog;}});
  assert.equal(calls,0);
  const [a,b]=await Promise.all([runtime.load(),runtime.load()]);
  assert.equal(calls,1);assert.equal(a,b);
  const eager=await createM2PersonRuntime({...options,catalogWorks:catalog}).load();
  assert.deepEqual(a.records,eager.records);
  assert.equal(a.records[0].credits[0].title,'测试作品');
  runtime.clear();await runtime.load();assert.equal(calls,2);
});

test('failed or malformed lazy catalog retries without caching partial person state',async()=>{
  let calls=0;
  const runtime=createM2PersonRuntime({...options,loadCatalogWorks:async()=>{
    calls++;if(calls===1)throw Error('catalog unavailable');if(calls===2)return null;return catalog;
  }});
  await assert.rejects(runtime.load(),/catalog unavailable/);
  await assert.rejects(runtime.load(),/catalog must be an array/);
  assert.equal((await runtime.load()).records[0].credits[0].title,'测试作品');
  assert.equal(calls,3);
});

test('real integrity failure occurs before lazy catalog is touched',async()=>{
  let calls=0;
  const runtime=createM2PersonRuntime({...options,cryptoRef:webcrypto,loadCatalogWorks:async()=>{calls++;return catalog;}});
  await assert.rejects(runtime.load(),/integrity failed/);
  assert.equal(calls,0);
  assert.throws(()=>createM2PersonRuntime({...options,loadCatalogWorks:42}),/must be a function/);
});
