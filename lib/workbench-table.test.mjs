import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWorkbenchTable,decodeWorkbenchTable} from './workbench-table.js';
import {createQueryIndex,createSearchTextCarrier,queryIndexedCatalog} from './query-index.js';

test('column table roundtrips exact values, empty lists, nulls and shared strings',()=>{
 const fields=['workId','title','tags','score','optional'];
 const works=Array.from({length:50},(_,i)=>({workId:String(i),title:i%2?'成瀬 未亜':'other',tags:i%3?['a','b']:[],score:Math.PI*i,optional:null}));
 const encoded=encodeWorkbenchTable(works,fields);
 assert.equal(encoded.columns[1].kind,'dictionary');assert.equal(encoded.columns[2].kind,'lists');
 assert.deepEqual(decodeWorkbenchTable(JSON.parse(JSON.stringify(encoded)),fields,works.length),works);
 for(const corrupt of [t=>t.length++,t=>t.columns[1].values[0]=-1,t=>t.columns[1].values[0]=10000,t=>t.columns[2].values[0]=3,t=>t.columns[2].dictionary[0]={}]) {
  const bad=structuredClone(encoded);corrupt(bad);assert.throws(()=>decodeWorkbenchTable(bad,fields,works.length));
 }
});

test('build-time search carriers preserve CJK, aliases, pinyin and reject identity drift',()=>{
 const work={workId:'1',workGroupId:'1',title:'成瀬未亜',brandId:'b',brandName:'Test',releaseDate:'2000-01-01',filterIds:[],genreFilterIds:[],platformFilterId:'platform-pc',median:80,voteCount:100};
 const options={works:[work],knownFilterIds:[],workAliasesById:new Map([['1',['测试别名']]])};
 const original=createQueryIndex(options),carrier=createSearchTextCarrier(original);
 const encoded=createQueryIndex({...options,workAliasesById:{get(){throw Error('unexpected search normalization');}},searchText:carrier});
 const state={mode:'basic',titleQuery:'',minimumScore:0,minimumVoteCount:0,releaseYearStart:1987,releaseYearEnd:2026,brandIds:[],basicOperator:'AND',positiveFilterIds:[],excludedFilterIds:[],advancedExpression:'',sortKey:'voteCount',sortDirection:'desc'};
 for(const titleQuery of ['成濑','测试别名','chenglai','no_match'])assert.deepEqual(queryIndexedCatalog(encoded,{...state,titleQuery}),queryIndexedCatalog(original,{...state,titleQuery}));
 assert.throws(()=>createQueryIndex({...options,searchText:{...carrier,workIds:['other']}}),/identity/);
 assert.throws(()=>createQueryIndex({...options,searchText:{...carrier,rows:[[null,'','']]}}),/format/);
});
