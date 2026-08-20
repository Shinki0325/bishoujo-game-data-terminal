import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  PROJECT_ENTITY_BACKEND_MANIFEST_SCHEMA_VERSION,
  PROJECT_ENTITY_CONTRACT_SHA256,
  PROJECT_ENTITY_PROJECTION_MAPPING,
  validateProjectionEnvelope,
  verifyProjectionEnvelopeIntegrity,
} from './project-entity-consumer.js';

const binding = {
  contractSha256: PROJECT_ENTITY_CONTRACT_SHA256,
  catalogSnapshotId: 'snap_fixture_2026-08-21_00000000',
  catalogSha256: '1'.repeat(64),
  dataRevision: 'egs-project-m0-1-fixture-00000000',
  projectionShas: { indexes: '4'.repeat(64) },
};

const envelope = {
  schemaVersion: 'egs-platform-entity-projection-v1',
  contractSha256: PROJECT_ENTITY_CONTRACT_SHA256,
  projection: 'indexes',
  releaseId: 'relv_2026-08-21_00000000',
  dataRevision: binding.dataRevision,
  catalogSnapshotId: binding.catalogSnapshotId,
  catalogSha256: binding.catalogSha256,
  sourceSnapshots: [{ source: 'fixture-source', snapshotId: 'snap_fixture_source_0001', sha256: '3'.repeat(64) }],
  records: [],
  integrity: { recordCount: 0, payloadSha256: '4'.repeat(64) },
};

assert.equal(PROJECT_ENTITY_BACKEND_MANIFEST_SCHEMA_VERSION, 'egs-project-projection-manifest-v1');
assert.deepEqual(PROJECT_ENTITY_PROJECTION_MAPPING.relations, ['typed-relations.json']);
assert.deepEqual(validateProjectionEnvelope(envelope, binding, { projection: 'indexes' }).records, []);
await assert.rejects(() => verifyProjectionEnvelopeIntegrity(envelope, binding, { cryptoRef: webcrypto }), /payload SHA-256/);
assert.throws(() => validateProjectionEnvelope({ ...envelope, contractSha256: '0'.repeat(64) }, binding), /contract SHA-256/);

console.log('G0 consumer contract checks: 4/4');
