import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';

const catalogSha256 = 'a'.repeat(64);
const workIds = ['2016', '3174', '3454'];
const family = {
  catalogMemberWorkIds: ['2016', '3174'],
  defaultWorkId: '2016',
  members: [
    { default: true, label: 'PC · 2002', platform: 'PC', releaseDate: '2002-04-26', title: 'default', workId: '2016' },
    { default: false, label: 'PC · 2003', platform: 'PC', releaseDate: '2003-12-12', title: 'edition', workId: '3174' }
  ],
  presentationWorkId: 'vndb:v3',
  status: 'auto-version-family',
  title: 'default',
  vndbId: 'v3'
};
const sidecar = {
  families: [family],
  generatedAt: '2026-08-18T00:00:00Z',
  schemaVersion: 'egs-tier-full-presentation-families-v1',
  selectionPolicy: 'auto',
  sourceCatalogSha256: catalogSha256,
  sourceCatalogSnapshotId: 'catalog-v1',
  workToPresentationWorkId: { '2016': 'vndb:v3', '3174': 'vndb:v3' }
};

test('undecorated result identities match full projection; page decoration preserves family details',()=>{
 const projection=preparePresentationFamiliesSidecar(sidecar,{catalogSnapshotId:'catalog-v1',catalogSha256,workIds});
 const works=[work('3454',2186),work('2016',1234),work('3174',296)];
 const byId=new Map(works.map(w=>[w.workId,w]));
 for(const visible of [works,[works[2]]]){
  const options={workById:byId,sortKey:'voteCount',sortDirection:'desc',presorted:true};
  const full=projection.projectVisibleWorks(visible,options);
  const bare=projection.projectVisibleWorks(visible,{...options,decorate:false});
  assert.deepEqual(bare.map(w=>w.workId),full.map(w=>w.workId));
  assert.ok(bare.every(w=>w===byId.get(w.workId)));
  assert.deepEqual(projection.decorateWorks(bare),full);
 }
 const first=projection.projectVisibleWorks(works,{workById:byId,presorted:true,decorate:false});
 const second=projection.projectVisibleWorks(works,{workById:byId,presorted:true,decorate:false});
 assert.ok(first.every((w,i)=>w===second[i]));
 byId.get('2016').title='updated';assert.equal(projection.decorateWorks([byId.get('2016')])[0].title,'updated');
});

function work(workId, voteCount) {
  return {
    workId,
    title: workId,
    furigana: '',
    brandName: 'Leaf',
    median: 8,
    voteCount,
    brandId: 'leaf',
    rawFilterIds: [],
    filterIds: [],
    rawGenre: '',
    genreFilterIds: [],
    platformFilterId: 'pc',
    releaseDate: workId === '3174' ? '2003-12-12' : workId === '2016' ? '2002-04-26' : '2004-04-28'
  };
}

test('preserves worker order without a second sort when every default member is visible', () => {
  const projection = preparePresentationFamiliesSidecar(sidecar, {
    catalogSnapshotId: 'catalog-v1', catalogSha256, workIds
  });
  const works = [work('3454', 2186), work('2016', 1234), work('3174', 296)];
  const projected = projection.projectVisibleWorks(works, {
    sortKey: 'voteCount', sortDirection: 'desc', presorted: true
  });
  assert.deepEqual(projected.map(item => item.workId), ['3454', '2016']);
  assert.equal(projected[1].presentationMemberCount, 2);
});

test('falls back to projection sorting when only a non-default member is visible', () => {
  const projection = preparePresentationFamiliesSidecar(sidecar, {
    catalogSnapshotId: 'catalog-v1', catalogSha256, workIds
  });
  const allWorks = new Map(workIds.map((workId, index) => [workId, work(workId, 3000 - index)]));
  const projected = projection.projectVisibleWorks([allWorks.get('3174')], {
    sortKey: 'voteCount', sortDirection: 'desc', workById: allWorks, presorted: true
  });
  assert.deepEqual(projected.map(item => item.workId), ['2016']);
});

test('excludes a VNDB family when confirmed Bangumi subjects are distinct', () => {
  const projection = preparePresentationFamiliesSidecar(sidecar, {
    catalogSnapshotId: 'catalog-v1', catalogSha256, workIds,
    bangumiSubjectByWorkId: new Map([['2016', '4066'], ['3174', '22290']])
  });
  assert.equal(projection.excludedFamilyCount, 1);
  assert.equal(projection.familyForWork('2016'), null);
  assert.equal(projection.familyForWork('3174'), null);
});
