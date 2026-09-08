import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchMediaSources } from './workbench-media-sources.js';
import { createRankingMediaSession } from './ranking-media-session.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const work = { workId:'1', coverPath:'assets/a.webp', projectedPreviewPath:'assets/a-large.webp' };
function sources(options={}) {
  return createWorkbenchMediaSources({getMediaStore:()=>null,assetBase:'https://local.test/',highDensityPreviewsEnabled:true,
    previewMedia:{urlFor:async()=> 'https://local.test/legacy.webp'},...options});
}
test('cover source requests coalesce by work identity and media authority signature', async()=>{
  let calls=0;const s=sources({getMediaStore:()=>({replacementFor:async()=>{calls++;return null;}})});
  const a=s.coverSourcesForWork(work);assert.equal(a,s.coverSourcesForWork(work));
  assert.deepEqual(await a,{thumbnailUrl:'https://local.test/assets/a.webp',previewUrl:'https://local.test/assets/a-large.webp'});
  assert.equal(calls,1);const b=s.coverSourcesForWork({...work,projectedThumbnailPath:'assets/b.webp'});
  assert.notEqual(a,b);assert.equal((await b).thumbnailUrl,'https://local.test/assets/b.webp');
});
test('only a replacement with matching authority is used; custom media never consults replacement metadata', async()=>{
  let calls=0;const store={replacementFor:async()=>{calls++;return {authorityThumbnailPath:work.coverPath};},
    urlForReplacement:async()=> 'blob:replacement',urlForCustom:async()=> 'blob:custom'};
  const s=sources({getMediaStore:()=>store});
  assert.deepEqual(await s.coverSourcesForWork(work),{thumbnailUrl:'blob:replacement',previewUrl:null});
  assert.equal(await s.hasLocalReplacementForCurrentAuthority(work),true);
  assert.equal(await s.previewUrlForWork({...work,projectedThumbnailPath:'assets/changed.webp'}),'https://local.test/assets/a-large.webp');
  assert.deepEqual(await s.coverSourcesForWork({...work,localMediaKind:'custom'}),{thumbnailUrl:'blob:custom',previewUrl:null});
  assert.equal(calls,1);
});
test('invalidation rereads metadata and a late failed old request cannot evict the new promise', async()=>{
  const old=deferred(),current=deferred();let reads=0;
  const s=sources({getMediaStore:()=>({replacementFor:()=>++reads===1?old.promise:current.promise})});
  const a=s.coverSourcesForWork(work);const caught=assert.rejects(a,/old/);
  s.invalidateMedia('1');const b=s.coverSourcesForWork(work);old.reject(Error('old'));await caught;
  current.resolve(null);await b;assert.equal(s.coverSourcesForWork(work),b);
  await s.hasLocalReplacementForCurrentAuthority(work);assert.equal(reads,2);
});
test('failed preparation retries; low-density mode does not request preview fallback', async()=>{
  let reads=0;const s=sources({highDensityPreviewsEnabled:false,getMediaStore:()=>({replacementFor:async()=>{
    if(++reads===1)throw Error('offline');return null;
  }}),previewMedia:{urlFor(){throw Error('unexpected preview');}}});
  await assert.rejects(s.coverSourcesForWork(work),/offline/);
  assert.equal((await s.coverSourcesForWork(work)).previewUrl,null);assert.equal(reads,2);
});
test('preview path precedence and identical thumbnail/preview deduplication remain unchanged', async()=>{
  const s=sources();
  assert.equal(await s.previewUrlForWork({...work,previewPath:'assets/p.webp'}),'https://local.test/assets/a-large.webp');
  assert.equal(await s.previewUrlForWork({...work,projectedPreviewPath:null,previewPath:'assets/p.webp'}),'https://local.test/assets/p.webp');
  assert.equal(await s.previewUrlForWork({...work,projectedPreviewPath:null}),'https://local.test/legacy.webp');
  assert.equal((await s.coverSourcesForWork({...work,projectedPreviewPath:work.coverPath})).previewUrl,null);
});
test('batch media hydrates through the existing owner and returns a work-id keyed map', async()=>{
  let input;const s=sources({hydrateWorks:async rows=>{input=rows;return [{...work,projectedThumbnailPath:'assets/hydrated.webp'}];}});
  const rows=[{workId:'1'}],out=await s.resolveCoverUrls(rows);
  assert.equal(input,rows);assert.ok(out instanceof Map);assert.equal(out.get('1').thumbnailUrl,'https://local.test/assets/hydrated.webp');
});
function preloadFixture() {
  const batches=[];let active=true,cancels=0;const jobs=new Map();
  const session=createRankingMediaSession({visibleWorkIds:()=>['2'],isActive:()=>active,
    previewUrlForWork:w=>jobs.get(w.workId)?.promise??Promise.resolve(w.workId),
    preloader:{replace:rows=>batches.push(rows),cancel:()=>cancels++}});
  return {session,jobs,batches,setActive:v=>{active=v;},get cancels(){return cancels;}};
}
const model=ids=>({tiers:[{works:ids.slice(0,1).map(workId=>({workId}))}],candidateWorks:ids.slice(1).map(workId=>({workId}))});
test('preload preserves tier/candidate order and visible priority',async()=>{
  const f=preloadFixture();assert.equal(await f.session.refresh(model(['1','2'])),true);
  assert.deepEqual(f.batches[0],[{url:'1',visible:false},{url:'2',visible:true}]);
});
test('newer preload and cancellation discard old async preparation',async()=>{
  const f=preloadFixture(),old=deferred();f.jobs.set('1',old);
  const first=f.session.refresh(model(['1']));await f.session.refresh(model(['2']));old.resolve('old');
  assert.equal(await first,false);assert.equal(f.batches.length,1);
  const pending=deferred();f.jobs.set('3',pending);const third=f.session.refresh(model(['3']));
  f.session.cancel();pending.resolve('late');assert.equal(await third,false);assert.equal(f.cancels,1);assert.equal(f.batches.length,1);
});
test('leaving ranking suppresses prepared results and a failed preparation can be retried',async()=>{
  const f=preloadFixture();f.setActive(false);assert.equal(await f.session.refresh(model(['1'])),false);
  f.setActive(true);const bad=deferred();f.jobs.set('1',bad);const read=f.session.refresh(model(['1']));
  bad.reject(Error('decode'));await assert.rejects(read,/decode/);f.jobs.delete('1');
  assert.equal(await f.session.refresh(model(['1'])),true);assert.equal(f.batches.length,1);
});
