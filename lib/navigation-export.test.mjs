import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchNavigationController, projectUiLocation } from './workbench-navigation-controller.js';
import { createSharedSelectionController } from './shared-selection-controller.js';
import { createShareImportView } from '../views/share-import-view.js';
import { buildSelectionShareUrl } from './share-selection.js';
import { createRankingExportController, projectPngExport, pngExportMessage } from './ranking-export-controller.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const routeSnapshot=()=>({page:'works',query:'test',sort:'voteCount-desc',pageNumber:1});
function navigationFixture(extra={}) {
  const calls=[],locationRef=new URL('https://example.test/?keep=1#works'),mark=name=>(...args)=>calls.push([name,...args]);
  const deps={locationRef,historyRef:{pushState:mark('push'),replaceState:mark('replace')},snapshot:routeSnapshot,
    isHome:()=>false,isHomeRoute:()=>false,invalidate:mark('invalidate'),home:mark('home'),render:async()=>calls.push(['render']),
    ranking:{enter:mark('ranking')},companies:{enter:mark('companies'),setPage:mark('company-page')},
    persons:{enter:mark('persons'),show:mark('person-show'),ensureReady:async()=>calls.push(['person-ready']),finish:mark('person-finish')},
    works:{enter:mark('works'),setPage:mark('work-page'),find:id=>({workId:id}),open:mark('work-open')},...extra};
  return {calls,location:locationRef,deps,nav:createWorkbenchNavigationController(deps)};
}
test('location projection preserves directory precedence, deep links and lightweight work filters',()=>{
  const data={state:{workspaceMode:'selection',filterState:{titleQuery:'a',sortKey:'median',sortDirection:'desc'}},person:{open:false},company:{open:false},workId:null,subject:'company',workPage:3};
  assert.deepEqual(projectUiLocation(data),{page:'works',query:'a',sort:'median-desc',pageNumber:3});
  assert.deepEqual(projectUiLocation({...data,workId:'w'}),{page:'works',workId:'w'});
  assert.deepEqual(projectUiLocation({...data,state:{workspaceMode:'ranking'}}),{page:'ranking',subject:'company'});
  assert.deepEqual(projectUiLocation({...data,person:{open:true,id:'p'},company:{open:true,id:'c'}}),{page:'persons',personId:'p'});
});
test('history updates preserve query params, suppress writes while applying, and never replace home incidentally',async()=>{
  const hold=deferred(),f=navigationFixture({render:()=>hold.promise});
  f.nav.update('pushState');assert.match(f.calls[0][3],/\?keep=1#works\?/);
  const apply=f.nav.apply();assert.equal(f.nav.applying,true);assert.equal(f.nav.update(),false);
  hold.resolve();await apply;assert.equal(f.nav.applying,false);assert.equal(f.nav.update(),true);
  assert.throws(()=>f.nav.update('go'),/Invalid history/);
  const home=navigationFixture({isHome:()=>true});assert.equal(home.nav.update(),false);assert.equal(home.nav.update('pushState'),true);
  home.nav.clearShareHash();assert.equal(new URL(home.calls.at(-1)[3]).hash,'');
});
test('navigation invalidates observers before rendering and restores page only after readiness',async()=>{
  const f=navigationFixture();f.location.hash='#works?page=3';await f.nav.apply();
  assert.deepEqual(f.calls.map(c=>c[0]),['invalidate','works','render','work-page']);assert.equal(f.calls.at(-1)[1],3);
  f.calls.length=0;f.location.hash='#companies?page=2';await f.nav.apply();
  assert.deepEqual(f.calls.map(c=>c[0]),['invalidate','companies','company-page','render','company-page']);
});
test('late person preparation cannot re-enter after a new route and cannot clear the new applying flag',async()=>{
  const hold=deferred(),newHold=deferred(),f=navigationFixture();
  f.deps.persons.ensureReady=()=>hold.promise;f.deps.render=()=>newHold.promise;
  // create controller with the replacement render dependency before running.
  const nav=createWorkbenchNavigationController(f.deps);
  f.location.hash='#persons';const old=nav.apply();
  f.location.hash='#works';const next=nav.apply();hold.resolve();await old;
  assert.equal(nav.applying,true);assert.equal(f.calls.some(c=>c[0]==='person-finish'),false);
  newHold.resolve();await next;assert.equal(nav.applying,false);
});
test('changed hash invalidates post-render work detail opening even before the next navigation event',async()=>{
  const hold=deferred(),f=navigationFixture({render:()=>hold.promise});f.location.hash='#works/work/1';const run=f.nav.apply();
  f.location.hash='#companies';hold.resolve();await run;assert.equal(f.calls.some(c=>c[0]==='work-open'),false);
});
test('home/share/invalid routes and failed preparation release the applying state without importing',async()=>{
  const home=navigationFixture({isHomeRoute:()=>true});await home.nav.apply();assert.deepEqual(home.calls.map(c=>c[0]),['invalidate','home']);
  const share=navigationFixture();share.location.href=buildSelectionShareUrl({baseUrl:share.location.href,datasetVersion:'v1',workIds:['1']});assert.equal(await share.nav.apply(),false);
  assert.deepEqual(share.calls.map(c=>c[0]),['invalidate']);
  const bad=navigationFixture();bad.location.hash='#unknown';assert.equal(await bad.nav.apply(),false);assert.equal(bad.calls.at(-1)[0],'replace');
  const fail=navigationFixture({render:async()=>{throw Error('render failed');}});await assert.rejects(fail.nav.apply(),/render failed/);assert.equal(fail.nav.applying,false);
});
function shareFixture(version='v1',workIds=['1','missing']){
  const calls=[],f={busy:false,fail:false,calls};
  const locationRef=new URL(buildSelectionShareUrl({baseUrl:'https://example.test',datasetVersion:version,workIds}));
  f.location=locationRef;f.api=createSharedSelectionController({locationRef,datasetVersion:'v1',authorityWorkIds:['1','2'],selectedIds:()=>['2'],
    importWorks:(...args)=>{if(f.fail)throw Error('import failed');if(f.busy)return false;calls.push(['import',...args]);return true;},
    view:{render:model=>calls.push(['render',model]),open:()=>calls.push(['open']),close:()=>calls.push(['close'])},clearHash:()=>calls.push(['clear']),announce:(...args)=>calls.push(['announce',...args])});return f;
}
test('share inspection never imports automatically; confirmation uses only validated IDs and requested mode',()=>{
  const f=shareFixture();f.api.open();assert.equal(f.calls.some(c=>c[0]==='import'),false);
  assert.deepEqual(f.calls.find(c=>c[0]==='render'&&c[1].ready)[1],{count:1,missing:1,ready:true,error:null});
  assert.equal(f.api.commit('replace'),true);assert.deepEqual(f.calls.find(c=>c[0]==='import'),['import',['1'],{mode:'replace'}]);assert.equal(f.api.commit('append'),false);
});
test('invalid or mismatched shares keep workspace untouched and cancellation discards the pending plan',()=>{
  const f=shareFixture('v2');f.api.open();assert.equal(f.api.commit('append'),false);assert.match(f.calls.at(-2)[1].error,/版本/);
  const valid=shareFixture();valid.api.open();valid.api.cancel();assert.equal(valid.api.commit('append'),false);
  valid.location.hash='#share=broken';valid.api.open();assert.equal(valid.calls.some(c=>c[0]==='import'),false);
});
test('busy or failed share commits remain pending and do not falsely clear the URL',()=>{
  const f=shareFixture();f.api.open();f.calls.length=0;f.busy=true;assert.equal(f.api.commit('append'),false);assert.deepEqual(f.calls,[]);
  f.busy=false;f.fail=true;assert.equal(f.api.commit('append'),false);assert.equal(f.calls.some(c=>c[0]==='clear'),false);
  f.fail=false;assert.equal(f.api.commit('append'),true);
});
test('share view owns only dialog presentation',()=>{
  const elements=Object.fromEntries(['message','count','missing','append','replace','dialog'].map(k=>[k,{}]));
  const view=createShareImportView({elements,openDialog:d=>d.open=true,closeDialog:d=>d.open=false});
  view.render({count:2,missing:1,ready:true,error:null});assert.equal(elements.count.textContent,'2');assert.equal(elements.append.disabled,false);
  view.open();assert.equal(elements.dialog.open,true);view.close();assert.equal(elements.dialog.open,false);
});
const exportSnapshot=()=>({company:false,rankedCount:1,state:{tiers:[{id:'s'}]},tierOrder:{s:['1']},worksById:new Map([['1',{workId:'1'}],['2',{workId:'2'}]]),presentation:{showTitles:true}});
function exportFixture(extra={}){
  const calls=[],f={busyImport:false,subject:'work',calls,snapshot:exportSnapshot()};
  const deps={isImportBusy:()=>f.busyImport,getSubject:()=>f.subject,getCompanyState:()=>({selectedCompanyIds:['c'],tierOrder:{s:['c']}}),
    exportWorksJson:()=>({filename:'work.json'}),downloadJson:r=>(calls.push(['json',r]),r),closeMenus:()=>calls.push(['menus']),
    pngSnapshot:()=>f.snapshot,exportPng:async options=>(calls.push(['png',options]),{blob:'blob',filename:'tier.png'}),
    environment:{createCanvas:()=>({}),fontsReady:()=>Promise.resolve(),loadCover:(...args)=>calls.push(['cover',...args]),download:r=>calls.push(['download',r])},
    isPngError:e=>e.known===true,onBusyChange:()=>calls.push(['busy',f.api.busy]),announce:(...args)=>calls.push(['announce',...args]),logError:e=>calls.push(['error',e]),...extra};
  f.api=createRankingExportController(deps);return f;
}
test('JSON uses existing work serializer and preserves the exact company schema',()=>{
  const f=exportFixture();assert.equal(f.api.json().filename,'work.json');f.subject='company';f.api.json();
  assert.deepEqual(JSON.parse(f.calls.find(c=>c[0]==='json')[1].text),{schemaVersion:1,selectedCompanyIds:['c'],tierOrder:{s:['c']}});
  f.busyImport=true;const count=f.calls.length;assert.equal(f.api.json(),false);assert.equal(f.calls.length,count);
});
test('PNG projection includes only ranked works and preserves the company item adapter',()=>{
  const snapshot=exportSnapshot();assert.deepEqual([...projectPngExport(snapshot).worksById.keys()],['1']);assert.equal(snapshot.worksById.size,2);
  snapshot.company=true;assert.equal(projectPngExport(snapshot).worksById,snapshot.worksById);
});
test('PNG is single-flight, uses the clicked subject through awaits and restores busy controls',async()=>{
  const hold=deferred();let options;const f=exportFixture({exportPng:o=>(options=o,hold.promise)});
  const first=f.api.png();assert.equal(f.api.busy,true);assert.equal(await f.api.png(),false);
  f.subject='company';f.snapshot={...exportSnapshot(),company:true};options.loadCover('path',{work:'record'});
  assert.equal(f.calls.find(c=>c[0]==='cover').at(-1),false);
  hold.resolve({filename:'tier.png',blob:'blob'});await first;assert.equal(f.api.busy,false);
  assert.deepEqual(f.calls.filter(c=>c[0]==='busy'),[['busy',true],['busy',false]]);
});
test('empty, import-busy and failed PNGs neither download nor leave the busy state stuck',async()=>{
  const f=exportFixture();f.snapshot.rankedCount=0;assert.equal(await f.api.png(),false);assert.deepEqual(f.calls,[]);
  const bad=exportFixture({exportPng:async()=>{throw Object.assign(Error('cover'),{known:true,code:'COVER_LOAD_FAILED'});}});
  assert.equal(await bad.api.png(),false);assert.equal(bad.api.busy,false);assert.equal(bad.calls.some(c=>c[0]==='download'),false);assert.equal(bad.calls.some(c=>c[0]==='error'),false);
  assert.match(bad.calls.find(c=>c[0]==='announce')[1],/封面加载失败/);
  assert.match(pngExportMessage({code:'UNSAFE_DIMENSIONS'},true),/画布限制/);
});
