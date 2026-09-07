import test from 'node:test';
import assert from 'node:assert/strict';
import { createBangumiImportController } from './bangumi-import-controller.js';
const keys=["bangumiPublicImportDialog","bangumiPublicImportStatus","bangumiPublicImportList","bangumiPublicImportCapacity","bangumiPublicImportAppend","bangumiPublicImportSelectionStatus","bangumiPublicImportResults","bangumiPublicUnmatchedList","bangumiPublicImportUnmatched","bangumiPublicTotal","bangumiPublicMatchedSubjects","bangumiPublicMappedWorks","bangumiPublicUnmatched","bangumiPublicUnmatchedCount","bangumiPublicFetch","bangumiPublicUserInput","bangumiImportOpen","mobileBangumiImportOpen","bangumiPublicImportForm","bangumiPublicImportCancel"];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class Element extends EventTarget {
  constructor(document){super();this.ownerDocument=document;this.children=[];this.dataset={};this.value='';this.textContent='';this.open=false;this.hidden=false;this.disabled=false;this.attributes={};this.focuses=0;this.classList={toggle(){},add(){}};}
  setAttribute(k,v){this.attributes[k]=v;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  querySelectorAll(){return this.children.flatMap(node=>[node,...node.querySelectorAll()]).filter(node=>node.type==='checkbox'&&node.checked&&!node.disabled);}
  focus(){this.focuses++;}
}
function setup(overrides={}) {
  const document={defaultView:{setTimeout,clearTimeout},createElement(){return new Element(document);},createDocumentFragment(){return new Element(document);}};
  const elements=Object.fromEntries(keys.map(key=>[key,new Element(document)]));
  const phases=[],completed=[],appended=[],signals=[];let current=[];
  const plan={matched:[{subjectId:'42',collectionType:2,personalRate:null,primaryWorkIds:['w1'],optionalWorkIds:[],alreadySelectedPrimaryWorkIds:[],alreadySelectedOptionalWorkIds:[]}],
    unmatched:[],availableSlots:2,matchedSubjectCount:1,mappedWorkCount:1,unmatchedSubjectCount:0};
  const api={collectionTypeLabel:()=> '已玩',BangumiPublicImportError:class extends Error {},
    fetchBangumiPublicGameCollections:async({signal})=>{signals.push(signal);return {collections:[],reportedTotal:1};},
    planBangumiPublicImport:()=>plan};
  const controller=createBangumiImportController({elements,loadImportModule:async()=>api,confirmedBindings:[],getSelectedWorkIds:()=>current,workLimit:2,
    titleForWork:()=> '测试作品',familyForWork:()=>null,isBusy:()=>false,onPhase:p=>phases.push(p),renderGuidance(){},
    completeGuide:id=>completed.push(id),appendWorks:ids=>{appended.push(ids);return true;},onSuccess(){},onOpen(){},onClose(){},
    closeDialog:d=>{d.open=false;},showDialog:d=>{d.open=true;},...overrides});
  return {controller,elements,api,plan,phases,completed,appended,signals,setCurrent:v=>{current=v;}};
}
test('Bangumi open/read/append owns UI state but appends through the existing candidate owner',async()=>{
  const f=setup();assert.equal(f.controller.open(),true);
  await f.controller.read();assert.equal(f.elements.bangumiPublicMappedWorks.textContent,'1');
  assert.equal(f.elements.bangumiPublicImportAppend.disabled,false);
  f.elements.bangumiPublicImportAppend.dispatchEvent(new Event('click'));
  assert.deepEqual(f.appended,[['w1']]);assert.ok(f.completed.includes('bangumi.result'));
  assert.equal(f.elements.bangumiPublicImportDialog.open,false);f.controller.dispose();
});
test('capacity is checked again at append time and never replaces existing ranking state',async()=>{
  const f=setup();f.controller.open();await f.controller.read();f.setCurrent(['old1','old2']);
  f.elements.bangumiPublicImportAppend.dispatchEvent(new Event('click'));
  assert.deepEqual(f.appended,[]);assert.equal(f.elements.bangumiPublicImportAppend.disabled,true);
  assert.match(f.elements.bangumiPublicImportSelectionStatus.textContent,/只剩 0/);f.controller.dispose();
});
test('closing aborts private reads; a late successful response cannot revive the result panel',async()=>{
  const f=setup(),pending=deferred();let signal;
  f.api.fetchBangumiPublicGameCollections=async input=>{signal=input.signal;return pending.promise;};
  f.controller.open();const read=f.controller.read();await Promise.resolve();f.controller.close();
  assert.equal(signal.aborted,true);pending.resolve({collections:[],reportedTotal:1});await read;
  assert.equal(f.elements.bangumiPublicImportResults.hidden,true);assert.equal(f.elements.bangumiPublicImportStatus.textContent,'');
  f.controller.dispose();
});
test('queued native close does not reset a reopened import; dispose prevents new work',async()=>{
  const f=setup();f.controller.open();f.controller.close();f.controller.open();await f.controller.read();
  f.elements.bangumiPublicImportDialog.dispatchEvent(new Event('close'));
  assert.equal(f.elements.bangumiPublicImportResults.hidden,false);
  f.controller.dispose();f.controller.dispose();assert.equal(f.controller.open(),false);
  const count=f.signals.length;await f.controller.read();assert.equal(f.signals.length,count);
});
test('late title enrichment is ignored after close and unresolved bindings make no request',async()=>{
  const titles=deferred();let arrived;const started=new Promise(r=>arrived=r);
  const f=setup({readTitles:()=>{arrived();return titles.promise;}});
  f.controller.open();const read=f.controller.read();await started;f.controller.close();
  titles.resolve([{workId:'w1',title:'不应显示'}]);await read;assert.equal(f.elements.bangumiPublicImportResults.hidden,true);f.controller.dispose();
  let calls=0;const missing=setup({confirmedBindings:null,loadImportModule:async()=>{calls++;}});
  missing.controller.open();await missing.controller.read();assert.equal(calls,0);assert.match(missing.elements.bangumiPublicImportStatus.textContent,/无法安全导入/);missing.controller.dispose();
});
