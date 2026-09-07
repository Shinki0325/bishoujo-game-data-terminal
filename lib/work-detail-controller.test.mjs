import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkDetailController } from './work-detail-controller.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const context = () => ({ workspace:'selection', personDirectoryOpen:false, companyDirectoryOpen:false, home:'false' });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('detail opening owns hydration and aliases but preserves explicit options and caller work', async () => {
  const shown=[]; const source={workId:'1'};
  const controller=createWorkDetailController({hydrateWork:async work=>({...work,title:'完整资料'}),
    readAliases:async ids=>{assert.deepEqual(ids,['1']);return [{workId:'1',aliases:['别名']}];},
    readLocation:context,showReady:(...args)=>shown.push(args),onError:assert.fail});
  await controller.open(source,{keepVersionShelf:true,push:false});
  assert.deepEqual(source,{workId:'1'});
  assert.equal(shown[0][0].title,'完整资料');
  assert.equal(shown[0][1].aliases.get('1')[0],'别名');
  assert.equal(shown[0][1].keepVersionShelf,true);
  assert.equal(shown[0][1].push,false);
});

test('detail late hydration and late aliases cannot reopen an older work', async () => {
  const slow=deferred(), aliases=deferred(),shown=[];
  const controller=createWorkDetailController({hydrateWork:work=>work.workId==='1'?slow.promise:Promise.resolve(work),
    readAliases:ids=>ids[0]==='2'?aliases.promise:Promise.resolve([{workId:ids[0],aliases:[]}]),
    readLocation:context,showReady:work=>shown.push(work.workId),onError:assert.fail});
  const first=controller.open({workId:'1'}), second=controller.open({workId:'2'});
  await tick();await controller.open({workId:'3'});
  slow.resolve({workId:'1'});aliases.resolve([{workId:'2',aliases:[]}]);
  await Promise.all([first,second]);assert.deepEqual(shown,['3']);
});

test('detail departure guards every location field and suspend suppresses failures', async () => {
  for(const [key,value] of [['workspace','ranking'],['personDirectoryOpen',true],['companyDirectoryOpen',true],['home','true']]) {
    const location=context(),pending=deferred();
    const controller=createWorkDetailController({hydrateWork:()=>pending.promise,readLocation:()=>({...location}),showReady:()=>assert.fail('stale display'),onError:assert.fail});
    const task=controller.open({workId:'1'});location[key]=value;pending.resolve({workId:'1'});await task;
  }
  const pending=deferred();
  const controller=createWorkDetailController({hydrateWork:()=>pending.promise,readLocation:context,showReady:assert.fail,onError:assert.fail});
  const task=controller.open({workId:'1'});controller.suspend();pending.reject(Error('late'));await task;
});

test('detail failed aliases remain retryable; non-worker path needs no aliases', async () => {
  let calls=0; const errors=[],shown=[];
  const controller=createWorkDetailController({readAliases:async()=>++calls===1?[]:[{workId:'1',aliases:[]}],
    readLocation:context,showReady:work=>shown.push(work),onError:error=>errors.push(error.message)});
  await controller.open({workId:'1'});assert.deepEqual(errors,['作品名称资料缺失']);
  await controller.open({workId:'1'});assert.equal(shown.length,1);
  const legacy=createWorkDetailController({readLocation:context,showReady:work=>shown.push(work),onError:assert.fail});
  await legacy.open({workId:'2'});assert.equal(shown.length,2);
});

test('detail modules do not import main or recreate routing and persisted application state', async () => {
  for(const file of ['work-detail-controller.js','../views/work-detail-view.js','../views/work-version-view.js']) {
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"].*main\.js|localStorage|pushState|replaceState|new Proxy|\beval\(/);
  }
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/function showDetails\(|function renderDetailsVersions\(|detailsVersionShelfExpanded|detailHydrationSession/);
  assert.match(main,/detailPresentation\.suspend\(\)/);
});
