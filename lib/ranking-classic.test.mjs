import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingPresentation } from './ranking-presentation.js';
import { planTierPng } from './png-export.js';
import { projectPngExport } from './ranking-export-controller.js';
import { wrappedInsertionIndex } from '../views/ranking-view.js';
const fixture = (initial = null) => {
  let json = initial, writes = 0;
  const io = { read: () => json, write: (_, value) => { json = value; writes++; } };
  return { api: createRankingPresentation(io), reload: () => createRankingPresentation(io), writes: () => writes };
};
test('classic and garden restore independent display profiles without touching annotations', () => {
  const f = fixture(); const p = f.api;
  p.setShowCounts(true); p.setShowTitles(true); p.setUiScale('overall', 115); p.setAnnotation('w1', '记录');
  const before = p.inspect(); p.setDisplayStyle('classic');
  assert.equal(p.inspect().showTitles, false); assert.equal(p.inspect().uiScale.overall, 100);
  p.setDensity('compact'); p.setDisplayShape('portrait'); p.setShowTitles(true);
  p.setDisplayStyle('garden'); assert.deepEqual(p.inspect(), before);
  p.setDisplayStyle('classic'); assert.equal(p.inspect().uiScale.card, 80); assert.equal(p.inspect().display.shape, 'portrait');
  assert.equal(p.inspect().annotations.w1, '记录'); assert.deepEqual(f.reload().inspect(), p.inspect());
});
test('legacy settings remain intact and unavailable storage does not block switching', () => {
  const f = fixture(JSON.stringify({ showTitles: true, uiScale: { card: 125, controls: 110 }, annotations: { w1: '旧标注' } }));
  assert.equal(f.api.inspect().uiScale.card, 125); assert.equal(f.api.inspect().uiScale.tierName, 110);
  f.api.setDisplayStyle('classic'); f.api.setDisplayStyle('garden'); assert.equal(f.api.inspect().uiScale.card, 125);
  const p = createRankingPresentation({ read: () => { throw Error(); }, write: () => { throw Error(); } });
  p.setDisplayStyle('classic'); assert.equal(p.inspect().display.style, 'classic');
});
test('live preview defers storage, density removes compound scale, invalid values reject', () => {
  const f = fixture(); f.api.setUiScale('card', 135, { persistChange: false }); assert.equal(f.writes(), 0);
  f.api.saveDisplay(); assert.equal(f.writes(), 1);
  f.api.setUiScale('overall', 140); f.api.setDensity('spacious'); assert.equal(f.api.inspect().uiScale.overall, 100);
  assert.equal(f.api.inspect().uiScale.card, 130);
  assert.throws(() => f.api.setDisplayStyle('bad')); assert.throws(() => f.api.setDisplayShape('bad'));
});
const tiers = ['s', 'a', 'b'].map(id => ({ id, name: id.toUpperCase(), colorId: 'coral' }));
test('wrapped drag insertion targets the intended line and handles empty/end positions', () => {
  const rects = Array.from({ length: 8 }, (_, i) => ({ left: i % 3 * 80, right: (i % 3 + 1) * 80, top: Math.floor(i / 3) * 80, bottom: (Math.floor(i / 3) + 1) * 80 }));
  assert.equal(wrappedInsertionIndex(rects, 5, 100), 3); assert.equal(wrappedInsertionIndex(rects, 200, 180), 8);
  assert.equal(wrappedInsertionIndex(rects, 5, -10), 0); assert.equal(wrappedInsertionIndex([], 50, 50), 0);
});
const work = { workId: 'w1', title: '封面', coverPath: 'media/test.webp', coverWidth: 200, coverHeight: 300 };
const input = p => ({ tiers, tierOrder: { s: ['w1'], a: [], b: [] }, worksById: new Map([['w1', work]]), presentation: p.inspect(), logicalMaxWidth: 740, pixelRatio: 1 });
test('tier width is independent of card scale and persists across display profiles', () => {
  const f = fixture(), p = f.api;
  p.setDisplayStyle('classic'); p.setUiScale('tierWidth', 140);
  assert.equal(planTierPng(input(p)).tiers[0].items[0].x, 140);
  p.setUiScale('card', 160);
  const item = planTierPng(input(p)).tiers[0].items[0];
  assert.equal(item.x, 140); assert.equal(item.width, 128);
  p.setDisplayStyle('garden'); assert.equal(p.inspect().uiScale.tierWidth, 100);
  p.setDisplayStyle('classic'); assert.equal(p.inspect().uiScale.tierWidth, 140);
  assert.equal(f.reload().inspect().uiScale.tierWidth, 140);
});
test('old five-key PNG presentation still uses the default tier width', () => {
  const p = fixture().api; p.setDisplayStyle('classic');
  const value = input(p);
  value.presentation = {...value.presentation, uiScale: {...value.presentation.uiScale}};
  delete value.presentation.uiScale.tierWidth;
  assert.equal(planTierPng(value).tiers[0].items[0].x, 100);
});
test('base canvas reserves space without scaling covers and compact stays small', () => {
  const p = fixture().api; p.setDisplayStyle('classic');
  const value = input(p), snapshot = { ...value, state: { tiers } };
  const base = planTierPng(projectPngExport(snapshot));
  assert.equal(base.logicalWidth, 960); assert.equal(base.logicalHeight, 540);
  assert.equal(base.tiers[0].items[0].width, 80);
  assert.equal(base.tiers[0].label.height, 80);
  assert.equal(base.tiers[1].label.y, 80);
  assert.equal(base.tiers[2].label.y + base.tiers[2].label.height, 240);
  const compact = planTierPng(projectPngExport({ ...snapshot, exportCanvas: 'compact' }));
  assert.equal(compact.logicalWidth, 320); assert.equal(compact.logicalHeight, 240);
  const high = planTierPng(projectPngExport({ ...snapshot, exportQuality: 'high' }));
  assert.equal(high.pixelWidth, 1920); assert.equal(high.pixelHeight, 1080);
  const works = new Map(Array.from({length: 100}, (_, i) => [`w${i}`, {...work, workId: `w${i}`} ]));
  const large = planTierPng(projectPngExport({...snapshot, worksById: works, tierOrder: {s: [...works.keys()], a: [], b: []}}));
  assert.ok(large.logicalHeight > 540); assert.equal(large.tiers[0].items.length, 100);
});
for (const shape of ['square', 'portrait', 'landscape', 'contain']) {
  test(`base canvas never inserts a strip below populated classic ${shape} tiers`, () => {
    const p = fixture().api; p.setDisplayStyle('classic'); p.setDisplayShape(shape); p.setUiScale('card', 125);
    const list = ['s','a','b','c','d'].map(id => ({id,name:id.toUpperCase(),colorId:'coral'}));
    const works = new Map(list.map(t => [t.id,{...work,workId:t.id}]));
    const order = Object.fromEntries(list.map(t=>[t.id,[t.id]]));
    const plan=planTierPng(projectPngExport({state:{tiers:list},tierOrder:order,worksById:works,presentation:p.inspect()}));
    for (let i=0;i<plan.tiers.length;i++) {
      const tier=plan.tiers[i],item=tier.items[0];
      assert.equal(tier.label.y+tier.label.height,item.y+item.height);
      if(i<plan.tiers.length-1) assert.equal(item.y+item.height,plan.tiers[i+1].items[0].y);
    }
    assert.ok(plan.logicalHeight>=540);
  });
}
test('invalid minimum canvas dimensions reject without relaxing pixel safety limits', () => {
  const value = input(fixture().api);
  for (const logicalMinHeight of [-1, NaN, Infinity, 0.5, 20000]) {
    assert.throws(() => planTierPng({...value, logicalMinHeight}), e => e.code === 'UNSAFE_DIMENSIONS');
  }
  assert.throws(() => planTierPng({...value, logicalMinHeight: 16384, pixelRatio: 2}));
});
for (const [shape, width, height] of [['square', 80, 80], ['portrait', 80, 120], ['landscape', 130, 80], ['contain', 80 * 200 / 300, 80]]) {
  test(`classic PNG ${shape} uses the same card geometry without gutters`, () => {
    const p = fixture().api; p.setDisplayStyle('classic'); p.setDisplayShape(shape);
    const plan = planTierPng(input(p)); const item = plan.tiers[0].items[0];
    assert.equal(item.x, 100); assert.equal(item.width, width); assert.equal(item.height, height);
    assert.equal(plan.logicalHeight, height * 3); assert.equal(plan.showTitles, false);
  });
}
test('garden PNG geometry is unchanged and malformed display rejects safely', () => {
  const p = fixture().api; const plan = planTierPng(input(p)); assert.equal(plan.tiers[0].items[0].width, 160);
  assert.throws(() => planTierPng({ ...input(p), presentation: { ...p.inspect(), display: { style: 'bad', shape: 'square' } } }));
});
test('uncropped classic images have proportional widths and wrap without empty square slots', () => {
  const p = fixture().api; p.setDisplayStyle('classic'); p.setDisplayShape('contain');
  const works = new Map([['w1',work],['w2',{...work,workId:'w2',coverWidth:600,coverHeight:300}],['w3',{...work,workId:'w3',coverWidth:400,coverHeight:300}]]);
  const plan = planTierPng({...input(p),logicalMaxWidth:320,worksById:works,tierOrder:{s:['w1','w2','w3'],a:[],b:[]}});
  const [one,two,three]=plan.tiers[0].items;
  assert.equal(two.x,one.x+one.width);assert.equal(two.y,one.y);assert.equal(three.x,100);assert.equal(three.y,80);
  assert.equal(plan.columns,2);assert.equal(plan.logicalHeight,320);
  for(const item of [one,two,three])assert.ok(Math.abs(item.width/item.height-item.coverWidth/item.coverHeight)<1e-10);
});
