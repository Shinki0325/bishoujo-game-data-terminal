const ROOT_FIELDS = new Set([
  'bindings',
  'generatedAt',
  'mappingPolicy',
  'population',
  'provenance',
  'schemaVersion'
]);
const BINDING_FIELDS = new Set(['bangumiSubjectId', 'egsWorkId', 'relation', 'vndbId']);
const POPULATION_FIELDS = new Set([
  'admissionBindings',
  'admissionWorks',
  'ambiguousMultiSubject',
  'bindingCount',
  'catalogWorks',
  'confirmedSameWork',
  'coreBindings',
  'coreWorks',
  'distinctConfirmedSubjects',
  'noBangumiPair',
  'noVndbBinding',
  'nullVndbBindings'
]);
const PROVENANCE_FIELDS = new Set([
  'sourceAdmissionsCarrierSha256',
  'sourceAdmissionsSha256',
  'sourceAdmissionsStatusCounts',
  'sourceAuthoritySchemaVersion',
  'sourceAuthoritySha256',
  'sourceBangumiRatingsSchemaVersion',
  'sourceBangumiRatingsSha256',
  'sourceCandidateSha256',
  'sourceCatalogSha256',
  'sourceCatalogSnapshotId',
  'sourceConnector'
]);
const ADMISSIONS_STATUS_FIELDS = new Set([
  'ambiguous-or-version-conflict',
  'confirmed-title-date',
  'no-confirmed-bangumi-pair'
]);
const CONNECTOR_FIELDS = new Set(['buildNumber', 'provider', 'sha256']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VNDB_ID_PATTERN = /^v[1-9][0-9]*$/u;
const SUBJECT_ID_PATTERN = /^[1-9][0-9]*$/u;

function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertExactFields(value, fields, name) {
  assertPlainObject(value, name);
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some(key => !fields.has(key))) {
    throw new TypeError(`${name} contains unsupported fields`);
  }
}

function assertTimestamp(value, name) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO timestamp`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
}

function assertCountObject(value, fields, name) {
  assertExactFields(value, fields, name);
  for (const key of Object.keys(value)) {
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      throw new TypeError(`${name}.${key} is invalid`);
    }
  }
}

function assertBinding(row, index, knownWorkIds) {
  const name = `Bangumi public bindings bindings[${index}]`;
  assertExactFields(row, BINDING_FIELDS, name);
  if (typeof row.egsWorkId !== 'string' || !knownWorkIds.has(row.egsWorkId)) {
    throw new TypeError(`${name}.egsWorkId is invalid`);
  }
  if (typeof row.bangumiSubjectId !== 'string' || !SUBJECT_ID_PATTERN.test(row.bangumiSubjectId)) {
    throw new TypeError(`${name}.bangumiSubjectId is invalid`);
  }
  if (row.relation !== 'same-work') {
    throw new TypeError(`${name}.relation is unsupported`);
  }
  if (row.vndbId !== null && (typeof row.vndbId !== 'string' || !VNDB_ID_PATTERN.test(row.vndbId))) {
    throw new TypeError(`${name}.vndbId is invalid`);
  }
  return Object.freeze({
    bangumiSubjectId: row.bangumiSubjectId,
    egsWorkId: row.egsWorkId,
    relation: row.relation,
    vndbId: row.vndbId
  });
}

function createReadonlyMap(entries) {
  const source = new Map(entries);
  return Object.freeze({
    get(id) { return source.get(id); },
    has(id) { return source.has(id); },
    entries() { return source.entries(); },
    [Symbol.iterator]() { return source[Symbol.iterator](); },
    get size() { return source.size; }
  });
}

export function prepareBangumiPublicBindingsCarrier(value, {
  catalogSnapshotId = null,
  catalogSha256 = null,
  workIds
} = {}) {
  assertExactFields(value, ROOT_FIELDS, 'Bangumi public bindings carrier');
  if (value.schemaVersion !== 'bangumi-public-bindings-v1') {
    throw new TypeError('Bangumi public bindings carrier schema version is unsupported');
  }
  assertTimestamp(value.generatedAt, 'Bangumi public bindings carrier.generatedAt');
  if (typeof value.mappingPolicy !== 'string' || value.mappingPolicy.trim().length === 0) {
    throw new TypeError('Bangumi public bindings carrier.mappingPolicy is invalid');
  }
  assertCountObject(value.population, POPULATION_FIELDS, 'Bangumi public bindings carrier.population');
  assertExactFields(value.provenance, PROVENANCE_FIELDS, 'Bangumi public bindings carrier.provenance');
  assertSha256(value.provenance.sourceCatalogSha256, 'Bangumi public bindings carrier.provenance.sourceCatalogSha256');
  if (value.provenance.sourceCatalogSnapshotId !== catalogSnapshotId
    || value.provenance.sourceCatalogSha256 !== catalogSha256) {
    throw new TypeError('Bangumi public bindings carrier catalog binding does not match');
  }
  for (const field of ['sourceAdmissionsCarrierSha256', 'sourceAdmissionsSha256', 'sourceAuthoritySha256', 'sourceBangumiRatingsSha256', 'sourceCandidateSha256']) {
    assertSha256(value.provenance[field], `Bangumi public bindings carrier.provenance.${field}`);
  }
  assertExactFields(value.provenance.sourceConnector, CONNECTOR_FIELDS, 'Bangumi public bindings carrier.provenance.sourceConnector');
  if (value.provenance.sourceConnector.provider !== 'tuihub/vndb_id_connector'
    || !/^\d+$/u.test(value.provenance.sourceConnector.buildNumber)) {
    throw new TypeError('Bangumi public bindings carrier.provenance.sourceConnector is invalid');
  }
  assertSha256(value.provenance.sourceConnector.sha256, 'Bangumi public bindings carrier.provenance.sourceConnector.sha256');
  assertCountObject(value.provenance.sourceAdmissionsStatusCounts, ADMISSIONS_STATUS_FIELDS, 'Bangumi public bindings carrier.provenance.sourceAdmissionsStatusCounts');
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array');
  const knownWorkIds = new Set(workIds);
  if (knownWorkIds.size !== workIds.length) throw new TypeError('workIds must be unique');
  if (!Array.isArray(value.bindings)) throw new TypeError('Bangumi public bindings carrier.bindings must be an array');
  const seenWorkIds = new Set();
  const seenSubjectIds = new Set();
  const bindings = value.bindings.map((row, index) => {
    const binding = assertBinding(row, index, knownWorkIds);
    if (seenWorkIds.has(binding.egsWorkId)) throw new TypeError('Bangumi public bindings carrier contains duplicate work IDs');
    seenWorkIds.add(binding.egsWorkId);
    seenSubjectIds.add(binding.bangumiSubjectId);
    return binding;
  });
  if (value.population.bindingCount !== bindings.length) {
    throw new TypeError('Bangumi public bindings carrier.population.bindingCount does not match bindings');
  }
  if (value.population.catalogWorks < bindings.length) {
      throw new TypeError('Bangumi public bindings carrier.bindingCounts.catalogWorks does not match bindings');
  }
  if (value.population.confirmedSameWork !== bindings.length) {
      throw new TypeError('Bangumi public bindings carrier.bindingCounts.confirmedSameWork does not match bindings');
  }
  if (value.population.distinctConfirmedSubjects !== seenSubjectIds.size) {
      throw new TypeError('Bangumi public bindings carrier.bindingCounts.distinctConfirmedSubjects does not match bindings');
  }
  const bindingByWorkId = createReadonlyMap(bindings.map(binding => [binding.egsWorkId, binding]));
  const bindingsBySubjectId = new Map();
  for (const binding of bindings) {
    const subjectBindings = bindingsBySubjectId.get(binding.bangumiSubjectId) ?? [];
    subjectBindings.push(binding);
    bindingsBySubjectId.set(binding.bangumiSubjectId, subjectBindings);
  }
  const bindingBySubjectId = createReadonlyMap(
    [...bindingsBySubjectId].map(([subjectId, subjectBindings]) => [subjectId, Object.freeze(subjectBindings)])
  );
  return Object.freeze({
    bindings: Object.freeze(bindings),
    bindingByWorkId,
    bindingBySubjectId
  });
}
