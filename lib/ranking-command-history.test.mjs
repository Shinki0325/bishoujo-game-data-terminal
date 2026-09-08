import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingCommandHistory } from './ranking-command-history.js';
import { createRankingPresentation } from './ranking-presentation.js';
function owner() {
  let state = { selectedWorkIds:['w'], tiers:[{id:'s',name:'S'}], tierOrder:{s:[]} };
  const past=[],future=[];
  return { read:()=>structuredClone(state), move(){past.push(state);state={...state,tierOrder:{s:['w']}};future.length=0;return true;},
    undo(){if(!past.length)return false;future.push(state);state=past.pop();return true;},
    redo(){if(!future.length)return false;past.push(state);state=future.pop();return true;} };
}
function setup(limit=100){const work=owner(),company=owner(),messages=[];
 return {work,company,messages,p:createRankingPresentation({read:()=>null,write:()=>{}}),
 h:createRankingCommandHistory({subjects:{work,company},limit,announce:x=>messages.push(x)})};}
test('annotation is undone before the earlier board movement, redo retains chronological order',()=>{
 const {h,work,p,messages}=setup();h.board(()=>work.move());h.annotations('work',p,()=>p.setAnnotation('w','note'));
 h.undo('work');assert.equal(p.inspect().annotations.w,undefined);assert.deepEqual(work.read().tierOrder.s,['w']);
 h.undo('work');assert.deepEqual(work.read().tierOrder.s,[]);
 h.redo('work');h.redo('work');assert.equal(p.inspect().annotations.w,'note');assert.match(messages[0],/修改标注/);
});
test('clear annotations is reversible and no-op annotations add no history',()=>{
 const {h,p}=setup();h.annotations('work',p,()=>p.setAnnotation('w','note'));
 h.annotations('work',p,()=>p.setAnnotation('w','note'));h.annotations('work',p,()=>p.clearAnnotations(),'清空标注');
 h.undo('work');assert.equal(p.inspect().annotations.w,'note');h.undo('work');assert.deepEqual(p.inspect().annotations,{});assert.equal(h.inspect('work').canUndo,false);
});
test('annotation after undo invalidates obsolete board redo without exposing native future',()=>{
 const {h,work,p}=setup();h.board(()=>work.move());h.undo('work');h.annotations('work',p,()=>p.setAnnotation('w','branch'));
 assert.equal(h.inspect('work').canRedo,false);assert.equal(h.redo('work'),false);h.undo('work');h.redo('work');assert.deepEqual(work.read().tierOrder.s,[]);
});
test('subjects are isolated, no-op board does not clear future, failed changes create no entries',()=>{
 const {h,work,company}=setup();h.board(()=>work.move());h.board(()=>company.move());h.undo('work');h.board(()=>false);
 assert.equal(h.inspect('work').canRedo,true);assert.deepEqual(company.read().tierOrder.s,['w']);
 assert.throws(()=>h.board(()=>{throw Error('invalid import');}));assert.equal(h.inspect('work').canRedo,true);
});
test('journal is bounded and refuses a stale native history state',()=>{
 const {h,p,work}=setup(2);for(const text of ['a','b','c'])h.annotations('work',p,()=>p.setAnnotation('w',text));
 h.undo('work');h.undo('work');assert.equal(h.undo('work'),false);assert.equal(p.inspect().annotations.w,'a');
 h.board(()=>work.move());work.undo();assert.equal(h.undo('work'),false);
});
