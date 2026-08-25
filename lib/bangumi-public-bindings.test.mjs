import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareBangumiPublicBindingsCarrier } from './bangumi-public-bindings.js';

const sha = 'a'.repeat(64);
const carrier = {
  schemaVersion: 'bangumi-public-bindings-v1',
  generatedAt: '2026-08-25T00:00:00Z',
  mappingPolicy: 'fixture',
  population: {
    admissionBindings: 0,
    admissionWorks: 0,
    ambiguousMultiSubject: 0,
    bindingCount: 2,
    catalogWorks: 3,
    confirmedSameWork: 2,
    coreBindings: 2,
    coreWorks: 3,
    distinctConfirmedSubjects: 2,
    noBangumiPair: 0,
    noVndbBinding: 1,
    nullVndbBindings: 1
  },
  provenance: {
    sourceAdmissionsCarrierSha256: sha,
    sourceAdmissionsSha256: sha,
    sourceAdmissionsStatusCounts: {
      'ambiguous-or-version-conflict': 0,
      'confirmed-title-date': 0,
      'no-confirmed-bangumi-pair': 0
    },
    sourceAuthoritySchemaVersion: 'fixture-authority-v1',
    sourceAuthoritySha256: sha,
    sourceBangumiRatingsSchemaVersion: 'egs-tier-bangumi-ratings-v1',
    sourceBangumiRatingsSha256: sha,
    sourceCandidateSha256: sha,
    sourceCatalogSha256: sha,
    sourceCatalogSnapshotId: 'fixture',
    sourceConnector: { buildNumber: '37', provider: 'tuihub/vndb_id_connector', sha256: sha }
  },
  bindings: [
    { bangumiSubjectId: '13', egsWorkId: '1', relation: 'same-work', vndbId: 'v4' },
    { bangumiSubjectId: '142', egsWorkId: '2', relation: 'same-work', vndbId: null }
  ]
};

test('prepares a public bindings carrier with readonly lookup maps', () => {
  const prepared = prepareBangumiPublicBindingsCarrier(carrier, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2', '3'] });
  assert.equal(prepared.bindings.length, 2);
  assert.equal(prepared.bindingByWorkId.get('1').bangumiSubjectId, '13');
  assert.equal(prepared.bindingBySubjectId.get('142')[0].egsWorkId, '2');
});

test('rejects a carrier whose work ids are not unique', () => {
  const invalid = structuredClone(carrier);
  invalid.bindings.push({ bangumiSubjectId: '143', egsWorkId: '2', relation: 'same-work', vndbId: 'v5' });
  assert.throws(() => prepareBangumiPublicBindingsCarrier(invalid, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['1', '2', '3'] }));
});
