const SCHEMA_VERSION = 'egs-tier-bangumi-canonical-alias-fallback-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[1-9][0-9]*$/u;
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'sourceCatalogSnapshotId',
  'sourceCatalogSha256',
  'sourceEnrichmentSha256',
  'sourceBangumiRatingsSha256',
  'generatedAt',
  'works'
]);
const WORK_FIELDS = new Set(['workId', 'bangumiSubjectId', 'displayTitle']);

function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function assertExactFields(value, fields, name) {
  assertPlainObject(value, name);
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some(key => !fields.has(key))) {
    throw new TypeError(`${name} contains unsupported fields`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
}

function assertDisplayTitle(value, name) {
  if (typeof value !== 'string' || value.normalize('NFKC').trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
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

export function prepareBangumiCanonicalAliasFallback(sidecar, {
  catalogSnapshotId,
  catalogSha256,
  enrichmentSha256,
  bangumiRatingsSha256,
  workIds
} = {}) {
  assertExactFields(sidecar, TOP_LEVEL_FIELDS, 'Bangumi canonical alias fallback');
  if (sidecar.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('Bangumi canonical alias fallback schema version is unsupported');
  }
  if (sidecar.sourceCatalogSnapshotId !== catalogSnapshotId || sidecar.sourceCatalogSha256 !== catalogSha256) {
    throw new TypeError('Bangumi canonical alias fallback catalog binding does not match');
  }
  if (sidecar.sourceEnrichmentSha256 !== enrichmentSha256) {
    throw new TypeError('Bangumi canonical alias fallback enrichment binding does not match');
  }
  if (sidecar.sourceBangumiRatingsSha256 !== bangumiRatingsSha256) {
    throw new TypeError('Bangumi canonical alias fallback ratings binding does not match');
  }
  assertSha256(sidecar.sourceCatalogSha256, 'sourceCatalogSha256');
  assertSha256(sidecar.sourceEnrichmentSha256, 'sourceEnrichmentSha256');
  assertSha256(sidecar.sourceBangumiRatingsSha256, 'sourceBangumiRatingsSha256');
  if (typeof sidecar.generatedAt !== 'string' || Number.isNaN(Date.parse(sidecar.generatedAt))) {
    throw new TypeError('generatedAt must be an ISO date-time string');
  }
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array');
  const knownWorkIds = new Set(workIds);
  if (knownWorkIds.size !== workIds.length) throw new TypeError('workIds must be unique');
  if (!Array.isArray(sidecar.works)) throw new TypeError('works must be an array');
  const seenWorkIds = new Set();
  const entries = sidecar.works.map((row, index) => {
    const name = `works[${index}]`;
    assertExactFields(row, WORK_FIELDS, name);
    if (typeof row.workId !== 'string' || !ID_PATTERN.test(row.workId) || !knownWorkIds.has(row.workId)) {
      throw new TypeError(`${name}.workId is invalid`);
    }
    if (seenWorkIds.has(row.workId)) throw new TypeError('works contains duplicate work IDs');
    seenWorkIds.add(row.workId);
    if (typeof row.bangumiSubjectId !== 'string' || !ID_PATTERN.test(row.bangumiSubjectId)) {
      throw new TypeError(`${name}.bangumiSubjectId is invalid`);
    }
    return [row.workId, Object.freeze({
      bangumiSubjectId: row.bangumiSubjectId,
      displayTitle: assertDisplayTitle(row.displayTitle, `${name}.displayTitle`)
    })];
  });
  return Object.freeze({ workFallbackById: createReadonlyMap(entries) });
}
