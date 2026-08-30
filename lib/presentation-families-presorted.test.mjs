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
