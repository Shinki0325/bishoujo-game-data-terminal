const SCHEMA_VERSION = 'egs-platform-entity-projection-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u;
const SHARD_PATH_PATTERN = /^shards\/[A-Za-z0-9._-]+\.json$/u;
const PROJECTIONS = new Set(['identity', 'relations', 'indexes', 'media']);
const ENVELOPE_FIELDS = new Set([
  'schemaVersion', 'projection', 'releaseId', 'dataRevision',
  'catalogSnapshotId', 'catalogSha256', 'sourceSnapshots', 'records', 'integrity'
]);
const INTEGRITY_FIELDS = new Set(['recordCount', 'payloadSha256']);
const SOURCE_SNAPSHOT_FIELDS = new Set(['source', 'snapshotId', 'sha256']);

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
export const PROJECT_ENTITY_PROJECTIONS = Object.freeze([...PROJECTIONS]);

export const DEFAULT_PROJECT_ENTITY_FEATURE_FLAGS = Object.freeze({
  entityRelationsV1: false,
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
