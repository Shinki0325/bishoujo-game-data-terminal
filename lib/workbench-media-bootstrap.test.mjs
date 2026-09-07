import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createMediaDeferredBootstrap} from './workbench-media-bootstrap.js';
import {decodeWorkbenchPayload,workbenchQueryWork,loadWorkerWorkbenchBundle,validateWorkbenchManifest,loadWorkbenchLanding} from './workbench-demand-data.js';
import {createWorkbenchUISummary,projectPersonWorkMetadata} from './workbench-ui-summary.js';
import {createWorkbenchWorkerHandler} from './workbench-worker-handler.js';
import {createFilterWorkerRuntime} from './filter-worker-runtime.js';

const root=new URL('../runtime-data/workbench-demand/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root)));
const full=JSON.parse(await readFile(new URL(manifest.bootstrap.path,root)));
const slim=createMediaDeferredBootstrap(full);
const oldData=decodeWorkbenchPayload(structuredClone(full),manifest);
const raw=Buffer.from(JSON.stringify(slim)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptor={path:`worker-bootstrap.${hash(raw).slice(0,16)}.json`,sha256:hash(raw),bytes:raw.length};
const testManifest={...manifest,workerBootstrap:descriptor};
const manifestBytes=Buffer.from(JSON.stringify(testManifest));
const config={enabled:true,manifestPath:'../runtime-data/workbench-demand/manifest.json',sha256:hash(manifestBytes)};
const source={sha256:config.sha256,media:'on-demand-v1'};
const fetchSource=async url=>new Response(String(url).endsWith('/manifest.json')?manifestBytes:String(url).endsWith('/'+descriptor.path)?raw:await readFile(url));

test('media-deferred bootstrap preserves every query field and all company cover choices',()=>{
 const data=decodeWorkbenchPayload(structuredClone(slim),manifest,{allowDeferredMedia:true});
 assert.deepEqual(data.ratedDisplayWorks.map(workbenchQueryWork),oldData.ratedDisplayWorks.map(workbenchQueryWork));
 assert.deepEqual(createWorkbenchUISummary(data),createWorkbenchUISummary(oldData));
 assert.equal(data.ratedDisplayWorks.filter(work=>work.projectedPreviewPath).length,0);
 assert.ok(gzipSync(raw).length<gzipSync(JSON.stringify(full)).length*0.8);
 assert.throws(()=>decodeWorkbenchPayload(structuredClone(slim),manifest),/不能用作完整/);
 assert.throws(()=>validateWorkbenchManifest({...manifest,workerBootstrap:{...descriptor,path:'../evil.json'}}));
});

test('owned media is lazy, verified, equivalent to cards and automatically retries a transient media shard failure',async()=>{
 const calls=[];let fail=false,failedUrl=null;
 const fetchImpl=async url=>{calls.push(String(url));if(fail&&/cards-|first-page\./u.test(String(url))){fail=false;failedUrl=String(url);return new Response('',{status:503});}return fetchSource(url);};
 const bundle=await loadWorkerWorkbenchBundle(source,{config,fetchImpl});
 assert.equal(calls.length,2);assert.ok(!calls.some(url=>/cards-|first-page\./u.test(url)));
 assert.equal(bundle.data.mediaData.stats().cached,0);
 const handler=createWorkbenchWorkerHandler({runtime:createFilterWorkerRuntime(),loadSource:async()=>bundle,projectWork:workbenchQueryWork});
 assert.equal((await handler({id:1,type:'init',payload:{workbenchSource:source}})).type,'ready');
 const selected=oldData.ratedDisplayWorks.filter(work=>work.projectedThumbnailPath&&!manifest.firstPage.ids.includes(work.workId)).slice(0,4);
 const workIds=[...selected.map(work=>work.workId),'not-in-catalog'];
 await handler({id:2,type:'work-metadata',payload:{kind:'titles',workIds}});
 assert.equal(calls.length,2);
 fail=true;
 assert.equal((await handler({id:3,type:'work-metadata',payload:{kind:'person',workIds}})).type,'work-metadata');
 assert.ok(failedUrl);assert.equal(calls.filter(url=>url===failedUrl).length,2);
 const recoveredCalls=calls.length;
 const reply=await handler({id:4,type:'work-metadata',payload:{kind:'person',workIds}});
 assert.equal(calls.length,recoveredCalls);
 const rows=await bundle.data.mediaData.get(selected.map(work=>work.workId));
 assert.deepEqual(reply.rows,selected.map(work=>projectPersonWorkMetadata(rows.get(work.workId))));
 for(const work of selected)assert.equal(rows.get(work.workId).projectedThumbnailPath,work.projectedThumbnailPath);
 assert.ok(bundle.data.mediaData.stats().cached<=64);
});

test('corrupt deferred source and unknown media modes fail closed; complete source remains available',async()=>{
 await assert.rejects(loadWorkerWorkbenchBundle({...source,media:'invalid'},{config,fetchImpl:fetchSource}),/媒体模式/);
 await assert.rejects(loadWorkerWorkbenchBundle(source,{config,fetchImpl:async url=>String(url).endsWith('/'+descriptor.path)?new Response('{}'):fetchSource(url)}),/校验/);
 const legacy=await loadWorkerWorkbenchBundle({sha256:config.sha256},{config,fetchImpl:fetchSource});
 assert.equal(legacy.data.mediaData,undefined);
 assert.deepEqual(legacy.data,oldData);
});

test('first-page hint overlaps manifest loading but never bypasses hash or identity validation',async()=>{
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),calls=[],bothStarted=new Promise(resolve=>{started=resolve;});
 const firstPage={path:manifest.firstPage.path,sha256:manifest.firstPage.sha256};
 const loading=loadWorkbenchLanding({config:{...config,firstPage},fetchImpl:async url=>{
   calls.push(String(url));if(calls.length===2)started();if(String(url).endsWith('/manifest.json'))await gate;return fetchSource(url);
 }});
 try {
   await bothStarted;
   assert.ok(calls.some(url=>url.endsWith(firstPage.path)));assert.ok(calls.some(url=>url.endsWith('/manifest.json')));
 } finally { release(); }
 assert.deepEqual((await loading).works.map(work=>work.workId),manifest.firstPage.ids);
 assert.equal(calls.filter(url=>url.endsWith(firstPage.path)).length,1);
 await assert.rejects(loadWorkbenchLanding({config:{...config,firstPage},fetchImpl:async url=>String(url).endsWith('/manifest.json')?new Response('{}'):fetchSource(url)}),/校验/);
 const stale=await loadWorkbenchLanding({config:{...config,firstPage:{...firstPage,sha256:'0'.repeat(64)}},fetchImpl:fetchSource});
 assert.deepEqual(stale.works.map(work=>work.workId),manifest.firstPage.ids);
 const unsafeCalls=[];
 await loadWorkbenchLanding({config:{...config,firstPage:{path:'../foreign.json',sha256:firstPage.sha256}},fetchImpl:async url=>{unsafeCalls.push(String(url));return fetchSource(url);}});
 assert.ok(!unsafeCalls.some(url=>url.includes('foreign.json')));
});
