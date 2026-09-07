import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStateAuthority,createDefaultState,validateState,importState,exportState} from './state.js';
import {createAppController} from './app-controller.js';

const authority=()=>({sampleId:'capacity-test',workIds:['1','2'],filterIds:[],workGroupByEditionWorkId:{'1':'g1','2':'g2'}});
test('prepared authority produces exactly the same validated state and import result',()=>{
 const raw=authority(),state=createDefaultState(raw.sampleId),handle=prepareStateAuthority(raw);
 assert.deepEqual(validateState(state,handle),validateState(state,raw));
 assert.deepEqual(importState(exportState(state),handle),importState(exportState(state),raw));
 assert.equal(Object.isFrozen(handle),true);assert.deepEqual(Reflect.ownKeys(handle),[]);
});
test('preparing authority snapshots caller data; later mutation cannot bypass validation',()=>{
 const raw=authority(),handle=prepareStateAuthority(raw),state=createDefaultState(raw.sampleId);
 raw.workIds.push('3');raw.workGroupByEditionWorkId['3']='g3';
 const selected={...state,selectedWorkIds:['3'],selectedWorkRefs:[{editionWorkId:'3',workGroupId:'g3'}]};
 assert.throws(()=>validateState(selected,handle));assert.equal(validateState(selected,raw).selectedWorkIds[0],'3');
 assert.equal(validateState(selected,prepareStateAuthority(raw)).selectedWorkIds[0],'3');
});
test('unissued handles, duplicate IDs, accessors and unknown references fail closed',()=>{
 const state=createDefaultState('capacity-test');
 assert.throws(()=>validateState(state,Object.freeze(Object.create(null))));
 assert.throws(()=>prepareStateAuthority({...authority(),workIds:['1','1']}));
 let reads=0;const raw=authority();Object.defineProperty(raw,'workIds',{get(){reads++;return ['1','2'];}});
 assert.throws(()=>prepareStateAuthority(raw));assert.equal(reads,0);
 assert.throws(()=>validateState({...state,selectedWorkIds:['unknown']},prepareStateAuthority(authority())));
});
test('repeated state validation never re-enumerates a prepared source array',()=>{
 let reads=0;const raw=authority();raw.workIds=new Proxy(raw.workIds,{ownKeys(target){reads++;return Reflect.ownKeys(target);}});
 const handle=prepareStateAuthority(raw),initial=reads,state=createDefaultState(raw.sampleId);
 for(let i=0;i<20;i++)validateState({...state,filterState:{...state.filterState,titleQuery:String(i)}},handle);
 assert.equal(reads,initial);assert.ok(initial>0);
});
function controller(options={}){return createAppController({sample:{sampleId:'capacity-test',works:[{workId:'1',workGroupId:'g1',filterIds:[],title:'one',median:50,voteCount:50}],filters:[]},storage:null,confirm:()=>true,announce:()=>{},now:()=>new Date('2026-09-07'),downloadJson:()=>{},...options});}
test('controller refreshes authority on local registration and keeps public exports clean',()=>{
 const app=controller();app.registerLocalWorks([{workId:'custom-local-one',workGroupId:'custom-local-one',localMediaKind:'custom',title:'local',filterIds:[]}]);
 assert.ok(app.inspectState().selectedWorkIds.includes('custom-local-one'));
 app.setFilterState({titleQuery:'local'});assert.equal(app.exportJson().omittedCustomCount,1);
});
test('failed local registration rolls back the prepared authority as well as IDs',()=>{
 let fail=false;const app=controller({now:()=>{if(fail)throw Error('fixture commit failure');return new Date('2026-09-07');}});
 const work={workId:'custom-local-bad',workGroupId:'custom-local-bad',localMediaKind:'custom',title:'valid',filterIds:[]};
 fail=true;assert.throws(()=>app.registerLocalWorks([work]));fail=false;
 app.setFilterState({titleQuery:'after failure'});assert.deepEqual(app.inspectState().selectedWorkIds,[]);
 app.registerLocalWorks([work]);
 assert.ok(app.inspectState().selectedWorkIds.includes('custom-local-bad'));
});

test('result inspection keeps none/some/all and rejects invalid lists without revalidating their copies',()=>{
 const app=controller({sample:{sampleId:'capacity-test',works:[{workId:'1',filterIds:[],title:'one'},{workId:'2',filterIds:[],title:'two'}],filters:[]}});
 assert.equal(app.inspect(['1','2']).selectAllState,'none');
 app.selectWorks(['1']);assert.equal(app.inspect(['1','2']).selectAllState,'some');
 assert.equal(app.inspect(['1']).selectAllState,'all');assert.equal(app.inspect([]).selectAllState,'none');
 for(const ids of [['unknown'],['1','1'],new Array(1)])assert.throws(()=>app.inspect(ids));
 const ids=['1'];Object.setPrototypeOf(ids,{0:'1'});delete ids[0];assert.throws(()=>app.inspect(ids));
 const result=app.inspect(['1']);result.visibleWorks.length=0;assert.equal(app.inspect(['1']).visibleWorks.length,1);
});

test('inspection rejects caller mutation of a catalog work identity',()=>{
 const work={workId:'1',title:'one',filterIds:[]};
 const app=controller({sample:{sampleId:'capacity-test',works:[work],filters:[]}});
 work.workId='mutated';assert.throws(()=>app.inspect(['1']));
});
