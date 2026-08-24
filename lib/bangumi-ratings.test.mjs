import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareBangumiRatingsSidecar } from './bangumi-ratings.js';
import { createBangumiRatingViewModel } from './bangumi-rating-view.js';

const sha = 'a'.repeat(64);
const sidecar = {
  bindingAuthoritySha256: sha,
  bindingCounts: { ambiguousMultiSubject: 1, catalogWorks: 3, confirmedSameWork: 2, distinctConfirmedSubjects: 2, noBangumiPair: 0, noVndbBinding: 0 },
  generatedAt: '2026-08-24T03:59:00Z',
  mappingPolicy: 'fixture',
  ratingStatusCounts: { 'mapped-rated': 1, 'mapped-no-rating': 1, 'snapshot-unavailable': 0 },
  schemaVersion: 'egs-tier-bangumi-ratings-v1',
  sourceCatalogSha256: sha,
  sourceCatalogSnapshotId: 'fixture',
  sourceConnector: { buildNumber: '37', provider: 'tuihub/vndb_id_connector', sha256: sha },
  works: [
    { bangumiSubjectId: '13', egsWorkId: '1', ratingStatus: 'mapped-rated', relation: 'same-work', retrievedAt: '2026-08-24T03:59:00Z', score: 8.9, vndbId: 'v4', voteCount: 6377 },
    { bangumiSubjectId: '142', egsWorkId: '2', ratingStatus: 'mapped-no-rating', relation: 'same-work', retrievedAt: '2026-08-24T03:59:00Z', score: null, vndbId: 'v33', voteCount: 0 }
  ]
};

test('accepts a partial confirmed Bangumi binding sidecar', () => {
  const prepared = prepareBangumiRatingsSidecar(sidecar, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2', '3'] });
  assert.equal(prepared.ratingByWorkId.get('1').bangumiSubjectId, '13');
  assert.equal(prepared.ratingByWorkId.has('3'), false);
  assert.deepEqual(createBangumiRatingViewModel(prepared.ratingByWorkId.get('2')), {
    detailScore: '暂无评分', detailVotes: null, sortScore: null, sortVoteCount: null, retrievedAt: '2026-08-24T03:59:00Z', status: 'mapped-no-rating', subjectId: '142', subjectUrl: 'https://bgm.tv/subject/142'
  });
});

test('accepts direct title/date evidence when the EGS work has no VNDB binding', () => {
  const direct = structuredClone(sidecar);
  direct.works[1].vndbId = null;
  const prepared = prepareBangumiRatingsSidecar(direct, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2', '3'] });
  assert.equal(prepared.ratingByWorkId.get('2').vndbId, null);
});

test('rejects an unlisted rating status', () => {
  const invalid = structuredClone(sidecar);
  invalid.works[0].ratingStatus = 'unmapped';
  assert.throws(() => prepareBangumiRatingsSidecar(invalid, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2', '3'] }));
});
