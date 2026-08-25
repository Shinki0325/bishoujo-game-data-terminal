import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeightedRatingSort } from './rating-sort.js';
import { prepareBangumiPublicBindingsCarrier } from './bangumi-public-bindings.js';
import { prepareBangumiCanonicalAliasFallback } from './bangumi-canonical-alias-fallback.js';
import { prepareBangumiRatingsSidecar } from './bangumi-ratings.js';
import { projectWorkWithBangumiRating } from './bangumi-rating-view.js';
import { planBangumiPublicImport } from './bangumi-public-import.js';

const sha = 'a'.repeat(64);
const bindings = {
  schemaVersion: 'bangumi-public-bindings-v1',
  generatedAt: '2026-08-25T00:00:00Z',
  mappingPolicy: 'fixture',
  population: { admissionBindings: 0, admissionWorks: 0, ambiguousMultiSubject: 0, bindingCount: 2, catalogWorks: 2, confirmedSameWork: 2, coreBindings: 2, coreWorks: 2, distinctConfirmedSubjects: 2, noBangumiPair: 0, noVndbBinding: 0, nullVndbBindings: 0 },
  provenance: { sourceAdmissionsCarrierSha256: sha, sourceAdmissionsSha256: sha, sourceAdmissionsStatusCounts: { 'ambiguous-or-version-conflict': 0, 'confirmed-title-date': 0, 'no-confirmed-bangumi-pair': 0 }, sourceAuthoritySchemaVersion: 'fixture-authority-v1', sourceAuthoritySha256: sha, sourceBangumiRatingsSchemaVersion: 'egs-tier-bangumi-ratings-v1', sourceBangumiRatingsSha256: sha, sourceCandidateSha256: sha, sourceCatalogSha256: sha, sourceCatalogSnapshotId: 'fixture', sourceConnector: { buildNumber: '37', provider: 'tuihub/vndb_id_connector', sha256: sha } },
  bindings: [
    { bangumiSubjectId: '13', egsWorkId: '1', relation: 'same-work', vndbId: 'v4' },
    { bangumiSubjectId: '142', egsWorkId: '2', relation: 'same-work', vndbId: 'v33' }
  ]
};
const ratings = {
  bindingCounts: { ambiguousMultiSubject: 0, catalogWorks: 2, confirmedSameWork: 2, distinctConfirmedSubjects: 2, noBangumiPair: 0, noVndbBinding: 0 },
  generatedAt: '2026-08-24T03:59:00Z',
  mappingPolicy: 'fixture',
  ratingStatusCounts: { 'mapped-rated': 2, 'mapped-no-rating': 0, 'snapshot-unavailable': 0 },
  schemaVersion: 'egs-tier-bangumi-ratings-v1',
  sourceBangumiPublicBindingsSha256: sha,
  sourceCatalogSha256: sha,
  sourceCatalogSnapshotId: 'fixture',
  sourceConnector: { buildNumber: '37', provider: 'tuihub/vndb_id_connector', sha256: sha },
  works: [
    { bangumiSubjectId: '13', egsWorkId: '1', ratingStatus: 'mapped-rated', relation: 'same-work', retrievedAt: '2026-08-24T03:59:00Z', score: 8.9, vndbId: 'v4', voteCount: 6377 },
    { bangumiSubjectId: '142', egsWorkId: '2', ratingStatus: 'mapped-rated', relation: 'same-work', retrievedAt: '2026-08-24T03:59:00Z', score: 7.1, vndbId: 'v33', voteCount: 120 }
  ]
};
const alias = {
  generatedAt: '2026-08-24T16:00:00Z',
  schemaVersion: 'egs-tier-bangumi-canonical-alias-fallback-v1',
  sourceBangumiPublicBindingsSha256: sha,
  sourceCatalogSha256: sha,
  sourceCatalogSnapshotId: 'fixture',
  sourceEnrichmentSha256: sha,
  works: [
    { bangumiSubjectId: '13', displayTitle: 'A Title', workId: '1' }
  ]
};

test('Bangumi identity failure stays isolated from ratings, detail, sort and import', () => {
  const preparedBindings = prepareBangumiPublicBindingsCarrier(bindings, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2'] });
  const preparedRatings = prepareBangumiRatingsSidecar(ratings, { catalogSnapshotId: 'fixture', catalogSha256: sha, bangumiPublicBindingsSha256: sha, workIds: ['1', '2'] });
  assert.throws(() => prepareBangumiCanonicalAliasFallback({ ...alias, sourceBangumiPublicBindingsSha256: 'b'.repeat(64) }, { catalogSnapshotId: 'fixture', catalogSha256: sha, enrichmentSha256: sha, bangumiPublicBindingsSha256: sha, workIds: ['1', '2'] }));

  const projected = projectWorkWithBangumiRating({ workId: '1', title: 'Work 1' }, preparedRatings.ratingByWorkId);
  assert.equal(projected.bangumiRating.detailScore, '8.9');
  assert.equal(createWeightedRatingSort({ ratings: preparedRatings.ratingByWorkId, scoreField: 'score' }).score(8.9, 6377) > 0, true);

  const plan = planBangumiPublicImport({
    collections: [{ subjectId: '13', title: 'A Title' }, { subjectId: '999', title: 'Missing' }],
    confirmedBindings: preparedBindings.bindings,
    currentSelectedWorkIds: [],
    workLimit: 10
  });
  assert.equal(plan.matchedSubjectCount, 1);
  assert.equal(plan.unmatchedSubjectCount, 1);
});
