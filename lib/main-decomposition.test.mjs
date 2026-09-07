import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPersonWorkspaceController } from './person-workspace-controller.js';
import { buildPersonRecords } from './person-workspace-records.js';
import { createCompanyWorkspaceController } from './company-workspace-controller.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return {promise,resolve,reject}; };
const logger = {warn(){}};
const summary = {entityId:'p1',canonicalName:'成瀬 未亜',workCount:2,roleHints:['voice-actor']};
const works = new Map([
  ['w1',{workId:'w1',title:'作品一',releaseDate:'2000-01-01',brandId:'c1',coverPath:'covers/one.webp',bangumiVoteCount:20}],
  ['w2',{workId:'w2',title:'作品二',releaseDate:'2002-01-01',brandId:'c1',coverPath:'covers/two.webp',bangumiVoteCount:10}]
]);
const model = {companies:[{companyId:'c1',brandName:'会社一'}],workDisplayTitlesById:new Map(),
  characterAssetBase:'/characters/',assetBase:'https://fixture/',representativeFamilyByWorkId:new Map(),presentationFamilies:null};
const credits = [
  {workId:'w1',title:'作品一',creditType:'character-voiced-by',characterId:'a',characterName:'角色甲',characterRole:'main'},
  {workId:'w1',title:'作品一',creditType:'character-voiced-by',characterId:'a',characterName:'角色甲',characterRole:'main'},
  {workId:'w2',title:'作品二',creditType:'character-voiced-by',characterId:'b',characterName:'角色乙',characterRole:'side'}
];
const base = () => ({workIds:new Set(works.keys()),worksById:works,model,loadCharacterImages:async()=>null,logger});

test('person controller owns shared pending/settled records, retries original source and isolates instances',async()=>{
  const pending=deferred();let calls=0,legacy=0;
  const controller=createPersonWorkspaceController({...base(),coreRuntime:{load(){legacy++;}},
    performanceRuntime:{loadDirectory(){calls++;return calls===1?pending.promise:Promise.resolve({records:[summary],activityAxis:{start:2000}});}}});
  const first=controller.loadDirectory();assert.equal(first,controller.loadDirectory());
  pending.reject(Error('temporary'));await assert.rejects(first,/temporary/);
  const records=await controller.loadDirectory();assert.equal(records,controller.records);assert.equal(calls,2);assert.equal(legacy,0);
  assert.equal(await controller.loadDirectory(),records);assert.equal(calls,2);
  const other=createPersonWorkspaceController(base());assert.equal(other.records,null);
});

test('person detail failure never caches a summary; enrichment uses only known work IDs and retains success',async()=>{
  let calls=0;const requested=[];
  const controller=createPersonWorkspaceController({...base(),performanceRuntime:{async loadPerson(){
    if(++calls===1)throw Error('temporary');return {...summary,credits:[{workId:'w1'},{workId:'missing'}]};
  }},readWorkMetadata:async ids=>{requested.push(ids);return [works.get('w1')];}});
  await assert.rejects(controller.loadPerson('p1',summary),/temporary/);
  const detail=await controller.loadPerson('p1',summary);
  assert.deepEqual(requested,[['w1']]);assert.equal(detail.credits[0].workThumbnailPath,'covers/one.webp');
  assert.equal(detail.credits[1].workThumbnailPath,null);assert.equal(await controller.loadPerson('p1',summary),detail);assert.equal(calls,2);
});

test('legacy person projection preserves role/work dedupe, main-character preference and lazy peer/company derivation',()=>{
  const input={records:[{...summary,credits},{entityId:'p2',canonicalName:'同事',credits:[{workId:'w1',title:'作品一',roleCode:'scenario'}]}]};
  const result=buildPersonRecords(input,{...model,worksById:works});
  const person=result.records.find(p=>p.entityId==='p1');
  assert.equal(person.workCount,2);assert.equal(person.roles['voice-actor'],2);assert.equal(person.totalCredits,3);
  assert.equal(person.firstYear,2000);assert.equal(person.lastYear,2002);
  assert.deepEqual(person.representativeCharacters.map(c=>c.characterId),['a']);
  assert.equal(person.coActors,null);assert.deepEqual(person.getCoActors(),[{personId:'p2',count:1,name:'同事'}]);
  assert.deepEqual(person.getCoCompanies(),[{companyId:'c1',count:2,name:'会社一'}]);
  assert.equal(input.records[0].credits[0].characterImageUrl,undefined);
});

test('legacy text is available before optional images and hydration notifies without reloading source',async()=>{
  const images=deferred();let loads=0,hydrated=0;
  const controller=createPersonWorkspaceController({...base(),coreRuntime:{async load(){loads++;return {records:[{...summary,credits}]};}},
    loadCharacterImages:()=>images.promise,onHydrated:()=>hydrated++});
  const records=await controller.loadDirectory();assert.equal(records[0].credits[0].characterImageUrl,null);assert.equal(hydrated,0);
  images.resolve({bySourceCharacterId:new Map([['a',{characterId:'a',assetPath:'a.webp'}]])});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(hydrated,1);assert.ok(controller.records[0].credits.some(c=>c.characterImageUrl==='/characters/a.webp'));assert.equal(loads,1);
});

function companyFixture(overrides={}) {
  const rendered=[],errors=[];let resolved;
  const directory={companies:[{companyId:'c1',brandName:'一',_searchText:'one',totalVoteCount:10},
    {companyId:'c2',brandName:'二',_searchText:'two',totalVoteCount:5}],works:[...works.values()]};
  const controller=createCompanyWorkspaceController({directory,elements:{search:{value:''},count:{parentElement:{}},total:{}},
    renderView:value=>rendered.push(value),isActive:()=>true,onSelectionResolved:id=>{resolved=id;},
    onError:message=>errors.push(message),syncSearchClears(){},imageUrlForCompany(){},imageUrlForWork(){},logger,...overrides});
  const options={query:'',sort:'totalVoteCount-desc',hasImage:false,selectedCompanyId:'c1',
    detailSortKey:'releaseDate',detailSortDirection:'asc',selectedCompanyIds:new Set(),selectionMode:false};
  return {controller,rendered,errors,options,get resolved(){return resolved;}};
}
test('company late responses cannot replace newer company detail; cache avoids repeated work fetch',async()=>{
  const old=deferred();let reads=0;
  const f=companyFixture({loadWorkIds:id=>id==='c1'?old.promise:Promise.resolve(['w2']),loadWorks:async()=>{reads++;return works;}});
  const a=f.controller.render(f.options);await f.controller.render({...f.options,selectedCompanyId:'c2'});
  old.resolve(['w1']);await a;
  assert.equal(f.rendered.at(-1).selectedCompanyId,'c2');assert.deepEqual(f.rendered.at(-1).selectedWorks,[works.get('w2')]);assert.equal(reads,1);
  await f.controller.render({...f.options,selectedCompanyId:'c2'});assert.equal(reads,1);
});
test('company suspension suppresses late failure; current failure renders retry and can recover',async()=>{
  const pending=deferred();let calls=0;
  const f=companyFixture({loadWorkIds:()=>++calls===1?pending.promise:Promise.resolve(['w1']),loadWorks:async()=>works});
  const loading=f.controller.render(f.options);f.controller.suspend();pending.reject(Error('late'));await loading;
  assert.deepEqual(f.errors,[]);assert.equal(f.rendered.at(-1).detailState,'loading');
  await f.controller.render(f.options);assert.equal(f.rendered.at(-1).detailState,'ready');
  let fail=true;const retry=companyFixture({loadWorkIds:async()=>{if(fail)throw Error('offline');return ['w1'];},loadWorks:async()=>works});
  await retry.controller.render(retry.options);assert.equal(retry.rendered.at(-1).detailState,'error');
  fail=false;await retry.rendered.at(-1).onRetryDetail();assert.equal(retry.rendered.at(-1).detailState,'ready');
});
test('company empty search restores full result without losing selected detail or ranking selection',async()=>{
  const f=companyFixture();const selected=new Set(['c1']);
  await f.controller.render({...f.options,query:'missing',selectedCompanyIds:selected,selectionMode:true});
  assert.equal(f.rendered.at(-1).companies.length,0);assert.equal(f.resolved,'c1');assert.equal(f.rendered.at(-1).selectedCompanyIds,selected);
  await f.controller.render(f.options);assert.equal(f.rendered.at(-1).companies.length,2);assert.equal(f.rendered.at(-1).selectedWorks.length,2);
});
test('main delegates person/company projection ownership without reverse imports or an ambient context',async()=>{
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/function buildPersonRecords|let personRuntimeState|personDetailCache|loadedCompanyWorks|companyRenderSession/);
  assert.match(main,/personWorkspace\.loadDirectory\(\)/);assert.match(main,/companyWorkspace\.render\(/);
  for(const file of ['person-workspace-controller.js','person-workspace-records.js','company-workspace-controller.js']){
    const code=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(code,/from ['"].*main\.js|new Proxy|\beval\(|globalThis\.|window\./);
  }
});
