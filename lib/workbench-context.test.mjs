import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeWorkbenchContext,decodeWorkbenchContext} from './workbench-context.js';
import {encodeWorkbenchTable,decodeWorkbenchTable} from './workbench-table.js';
const works=[{workId:'1',title:'成瀬未亜',releaseDate:'2000-01-01'},{workId:'2',title:'別版',releaseDate:'2001-01-01'},{workId:'3',title:'他作',releaseDate:'2002-01-01'}];
const family={catalogMemberWorkIds:['1','2'],defaultWorkId:'1',members:works.slice(0,2).map((w,i)=>({...w,default:i===0,label:'PC',platform:'PC'})),presentationWorkId:'vndb:v1',status:'auto-version-family',title:'成瀬未亜',vndbId:'v1'};
const context={other:{keep:true},presentationFamiliesSource:{sha256:'x',value:{families:[family],workToPresentationWorkId:{1:'vndb:v1',2:'vndb:v1'},generatedAt:'test'}}};
test('family references restore every source field and preserve nonmatching titles/dates',()=>{
 const original=structuredClone(context);original.presentationFamiliesSource.value.families[0].members[1].title='Source-specific title';
 const packed=encodeWorkbenchContext(original,works);
 assert.equal(packed.packedFamilies.rows[0][5],0);
 assert.equal(packed.packedFamilies.mapping,null);
 assert.deepEqual(decodeWorkbenchContext(JSON.parse(JSON.stringify(packed)),works),original);
 assert.deepEqual(context.presentationFamiliesSource.value.families[0],family);
});
test('family mapping exceptions and absent source round trip without silent losses',()=>{
 const original=structuredClone(context);original.presentationFamiliesSource.value.workToPresentationWorkId['3']='vndb:v99';
 assert.deepEqual(decodeWorkbenchContext(encodeWorkbenchContext(original,works),works),original);
 assert.deepEqual(decodeWorkbenchContext(encodeWorkbenchContext({presentationFamiliesSource:null},works),works),{presentationFamiliesSource:null});
 assert.throws(()=>encodeWorkbenchContext({...context,packedFamilies:{}},works));
 const unknown=structuredClone(context);unknown.presentationFamiliesSource.value.families[0].future='must not drop';
 assert.throws(()=>encodeWorkbenchContext(unknown,works));
});
test('family codec rejects invalid shape, cross-work text references and duplicate declarations',()=>{
 const packed=encodeWorkbenchContext(context,works);
 for(const mutate of [p=>{p.packedFamilies.schema='bad';},p=>{p.packedFamilies.rows[0][1]=99;},p=>{p.packedFamilies.rows[0][5]=1;},p=>{p.packedFamilies.rows[0][2][0].pop();},p=>{p.presentationFamiliesSource={};}]){
  const bad=structuredClone(packed);mutate(bad);assert.throws(()=>decodeWorkbenchContext(bad,works));
 }
});
test('copy columns preserve primitive values and reject cycles, bad indexes and duplicate overrides',()=>{
 const rows=Array.from({length:20},(_,i)=>({id:String(i),group:String(i),nullable:null,other:null}));rows[5].group='different';
 const fields=['id','group','nullable','other'],table=encodeWorkbenchTable(rows,fields);
 assert.equal(table.schema,'workbench-column-table-v2');assert.equal(table.columns[1].kind,'copy');
 assert.deepEqual(decodeWorkbenchTable(JSON.parse(JSON.stringify(table)),fields,rows.length),rows);
 for(const column of [{kind:'copy',source:1,overrides:[]},{kind:'copy',source:-1,overrides:[]},{kind:'copy',source:0,overrides:[[2,'x'],[2,'y']]},{kind:'copy',source:0,overrides:[[-1,'x']]},{kind:'copy',source:0,overrides:[[21,'x']]}]) {
  const bad=structuredClone(table);bad.columns[1]=column;assert.throws(()=>decodeWorkbenchTable(bad,fields,rows.length));
 }
});
test('actual public bootstrap context and every work column are lossless',async()=>{
 const root=new URL('../runtime-data/workbench-demand/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root)));
 const body=JSON.parse(await readFile(new URL(manifest.bootstrap.path,root)));
 const records=decodeWorkbenchTable(body.table,body.columns,manifest.count);
 const original=decodeWorkbenchContext(body.context,records);
 assert.deepEqual(decodeWorkbenchContext(encodeWorkbenchContext(original,records),records),original);
 assert.deepEqual(decodeWorkbenchTable(encodeWorkbenchTable(records,body.columns),body.columns,manifest.count),records);
});
