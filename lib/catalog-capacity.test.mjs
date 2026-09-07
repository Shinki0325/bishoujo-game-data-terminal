import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_RECORD_LIMIT, PRESENTATION_FAMILY_LIMIT } from './catalog-capacity.js';
import { CATALOG_WORK_LIMIT, queryCatalog } from './catalog.js';
import { filterWorks } from './filter-engine.js';
import { createDefaultState, prepareStateAuthority, validateState } from './state.js';
import { createQueryIndex, queryIndexedCatalog, projectedCountsForIndex } from './query-index.js';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { USER_WORK_LIMIT } from './work-limit.js';

// Deliberately 25000 DISPLAY works and 33000 edition records, not 25000 clones.
const knownFilterIds = ['pov-a', 'pov-b', 'platform-pc'];
const works = Array.from({length:25000},(_,i)=>({
 workId:`capacity-${i}`,workGroupId:`capacity-${i}`,title:`作品 ${i} 测试词${i%71}`,
 furigana:'',brandId:`brand-${i%500}`,brandName:`会社 ${i%500}`,
 median:50+i%50,voteCount:40+i%5000,releaseDate:`${1987+i%40}-01-01`,
 rawFilterIds:[i%2?'pov-a':'pov-b'],filterIds:[i%2?'pov-a':'pov-b','platform-pc'],
 rawGenre:'',genreFilterIds:[],platformFilterId:'platform-pc',isNukige:false
}));
const sha='a'.repeat(64),families=[],mapping={};
for(let i=0;i<8000;i++){
 const original=works[i],edition={...original,workId:`edition-${i}`,title:`${original.title} 第二版`};
 works.push(edition);
 const presentationWorkId=`vndb:v${i+1}`;
 const members=[original,edition].map((w,j)=>({workId:w.workId,default:j===0,title:w.title,label:j?'第二版':'初版',platform:'PC',releaseDate:w.releaseDate}));
 families.push({presentationWorkId,vndbId:`v${i+1}`,status:'auto-version-family',title:original.title,defaultWorkId:original.workId,catalogMemberWorkIds:members.map(m=>m.workId),members});
 for(const m of members)mapping[m.workId]=presentationWorkId;
}
const workIds=works.map(w=>w.workId),byId=new Map(works.map(w=>[w.workId,w]));
const sidecar={schemaVersion:'egs-tier-full-presentation-families-v1',generatedAt:'2026-09-07T00:00:00Z',selectionPolicy:'auto',sourceCatalogSha256:sha,sourceCatalogSnapshotId:'capacity',families,workToPresentationWorkId:mapping};
const options={catalogSnapshotId:'capacity',catalogSha256:sha,workIds};
const state=createDefaultState('capacity'),filterState={...state.filterState,releaseYearStart:1987,releaseYearEnd:2026};
const index=createQueryIndex({works,knownFilterIds});

test('catalog, filters and state accept 33000 editions without bypassing validation',()=>{
 assert.equal(CATALOG_WORK_LIMIT,CATALOG_RECORD_LIMIT);
 assert.equal(filterWorks(works,filterState,knownFilterIds).length,33000);
 const result=queryCatalog(works,filterState,knownFilterIds,[]);
 assert.deepEqual(result.map(w=>w.workId),queryIndexedCatalog(index,filterState).map(w=>w.workId));
 const authority=prepareStateAuthority({sampleId:'capacity',workIds,filterIds:knownFilterIds,workGroupByEditionWorkId:Object.fromEntries(works.map(w=>[w.workId,w.workGroupId]))});
 assert.deepEqual(validateState(state,authority).selectedWorkIds,[]);
 for(let i=0;i<20;i++)validateState({...state,filterState:{...filterState,titleQuery:String(i)}},authority);
});

test('8000 version families fold 33000 records to exactly 25000 visible works',()=>{
 const projection=preparePresentationFamiliesSidecar(sidecar,options);
 const result=projection.projectVisibleWorks(queryIndexedCatalog(index,filterState),{sortKey:'voteCount',sortDirection:'desc',workById:byId,presorted:true});
 assert.equal(result.length,25000);
 assert.equal(result.filter(w=>w.presentationMemberCount===2).length,8000);
 const onlyEdition=projection.projectVisibleWorks([byId.get('edition-7')],{workById:byId});
 assert.equal(onlyEdition[0].workId,'capacity-7');
 assert.equal(onlyEdition[0].presentationMemberCount,2);
});

test('expanded catalog keeps label, company, year and empty-result recovery exact',()=>{
 for(const patch of [{positiveFilterIds:['pov-a']},{brandIds:['brand-17']},{releaseYearStart:2000,releaseYearEnd:2004},{titleQuery:'NOT_PRESENT'},{titleQuery:''}]){
  const next={...filterState,...patch};
  assert.deepEqual(queryIndexedCatalog(index,next).map(w=>w.workId),queryCatalog(works,next,knownFilterIds,[]).map(w=>w.workId));
 }
 const a=projectedCountsForIndex(index,{...filterState,positiveFilterIds:['pov-a']});
 const b=projectedCountsForIndex(index,{...filterState,positiveFilterIds:['pov-b']});
 assert.notDeepEqual(a.yearCounts,b.yearCounts);
});

test('10000 people and 100000 role links filter the expanded catalog without character entities',()=>{
 const persons=Object.fromEntries(Array.from({length:10000},(_,i)=>[`per_C${i}`,{'voice-actor':Array.from({length:10},(_,j)=>workIds[(i*3+j)%workIds.length])}]));
 const personIndex=createQueryIndex({works,knownFilterIds,personWorkIndex:{format:'egs-tier-person-work-index-v1',workOrder:workIds,persons}});
 const actual=queryIndexedCatalog(personIndex,{...filterState,personIds:['per_C9999']});
 assert.deepEqual(actual.map(w=>w.workId).sort(),[...persons.per_C9999['voice-actor']].sort());
 assert.deepEqual(queryIndexedCatalog(personIndex,{...filterState,personIds:['per_missing']}),[]);
 assert.equal(queryIndexedCatalog(personIndex,filterState).length,33000);
});

test('bounded capacity still rejects oversize catalogs, families and selections',()=>{
 const oversized=new Array(CATALOG_RECORD_LIMIT+1);
 assert.throws(()=>filterWorks(oversized,filterState,knownFilterIds),/limit/);
 assert.throws(()=>queryCatalog(oversized,filterState,knownFilterIds,[]));
 assert.throws(()=>prepareStateAuthority({sampleId:'capacity',workIds:oversized,filterIds:knownFilterIds}));
 assert.throws(()=>preparePresentationFamiliesSidecar({...sidecar,families:new Array(PRESENTATION_FAMILY_LIMIT+1)},options),/limit/);
 const authority=prepareStateAuthority({sampleId:'capacity',workIds,filterIds:knownFilterIds});
 assert.throws(()=>validateState({...state,selectedWorkIds:workIds.slice(0,USER_WORK_LIMIT+1)},authority));
});
