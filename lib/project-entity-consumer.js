import { createWorkDetailCreditsLoader, validateWorkDetailCreditsIndex } from './work-detail-credits.js';

const SCHEMA_VERSION = 'egs-platform-entity-projection-v1';
const G0_CONTRACT_SHA256 = 'e4a8803c31c41b67e67f95f76e0f132b08311be5001686ad7f6cace102a3acf4';
const BACKEND_MANIFEST_SCHEMA_VERSION = 'egs-project-projection-manifest-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u;
const SHARD_PATH_PATTERN = /^shards\/[A-Za-z0-9._-]+\.json$/u;
const PROJECTIONS = new Set(['identity', 'relations', 'indexes', 'media']);
const PROJECTION_MAPPING = Object.freeze({
  identity: Object.freeze(['entity-registry.json', 'legacy-id-map.json', 'name-variants.json', 'source-claims.json']),
  relations: Object.freeze(['typed-relations.json']),
  indexes: Object.freeze(['index-*.json']),
  media: Object.freeze(['media-relations.json'])
});
const ENVELOPE_FIELDS = new Set([
  'schemaVersion', 'contractSha256', 'projection', 'releaseId', 'dataRevision',
  'catalogSnapshotId', 'catalogSha256', 'sourceSnapshots', 'records', 'integrity'
]);
const INTEGRITY_FIELDS = new Set(['recordCount', 'payloadSha256']);
const SOURCE_SNAPSHOT_FIELDS = new Set(['source', 'snapshotId', 'sha256']);
const CANONICAL_MANIFEST_SCHEMA_VERSION = 'egs-project-projection-manifest-v1';
const CANONICAL_MANIFEST_FIELDS = new Set([
  'schemaVersion', 'projection', 'contractSha256', 'publicationStatus', 'releaseId',
  'dataRevision', 'catalogSnapshotId', 'sourceSnapshots', 'artifacts'
]);
const CANONICAL_ARTIFACT_FIELDS = new Set(['path', 'schemaVersion', 'sha256', 'recordCount']);
const CANONICAL_ARTIFACTS = Object.freeze({
  'entity-registry.json': 'egs-project-entity-registry-v1',
  'legacy-id-map.json': 'egs-project-legacy-id-map-v1',
  'source-claims.json': 'egs-project-source-claim-v1',
  'typed-relations.json': 'egs-project-typed-relation-v1',
  'name-variants.json': 'egs-project-name-variant-v1',
  'media-relations.json': 'egs-project-media-relation-v1',
  'index-000.json': 'egs-project-index-v1'
});
const PUBLIC_MEDIA_RIGHTS = new Set(['cleared-public', 'owner-cleared']);
const M1_CANONICAL_WORK_COUNT = 6799;

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function assertExactFields(value, fields, label) {
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some(key => !fields.has(key))) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function serializeProjectionRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('projection records must be an array');
  return stableStringify(records);
}

function assertBinding(binding) {
  const candidate = assertObject(binding, 'projection binding');
  assertText(candidate.catalogSnapshotId, 'projection binding.catalogSnapshotId');
  assertSha256(candidate.catalogSha256, 'projection binding.catalogSha256');
  assertText(candidate.dataRevision, 'projection binding.dataRevision');
  assertSha256(candidate.contractSha256, 'projection binding.contractSha256');
  if (candidate.contractSha256 !== G0_CONTRACT_SHA256) throw new TypeError('projection binding contract SHA-256 is unsupported');
  if (candidate.projectionShas !== undefined) {
    assertObject(candidate.projectionShas, 'projection binding.projectionShas');
    for (const [projection, sha256] of Object.entries(candidate.projectionShas)) {
      if (!PROJECTIONS.has(projection)) throw new TypeError(`unknown projection SHA: ${projection}`);
      assertSha256(sha256, `projection binding.projectionShas.${projection}`);
    }
  }
  return candidate;
}

function validateSourceSnapshots(value) {
  if (!Array.isArray(value)) throw new TypeError('sidecar sourceSnapshots must be an array');
  return Object.freeze(value.map((source, index) => {
    const item = assertObject(source, `sidecar sourceSnapshots[${index}]`);
    assertExactFields(item, SOURCE_SNAPSHOT_FIELDS, `sidecar sourceSnapshots[${index}]`);
    assertText(item.source, `sidecar sourceSnapshots[${index}].source`);
    assertText(item.snapshotId, `sidecar sourceSnapshots[${index}].snapshotId`);
    assertSha256(item.sha256, `sidecar sourceSnapshots[${index}].sha256`);
    return Object.freeze({ ...item });
  }));
}

/**
 * Validate the common M0 projection envelope against the active catalog binding.
 * This function intentionally does not attempt partial recovery: a mismatched
 * projection is unavailable and callers must retain the legacy EGS view.
 */
export function validateProjectionEnvelope(value, binding, { projection } = {}) {
  const envelope = assertObject(value, 'projection sidecar');
  assertExactFields(envelope, ENVELOPE_FIELDS, 'projection sidecar');
  const expected = assertBinding(binding);
  if (envelope.schemaVersion !== SCHEMA_VERSION) throw new TypeError('projection sidecar schemaVersion is unsupported');
  if (envelope.contractSha256 !== expected.contractSha256 || envelope.contractSha256 !== G0_CONTRACT_SHA256) throw new TypeError('projection sidecar contract SHA-256 does not match the G0 contract');
  if (!PROJECTIONS.has(envelope.projection) || (projection !== undefined && envelope.projection !== projection)) {
    throw new TypeError('projection sidecar projection is invalid');
  }
  assertText(envelope.releaseId, 'projection sidecar.releaseId');
  if (envelope.dataRevision !== expected.dataRevision) throw new TypeError('projection sidecar dataRevision does not match the catalog binding');
  if (envelope.catalogSnapshotId !== expected.catalogSnapshotId) throw new TypeError('projection sidecar catalogSnapshotId does not match the catalog binding');
  if (envelope.catalogSha256 !== expected.catalogSha256) throw new TypeError('projection sidecar catalog SHA-256 does not match the catalog binding');
  if (!Array.isArray(envelope.records)) throw new TypeError('projection sidecar.records must be an array');
  const integrity = assertObject(envelope.integrity, 'projection sidecar.integrity');
  assertExactFields(integrity, INTEGRITY_FIELDS, 'projection sidecar.integrity');
  if (integrity.recordCount !== envelope.records.length) throw new TypeError('projection sidecar recordCount does not match records');
  assertSha256(integrity.payloadSha256, 'projection sidecar.integrity.payloadSha256');
  if (expected.projectionShas?.[envelope.projection] !== undefined && expected.projectionShas[envelope.projection] !== integrity.payloadSha256) {
    throw new TypeError(`projection sidecar ${envelope.projection} SHA-256 does not match the binding`);
  }
  validateSourceSnapshots(envelope.sourceSnapshots);
  return Object.freeze({
    ...envelope,
    sourceSnapshots: Object.freeze(envelope.sourceSnapshots.map(source => Object.freeze({ ...source }))),
    records: Object.freeze(envelope.records.slice()),
    integrity: Object.freeze({ ...integrity })
  });
}

export const PROJECT_ENTITY_SCHEMA_VERSION = SCHEMA_VERSION;
export const PROJECT_ENTITY_CONTRACT_SHA256 = G0_CONTRACT_SHA256;
export const PROJECT_ENTITY_BACKEND_MANIFEST_SCHEMA_VERSION = BACKEND_MANIFEST_SCHEMA_VERSION;
export const PROJECT_ENTITY_PROJECTION_MAPPING = PROJECTION_MAPPING;
export const PROJECT_ENTITY_PROJECTIONS = Object.freeze([...PROJECTIONS]);

export const DEFAULT_PROJECT_ENTITY_FEATURE_FLAGS = Object.freeze({
  entityRelationsV1: false,
  workDetailV1: false,
  personPageV1: false,
  characterPageV1: false,
  mediaProjectionV1: false,
  lazyProjectionShardsV1: false
});

export function resolveProjectEntityFeatureFlags(overrides = {}) {
  const candidate = assertObject(overrides, 'feature flag overrides');
  for (const key of Object.keys(candidate)) {
    if (!Object.hasOwn(DEFAULT_PROJECT_ENTITY_FEATURE_FLAGS, key)) throw new TypeError(`unknown project entity feature flag: ${key}`);
    if (typeof candidate[key] !== 'boolean') throw new TypeError(`project entity feature flag ${key} must be boolean`);
  }
  return Object.freeze({ ...DEFAULT_PROJECT_ENTITY_FEATURE_FLAGS, ...candidate });
}

function legacyVm(kind, legacy, key) {
  const value = assertObject(legacy ?? {}, `${kind} legacy view model`);
  return Object.freeze({ ...value, [key]: value[key] ?? null, source: 'legacy' });
}

function projectedVm(kind, legacy, record, key) {
  const base = assertObject(legacy ?? {}, `${kind} legacy view model`);
  return Object.freeze({ ...base, ...record, [key]: record[key], source: 'projected' });
}

function recordFor(records, predicate) {
  if (!Array.isArray(records)) return null;
  return records.find(predicate) ?? null;
}

function useProjection(projection, flags, requiredFlag) {
  return flags[requiredFlag] === true && projection !== null && projection !== undefined;
}

export function adaptWorkDetailVM({ workId, legacy = {}, projection = null, featureFlags = {} } = {}) {
  assertText(workId, 'work detail workId');
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  if (!useProjection(projection, flags, 'entityRelationsV1')) return legacyVm('work detail', legacy, 'workId');
  const record = recordFor(projection.records, item => item?.workId === workId);
  return record === null ? legacyVm('work detail', legacy, 'workId') : projectedVm('work detail', legacy, record, 'workId');
}

function assertCanonicalBinding(binding) {
  const candidate = assertBinding(binding);
  assertSha256(candidate.manifestSha256, 'canonical snapshot binding.manifestSha256');
  const artifactShas = assertObject(candidate.artifactShas, 'canonical snapshot binding.artifactShas');
  const expectedPaths = Object.keys(CANONICAL_ARTIFACTS);
  if (Object.keys(artifactShas).length !== expectedPaths.length || expectedPaths.some(path => artifactShas[path] === undefined)) {
    throw new TypeError('canonical snapshot binding artifact SHA set is invalid');
  }
  for (const path of expectedPaths) assertSha256(artifactShas[path], `canonical snapshot binding.artifactShas.${path}`);
  return Object.freeze({ ...candidate, artifactShas: Object.freeze({ ...artifactShas }) });
}

function isPublicConfirmed(value) {
  return value?.visibility === 'public' && value?.assertionStatus === 'confirmed';
}

function sourceSnapshotMatchesCatalog(sourceSnapshots, catalogSha256) {
  return sourceSnapshots.some(item => item.source === 'egs' && item.sha256 === catalogSha256);
}

function validateCanonicalManifest(value, binding) {
  const manifest = assertObject(value, 'canonical snapshot manifest');
  assertExactFields(manifest, CANONICAL_MANIFEST_FIELDS, 'canonical snapshot manifest');
  if (manifest.schemaVersion !== CANONICAL_MANIFEST_SCHEMA_VERSION || manifest.projection !== 'entity-index-v1') {
    throw new TypeError('canonical snapshot manifest schema is unsupported');
  }
  if (manifest.contractSha256 !== binding.contractSha256 || manifest.contractSha256 !== G0_CONTRACT_SHA256) {
    throw new TypeError('canonical snapshot manifest contract SHA-256 does not match the G0 contract');
  }
  if (manifest.publicationStatus !== 'source-only') throw new TypeError('canonical snapshot publication boundary is unsupported');
  if (manifest.dataRevision !== binding.dataRevision || manifest.releaseId !== binding.dataRevision) {
    throw new TypeError('canonical snapshot data revision does not match the binding');
  }
  if (manifest.catalogSnapshotId !== binding.catalogSnapshotId) throw new TypeError('canonical snapshot catalog snapshot does not match the binding');
  const sourceSnapshots = validateSourceSnapshots(manifest.sourceSnapshots);
  if (!sourceSnapshotMatchesCatalog(sourceSnapshots, binding.catalogSha256)) {
    throw new TypeError('canonical snapshot catalog SHA-256 does not match the binding');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== Object.keys(CANONICAL_ARTIFACTS).length) {
    throw new TypeError('canonical snapshot artifact set is invalid');
  }
  const artifacts = new Map();
  for (const candidate of manifest.artifacts) {
    const artifact = assertObject(candidate, 'canonical snapshot artifact');
    assertExactFields(artifact, CANONICAL_ARTIFACT_FIELDS, 'canonical snapshot artifact');
    if (typeof artifact.path !== 'string' || CANONICAL_ARTIFACTS[artifact.path] === undefined || artifacts.has(artifact.path)) {
      throw new TypeError('canonical snapshot artifact path is invalid');
    }
    if (artifact.schemaVersion !== CANONICAL_ARTIFACTS[artifact.path]) throw new TypeError('canonical snapshot artifact schema is invalid');
    assertSha256(artifact.sha256, 'canonical snapshot artifact SHA-256');
    if (artifact.sha256 !== binding.artifactShas[artifact.path]) throw new TypeError('canonical snapshot artifact SHA-256 does not match the binding');
    if (!Number.isSafeInteger(artifact.recordCount) || artifact.recordCount < 0) throw new TypeError('canonical snapshot artifact recordCount is invalid');
    artifacts.set(artifact.path, Object.freeze({ ...artifact }));
  }
  return Object.freeze({ ...manifest, sourceSnapshots, artifacts });
}

function recordsForArtifact(artifact, expectedSchema, key) {
  if (artifact?.schemaVersion !== expectedSchema || !Array.isArray(artifact[key])) {
    throw new TypeError(`canonical snapshot ${expectedSchema} records are invalid`);
  }
  return artifact[key];
}

function prepareCanonicalSnapshot(artifacts, manifest) {
  const entities = recordsForArtifact(artifacts.get('entity-registry.json'), 'egs-project-entity-registry-v1', 'entities');
  const legacyEntries = recordsForArtifact(artifacts.get('legacy-id-map.json'), 'egs-project-legacy-id-map-v1', 'entries');
  const claims = recordsForArtifact(artifacts.get('source-claims.json'), 'egs-project-source-claim-v1', 'claims');
  const relations = recordsForArtifact(artifacts.get('typed-relations.json'), 'egs-project-typed-relation-v1', 'relations');
  const mediaRelations = recordsForArtifact(artifacts.get('media-relations.json'), 'egs-project-media-relation-v1', 'mediaRelations');
  const indexEntries = recordsForArtifact(artifacts.get('index-000.json'), 'egs-project-index-v1', 'entries');
  const entitiesById = new Map(entities.map(entity => [entity?.entityId, entity]));
  const legacyByWorkId = new Map();
  for (const entry of legacyEntries) {
    if (entry?.legacyNamespace !== 'egs-work' || entry.status !== 'active' || typeof entry.legacyId !== 'string' || typeof entry.canonicalEntityId !== 'string' || legacyByWorkId.has(entry.legacyId)) {
      throw new TypeError('canonical snapshot legacy work mapping is invalid');
    }
    legacyByWorkId.set(entry.legacyId, entry);
  }
  const indexedByWorkId = new Map();
  for (const entry of indexEntries) {
    if (typeof entry?.key !== 'string' || !Array.isArray(entry.entityIds) || entry.entityIds.length !== 1 || !Array.isArray(entry.relationIds) || entry.relationIds.length !== 1 || indexedByWorkId.has(entry.key)) {
      throw new TypeError('canonical snapshot work index is invalid');
    }
    indexedByWorkId.set(entry.key, entry);
  }
  if (legacyByWorkId.size !== M1_CANONICAL_WORK_COUNT || indexedByWorkId.size !== M1_CANONICAL_WORK_COUNT || legacyByWorkId.size !== indexedByWorkId.size) {
    throw new TypeError('canonical snapshot must map exactly 6799 works');
  }
  const workById = new Map();
  for (const [workId, legacy] of legacyByWorkId) {
    const indexed = indexedByWorkId.get(workId);
    const entity = entitiesById.get(legacy.canonicalEntityId);
    if (indexed?.entityIds[0] !== legacy.canonicalEntityId || entity?.entityType !== 'work' || entity.status !== 'active') {
      throw new TypeError('canonical snapshot work ID to entity mapping drifted');
    }
    workById.set(workId, entity);
  }
  const relationsBySubject = new Map();
  for (const relation of relations) {
    if (!isPublicConfirmed(relation)) continue;
    const list = relationsBySubject.get(relation.subject) ?? [];
    list.push(relation);
    relationsBySubject.set(relation.subject, list);
  }
  const mediaByTarget = new Map();
  for (const relation of mediaRelations) {
    if (!isPublicConfirmed(relation) || !PUBLIC_MEDIA_RIGHTS.has(relation.rightsStatus) || relation.targetType !== 'work') continue;
    const list = mediaByTarget.get(relation.targetEntityId) ?? [];
    list.push(relation);
    mediaByTarget.set(relation.targetEntityId, list);
  }
  const claimsByEntity = new Map();
  for (const claim of claims) {
    if (claim?.assertionStatus !== 'confirmed' || typeof claim.canonicalEntityId !== 'string') continue;
    const list = claimsByEntity.get(claim.canonicalEntityId) ?? [];
    list.push(claim);
    claimsByEntity.set(claim.canonicalEntityId, list);
  }
  return Object.freeze({ manifest, entitiesById, legacyByWorkId, workById, relationsBySubject, mediaByTarget, claimsByEntity });
}

function availability(availabilityValue, status, items = []) {
  return Object.freeze({ availability: availabilityValue, status, items: Object.freeze(items.slice()) });
}

function makeWorkDetailSnapshotVm({ workId, canonicalEntityId, legacy, snapshot, detail }) {
  const work = snapshot.workById.get(workId);
  const editions = (snapshot.relationsBySubject.get(canonicalEntityId) ?? [])
    .filter(relation => relation.relationType === 'work-has-edition' && snapshot.entitiesById.get(relation.object)?.entityType === 'edition')
    .map(relation => Object.freeze({
      editionEntityId: relation.object,
      assertionStatus: relation.assertionStatus,
      visibility: relation.visibility,
      scope: relation.scope,
      validFromSnapshot: relation.validFromSnapshot,
      validToSnapshot: relation.validToSnapshot
    }));
  const media = (snapshot.mediaByTarget.get(canonicalEntityId) ?? []).map(relation => Object.freeze({
    mediaEntityId: relation.mediaEntityId,
    usage: relation.usage,
    selectionRank: relation.selectionRank,
    rightsStatus: relation.rightsStatus,
    assertionStatus: relation.assertionStatus,
    visibility: relation.visibility,
    scope: relation.scope,
    sourceClaimIds: Object.freeze((relation.sourceClaimIds ?? []).slice())
  }));
  const evidenceEntityIds = new Set([canonicalEntityId, ...editions.map(item => item.editionEntityId), ...media.map(item => item.mediaEntityId)]);
  const sourceEvidence = [...evidenceEntityIds].flatMap(entityId => snapshot.claimsByEntity.get(entityId) ?? []).map(claim => Object.freeze({
    claimId: claim.claimId,
    canonicalEntityId: claim.canonicalEntityId,
    claimType: claim.claimType,
    assertionStatus: claim.assertionStatus,
    confidence: claim.confidence,
    snapshotId: claim.snapshotId,
    sourceRef: claim.sourceRef,
    evidenceRef: claim.evidenceRef
  }));
  const hasDetail = detail !== null;
  const credits = hasDetail ? Object.freeze({
    availability: 'available', status: 'legacy-projection',
    cast: Object.freeze((detail.cast ?? []).slice()), staff: Object.freeze({ ...(detail.staff ?? {}) }), songs: Object.freeze((detail.songs ?? []).slice())
  }) : Object.freeze({
    availability: 'unavailable', status: 'legacy-fallback', cast: Object.freeze([]), staff: Object.freeze({}), songs: Object.freeze([])
  });
  return Object.freeze({
    ...assertObject(legacy ?? {}, 'work detail legacy view model'),
    workId,
    canonicalEntityId,
    source: hasDetail ? 'canonical-snapshot-and-legacy-detail' : 'canonical-snapshot-with-legacy-fallback',
    identity: Object.freeze({ availability: 'available', status: work.status, workId, canonicalEntityId, sourceRefs: Object.freeze((work.sourceRefs ?? []).slice()) }),
    editions: availability('available', 'public-confirmed', editions),
    credits,
    ratings: availability('unavailable', 'not-projected'),
    media: availability(media.length > 0 ? 'available' : 'unavailable', media.length > 0 ? 'public-cleared' : 'not-projected', media),
    sourceEvidence: availability(sourceEvidence.length > 0 ? 'available' : 'unavailable', sourceEvidence.length > 0 ? 'confirmed' : 'not-projected', sourceEvidence)
  });
}

/**
 * Source-only M1 consumer for the real G1 canonical snapshot. It is not wired
 * to the product UI; callers must explicitly enable workDetailV1.
 */
export function createWorkDetailVMLoader({
  snapshotManifestUrl,
  detailIndexUrl,
  binding,
  featureFlags = {},
  fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto,
  cacheMode = 'force-cache'
} = {}) {
  if (!(snapshotManifestUrl instanceof URL) || !(detailIndexUrl instanceof URL)) throw new TypeError('work detail snapshot URLs must be URLs');
  if (typeof fetchImpl !== 'function' || !cryptoRef?.subtle?.digest) throw new TypeError('work detail snapshot loader requires fetch and Web Crypto');
  const expected = assertCanonicalBinding(binding);
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  let detailLoader = null;
  let snapshotPromise = null;
  let detailCoveragePromise = null;

  function loadSnapshot() {
    if (snapshotPromise !== null) return snapshotPromise;
    snapshotPromise = fetchJsonBytes(snapshotManifestUrl, 'G1 canonical snapshot manifest', { fetchImpl, cacheMode }).then(async ({ bytes, value }) => {
      if (await sha256Hex(bytes, cryptoRef) !== expected.manifestSha256) throw new Error('G1 canonical snapshot manifest integrity check failed');
      const manifest = validateCanonicalManifest(value, expected);
      const artifacts = new Map(await Promise.all([...manifest.artifacts.values()].map(async descriptor => {
        const url = new URL(descriptor.path, snapshotManifestUrl);
        const { bytes: artifactBytes, value: artifact } = await fetchJsonBytes(url, `G1 canonical artifact ${descriptor.path}`, { fetchImpl, cacheMode });
        if (await sha256Hex(artifactBytes, cryptoRef) !== descriptor.sha256) throw new Error(`G1 canonical artifact ${descriptor.path} integrity check failed`);
        return [descriptor.path, artifact];
      })));
      return prepareCanonicalSnapshot(artifacts, manifest);
    }).catch(error => { snapshotPromise = null; throw error; });
    return snapshotPromise;
  }

  async function loadDetailCoverage(snapshot) {
    if (detailCoveragePromise !== null) return detailCoveragePromise;
    if (detailLoader === null) {
      detailLoader = createWorkDetailCreditsLoader({ indexUrl: detailIndexUrl, catalogSnapshotId: expected.catalogSnapshotId, catalogSha256: expected.catalogSha256, workIds: new Set(snapshot.workById.keys()), fetchImpl, cryptoRef, cacheMode });
    }
    detailCoveragePromise = fetchJsonBytes(detailIndexUrl, '作品制作资料目录', { fetchImpl, cacheMode }).then(({ value }) => {
      const index = validateWorkDetailCreditsIndex(value, { catalogSnapshotId: expected.catalogSnapshotId, catalogSha256: expected.catalogSha256, workIds: new Set(snapshot.workById.keys()) });
      const availableWorkIds = new Set(index.descriptorsByWorkId.keys());
      const missingWorkIds = [...snapshot.workById.keys()].filter(workId => !availableWorkIds.has(workId)).sort((a, b) => Number(a) - Number(b));
      return Object.freeze({ canonicalWorkCount: snapshot.workById.size, detailAvailableWorkCount: availableWorkIds.size, missingDetailWorkIds: Object.freeze(missingWorkIds) });
    }).catch(error => { detailCoveragePromise = null; throw error; });
    return detailCoveragePromise;
  }

  function resolve(snapshot, { workId, canonicalEntityId }) {
    if (workId !== undefined && (typeof workId !== 'string' || !/^[1-9][0-9]*$/u.test(workId))) return null;
    if (canonicalEntityId !== undefined && (typeof canonicalEntityId !== 'string' || !snapshot.entitiesById.has(canonicalEntityId))) return null;
    const resolvedWorkId = workId ?? [...snapshot.legacyByWorkId.entries()].find(([, entry]) => entry.canonicalEntityId === canonicalEntityId)?.[0];
    if (resolvedWorkId === undefined) return null;
    const resolvedCanonicalId = snapshot.legacyByWorkId.get(resolvedWorkId)?.canonicalEntityId;
    return canonicalEntityId !== undefined && canonicalEntityId !== resolvedCanonicalId ? null : Object.freeze({ workId: resolvedWorkId, canonicalEntityId: resolvedCanonicalId });
  }

  return Object.freeze({
    async inspectCoverage() {
      if (flags.workDetailV1 !== true) return null;
      try { return await loadDetailCoverage(await loadSnapshot()); } catch { return null; }
    },
    async load({ workId, canonicalEntityId, legacy = {} } = {}) {
      const fallbackId = typeof workId === 'string' ? workId : null;
      if (flags.workDetailV1 !== true) return legacyVm('work detail', legacy, 'workId');
      try {
        const snapshot = await loadSnapshot();
        const resolved = resolve(snapshot, { workId, canonicalEntityId });
        if (resolved === null) return legacyVm('work detail', legacy, 'workId');
        const coverage = await loadDetailCoverage(snapshot);
        const detail = coverage.missingDetailWorkIds.includes(resolved.workId) ? null : await detailLoader.load(resolved.workId);
        return makeWorkDetailSnapshotVm({ ...resolved, legacy, snapshot, detail });
      } catch {
        const fallback = legacyVm('work detail', legacy, 'workId');
        return fallbackId === null ? fallback : Object.freeze({ ...fallback, workId: fallback.workId ?? fallbackId });
      }
    },
    clear() { snapshotPromise = null; detailCoveragePromise = null; }
  });
}

export function adaptPersonPageVM({ personEntityId, legacy = {}, projection = null, featureFlags = {} } = {}) {
  assertText(personEntityId, 'person page personEntityId');
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  if (!useProjection(projection, flags, 'personPageV1')) return legacyVm('person page', legacy, 'personEntityId');
  const record = recordFor(projection.records, item => item?.personEntityId === personEntityId);
  return record === null ? legacyVm('person page', legacy, 'personEntityId') : projectedVm('person page', legacy, record, 'personEntityId');
}

export function adaptCharacterPageVM({ characterEntityId, legacy = {}, projection = null, featureFlags = {} } = {}) {
  assertText(characterEntityId, 'character page characterEntityId');
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  if (!useProjection(projection, flags, 'characterPageV1')) return legacyVm('character page', legacy, 'characterEntityId');
  const record = recordFor(projection.records, item => item?.characterEntityId === characterEntityId);
  return record === null ? legacyVm('character page', legacy, 'characterEntityId') : projectedVm('character page', legacy, record, 'characterEntityId');
}

export function adaptMediaVM({ mediaId, legacy = {}, projection = null, featureFlags = {} } = {}) {
  assertText(mediaId, 'media mediaId');
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  if (!useProjection(projection, flags, 'mediaProjectionV1')) return legacyVm('media', legacy, 'mediaId');
  const record = recordFor(projection.records, item => item?.mediaId === mediaId);
  return record === null ? legacyVm('media', legacy, 'mediaId') : projectedVm('media', legacy, record, 'mediaId');
}

export async function sha256Hex(bytes, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) throw new TypeError('project entity consumer requires Web Crypto');
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyProjectionEnvelopeIntegrity(value, binding, options = {}) {
  const envelope = validateProjectionEnvelope(value, binding, options);
  const digest = await sha256Hex(new TextEncoder().encode(serializeProjectionRecords(envelope.records)), options.cryptoRef ?? globalThis.crypto);
  if (digest !== envelope.integrity.payloadSha256) throw new TypeError('projection sidecar payload SHA-256 does not match its records');
  return envelope;
}

async function fetchJsonBytes(url, label, { fetchImpl, cacheMode }) {
  const response = await fetchImpl(url, { cache: cacheMode });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  try {
    return { bytes, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch (error) {
    throw new Error(`${label} 不是有效的 JSON`, { cause: error });
  }
}

function validateShardDescriptor(value, index) {
  const descriptor = assertObject(value, `projection index records[${index}]`);
  const fields = new Set(['projection', 'path', 'bytes', 'sha256']);
  assertExactFields(descriptor, fields, `projection index records[${index}]`);
  if (!PROJECTIONS.has(descriptor.projection) || descriptor.projection === 'indexes') throw new TypeError('projection shard descriptor projection is invalid');
  if (typeof descriptor.path !== 'string' || !SHARD_PATH_PATTERN.test(descriptor.path)) throw new TypeError('projection shard descriptor path is unsafe');
  if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes <= 0) throw new TypeError('projection shard descriptor bytes is invalid');
  assertSha256(descriptor.sha256, 'projection shard descriptor sha256');
  return Object.freeze({ ...descriptor });
}

/** Load only the requested projection shard; index and shard promises are cached independently. */
export function createProjectProjectionLoader({
  indexUrl,
  binding,
  featureFlags = {},
  fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto,
  cacheMode = 'force-cache'
} = {}) {
  if (!(indexUrl instanceof URL)) throw new TypeError('project projection indexUrl must be a URL');
  const expected = assertBinding(binding);
  const flags = resolveProjectEntityFeatureFlags(featureFlags);
  if (typeof fetchImpl !== 'function') throw new TypeError('project projection fetch must be a function');
  if (!cryptoRef?.subtle?.digest) throw new TypeError('project projection loader requires Web Crypto');
  let indexPromise = null;
  const shardPromises = new Map();

  function loadIndex() {
    if (indexPromise !== null) return indexPromise;
    indexPromise = fetchJsonBytes(indexUrl, '项目实体索引', { fetchImpl, cacheMode })
      .then(async ({ bytes, value }) => {
        const envelope = await verifyProjectionEnvelopeIntegrity(value, expected, { projection: 'indexes', cryptoRef });
        const descriptors = envelope.records.map(validateShardDescriptor);
        return Object.freeze({ envelope, descriptors });
      })
      .catch(error => { indexPromise = null; throw error; });
    return indexPromise;
  }

  function loadShard(descriptor) {
    const cached = shardPromises.get(descriptor.projection);
    if (cached !== undefined) return cached;
    const url = new URL(descriptor.path, indexUrl);
    const pending = fetchJsonBytes(url, `项目实体分片 ${descriptor.projection}`, { fetchImpl, cacheMode })
      .then(async ({ bytes, value }) => {
        if (bytes.byteLength !== descriptor.bytes) throw new Error(`项目实体分片 ${descriptor.projection} 大小校验失败`);
        if (await sha256Hex(bytes, cryptoRef) !== descriptor.sha256) throw new Error(`项目实体分片 ${descriptor.projection} 完整性校验失败`);
        return verifyProjectionEnvelopeIntegrity(value, expected, { projection: descriptor.projection, cryptoRef });
      })
      .catch(error => { shardPromises.delete(descriptor.projection); throw error; });
    shardPromises.set(descriptor.projection, pending);
    return pending;
  }

  return Object.freeze({
    async load(projection) {
      if (flags.lazyProjectionShardsV1 !== true || !PROJECTIONS.has(projection) || projection === 'indexes') return null;
      const { descriptors } = await loadIndex();
      const descriptor = descriptors.find(item => item.projection === projection);
      return descriptor === undefined ? null : loadShard(descriptor);
    },
    clear(projection) {
      if (projection === undefined) { indexPromise = null; shardPromises.clear(); return; }
      shardPromises.delete(projection);
    }
  });
}
