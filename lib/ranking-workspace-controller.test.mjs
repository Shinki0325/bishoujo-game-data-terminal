import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIERS } from './tier-palette.js';
import { createRankingWorkspaceController, projectCompanyRankingItems } from './ranking-workspace-controller.js';
import { createCompanyRankingCard } from '../views/company-ranking-card.js';

function fixture() {
  const calls=[],state={tiers:[...DEFAULT_TIERS],tierOrder:{'tier-s':['w']}},company={tiers:[...DEFAULT_TIERS],selectedCompanyIds:['c'],tierOrder:{'tier-s':['c','d']}};
  const f={subject:'work',busy:false,confirmed:true,changed:true,calls,state,company};
  const record=(name)=>(...args)=>{calls.push([name,...args]);return f.changed;};
  const works={inspectState:()=>state,...Object.fromEntries(['moveToTier','moveToUnranked','deselectWorks','moveCandidatesToTier','undo','redo'].map(k=>[k,record('work:'+k)])),saveTierConfig:tiers=>{calls.push(['work:tiers',tiers]);state.tiers=tiers;return true;}};
  const companies={inspect:()=>company,...Object.fromEntries(['moveToTier','moveToCandidates','toggle','removeMany','moveMany','undo','redo'].map(k=>[k,record('company:'+k)])),setTiers:tiers=>{calls.push(['company:tiers',tiers]);company.tiers=tiers;return true;}};
  f.actions=createRankingWorkspaceController({works,companies,getSubject:()=>f.subject,commit:change=>f.busy?false:change(),confirm:message=>{calls.push(['confirm',message]);return f.confirmed;},createId:()=> 'new-tier',focusTier:record('focus'),completeFirstDrag:record('firstDrag')});
  return f;
}
test('moves target only the active board and work onboarding runs only after a successful move',()=>{
  const f=fixture();f.actions.moveToTier('w','tier-s',1);assert.deepEqual(f.calls,[['work:moveToTier','w','tier-s',1],['firstDrag']]);
  f.calls.length=0;f.subject='company';f.actions.moveToTier('c','tier-s',2);assert.deepEqual(f.calls,[['company:moveToTier','c','tier-s',2]]);
  f.calls.length=0;f.subject='work';f.changed=false;f.actions.moveToTier('w','tier-s',0);assert.equal(f.calls.length,1);
});
test('candidate removal, return, undo and redo retain their existing state owner',()=>{
  for(const subject of ['work','company']){
    const f=fixture();f.subject=subject;
    f.actions.moveToUnranked('a');f.actions.removeCandidate('b');f.actions.removeCandidates(['c','d']);f.actions.undo();f.actions.redo();
    assert.ok(f.calls.every(([name])=>name.startsWith(subject+':')));
    assert.equal(f.calls.at(-2)[0],subject+':undo');assert.equal(f.calls.at(-1)[0],subject+':redo');
    assert.deepEqual(f.calls[0],[subject==='work'?'work:moveToUnranked':'company:moveToCandidates','a']);
  }
});
test('bulk company moves preserve order and work bulk moves remain one state operation',()=>{
  const f=fixture();f.subject='company';f.actions.moveCandidatesToTier(['a','b'],'tier-s',3);
  assert.deepEqual(f.calls,[['company:moveMany',['a','b'],'tier-s',3]]);
  f.calls.length=0;f.subject='work';f.actions.moveCandidatesToTier(['a','b'],'tier-s',3);
  assert.deepEqual(f.calls,[['work:moveCandidatesToTier',['a','b'],'tier-s',3],['firstDrag']]);
});
test('tier delete observes minimum count and changes only the active board',()=>{
  const f=fixture();f.confirmed=false;assert.equal(f.actions.deleteTier('tier-s'),false);assert.equal(f.calls.length,1);assert.match(f.calls[0][1],/1 部/);
  f.calls.length=0;f.subject='company';f.confirmed=true;assert.equal(f.actions.deleteTier('tier-s'),true);
  assert.match(f.calls[0][1],/2 家会社/);assert.deepEqual(f.calls.slice(1).map(v=>v[0]),['company:tiers']);assert.equal(f.company.tiers.length,4);assert.equal(f.state.tiers.length,5);
  f.calls.length=0;f.company.tiers=f.company.tiers.slice(0,3);assert.equal(f.actions.deleteTier('tier-a'),false);assert.equal(f.actions.deleteTier('missing'),false);assert.deepEqual(f.calls,[]);
});
test('tier creation preserves palette validation and focus handoff; busy blocks both state owners',()=>{
  const f=fixture();f.actions.addTier();assert.equal(f.state.tiers.length,6);assert.deepEqual(f.calls.map(v=>v[0]),['focus','work:tiers']);assert.equal(f.calls[0][1],f.state.tiers.at(-1).id);assert.equal(f.company.tiers.length,5);
  f.calls.length=0;f.busy=true;
  for(const call of [()=>f.actions.addTier(),()=>f.actions.deleteTier('tier-s'),()=>f.actions.setTiers(DEFAULT_TIERS),()=>f.actions.moveToTier('w','tier-s',0),()=>f.actions.undo()])assert.equal(call(),false);
  assert.deepEqual(f.calls,[]);assert.equal(f.state.tiers.length,6);
});
test('company model adapts company selection to the original ranking builder without duplicating state',()=>{
  const f=fixture(),items=new Map();let received;
  const model=f.actions.buildCompanyModel((...args)=>(received=args,'model'),items);
  assert.equal(model,'model');assert.deepEqual(received,[{selectedWorkIds:['c'],tiers:f.company.tiers,tierOrder:f.company.tierOrder},items,'']);assert.deepEqual(f.calls,[]);
});
test('company ranking items preserve source identity and image-missing fallback',()=>{
  const source=[{companyId:'a',brandName:'A'},{companyId:'b',brandName:'B'}];let calls=0;
  const result=projectCompanyRankingItems(source,c=>(calls++,c.companyId==='a'?'image.webp':null));
  assert.equal(calls,2);assert.equal(result.get('a').company,source[0]);assert.equal(result.get('a').coverPath,'image.webp');assert.equal(result.get('b').coverPath,'company:b');assert.equal(result.get('b').coverWidth,512);
});
function node(tag){return {tag,dataset:{},children:[],attrs:{},events:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=v;},append(...children){this.children.push(...children);},addEventListener(type,fn){(this.events[type]??=[]).push(fn);}};}
test('company card retains accessible labels, activation suppression and drag/context callbacks',()=>{
  const calls=[],document={createElement:node,defaultView:{matchMedia:()=>({matches:true})}},item={workId:'c',title:'会社',companyImageUrl:'image.webp'};
  let activate=false;
  const card=createCompanyRankingCard(document,item,{isCardActivationEnabled:()=>activate,shouldSuppressMediaClick:()=>false,onOpenDetails:w=>calls.push(['details',w.workId]),onContextMenu:()=>calls.push(['menu']),onDragStart:()=>calls.push(['drag']),onDragEnd:()=>calls.push(['end'])});
  assert.equal(card.attrs['aria-label'],'会社');assert.equal(card.dataset.workId,'c');assert.equal(card.draggable,true);
  const event={preventDefault(){},stopPropagation(){}};
  card.children[0].events.click[0](event);assert.deepEqual(calls,[]);activate=true;card.children[0].events.click[0](event);assert.deepEqual(calls,[['details','c']]);
  card.events.contextmenu[0]({...event,pointerType:'touch'});assert.equal(calls.length,1);card.events.contextmenu[0](event);
  const dataTransfer={setData:(...args)=>calls.push(args)};card.events.dragstart[0]({...event,dataTransfer});card.events.dragend[0](event);
  assert.equal(dataTransfer.effectAllowed,'move');assert.deepEqual(calls.slice(-4),[['menu'],['text/plain','c'],['drag'],['end']]);
});
