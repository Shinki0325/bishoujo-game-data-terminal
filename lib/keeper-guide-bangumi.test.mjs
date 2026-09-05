import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveKeeperGuide } from './keeper-guide-rules.js';
import { createKeeperPreferences } from './keeper-guide-preferences.js';
const input={id:'bangumi.input',ready:true,restored:true,p1Enabled:true,importDialogOpen:true,importPhase:'input'};
test('P1 requires actual active phase, ready state and explicit flag',()=>{
  assert.equal(resolveKeeperGuide(input).expression,'neutral');
  for(const delta of [{ready:false},{restored:false},{p1Enabled:false},{importDialogOpen:false},{importPhase:'loading'},{importPhase:'error'},{importPhase:'result'},{busy:true},{topOverlay:true},{live:true}]) assert.equal(resolveKeeperGuide({...input,...delta}),null);
});
test('result guidance never claims append success or supplies business actions',()=>{
  const guide=resolveKeeperGuide({...input,id:'bangumi.result',importPhase:'result'});
  assert.equal(guide.expression,'smile');assert.equal(guide.actionId,null);
  assert.match(guide.summary,/确认后只追加/);
});
test('P1 preferences and lifecycle remain isolated and preserve base text',()=>{
  const store=createKeeperPreferences({storage:null});
  store.dismiss('bangumi.input');
  assert.equal(resolveKeeperGuide(input,store.get()).showEnhancement,false);
  assert.equal(resolveKeeperGuide({...input,id:'bangumi.result',importPhase:'result'},store.get()).showEnhancement,true);
  store.complete('bangumi.result');assert.equal(store.get().completed['bangumi.result'],1);
  store.setPreference('illustrations',false);store.reset();
  assert.equal(resolveKeeperGuide(input,store.get()).showPortrait,false);
  assert.equal(resolveKeeperGuide(input,store.get()).showEnhancement,true);
  store.setPreference('autoTips',false);assert.equal(resolveKeeperGuide(input,store.get()).showEnhancement,false);
});
