import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWorkbenchStore,loadWorkbenchData,validateWorkbenchManifest,WORKBENCH_SCHEMA,workbenchSourcePins,serializeWorkbench,reviveWorkbench,workbenchQueryWork,restoreWorkbenchContext} from './workbench-demand-data.js';
import {createQueryIndex,queryIndexedCatalog,projectedCountsForIndex} from './query-index.js';
import {preparePresentationFamiliesSidecar} from './presentation-families.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
const root=new URL('../runtime-data/workbench-demand/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const readJson=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'),reviveWorkbench);
const fetchImpl=async url=>new Response(await readFile(url));
const candidate=await loadWorkbenchData({legacyLoader:()=>{throw Error('unexpected fallback');},config:WORKBENCH_DEMAND,fetchImpl,locationRef:{search:''}});
const candidateSearchText=candidate.loadSearchText?await candidate.loadSearchText():candidate.searchText;
const full=(await Promise.all(manifest.shards.map(d=>readJson(d.path)))).flat();
const state={mode:'basic',titleQuery:'',minimumScore:0,minimumVoteCount:30,releaseYearStart:1987,releaseYearEnd:2026,brandIds:[],attributeSelections:{'game-type':[],platform:[],length:[]},basicOperator:'AND',positiveFilterIds:[],excludedFilterIds:[],excludeNukige:false,advancedExpression:'',sortKey:'voteCount',sortDirection:'desc',personIds:[]};
test('manifest identity, source drift, traversal and schema fail closed independently from UI revision',()=>{
 assert.equal(validateWorkbenchManifest(manifest),manifest);
 for(const changed of [{...manifest,schema:'bad'},{...manifest,dataRevision:'ui-new-version'},{...manifest,sourcePins:{}},{...manifest,bootstrap:{...manifest.bootstrap,path:'../catalog.json'}}])assert.throws(()=>validateWorkbenchManifest(changed));
});
test('readonly alias maps survive the derived serialization boundary',()=>{
 const source=new Map([['x',['别名']]]),facade={get:key=>source.get(key),entries:()=>source.entries()};
 assert.deepEqual(JSON.parse(JSON.stringify({facade},serializeWorkbench),reviveWorkbench).facade,source);
 assert.ok(candidate.workPinyinById instanceof Map);
});

test('context-only restoration matches legacy reviver including nested maps and arrays',()=>{
 const input={aliases:new Map([['a',['成濑']]]),nested:[{map:new Map([['x',{deep:new Map([['y',2]])}]])}],nil:null,scalar:3};
 const text=JSON.stringify(input,serializeWorkbench);
 assert.deepEqual(restoreWorkbenchContext(JSON.parse(text)),JSON.parse(text,reviveWorkbench));
});
test('real full-catalog IDs, sort order, aliases and conditional histograms remain equal',()=>{
 const options={knownFilterIds:candidate.sample.filters.map(f=>f.filterId),brands:candidate.brands,workAliasesById:candidate.workAliasesById,workPinyinById:candidate.workPinyinById,companyAliasesById:candidate.enrichment.companyAliasesById,companyPinyinById:candidate.enrichment.companyPinyinById};
 const a=createQueryIndex({...options,works:full}),b=createQueryIndex({...options,works:candidate.ratedDisplayWorks.map(workbenchQueryWork),searchText:candidateSearchText});
 // Every built carrier must match current source rules, not only a query sample.
 for(const key of ['normalizedTitles','normalizedLooseTitles','pinyinTitles'])assert.deepEqual(b[key],a[key]);
 const cases=[state,{...state,minimumVoteCount:100000},{...state,releaseYearStart:2000,releaseYearEnd:2000}];
 for(const sortKey of ['title','brandName','median','voteCount','releaseDate','egsScore','vndbScore','vndbVoteCount','bangumiScore','bangumiVoteCount'])for(const sortDirection of ['asc','desc'])cases.push({...state,sortKey,sortDirection});
 for(const titleQuery of ['濑里奈','lailinai','CROSS†CHANNEL','crosschannel','WHITE ALBUM','whitealbum','壳之少女','HULOTTE','不存在的作品abcdef'])cases.push({...state,titleQuery,minimumVoteCount:0});
 for(const filterId of options.knownFilterIds.slice(0,30))cases.push({...state,positiveFilterIds:[filterId]});
 for(let i=0;i<cases.length;i++){
  assert.deepEqual(queryIndexedCatalog(b,cases[i]).map(w=>w.workId),queryIndexedCatalog(a,cases[i]).map(w=>w.workId));
  if(i%7===0)assert.deepEqual(projectedCountsForIndex(b,cases[i]),projectedCountsForIndex(a,cases[i]));
 }
});
test('presentation families are folded before paging and preserve default-edition IDs',()=>{
 const families=preparePresentationFamiliesSidecar(candidate.presentationFamiliesSource.value,{catalogSnapshotId:candidate.sampleSource.snapshot.snapshotId,catalogSha256:candidate.catalogSource.sha256,workIds:candidate.populationContract.presentation.workIds,bangumiSubjectByWorkId:new Map(candidate.bangumiPublicBindings.bindings.map(x=>[x.egsWorkId,x.bangumiSubjectId]))});
 const options={knownFilterIds:candidate.sample.filters.map(f=>f.filterId)};
 const project=works=>families.projectVisibleWorks(queryIndexedCatalog(createQueryIndex({...options,works}),state),{sortKey:'voteCount',sortDirection:'desc',workById:new Map(works.map(w=>[w.workId,w])),presorted:true}).map(w=>w.workId);
 assert.deepEqual(project(candidate.ratedDisplayWorks),project(full));
 assert.equal(candidate.ratedDisplayWorks.length-families.memberCount+families.familyCount,7025);
});
test('first page and arbitrary IDs hydrate exact media/ratings, including all admissions fallback media',async()=>{
 const ids=[...manifest.firstPage.ids,...full.filter(w=>!w.projectedThumbnailPath).slice(0,25).map(w=>w.workId)];
 const rows=await candidate.workData.get(ids),byId=new Map(full.map(w=>[w.workId,w]));
 for(const id of ids)assert.deepEqual(rows.get(id),byId.get(id));
 for(const work of candidate.ratedDisplayWorks.filter(w=>!w.projectedThumbnailPath))assert.equal(work.coverPath,byId.get(work.workId).coverPath);
});
test('shard fetches dedupe, bound concurrency/cache, retry HTTP/hash failures and reject wrong order',async()=>{
 const hash=b=>createHash('sha256').update(b).digest('hex');const rows=Array.from({length:8},(_,i)=>({workId:String(i+1)}));const payloads=rows.map(w=>Buffer.from(JSON.stringify([w])));
 const make=(b,i)=>({path:`cards-${i}.${hash(b).slice(0,16)}.json`,sha256:hash(b)});
 const m={schema:WORKBENCH_SCHEMA,count:8,blockSize:1,sourcePins:workbenchSourcePins(),shards:payloads.map(make),firstPage:{...make(Buffer.from('[]'),8),ids:[]}};
 let calls=0,active=0,peak=0,fail=0;
 const store=createWorkbenchStore(m,rows,{baseUrl:new URL('http://local/'),maxCached:2,concurrency:2,fetchImpl:async url=>{calls++;if(fail===1)return new Response('',{status:503});if(fail===2)return new Response('{}');active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(payloads[Number(url.pathname.match(/cards-(\d+)/)[1])]);}});
 await Promise.all([store.get(['1']),store.get(['1'])]);assert.equal(calls,1);
 await store.get(rows.map(w=>w.workId));assert.ok(peak<=2);assert.equal(store.stats().cached,2);
 fail=1;await assert.rejects(store.get(['1']),/503/);fail=2;await assert.rejects(store.get(['1']),/校验/);fail=0;assert.equal((await store.get(['1'])).get('1').workId,'1');
 await assert.rejects(store.get(['unknown']),/未知/);
 const wrong=createWorkbenchStore({...m,shards:[m.shards[1],...m.shards.slice(1)]},rows,{baseUrl:new URL('http://local/'),fetchImpl:async()=>new Response(payloads[1])});await assert.rejects(wrong.get(['1']),/顺序/);
});
