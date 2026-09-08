import test from 'node:test';
import assert from 'node:assert/strict';
import {createRankingExportController, estimatePngBytes} from './ranking-export-controller.js';
import {createRankingExportView, formatEstimatedPngSize} from '../views/ranking-export-view.js';
import {rankingInteractionKey} from '../views/ranking-view.js';

test('media-only hydration retains an interaction; order, identity, tier and query changes invalidate it',()=>{
  const model={candidateTitleQuery:'',tiers:[{id:'s',name:'S',colorId:'crimson',works:[]}],candidateWorks:[{workId:'1',title:'One'}]};
  const key=rankingInteractionKey(model);
  assert.equal(rankingInteractionKey({...model,candidateWorks:[{...model.candidateWorks[0],coverPath:'new.webp'}]}),key);
  assert.notEqual(rankingInteractionKey({...model,candidateTitleQuery:'one'}),key);
  assert.notEqual(rankingInteractionKey({...model,tiers:[{...model.tiers[0],name:'First'}]}),key);
  assert.notEqual(rankingInteractionKey({...model,candidateWorks:[{workId:'2',title:'Two'}]}),key);
});

class Node extends EventTarget {
  value='standard';open=false;disabled=false;textContent='';focused=false;
  click(){this.dispatchEvent(new Event('click'));}
  showModal(){this.open=true;}
  close(){this.open=false;}
  focus(){this.focused=true;}
}
function fixture({preview=async()=>({rankedCount:2,width:800,height:600,columns:4}),storage,isBusy}={}) {
  const nodes=Object.fromEntries(['ranking-export-dialog','ranking-export-options','mobile-ranking-export-png','ranking-live-export',
    '[data-ranking-export-quality]','[data-export-summary]','[data-export-confirm]','[data-export-close]','[data-export-retry]','[data-export-json]'].map(k=>[k,new Node()]));
  nodes['ranking-export-dialog'].querySelector=s=>nodes[s];
  const counts={preview:0,png:0,json:0};
  const api=createRankingExportView({documentRef:{getElementById:id=>nodes[id]},storage,isBusy,
    preview:()=>{counts.preview++;return preview();},png:()=>counts.png++,json:()=>counts.json++});
  return {api,nodes,counts};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('an in-progress export is explained without closing the dialog or duplicating work',async()=>{
  let busy=true;const f=fixture({isBusy:()=>busy});f.nodes['ranking-export-options'].click();await settle();
  f.nodes['[data-export-confirm]'].click();assert.equal(f.counts.png,0);assert.equal(f.nodes['ranking-export-dialog'].open,true);
  assert.match(f.nodes['[data-export-summary]'].textContent,/等待/);busy=false;f.nodes['[data-export-confirm]'].click();assert.equal(f.counts.png,1);f.api.dispose();
});
test('export settings are lazy, show dimensions, and confirmation exports once',async()=>{
  const f=fixture();assert.equal(f.counts.preview,0);f.nodes['ranking-export-options'].click();await settle();
  assert.match(f.nodes['[data-export-summary]'].textContent,/800 × 600/);assert.equal(f.counts.png,0);
  f.nodes['[data-export-confirm]'].click();assert.equal(f.counts.png,1);assert.equal(f.nodes['ranking-export-dialog'].open,false);
  assert.equal(f.nodes['ranking-export-options'].focused,true);f.api.dispose();
});
test('empty board cannot export and JSON remains a distinct action',async()=>{
  const f=fixture({preview:async()=>({rankedCount:0})});f.nodes['mobile-ranking-export-png'].click();await settle();
  assert.equal(f.nodes['[data-export-confirm]'].disabled,true);f.nodes['[data-export-confirm]'].click();assert.equal(f.counts.png,0);
  f.nodes['[data-export-json]'].click();assert.equal(f.counts.json,1);f.api.dispose();
});
test('quality persists and denied storage does not break export UI',async()=>{
  const writes=[],f=fixture({storage:{getItem:()=> 'high',setItem:(...a)=>writes.push(a)}});
  assert.equal(f.nodes['[data-ranking-export-quality]'].value,'high');f.nodes['ranking-live-export'].click();await settle();
  f.nodes['[data-ranking-export-quality]'].value='standard';f.nodes['[data-ranking-export-quality]'].dispatchEvent(new Event('change'));await settle();
  assert.equal(writes[0][1],'standard');f.api.dispose();
  const denied=fixture({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
  denied.nodes['ranking-export-options'].click();await settle();assert.equal(denied.nodes['[data-export-confirm]'].disabled,false);denied.api.dispose();
});
test('closed or obsolete export preview cannot overwrite current dialog',async()=>{
  const pending=[];const f=fixture({preview:()=>new Promise(resolve=>pending.push(resolve))});
  f.nodes['ranking-export-options'].click();f.nodes['[data-export-close]'].click();f.nodes['ranking-export-options'].click();
  pending[1]({rankedCount:1,width:100,height:200,columns:1});await settle();
  pending[0]({rankedCount:5,width:999,height:999,columns:8});await settle();assert.match(f.nodes['[data-export-summary]'].textContent,/100 × 200/);f.api.dispose();
});
test('preview failure is retryable; cancel makes no export and dispose unbinds',async()=>{
  let fail=true;const f=fixture({preview:async()=>{if(fail)throw Error('failed');return {rankedCount:1,width:100,height:200,columns:1};}});
  f.nodes['ranking-export-options'].click();await settle();assert.match(f.nodes['[data-export-summary]'].textContent,/重试/);
  fail=false;f.nodes['[data-export-retry]'].click();await settle();assert.equal(f.nodes['[data-export-confirm]'].disabled,false);
  f.nodes['ranking-export-dialog'].dispatchEvent(new Event('cancel',{cancelable:true}));assert.equal(f.counts.png,0);
  f.api.dispose();f.nodes['ranking-export-options'].click();assert.equal(f.nodes['ranking-export-dialog'].open,false);
});
test('export geometry preview uses the clicked snapshot without starting a PNG job',async()=>{
  let planned=0;const state={tiers:[{id:'s'}]},tierOrder={s:['1']};
  const controller=createRankingExportController({pngSnapshot:()=>({rankedCount:1,company:true,state,tierOrder,worksById:new Map(),presentation:{}}),
    planPng:async options=>{planned++;assert.equal(options.tierOrder,tierOrder);return {pixelWidth:296,pixelHeight:864,columns:1};}});
  assert.deepEqual(await controller.preview(),{rankedCount:1,width:296,height:864,columns:1,estimatedBytes:estimatePngBytes({pixelWidth:296,pixelHeight:864})});assert.equal(controller.busy,false);assert.equal(planned,1);
});

test('file estimate counts cover area separately from blank rows, and scales with resolution',()=>{
  const plan={pixelWidth:800,pixelHeight:600,pixelRatio:1,tiers:[{items:[{width:160,height:160,titleStrip:{height:0}}]}]};
  const normal=estimatePngBytes(plan),high=estimatePngBytes({...plan,pixelWidth:1600,pixelHeight:1200,pixelRatio:2});
  assert.ok(normal.min>0&&normal.max>normal.min);assert.ok(high.min>normal.min&&high.max>normal.max);
  const blank=estimatePngBytes({...plan,tiers:[]});assert.ok(blank.max<normal.max);
  assert.ok(normal.max<800*600*4);assert.equal(estimatePngBytes({pixelWidth:0,pixelHeight:2}),null);
  assert.match(formatEstimatedPngSize(normal),/预计 PNG 大小：约 .* KB/);
  assert.equal(formatEstimatedPngSize({min:1200000,max:2800000}),'预计 PNG 大小：约 1.2–2.8 MB');
});
test('preview includes file estimate and only errors expose retry',async()=>{
  const f=fixture({preview:async()=>({rankedCount:2,width:800,height:600,columns:4,estimatedBytes:{min:1200000,max:2800000}})});
  f.nodes['ranking-export-options'].click();await settle();
  assert.match(f.nodes['[data-export-summary]'].textContent,/1.2–2.8 MB/);assert.equal(f.nodes['[data-export-retry]'].hidden,true);f.api.dispose();
  const failed=fixture({preview:async()=>{throw Error('network');}});failed.nodes['ranking-export-options'].click();await settle();
  assert.equal(failed.nodes['[data-export-retry]'].hidden,false);failed.api.dispose();
});
test('known limits explain corrective action instead of useless retry',async()=>{
  for(const code of ['TIER_ORDER_TOO_LARGE','CANVAS_BUDGET_EXCEEDED']){
    const f=fixture({preview:async()=>{throw Object.assign(Error('limit'),{code});}});f.nodes['ranking-export-options'].click();await settle();
    assert.match(f.nodes['[data-export-summary]'].textContent,/减少/);assert.equal(f.nodes['[data-export-confirm]'].disabled,true);
    assert.equal(f.nodes['[data-export-retry]'].hidden,true);f.api.dispose();
  }
});
