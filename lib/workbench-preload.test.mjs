import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const firstIds=JSON.parse(await readFile(new URL('../runtime-data/workbench-demand/manifest.json',import.meta.url),'utf8')).firstPage.ids;

test('default preload dedupes concurrent startup and recovers from a failed manifest',async()=>{
  const originalFetch=globalThis.fetch,calls=new Map();let fail=true;
  globalThis.fetch=async url=>{
    const key=new URL(url).pathname;calls.set(key,(calls.get(key)??0)+1);
    if(key.endsWith('/manifest.json')&&fail){fail=false;return new Response('',{status:503});}
    return new Response(await readFile(url));
  };
  try {
    const lib=await import('./workbench-demand-data.js?shared-preload-test');
    await assert.rejects(lib.preloadWorkbenchData());
    const [a,b]=await Promise.all([lib.preloadWorkbenchData(),lib.loadWorkbenchData()]);
    assert.equal(a,b);assert.equal(a.ratedDisplayWorks.length,7264);
    await a.workData.get(firstIds);
    const entries=[...calls];
    assert.equal(entries.find(([k])=>k.endsWith('/manifest.json'))[1],2);
    assert.equal(entries.find(([k])=>k.includes('/bootstrap.'))[1],1);
    assert.equal(entries.find(([k])=>k.includes('/first-page.'))[1],1);
  }finally{globalThis.fetch=originalFetch;}
});

test('failed speculative first page can be retried without reloading bootstrap',async()=>{
  const originalFetch=globalThis.fetch;let firstCalls=0,bootstrapCalls=0;
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    if(path.includes('/first-page.')&&++firstCalls===1)return new Response('',{status:503});
    if(path.includes('/bootstrap.'))bootstrapCalls++;
    return new Response(await readFile(url));
  };
  try {
    const lib=await import('./workbench-demand-data.js?first-retry-test');
    const data=await lib.preloadWorkbenchData();
    await assert.rejects(data.workData.get(firstIds));
    const rows=await data.workData.get(firstIds);assert.equal(rows.size,100);
    assert.equal(firstCalls,2);assert.equal(bootstrapCalls,1);
  }finally{globalThis.fetch=originalFetch;}
});
