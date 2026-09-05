const ROOT_FIELDS = new Set([
  'schemaVersion',
  'sourceCatalogSnapshotId',
  'sourceCatalogSha256',
  'generatedAt',
  'mappingPolicy',
  'statusCounts',
  'works'
]);
const WORK_FIELDS = new Set([
  'egsWorkId',
  'vndbId',
  'mappingStatus',
  'ratingStatus',
  'ratingRaw',
  'voteCount',
  'retrievedAt'
]);
const RATING_STATUSES = Object.freeze([
  'mapped-rated',
  'mapped-no-rating',
  'mapping-not-returned',
  'unmapped'
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VNDB_ID_PATTERN = /^v[1-9][0-9]*$/u;

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
  if (value === null && nullable) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO timestamp`);
  }
}

function assertNullableRatingFields(row, name) {
  if (row.ratingRaw !== null || row.voteCount !== null || row.retrievedAt !== null) {
    throw new TypeError(`${name} must not expose rating fields`);
  }
}

function snapshotRating(row, index, allowedWorkIds, { allowUnknown = false } = {}) {
  const name = `ratings works[${index}]`;
  assertExactFields(row, WORK_FIELDS, name);
  if (typeof row.egsWorkId !== 'string' || (!allowedWorkIds.has(row.egsWorkId) && !allowUnknown)) {
    throw new TypeError(`${name}.egsWorkId is unknown`);
  }
  if (!RATING_STATUSES.includes(row.ratingStatus)) {
    throw new TypeError(`${name}.ratingStatus is unsupported`);
  }
  const mapped = row.ratingStatus !== 'unmapped';
  if (row.mappingStatus !== (mapped ? 'mapped' : 'unmapped')) {
    throw new TypeError(`${name}.mappingStatus conflicts with ratingStatus`);
  }
  if (mapped) {
    if (typeof row.vndbId !== 'string' || !VNDB_ID_PATTERN.test(row.vndbId)) {
      throw new TypeError(`${name}.vndbId is invalid`);
    }
  } else {
    if (row.vndbId !== null) throw new TypeError(`${name}.vndbId must be null when unmapped`);
    assertNullableRatingFields(row, name);
  }
  if (row.ratingStatus === 'mapped-rated') {
    if (typeof row.ratingRaw !== 'number' || !Number.isFinite(row.ratingRaw) || row.ratingRaw < 0) {
      throw new TypeError(`${name}.ratingRaw is invalid`);
    }
    if (!Number.isInteger(row.voteCount) || row.voteCount < 0) {
      throw new TypeError(`${name}.voteCount is invalid`);
    }
    assertTimestamp(row.retrievedAt, `${name}.retrievedAt`);
  } else if (row.ratingStatus === 'mapped-no-rating') {
    if (row.ratingRaw !== null || !Number.isInteger(row.voteCount) || row.voteCount < 0) {
      throw new TypeError(`${name} has inconsistent no-rating fields`);
    }
    assertTimestamp(row.retrievedAt, `${name}.retrievedAt`);
  } else if (row.ratingStatus === 'mapping-not-returned') {
    assertNullableRatingFields(row, name);
  }
  return Object.freeze({
    egsWorkId: row.egsWorkId,
    vndbId: row.vndbId,
    mappingStatus: row.mappingStatus,
    ratingStatus: row.ratingStatus,
    ratingRaw: row.ratingRaw,
    voteCount: row.voteCount,
    retrievedAt: row.retrievedAt
  });
}

export function prepareVndbRatingsSidecar(value, {
  catalogSnapshotId,
  catalogSha256,
  workIds,
  allowSuperset = false
} = {}) {
  assertExactFields(value, ROOT_FIELDS, 'ratings sidecar');
  if (value.schemaVersion !== 'egs-tier-vndb-ratings-v1') {
    throw new TypeError('ratings sidecar schema version is unsupported');
  }
  if (typeof catalogSnapshotId !== 'string' || catalogSnapshotId.length === 0) {
    throw new TypeError('catalogSnapshotId is required');
  }
  if (typeof catalogSha256 !== 'string' || !SHA256_PATTERN.test(catalogSha256)) {
    throw new TypeError('catalogSha256 is invalid');
  }
  if (value.sourceCatalogSnapshotId !== catalogSnapshotId || value.sourceCatalogSha256 !== catalogSha256) {
    throw new TypeError('ratings sidecar catalog binding does not match');
  }
  assertTimestamp(value.generatedAt, 'ratings sidecar.generatedAt');
  if (typeof value.mappingPolicy !== 'string' || value.mappingPolicy.trim().length === 0) {
    throw new TypeError('ratings sidecar.mappingPolicy is invalid');
  }
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array');
  const allowedWorkIds = new Set(workIds);
  if (allowedWorkIds.size !== workIds.length) throw new TypeError('workIds must be unique');
  if (!Array.isArray(value.works) || (!allowSuperset && value.works.length !== allowedWorkIds.size)
      || (allowSuperset && value.works.length < allowedWorkIds.size)) {
    throw new TypeError('ratings sidecar must cover every catalog work in the requested population exactly once');
  }
  assertPlainObject(value.statusCounts, 'ratings sidecar.statusCounts');
  const statusCountKeys = Object.keys(value.statusCounts);
  if (statusCountKeys.length !== RATING_STATUSES.length || statusCountKeys.some(key => !RATING_STATUSES.includes(key))) {
    throw new TypeError('ratings sidecar.statusCounts is invalid');
  }
  const ratingByWorkId = new Map();
  const observedCounts = Object.fromEntries(RATING_STATUSES.map(status => [status, 0]));
  const sourceCounts = Object.fromEntries(RATING_STATUSES.map(status => [status, 0]));
  for (const [index, row] of value.works.entries()) {
    const rating = snapshotRating(row, index, allowedWorkIds, { allowUnknown: allowSuperset });
    sourceCounts[rating.ratingStatus] += 1;
    if (!allowedWorkIds.has(rating.egsWorkId)) {
      if (allowSuperset) continue;
      throw new TypeError('ratings sidecar contains an unknown work ID');
    }
    if (ratingByWorkId.has(rating.egsWorkId)) throw new TypeError('ratings sidecar contains duplicate work IDs');
    ratingByWorkId.set(rating.egsWorkId, rating);
    observedCounts[rating.ratingStatus] += 1;
  }
  if (ratingByWorkId.size !== allowedWorkIds.size) throw new TypeError('ratings sidecar coverage is incomplete');
  for (const status of RATING_STATUSES) {
    if (!Number.isInteger(value.statusCounts[status]) || value.statusCounts[status] < 0
        || value.statusCounts[status] !== (allowSuperset ? sourceCounts[status] : observedCounts[status])) {
      throw new TypeError('ratings sidecar.statusCounts does not match works');
    }
  }
  return Object.freeze({ ratingByWorkId });
}
