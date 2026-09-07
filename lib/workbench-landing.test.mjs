import test from 'node:test';
import assert from 'node:assert/strict';
import {canShowWorkbenchLanding} from './workbench-landing.js';
import {bindTitleQueryInput} from '../views/selection-view.js';

test('landing permits only default works and refuses persisted state or shared filters',()=>{
 const storage={length:0};
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:''},storage),true);
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:'?startupMetrics=1&interactionMetrics=1'},storage),true);
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:'?interactionMetrics=1&q=alias'},storage),false);
 for(const hash of ['#work/6234','#ranking','#persons','#works?q=test','#works?page=2'])assert.equal(canShowWorkbenchLanding({hash,search:''},storage),false);
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:'?legacyWorkbench=1'},storage),false);
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:''},{length:1,key:()=> 'egs-tier-terminal:state-v1'}),false);
 assert.equal(canShowWorkbenchLanding({hash:'#works',search:''},{length:1,key:()=> 'egs-tier-terminal:egs-tier-100-v1'}),false);
});

test('typing remains debounced; Enter and clearing flush; composing Enter never commits',()=>{
 const input=new EventTarget();input.value='';const records=[];
 const commit=(value)=>records.push(['schedule',value]);commit.flush=()=>records.push(['flush']);commit.cancel=()=>records.push(['cancel']);
 bindTitleQueryInput(input,commit,()=>null);
 const emit=(type,properties={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,properties);input.dispatchEvent(event);return event;};
 input.value='cross';emit('input');assert.deepEqual(records,[['schedule','cross']]);
 assert.equal(emit('keydown',{key:'Enter'}).defaultPrevented,true);assert.deepEqual(records.at(-1),['flush']);
 input.value='';emit('input');assert.deepEqual(records.slice(-2),[['schedule',''],['flush']]);
 emit('compositionstart');const length=records.length;input.value='成';emit('input',{isComposing:true});emit('keydown',{key:'Enter',isComposing:true});assert.equal(records.length,length);
 emit('compositionend');assert.deepEqual(records.at(-1),['schedule','成']);
});
