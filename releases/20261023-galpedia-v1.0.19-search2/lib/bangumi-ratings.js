const ROOT_FIELDS = new Set([
  'bindingCounts',
  'generatedAt',
  'mappingPolicy',
  'ratingStatusCounts',
  'schemaVersion',
  'sourceBangumiPublicBindingsSha256',
  'sourceCatalogSha256',
  'sourceCatalogSnapshotId',
  'sourceConnector',
  'works'
]);
const CONNECTOR_FIELDS = new Set(['buildNumber', 'provider', 'sha256']);
const BINDING_COUNT_FIELDS = new Set([
  'ambiguousMultiSubject',
  'catalogWorks',
  'confirmedSameWork',
  'distinctConfirmedSubjects',
  'noBangumiPair',
  'noVndbBinding'
]);
const WORK_FIELDS = new Set([
  'bangumiSubjectId',
  'egsWorkId',
  'ratingStatus',
  'relation',
  'retrievedAt',
  'score',
  'vndbId',
  'voteCount'
]);
const RATING_STATUSES = Object.freeze(['mapped-rated', 'mapped-no-rating', 'snapshot-unavailable']);
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

function assertTimestamp(value, name, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO timestamp`);
  }
}

function assertCountObject(value, fields, name) {
  assertExactFields(value, fields, name);
  for (const key of fields) {
    if (!Number.isInteger(value[key]) || value[key] < 0) throw new TypeError(`${name}.${key} is invalid`);
  }
}

function snapshotRating(row, index, allowedWorkIds) {
  const name = `Bangumi ratings works[${index}]`;
  assertExactFields(row, WORK_FIELDS, name);
  if (typeof row.egsWorkId !== 'string' || !allowedWorkIds.has(row.egsWorkId)) {
    throw new TypeError(`${name}.egsWorkId is unknown`);
  }
  if (row.vndbId !== null && (typeof row.vndbId !== 'string' || !VNDB_ID_PATTERN.test(row.vndbId))) {
    throw new TypeError(`${name}.vndbId is invalid`);
  }
  if (typeof row.bangumiSubjectId !== 'string' || !SUBJECT_ID_PATTERN.test(row.bangumiSubjectId)) {
    throw new TypeError(`${name}.bangumiSubjectId is invalid`);
  }
  if (row.relation !== 'same-work') throw new TypeError(`${name}.relation is unsupported`);
  if (!RATING_STATUSES.includes(row.ratingStatus)) throw new TypeError(`${name}.ratingStatus is unsupported`);
  if (row.ratingStatus === 'mapped-rated') {
    if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 10) {
      throw new TypeError(`${name}.score is invalid`);
    }
    if (!Number.isInteger(row.voteCount) || row.voteCount <= 0) throw new TypeError(`${name}.voteCount is invalid`);
    assertTimestamp(row.retrievedAt, `${name}.retrievedAt`);
  } else if (row.ratingStatus === 'mapped-no-rating') {
    if (row.score !== null || row.voteCount !== 0) throw new TypeError(`${name} has inconsistent no-rating fields`);
    assertTimestamp(row.retrievedAt, `${name}.retrievedAt`);
  } else if (row.score !== null || row.voteCount !== null || row.retrievedAt !== null) {
    throw new TypeError(`${name} must not expose unavailable snapshot fields`);
  }
  return Object.freeze({
    bangumiSubjectId: row.bangumiSubjectId,
    egsWorkId: row.egsWorkId,
    ratingStatus: row.ratingStatus,
    relation: row.relation,
    retrievedAt: row.retrievedAt,
    score: row.score,
    vndbId: row.vndbId,
    voteCount: row.voteCount
  });
}

export function prepareBangumiRatingsSidecar(value, {
  catalogSnapshotId,
  catalogSha256,
  bangumiPublicBindingsSha256,
  workIds
} = {}) {
  assertExactFields(value, ROOT_FIELDS, 'Bangumi ratings sidecar');
  if (value.schemaVersion !== 'egs-tier-bangumi-ratings-v1') {
    throw new TypeError('Bangumi ratings sidecar schema version is unsupported');
  }
  if (value.sourceCatalogSnapshotId !== catalogSnapshotId || value.sourceCatalogSha256 !== catalogSha256) {
    throw new TypeError('Bangumi ratings sidecar catalog binding does not match');
  }
  if (value.sourceBangumiPublicBindingsSha256 !== bangumiPublicBindingsSha256) {
    throw new TypeError('Bangumi ratings sidecar binding authority does not match');
  }
  if (typeof catalogSnapshotId !== 'string' || catalogSnapshotId.length === 0 || !SHA256_PATTERN.test(catalogSha256 ?? '')) {
    throw new TypeError('catalog binding arguments are invalid');
  }
  if (!SHA256_PATTERN.test(bangumiPublicBindingsSha256 ?? '')) throw new TypeError('Bangumi binding authority SHA is invalid');
  assertTimestamp(value.generatedAt, 'Bangumi ratings sidecar.generatedAt');
  if (typeof value.mappingPolicy !== 'string' || value.mappingPolicy.trim().length === 0) {
    throw new TypeError('Bangumi ratings sidecar.mappingPolicy is invalid');
  }
  assertExactFields(value.sourceConnector, CONNECTOR_FIELDS, 'Bangumi ratings sidecar.sourceConnector');
  if (value.sourceConnector.provider !== 'tuihub/vndb_id_connector'
    || !/^[0-9]+$/u.test(value.sourceConnector.buildNumber)
    || !SHA256_PATTERN.test(value.sourceConnector.sha256)) {
    throw new TypeError('Bangumi ratings sidecar.sourceConnector is invalid');
  }
  assertCountObject(value.bindingCounts, BINDING_COUNT_FIELDS, 'Bangumi ratings sidecar.bindingCounts');
  assertPlainObject(value.ratingStatusCounts, 'Bangumi ratings sidecar.ratingStatusCounts');
  const countKeys = Object.keys(value.ratingStatusCounts);
  if (countKeys.length !== RATING_STATUSES.length || countKeys.some(key => !RATING_STATUSES.includes(key))) {
    throw new TypeError('Bangumi ratings sidecar.ratingStatusCounts is invalid');
  }
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array');
  const allowedWorkIds = new Set(workIds);
  if (allowedWorkIds.size !== workIds.length) throw new TypeError('workIds must be unique');
  if (!Array.isArray(value.works) || value.works.length !== value.bindingCounts.confirmedSameWork) {
    throw new TypeError('Bangumi ratings sidecar work count does not match bindings');
  }
  if (value.bindingCounts.catalogWorks !== allowedWorkIds.size || value.bindingCounts.confirmedSameWork > allowedWorkIds.size) {
    throw new TypeError('Bangumi ratings sidecar binding counts are invalid');
  }
  const ratingByWorkId = new Map();
  const observedCounts = Object.fromEntries(RATING_STATUSES.map(status => [status, 0]));
  for (const [index, row] of value.works.entries()) {
    const rating = snapshotRating(row, index, allowedWorkIds);
    if (ratingByWorkId.has(rating.egsWorkId)) throw new TypeError('Bangumi ratings sidecar contains duplicate work IDs');
    ratingByWorkId.set(rating.egsWorkId, rating);
    observedCounts[rating.ratingStatus] += 1;
  }
  for (const status of RATING_STATUSES) {
    if (!Number.isInteger(value.ratingStatusCounts[status])
      || value.ratingStatusCounts[status] < 0
      || value.ratingStatusCounts[status] !== observedCounts[status]) {
      throw new TypeError('Bangumi ratings sidecar.ratingStatusCounts does not match works');
    }
  }
  return Object.freeze({ ratingByWorkId });
}
