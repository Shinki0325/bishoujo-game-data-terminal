import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkCompareController } from './work-compare-controller.js';
import { compareRating, compareScoreText, compareValueFor, sortComparedWorks } from './work-compare-model.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}) {
  const records=Array.from({length:22},(_,n)=>({workId:String(n+1),title:`work ${n+1}`,median:n,releaseDate:`${2000+n}-01-01`}));
  const paints=[],changes=[],limits=[];let open=true;
  const c=createWorkCompareController({workForId:id=>records.find(row=>row.workId===id),loadCredits:async()=>null,
    renderDialog:s=>paints.push(s),isOpen:()=>open,onSelectionChanged:()=>changes.push(1),onActivated:()=>{},onLimit:n=>limits.push(n),...overrides});
  return {c,records,paints,changes,limits,close(){open=false;c.suspend();}};
}
test('comparison collection is independent, immutable to callers, unique and capped at twenty',()=>{
  const f=fixture();for(const work of f.records)f.c.toggle(work,true);
  assert.equal(f.c.ids.length,20);assert.deepEqual(f.limits,[20,20]);
  assert.throws(()=>f.c.ids.push('foreign'));assert.equal(f.c.toggle(f.records[0],true),false);
  f.c.toggle(f.records[0],false);assert.equal(f.c.ids.includes('1'),false);
  f.c.clear();assert.deepEqual(f.c.ids,[]);assert.equal(f.c.minimum,2);
});
test('comparison minimum and multi-work mode do not fetch unnecessary credits',async()=>{
  let calls=0;const f=fixture({loadCredits:async()=>{calls++;return null;}});
  assert.equal(await f.c.open(),false);f.c.toggle(f.records[0],true);assert.equal(await f.c.open(),false);
  f.c.toggle(f.records[1],true);f.c.toggle(f.records[2],true);assert.equal(await f.c.open(),true);
  assert.equal(calls,0);assert.equal(f.paints[0].works.length,3);
});
test('concurrent opening shares credits and only newest opening repaints',async()=>{
  const pending=deferred();let calls=0;
  const f=fixture({loadCredits:()=>{calls++;return pending.promise;}});f.records.slice(0,2).forEach(work=>f.c.toggle(work,true));
  const first=f.c.open(),second=f.c.open();await tick();assert.equal(calls,2);assert.equal(f.c.staffText('1','artwork'),'加载中…');
  pending.resolve({staff:{artwork:[{name:'原画甲'}]}});await Promise.all([first,second]);
  assert.equal(f.paints.length,3);assert.equal(f.c.staffText('1','artwork'),'原画甲');
  await f.c.open();assert.equal(calls,2);assert.equal(f.paints.length,4);
});
test('closing comparison suppresses late rendering while successful cache stays reusable',async()=>{
  const pending=deferred();let calls=0;
  const f=fixture({loadCredits:()=>{calls++;return pending.promise;}});f.records.slice(0,2).forEach(work=>f.c.toggle(work,true));
  const task=f.c.open();f.close();pending.resolve(null);await task;
  assert.equal(f.paints.length,1);assert.equal(f.c.staffText('1','artwork'),'未记录');
  await f.c.open();assert.equal(calls,2);
});
test('selection changes invalidate old pair results without discarding comparison collection',async()=>{
  const pending=deferred();const f=fixture({loadCredits:()=>pending.promise});f.records.slice(0,2).forEach(work=>f.c.toggle(work,true));
  const task=f.c.open();f.c.toggle(f.records[2],true);await f.c.open();pending.resolve(null);await task;
  assert.equal(f.paints.length,2);assert.equal(f.paints.at(-1).works.length,3);assert.equal(f.c.ids.length,3);
});
test('failed credits are not cached as missing data and reopen retries without a render loop',async()=>{
  let fail=true,calls=0;const f=fixture({loadCredits:async()=>{calls++;if(fail)throw Error('offline');return {staff:{scenario:[{name:'剧本甲'}]}};}});
  f.records.slice(0,2).forEach(work=>f.c.toggle(work,true));await f.c.open();
  assert.equal(f.c.staffText('1','scenario'),'暂时无法加载');assert.equal(calls,2);assert.equal(f.paints.length,2);
  fail=false;await f.c.open();assert.equal(calls,4);assert.equal(f.c.staffText('1','scenario'),'剧本甲');
  await f.c.open();assert.equal(calls,4);
});
test('sort is shared by desktop and mobile, numeric defaults descend while year and title ascend',async()=>{
  const f=fixture();f.records.slice(0,3).forEach(work=>f.c.toggle(work,true));
  await f.c.sort('year');assert.equal(f.paints.at(-1).sortDirection,'asc');assert.deepEqual(f.paints.at(-1).sorted.map(w=>w.workId),['1','2','3']);
  await f.c.sort('year');assert.equal(f.paints.at(-1).sortDirection,'desc');
  await f.c.sort('egsScore');assert.equal(f.paints.at(-1).sortDirection,'desc');
  await f.c.sort('title');assert.equal(f.paints.at(-1).sortDirection,'asc');
  const count=f.paints.length;assert.equal(await f.c.sort('cover'),false);assert.equal(f.paints.length,count);
});
test('rating sources retain their original scales and missing values sort last in both directions',()=>{
  const rated={workId:'1',title:'A',median:90,voteCount:123,bangumiRating:{sortScore:8.5,sortVoteCount:30,detailScore:'8.5',detailVotes:'30 人评分'}};
  assert.deepEqual(compareRating(rated,'egs'),{score:90,votes:123});assert.equal(compareValueFor(rated,'bangumiScore'),8.5);
  assert.equal(compareScoreText(rated,'bangumi'),'8.5 / 30 人评分');assert.equal(compareScoreText({},'vndb'),'暂无评分');
  assert.equal(compareValueFor({releaseDate:''},'year'),null);
  const input=[{workId:'missing',title:'M'},rated,{workId:'2',title:'B',median:80}];
  for(const direction of ['asc','desc'])assert.equal(sortComparedWorks(input,'egsScore',direction).at(-1).workId,'missing');
  assert.equal(input[0].workId,'missing');
});
test('main delegates comparison state and views without reverse imports or ranking ownership duplication',async()=>{
  const main=await readFile(new URL('../main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/let compareWorkIds|compareCreditsCache|compareSortKey|function createCompareHeader|function compareRating/);
  assert.match(main,/comparison\.suspend\(\)/);
  for(const file of ['work-compare-model.js','work-compare-controller.js','../views/work-compare-view.js']) {
    const text=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(text,/from ['"].*main\.js|localStorage|createAppController|pushState|replaceState|new Proxy/);
  }
});
