import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkDetailView } from './work-detail-view.js';
import { createWorkVersionView } from './work-version-view.js';

class Node {
  constructor(tag) { this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.textContent=''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) { return this.attributes[key]??null; }
  removeAttribute(key) { delete this.attributes[key];delete this[key]; }
  addEventListener(type,fn) { (this.listeners[type]??=[]).push(fn); }
  click() { this.onclick?.();for(const fn of this.listeners.click??[])fn(); }
  showModal() { this.open=true; }
}
const documentRef={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag),createTextNode:text=>Object.assign(new Node('#text'),{textContent:text})};
const nodes=keys=>Object.fromEntries(keys.split(' ').map(key=>[key,new Node('div')]));
const work={workId:'1',title:'作品甲',brandName:'会社',brandId:'brand',releaseDate:'2000-01-01',median:80,voteCount:32};
function fixture(partitionFilters=()=>({visible:[],collapsed:[]})) {
  const elements=nodes('detailsDialog detailsTitle detailsBrand detailsAliases detailsCover detailsCoverImage detailsRelease detailsScore detailsTags');
  return {elements,view:createWorkDetailView({elements,documentRef,partitionFilters,attributeGroupIds:new Set(['platform'])})};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('detail presentation preserves titles, aliases, rating snapshots and company action',()=>{
  const {view,elements:e}=fixture();const opened=[];
  view.render({...work,bangumiRating:{detailVotes:'12 人评分',detailScore:'81',retrievedAt:'2026-09-07T00:00:00Z',subjectUrl:'https://bgm.tv/subject/1'}},
    {workAliasesById:new Map([['1',['别名']]]),onOpenCompany:id=>opened.push(id),egsSnapshotAt:'2026-09-08T00:00:00Z'});
  assert.equal(e.detailsTitle.textContent,work.title);assert.equal(e.detailsAliases.textContent,'别名');
  assert.equal(e.detailsScore.children[0].children[1].textContent,'数据快照：2026-09-08');
  assert.equal(e.detailsScore.children[1].children[0].rel,'noopener noreferrer');
  e.detailsBrand.children[0].click();assert.deepEqual(opened,['brand']);assert.equal(e.detailsDialog.open,true);
  view.render(work);assert.equal(e.detailsAliases.hidden,true);
});

test('sensitive detail tags remain collapsed and toggle without changing order or classification',()=>{
  const {view,elements:e}=fixture(()=>({visible:[{displayTitle:'PC',groupId:'platform'}],collapsed:[{displayTitle:'成人',groupId:'adult'}]}));
  view.render(work);const [normal,control,adult]=e.detailsTags.children;
  assert.equal(normal.className,'details-tag-attribute');assert.equal(adult.className,'details-tag-adult');assert.equal(adult.hidden,true);
  const toggle=control.children[0];toggle.click();assert.equal(adult.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  toggle.click();assert.equal(adult.hidden,true);
});

test('same-work rapid reopen and suspension reject old cover completions; current failure gets fallback',async()=>{
  const {view,elements:e}=fixture(),first=deferred(),second=deferred();
  view.render(work,{detailMedia:{coverSources:()=>first.promise}});
  view.render(work,{detailMedia:{coverSources:()=>second.promise}});
  second.resolve({thumbnailUrl:'current.webp'});await tick();first.resolve({thumbnailUrl:'stale.webp'});await tick();
  assert.equal(e.detailsCoverImage.src,'current.webp');
  const third=deferred();view.render(work,{detailMedia:{coverSources:()=>third.promise,fallbackUrl:'fallback.webp'}});
  view.suspend();third.resolve({thumbnailUrl:'closed.webp'});await tick();assert.equal(e.detailsCoverImage.hidden,true);
  view.render(work,{detailMedia:{coverSources:()=>Promise.reject(Error('image')),fallbackUrl:'fallback.webp'}});await tick();
  assert.equal(e.detailsCoverImage.src,'fallback.webp');assert.equal(e.detailsCover.disabled,true);
});

test('version shelf owns expansion, preserves it only across version changes and keeps selection callback unique',()=>{
  const elements=nodes('detailsVersionToggle detailsVersionShelf detailsVersionList detailsVersionCurrent'),selected=[];
  const family={members:[{workId:'1',label:'PC',title:'甲',default:true},{workId:'2',label:'PS',title:'乙'}]};
  const view=createWorkVersionView({elements,documentRef,familyForWork:id=>id==='3'?null:family,onSelectWork:id=>selected.push(id)});
  view.render(work,{keepExpanded:false});assert.equal(elements.detailsVersionShelf.hidden,true);
  elements.detailsVersionToggle.click();assert.equal(elements.detailsVersionShelf.hidden,false);
  elements.detailsVersionList.children[1].click();assert.deepEqual(selected,['2']);
  view.render({...work,workId:'2'},{keepExpanded:true});assert.equal(elements.detailsVersionShelf.hidden,false);
  assert.equal(elements.detailsVersionList.children[1].getAttribute('aria-current'),'true');
  view.render(work,{keepExpanded:false});assert.equal(elements.detailsVersionShelf.hidden,true);
  view.render({...work,workId:'3'});assert.equal(elements.detailsVersionToggle.hidden,true);assert.equal(elements.detailsVersionList.children.length,0);
});
