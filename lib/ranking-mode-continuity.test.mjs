import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingPresentation, createImmersiveController } from './ranking-presentation.js';
test('normal/live inherit once, then retain independent scales and content across reload',()=>{
  let saved=null;const io={read:()=>saved,write:(_,s)=>saved=s};const p=createRankingPresentation(io);
  p.setUiScale('card',110);p.setViewMode('live');assert.equal(p.inspect().uiScale.card,110);
  p.setUiScale('card',150);p.setShowTitles(true);p.setViewMode('normal');
  assert.equal(p.inspect().uiScale.card,110);assert.equal(p.inspect().showTitles,false);
  p.setViewMode('live');assert.equal(p.inspect().uiScale.card,150);
  const next=createRankingPresentation(io);assert.equal(next.inspect().uiScale.card,110);
  next.setViewMode('live');assert.equal(next.inspect().uiScale.card,150);assert.equal(next.inspect().showTitles,true);
});
test('style/shape are shared, new live style does not overwrite normal defaults, annotations stay shared',()=>{
  const p=createRankingPresentation({read:()=>null,write:()=>{}});
  p.setViewMode('live');p.setDisplayStyle('classic');p.setDisplayShape('contain');p.setUiScale('card',150);p.setAnnotation('w1','shared');
  p.setViewMode('normal');assert.equal(p.inspect().display.style,'classic');assert.equal(p.inspect().display.shape,'contain');assert.equal(p.inspect().uiScale.card,100);
  assert.equal(p.inspect().annotations.w1,'shared');p.setViewMode('live');assert.equal(p.inspect().uiScale.card,150);
  p.syncViewMode();p.setViewMode('normal');assert.equal(p.inspect().uiScale.card,150);
});
test('old preferences migrate without destroying normal settings',()=>{
  const p=createRankingPresentation({read:()=>JSON.stringify({uiScale:{card:125},showTitles:true}),write:()=>{}});
  p.setViewMode('live');p.setUiScale('card',80);p.setViewMode('normal');assert.equal(p.inspect().uiScale.card,125);assert.equal(p.inspect().showTitles,true);
});
test('immersive entry does not force fullscreen, browser fullscreen exit does not leave live, handled Esc is ignored',async()=>{
  class Node extends EventTarget { hidden=true; tabIndex=0; textContent='';setAttribute(){}contains(){return false;}focus(){} }
  const nodes=Object.fromEntries(['ranking-immersive-edge','ranking-immersive-controls','ranking-immersive-exit','ranking-live-toggle','ranking-live-fullscreen'].map(id=>[id,new Node()]));
  const classes=new Set(),root=new Node(),doc=new Node();let requests=0;const changes=[];
  root.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)};
  root.requestFullscreen=async()=>requests++;doc.getElementById=id=>nodes[id];doc.querySelector=()=>null;
  const c=createImmersiveController({root,documentRef:doc,onChange:v=>changes.push(v)});
  await c.enter();assert.equal(requests,0);doc.dispatchEvent(new Event('fullscreenchange'));assert.equal(classes.size,1);
  const esc=new Event('keydown',{cancelable:true});Object.defineProperty(esc,'key',{value:'Escape'});esc.preventDefault();doc.dispatchEvent(esc);assert.equal(classes.size,1);
  nodes['ranking-live-fullscreen'].dispatchEvent(new Event('click'));assert.equal(requests,1);
  await c.exit();assert.deepEqual(changes,[true,false]);
});
