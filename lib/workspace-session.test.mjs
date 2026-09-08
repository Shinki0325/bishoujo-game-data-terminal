import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createViewLifetime} from './view-lifetime.js';
import {createWorkspaceSession} from './workspace-session.js';

test('lifetime cleans up once, in reverse order',()=>{
  const life=createViewLifetime(),calls=[];
  life.add(()=>calls.push('first'));life.add(()=>calls.push('second'));
  life.dispose();life.dispose();assert.deepEqual(calls,['second','first']);assert.equal(life.disposed,true);
});
test('manual release removes its cleanup and is idempotent',()=>{
  const life=createViewLifetime();let calls=0;
  const remove=life.add(()=>calls++);remove();remove();life.dispose();assert.equal(calls,1);
});
test('late registrations cannot revive a disposed lifetime',()=>{
  const life=createViewLifetime(),target=new EventTarget();let calls=0;
  life.dispose();life.add(()=>calls++);life.listen(target,'change',()=>calls++);
  target.dispatchEvent(new Event('change'));assert.equal(calls,1);
});
test('listener capture is snapshotted and options are forwarded',()=>{
  const life=createViewLifetime(),seen=[];const options={capture:true,passive:true};const callback=()=>{};
  const target={addEventListener(...args){seen.push(args);},removeEventListener(...args){seen.push(args);}};
  life.listen(target,'click',callback,options);options.capture=false;life.dispose();
  assert.equal(seen[0][2],options);assert.deepEqual(seen[1],['click',callback,true]);
});
test('failing cleanup does not skip remaining cleanup',()=>{
  const life=createViewLifetime(),calls=[];life.add(()=>calls.push('done'));life.add(()=>{throw Error('bad');});
  assert.throws(()=>life.dispose(),AggregateError);assert.deepEqual(calls,['done']);assert.doesNotThrow(()=>life.dispose());
});
test('invalid cleanup is rejected',()=>assert.throws(()=>createViewLifetime().add(null),TypeError));
test('idle/loading/ready/empty/error are distinct frozen observations',()=>{
  const session=createWorkspaceSession();assert.equal(session.inspect().status,'idle');
  const task=session.begin('persons');assert.equal(session.inspect().status,'loading');task.complete();assert.equal(session.inspect().status,'ready');
  task.complete({empty:true});assert.equal(session.inspect().status,'empty');const error=Error('offline');task.fail(error);assert.equal(session.inspect().status,'error');assert.equal(session.inspect().error,error);assert.equal(Object.isFrozen(session.inspect()),true);
});
test('cross-page switch aborts and invalidates the previous UI ticket',()=>{
  const session=createWorkspaceSession(),old=session.begin('persons');let calls=0;
  const callback=old.guard(()=>calls++);callback();const next=session.begin('companies');callback();
  assert.equal(calls,1);assert.equal(old.signal.aborted,true);assert.equal(old.isCurrent(),false);assert.equal(next.isCurrent(),true);assert.equal(old.complete(),false);assert.equal(old.fail(Error('late')),false);assert.equal(session.inspect().key,'companies');
});
test('same-page navigation also invalidates previous work',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons'),b=session.begin('persons');
  assert.equal(a.isCurrent(),false);assert.equal(b.isCurrent(),true);
});
test('leaving and re-entering the same page cannot resurrect an old callback',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');let calls=0;const callback=a.guard(()=>calls++);
  session.suspend();session.begin('persons');callback();assert.equal(calls,0);
});
test('suspend disposes page UI but allows a new visit',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');let cleaned=0;a.scope.add(()=>cleaned++);
  session.suspend();session.suspend();assert.equal(cleaned,1);assert.equal(session.isActive('persons'),false);assert.equal(session.inspect().status,'idle');assert.equal(session.begin('persons').isCurrent(),true);
});
test('dispose is final and does not permit later entry',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');session.dispose();session.dispose();
  assert.equal(a.signal.aborted,true);assert.equal(session.disposed,true);assert.throws(()=>session.begin('persons'),/disposed/);
});
test('cleanup exception still leaves ticket invalid and aborts signal',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');a.scope.add(()=>{throw Error('cleanup');});
  assert.throws(()=>session.suspend(),AggregateError);assert.equal(a.signal.aborted,true);assert.equal(a.isCurrent(),false);assert.equal(session.begin('companies').isCurrent(),true);
});
test('reentrant begin during cleanup is rejected without leaking a new owner',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');a.scope.add(()=>session.begin('unexpected'));
  assert.throws(()=>session.begin('companies'),AggregateError);assert.equal(session.inspect().key,null);assert.equal(session.begin('companies').isCurrent(),true);
});
test('invalid key does not cancel a valid page',()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');assert.throws(()=>session.begin(''),TypeError);assert.equal(a.isCurrent(),true);assert.throws(()=>a.guard(null),TypeError);
});
test('shared successful load may finish for a new observer after the first leaves',async()=>{
  const session=createWorkspaceSession();let resolve;const shared=new Promise(done=>resolve=done);let oldWrites=0,newWrites=0;
  const a=session.begin('persons');const one=shared.then(a.guard(()=>oldWrites++));session.suspend();
  const b=session.begin('persons');const two=shared.then(b.guard(()=>newWrites++));resolve('same cached data');await Promise.all([one,two]);assert.equal(oldWrites,0);assert.equal(newWrites,1);
});
test('late failure cannot poison current state and a new attempt may succeed',async()=>{
  const session=createWorkspaceSession(),a=session.begin('persons');let reject;const old=new Promise((_,fail)=>reject=fail).catch(error=>a.fail(error));
  const b=session.begin('companies');b.complete();reject(Error('old failure'));assert.equal(await old,false);assert.equal(session.inspect().status,'ready');
  const retry=session.begin('persons');retry.complete();assert.equal(session.inspect().status,'ready');
});
test('generic lifecycle layer cannot depend on business or browser DOM',async()=>{
  for(const file of ['view-lifetime.js','workspace-session.js']){
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(document|window|localStorage|indexedDB|fetch)\b|main\.js|runtime-config|\/views\//);
    const imports=[...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]);
    assert.ok(imports.every(path=>['./view-lifetime.js','./runtime-diagnostics.js'].includes(path)));
  }
});
test('directory uses public session guards without importing the whole workbench',async()=>{
  const source=await readFile(new URL('directory-workspaces.js',import.meta.url),'utf8');
  assert.match(source,/createWorkspaceSession/);assert.match(source,/ticket\.scope\.add/);assert.match(source,/ticket\.guard/);
  assert.doesNotMatch(source,/\bfetch\s*\(|from ['"].*main\.js|import\(['"].*main\.js|new Worker|generation/);
});
