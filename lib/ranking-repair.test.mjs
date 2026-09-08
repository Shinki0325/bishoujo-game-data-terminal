import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyRanking,COMPANY_RANKING_STORAGE_KEY} from './company-ranking.js';
import {DEFAULT_TIERS} from './tier-palette.js';
import {appendTier} from './tier-config.js';
import {projectPngExport} from './ranking-export-controller.js';
const companies=Array.from({length:201},(_,i)=>({companyId:`co${i}`}));
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const fixture=(s=storage(),tiers=DEFAULT_TIERS)=>createCompanyRanking({companies,tiers,storage:s});
test('company tier creation, rename, reorder and delete are complete undoable snapshots',()=>{
 const c=fixture();c.toggle('co0',true);const tiers=appendTier(DEFAULT_TIERS,()=> 'new-tier');c.setTiers(tiers);assert.equal(c.moveToTier('co0',tiers.at(-1).id),true);
 const before=c.inspect();c.setTiers(DEFAULT_TIERS);assert.deepEqual(c.inspect().candidateCompanyIds,['co0']);c.undo();assert.deepEqual(c.inspect().tiers,before.tiers);assert.deepEqual(c.inspect().tierOrder,before.tierOrder);c.redo();assert.equal(c.inspect().tiers.length,5);
 c.undo();c.setTiers([...tiers].reverse().map(t=>({...t,name:t.name+'!'})));c.undo();assert.deepEqual(c.inspect().tiers,tiers);
});
test('new company backup restores custom tiers and assignments in an independent store',()=>{
 const c=fixture(),tiers=appendTier(DEFAULT_TIERS,()=> 'custom');c.setTiers(tiers);c.toggle('co1',true);assert.equal(c.moveToTier('co1',tiers.at(-1).id),true);const state=c.inspect();
 const other=fixture();other.importState({schemaVersion:2,tiers:state.tiers,selectedCompanyIds:state.selectedCompanyIds,tierOrder:state.tierOrder});assert.deepEqual(other.inspect().tierOrder,state.tierOrder);assert.deepEqual(other.inspect().tiers,state.tiers);
 other.undo();assert.equal(other.inspect().selectedCompanyIds.length,0);other.redo();assert.deepEqual(other.inspect().tiers,state.tiers);
});
test('legacy stored company tiers are pinned before the work board changes',()=>{
 const s=storage(),tiers=appendTier(DEFAULT_TIERS,()=> 'legacy');s.setItem(COMPANY_RANKING_STORAGE_KEY,JSON.stringify({selectedCompanyIds:['co1'],tierOrder:{[tiers.at(-1).id]:['co1']}}));
 fixture(s,tiers);const next=fixture(s,DEFAULT_TIERS);assert.equal(next.inspect().tiers.length,6);assert.deepEqual(next.inspect().tierOrder[tiers.at(-1).id],['co1']);
});
test('company bulk move and removal each consume one history step',()=>{
 const c=fixture();c.toggle('co1',true);c.toggle('co2',true);c.moveMany(['co1','co2'],'tier-s');c.undo();assert.deepEqual(c.inspect().candidateCompanyIds,['co1','co2']);c.redo();c.removeMany(['co1','co2']);c.undo();assert.deepEqual(c.inspect().tierOrder['tier-s'],['co1','co2']);
});
test('company capacity rejects additions and oversized imports without modifying state',()=>{
 const c=fixture();for(let i=0;i<200;i++)assert.equal(c.toggle('co'+i,true),true);assert.equal(c.toggle('co200',true),false);assert.equal(c.inspect().selectedCompanyIds.length,200);
 const before=c.inspect();assert.throws(()=>c.importState({selectedCompanyIds:companies.map(x=>x.companyId),tierOrder:{}}));assert.deepEqual(c.inspect(),before);
});
test('legacy over-capacity stored selections are preserved, not silently truncated',()=>{
 const s=storage();s.setItem(COMPANY_RANKING_STORAGE_KEY,JSON.stringify({selectedCompanyIds:companies.map(x=>x.companyId),tierOrder:{}}));assert.equal(fixture(s).inspect().selectedCompanyIds.length,201);
});
test('invalid or future company imports are atomic',()=>{
 const c=fixture();c.toggle('co0',true);const before=c.inspect();for(const value of [{schemaVersion:99},{schemaVersion:2,selectedCompanyIds:[],tierOrder:{}},{selectedCompanyIds:[],tierOrder:[]}])assert.throws(()=>c.importState(value));assert.deepEqual(c.inspect(),before);
});
test('company undo history is bounded and no-op toggles do not allocate entries',()=>{
 const c=fixture();for(let i=0;i<130;i++)c.toggle('co0',i%2===0);let count=0;while(c.undo())count++;assert.equal(count,100);
 const other=fixture();other.toggle('co0',true);other.toggle('co0',true);other.undo();assert.equal(other.inspect().selectedCompanyIds.length,0);assert.equal(other.undo(),false);
});
test('standard PNG dimensions adapt to content and high quality remains explicit',()=>{
 const snapshot={company:true,state:{tiers:DEFAULT_TIERS},tierOrder:Object.fromEntries(DEFAULT_TIERS.map(t=>[t.id,t.id==='tier-s'?['co0']:[]])),worksById:new Map(),presentation:{}};
 assert.equal(projectPngExport(snapshot).logicalMaxWidth,296);assert.equal(projectPngExport(snapshot).pixelRatio,1);assert.equal(projectPngExport({...snapshot,exportQuality:'high'}).pixelRatio,2);
});
