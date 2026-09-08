import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkspaceHostController } from './workspace-host-controller.js';
import { projectWorkbenchControls } from './workbench-control-model.js';
import { createWorkspaceHostView, createWorkbenchControlsView, WORKBENCH_CONTROL_ELEMENTS } from '../views/workbench-shell-view.js';

const state = (overrides={}) => ({workspaceMode:'selection',personDirectoryOpen:false,companyDirectoryOpen:false,...overrides});
function hostFixture(mobile=false) {
  const events=[];
  const record=name=>(...args)=>events.push([name,...args]);
  const host=createWorkspaceHostController({renderView:record('render'),isMobile:()=>mobile,setCandidatesOpen:record('candidates'),
    suspendCompany:record('company'),suspendDetails:record('details'),cancelRankingPreload:record('preload'),suspendSelection:record('selection'),suspendPerson:record('person')});
  return {host,events};
}
test('workspace transitions invalidate only presentation owners and repeated same-page renders do not resuspend',()=>{
  const {host,events}=hostFixture();host.render(state());
  assert.deepEqual(events,[['company'],['details'],['preload'],['person'],['candidates',false],['render','selection']]);
  events.length=0;host.render(state());assert.deepEqual(events,[['candidates',false],['render','selection']]);
  events.length=0;host.render(state({personDirectoryOpen:true}));
  assert.deepEqual(events,[['company'],['details'],['preload'],['selection'],['candidates',false],['render','persons']]);
  host.render(state({companyDirectoryOpen:true}));assert.equal(host.activeKey,'companies');
});
test('mobile candidate tray opens on ranking entry but not on ranking refresh, and reopens after return',()=>{
  const {host,events}=hostFixture(true);host.render(state({workspaceMode:'ranking'}));
  assert.ok(events.some(([name,value])=>name==='candidates'&&value));
  events.length=0;host.render(state({workspaceMode:'ranking'}));assert.deepEqual(events,[['render','ranking']]);
  host.render(state({companyDirectoryOpen:true}));events.length=0;host.render(state({workspaceMode:'ranking'}));
  assert.ok(events.some(([name,value])=>name==='candidates'&&value));
  const desktop=hostFixture();desktop.host.render(state({workspaceMode:'ranking'}));assert.ok(!desktop.events.some(([name])=>name==='candidates'));
});
test('directory precedence stays explicit and unknown workspace fails before any effects',()=>{
  const {host,events}=hostFixture();host.render(state({personDirectoryOpen:true,companyDirectoryOpen:true,workspaceMode:'ranking'}));
  assert.equal(host.activeKey,'persons');events.length=0;
  assert.throws(()=>host.render(state({workspaceMode:'foreign'})),/Unknown/);assert.deepEqual(events,[]);
});

const snapshot = (changes={}) => ({
  model:{state:{workspaceMode:'selection',filterState:{titleQuery:''}},selectedCount:2,rankedCount:1,unrankedCount:1,canUndo:true,canRedo:false},
  company:{selectedCompanyIds:['a','b','c'],candidateCompanyIds:['a','b','c'],rankedCount:0,canUndo:false,canRedo:true},
  rankingSubject:'work',importBusy:false,personAvailable:true,selectionMode:true,compareMode:false,
  companyDirectoryOpen:false,companySelectionMode:false,bangumiAvailable:true,annotationCount:1,pngExportInProgress:false,
  showCounts:true,showTitles:false,...changes
});
test('control projection uses the active ranking subject without changing either selection',()=>{
  const input=snapshot(),before=structuredClone(input);const work=projectWorkbenchControls(input);
  assert.equal(work.controls.undoEdit.disabled,false);assert.equal(work.controls.redoEdit.disabled,true);
  assert.equal(work.controls.exportPng.disabled,false);assert.equal(work.controls.mobileRankingCandidateCount.textContent,'1');
  const company=projectWorkbenchControls({...input,rankingSubject:'company'});
  assert.equal(company.controls.undoEdit.disabled,true);assert.equal(company.controls.redoEdit.disabled,false);
  assert.equal(company.controls.exportPng.disabled,true);assert.equal(company.controls.mobileRankingCandidateCount.textContent,'3');
  assert.equal(company.controls.selectionContextCount.textContent,'2');assert.equal(company.controls.companySelectionContextCount.textContent,'3');
  assert.deepEqual(input,before);
});
test('busy locks controls without clearing pressed modes, checks or counts and recovers original eligibility',()=>{
  const base=snapshot(),busy=projectWorkbenchControls({...base,importBusy:true});
  for(const key of ['undoEdit','redoEdit','exportPng','modeSelection','modePerson','selectionModeToggle','compareModeToggle','bangumiImportOpen','startCompanyRanking','mobileRankingUndo'])assert.equal(busy.controls[key].disabled,true,key);
  assert.equal(busy.controls.selectionModeToggle['aria-pressed'],'true');assert.equal(busy.controls.mobileRankingShowCounts.checked,true);
  assert.equal(busy.controls.mobileRankingShowTitles.checked,false);assert.equal(busy.controls.selectionContextCount.textContent,'2');
  const recovered=projectWorkbenchControls(base);assert.equal(recovered.controls.undoEdit.disabled,false);assert.equal(recovered.controls.redoEdit.disabled,true);
});
test('search, availability, zero selections, comparison and PNG busy states stay distinct',()=>{
  const base=snapshot();base.model.selectedCount=0;base.model.state.filterState.titleQuery='  搜索  ';
  const result=projectWorkbenchControls({...base,personAvailable:false,bangumiAvailable:false,compareMode:true,pngExportInProgress:true,annotationCount:0});
  assert.equal(result.controls.titleSearchClear.hidden,false);assert.equal(result.controls.mobileTitleSearchClear.hidden,false);
  assert.equal(result.controls.modePerson.disabled,true);assert.equal(result.controls.bangumiImportOpen.disabled,true);
  assert.equal(result.controls.startWorkRanking.disabled,true);assert.equal(result.controls.clearSelectedWorks.disabled,true);
  assert.equal(result.selection.mode,false);assert.equal(result.controls.browseModeToggle['aria-pressed'],'false');
  assert.equal(result.controls.clearAnnotations.disabled,true);assert.equal(result.controls.exportPng['aria-busy'],'true');
  assert.equal(result.controls.mobileRankingExportPng.disabled,true);
});
test('company selection context uses company count while work controls keep work count',()=>{
  const result=projectWorkbenchControls(snapshot({companyDirectoryOpen:true,companySelectionMode:true}));
  assert.deepEqual(result.companySelection,{mode:true,count:3});assert.equal(result.selection.mode,false);
  assert.equal(result.controls.startCompanyRanking.disabled,false);assert.equal(result.controls.compareModeToggle.disabled,true);
});

class Node {
  constructor(){this.attributes={};this.dataset={};this.hidden=false;this.inert=false;this.focused=false;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key];}
  querySelector(){return null;}
  focus(){this.focused=true;}
}
test('workspace view has exactly one current tab and visible panel on every transition',()=>{
  const tabs=Object.fromEntries(['selection','ranking','companies','persons'].map(k=>[k,new Node()]));
  const panels=Object.fromEntries(Object.keys(tabs).map(k=>[k,new Node()])),mobileSelectionView=new Node();
  const view=createWorkspaceHostView({tabs,panels,mobileSelectionView});
  for(const key of ['selection','persons','companies','ranking','selection']) {
    view.render(key);assert.deepEqual(Object.keys(panels).filter(k=>!panels[k].hidden),[key]);
    assert.deepEqual(Object.keys(tabs).filter(k=>tabs[k].tabIndex===0),[key]);
    assert.deepEqual(Object.keys(tabs).filter(k=>tabs[k].getAttribute('aria-selected')==='true'),[key]);assert.equal(mobileSelectionView.hidden,true);
  }
});
test('control view updates DOM and selection focus using projection without event registration',()=>{
  const elements=Object.fromEntries(WORKBENCH_CONTROL_ELEMENTS.map(key=>[key,new Node()]));
  const cards=[new Node()],scales=[new Node()],selected=new Node();
  const view=createWorkbenchControlsView({elements,cardDisplayInputs:cards,scaleInputs:scales,selectedWorksToggle:selected});
  view.setBusy(true);assert.equal(elements.selectionView.inert,true);view.render(projectWorkbenchControls(snapshot({importBusy:true})));
  assert.equal(cards[0].disabled,true);assert.equal(scales[0].disabled,true);assert.equal(elements.selectionContextBar.hidden,false);
  const empty=snapshot();empty.model.selectedCount=0;selected.ownerDocument={activeElement:selected};
  view.setBusy(false);view.render(projectWorkbenchControls(empty));
  assert.equal(elements.selectionView.inert,false);assert.equal(cards[0].disabled,false);
  assert.equal(elements.selectionModeToggle.focused,true);assert.equal(selected.hidden,true);assert.equal(elements.selectionContextBar.dataset.empty,'true');
  assert.equal(elements.mobileRankingExportPng.disabled,elements.exportPng.disabled);
});
test('shell modules cannot become a second routing, storage or data owner',async()=>{
  for(const file of ['workspace-host-controller.js','workbench-control-model.js','../views/workbench-shell-view.js']) {
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/from ['"].*main\.js|localStorage|pushState|replaceState|fetch\(|clearFilters|clearSelection|createAppController|addEventListener/);
  }
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/activeWorkspaceKey|rankingWorkspaceVisible/);
  assert.match(main,/workbenchControls\.render\(projectWorkbenchControls/);
});
