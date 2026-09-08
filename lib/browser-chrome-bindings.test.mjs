import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWorkbenchNavigation } from '../views/workbench-chrome.js';
import { loadImageUrl } from './browser-cover-loader.js';
import { createRankingControlsView } from '../views/ranking-controls-view.js';
test('navigation bridge calls existing route owner, preserves arrow semantics and disposes listeners',()=>{
  const windowRef=new EventTarget(),tabs=[new EventTarget(),new EventTarget()];let busy=false,applies=0;
  const counts=[{click:0,focus:0},{click:0,focus:0}];
  tabs.forEach((tab,i)=>{tab.click=()=>counts[i].click++;tab.focus=()=>counts[i].focus++;});
  const life=connectWorkbenchNavigation({windowRef,tabs,isBusy:()=>busy,applyLocation:()=>applies++});
  windowRef.dispatchEvent(new Event('popstate'));windowRef.dispatchEvent(new Event('hashchange'));assert.equal(applies,2);
  const key=()=>Object.assign(new Event('keydown',{cancelable:true}),{key:'ArrowRight'});
  const event=key();tabs[0].dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.deepEqual(counts[1],{click:1,focus:1});
  busy=true;tabs[0].dispatchEvent(key());assert.equal(counts[1].click,1);
  life.dispose();busy=false;tabs[0].dispatchEvent(key());windowRef.dispatchEvent(new Event('popstate'));
  assert.equal(applies,2);assert.equal(counts[1].click,1);
});
function imageFixture() {
  const image=new EventTarget();image.naturalWidth=100;image.naturalHeight=80;image.decode=async()=>{};
  return image;
}
test('cover loading preserves anonymous cross-origin and awaits valid decoded dimensions',async()=>{
  const image=imageFixture(),read=loadImageUrl('https://example.test/a.webp',{createImage:()=>image});
  assert.equal(image.src,'https://example.test/a.webp');assert.equal(image.crossOrigin,'anonymous');assert.equal(image.referrerPolicy,'no-referrer');
  image.dispatchEvent(new Event('load'));assert.equal(await read,image);
});
test('blob images can omit cross-origin; bad URLs, dimensions, decoding and load errors reject',async()=>{
  await assert.rejects(loadImageUrl(''),/unavailable/);
  for(const kind of ['dimensions','decode','error']) {
    const image=imageFixture();
    if(kind==='dimensions')image.naturalWidth=0;if(kind==='decode')image.decode=async()=>{throw Error('decode');};
    const read=loadImageUrl('blob:test',{crossOrigin:null,createImage:()=>image});assert.equal(image.crossOrigin,undefined);
    image.dispatchEvent(new Event(kind==='error'?'error':'load'));await assert.rejects(read);
  }
});

test('ranking controls preserve scale, lazy resize, subject-aware flags, mobile mirrors and cleanup',()=>{
  class Node extends EventTarget {
    value='100';checked=false;clicks=0;attributes=new Map();
    click(){this.clicks++;this.dispatchEvent(new Event('click'));}
    setAttribute(k,v){this.attributes.set(k,v);}
  }
  const names=['rankingScaleOverall','rankingScaleOverallOutput','rankingScaleCard','rankingScaleCardOutput',
    'rankingScaleRail','rankingScaleRailOutput','rankingScaleAnnotation','rankingScaleAnnotationOutput','rankingScaleTierName','rankingScaleTierNameOutput',
    'rankingScaleReset','mobileRankingCandidates','mobileRankingCandidatesLabel','mobileRankingMenu','rankingCoachmarkDismiss','rankingCoachmark',
    'rankingShowCounts','rankingShowTitles','mobileRankingUndo','undoEdit','mobileRankingRedo','redoEdit','mobileRankingMore',
    'mobileRankingShowCounts','mobileRankingShowTitles','mobileRankingImport','importState','mobileRankingExport','exportState',
    'mobileRankingExportPng','exportPng','mobileRankingClearBoard','clearBoard','mobileRankingClearCandidates','clearCandidates',
    'mobileRankingClearAnnotations','clearAnnotations','rankingImmersive'];
  const elements=Object.fromEntries(names.map(n=>[n,new Node()]));
  const css=new Map(),classes=new Set(),frames=new Map();let seq=0,refreshes=0,subject='work',entered=0;
  const documentRef=new EventTarget();documentRef.documentElement={style:{setProperty:(k,v)=>css.set(k,v)}};
  documentRef.body={classList:{contains:k=>classes.has(k),toggle(k,v){if(v===undefined)v=!classes.has(k);if(v)classes.add(k);else classes.delete(k);}}};
  documentRef.querySelector=()=>null;
  const windowRef=new EventTarget();windowRef.Event=Event;
  windowRef.requestAnimationFrame=fn=>{frames.set(++seq,fn);return seq;};windowRef.cancelAnimationFrame=id=>frames.delete(id);
  const uiScale={overall:100,card:100,rail:100,annotation:100,tierName:100};
  const presentation={inspect:()=>({uiScale}),setUiScale:(key,value)=>uiScale[key]=Number(value),resetUiScale:()=>Object.keys(uiScale).forEach(k=>uiScale[k]=100)};
  const selected=[];const active=()=>({setShowCounts:value=>{selected.push([subject,'counts',value]);return value;},setShowTitles:value=>{selected.push([subject,'titles',value]);return value;}});
  const restored=[];
  const ranking={refreshLayout:()=>refreshes++,setShowCounts(){},setShowTitles(){},captureScroll:()=>({top:450}),restoreScroll:position=>restored.push(position)};
  const view=createRankingControlsView({elements,scalePresentation:presentation,activePresentation:active,subject:()=>subject,
    getRankingView:()=>ranking,enterImmersive:()=>entered++,documentRef,windowRef});
  assert.equal(view.scaleInputs.length,5);assert.equal(view.scaleInputs[0],elements.rankingScaleOverall);
  elements.rankingScaleOverall.value='115';elements.rankingScaleOverall.dispatchEvent(new Event('input'));
  assert.equal(css.get('--ranking-ui-scale-overall'),'1.15');elements.rankingScaleReset.click();assert.equal(uiScale.overall,100);
  const before=refreshes;windowRef.dispatchEvent(new Event('resize'));windowRef.dispatchEvent(new Event('resize'));
  assert.equal(frames.size,1);for(const fn of frames.values())fn();frames.clear();assert.equal(refreshes,before+1);
  subject='company';elements.mobileRankingShowTitles.checked=true;elements.mobileRankingShowTitles.dispatchEvent(new Event('change'));
  assert.equal(elements.rankingShowTitles.checked,true);assert.deepEqual(selected.at(-1),['company','titles',true]);
  elements.mobileRankingUndo.click();assert.equal(elements.undoEdit.clicks,1);
  view.setCandidatesOpen(true);assert.equal(elements.mobileRankingCandidates.attributes.get('aria-label'),'收起候选会社');
  documentRef.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'}));assert.equal(classes.has('is-mobile-ranking-candidates-open'),false);
  elements.rankingImmersive.click();assert.equal(entered,1);
  view.setImmersive(true);view.setImmersive(false);
  for(let i=0;i<2;i++){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();}
  assert.deepEqual(restored,[{top:450}]);
  windowRef.dispatchEvent(new Event('resize'));view.dispose();
  assert.equal(frames.size,0);elements.mobileRankingUndo.click();assert.equal(elements.undoEdit.clicks,1);
});
