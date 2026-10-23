const ROOT_FIELDS = new Set(['schemaVersion', 'generatedAt', 'sourceCatalogSnapshotId', 'sourceCatalogSha256', 'sourceAuthoritySha256', 'publicVndbReleaseAuthoritySha256', 'mediaSelections', 'pageBindings']);
const MEDIA_FIELDS = new Set(['workId', 'source', 'thumbnail', 'preview']);
const ASSET_FIELDS = new Set(['path', 'sha256', 'bytes']);
const BINDING_FIELDS = new Set(['workId', 'currentVndbId', 'targetVndbId', 'ratings']);
const BINDING_RATINGS_FIELDS = new Set(['path', 'sha256', 'vndbId', 'ratingStatus']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VNDB_ID_PATTERN = /^v[1-9][0-9]*$/u;

function assertObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function assertExactFields(value, fields, name) {
  assertObject(value, name);
  const keys = Object.keys(value);
  if (keys.length !== fields.size || keys.some(key => !fields.has(key))) throw new TypeError(`${name} contains unsupported fields`);
}
function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${name} is invalid`);
}
function assertAsset(value, name) {
  assertExactFields(value, ASSET_FIELDS, name);
  if (typeof value.path !== 'string' || !value.path.startsWith('assets/') || value.path.includes('..') || value.path.includes('\\')) throw new TypeError(`${name}.path is unsafe`);
  assertSha256(value.sha256, `${name}.sha256`);
  if (!Number.isInteger(value.bytes) || value.bytes < 0) throw new TypeError(`${name}.bytes is invalid`);
  return Object.freeze({ path: value.path, sha256: value.sha256, bytes: value.bytes });
}

export function prepareAuthorityFanoutMediaProjection(value, { catalogSnapshotId, catalogSha256, workIds } = {}) {
  assertExactFields(value, ROOT_FIELDS, 'authority fanout');
  if (value.schemaVersion !== 'egs-tier-authority-fanout-v1') throw new TypeError('authority fanout schema is unsupported');
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) throw new TypeError('authority fanout.generatedAt is invalid');
  if (value.sourceCatalogSnapshotId !== catalogSnapshotId || value.sourceCatalogSha256 !== catalogSha256) throw new TypeError('authority fanout catalog binding does not match');
  assertSha256(value.sourceAuthoritySha256, 'authority fanout.sourceAuthoritySha256');
  assertSha256(value.publicVndbReleaseAuthoritySha256, 'authority fanout.publicVndbReleaseAuthoritySha256');
  if (!Array.isArray(workIds) || new Set(workIds).size !== workIds.length) throw new TypeError('authority fanout work IDs are invalid');
  const allowed = new Set(workIds);
  if (!Array.isArray(value.mediaSelections) || value.mediaSelections.length !== allowed.size) throw new TypeError('authority fanout media coverage is incomplete');
  const selectedMediaByWorkId = new Map();
  for (const [index, row] of value.mediaSelections.entries()) {
    assertExactFields(row, MEDIA_FIELDS, `authority fanout mediaSelections[${index}]`);
    if (!allowed.has(row.workId) || selectedMediaByWorkId.has(row.workId)) throw new TypeError('authority fanout media work ID is invalid');
    if (!['egs', 'vndb', 'manual'].includes(row.source)) throw new TypeError('authority fanout media source is invalid');
    selectedMediaByWorkId.set(row.workId, Object.freeze({ source: row.source, thumbnail: assertAsset(row.thumbnail, `authority fanout thumbnail ${row.workId}`), preview: assertAsset(row.preview, `authority fanout preview ${row.workId}`) }));
  }
  return Object.freeze({ selectedMediaByWorkId });
}

export function prepareAuthorityFanoutPageBindings(value, { catalogSnapshotId, catalogSha256, workIds, ratingsSha256 } = {}) {
  assertExactFields(value, ROOT_FIELDS, 'authority fanout');
  if (value.schemaVersion !== 'egs-tier-authority-fanout-v1') throw new TypeError('authority fanout schema is unsupported');
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) throw new TypeError('authority fanout.generatedAt is invalid');
  if (value.sourceCatalogSnapshotId !== catalogSnapshotId || value.sourceCatalogSha256 !== catalogSha256) throw new TypeError('authority fanout catalog binding does not match');
  assertSha256(value.sourceAuthoritySha256, 'authority fanout.sourceAuthoritySha256');
  assertSha256(value.publicVndbReleaseAuthoritySha256, 'authority fanout.publicVndbReleaseAuthoritySha256');
  if (!Array.isArray(workIds) || new Set(workIds).size !== workIds.length) throw new TypeError('authority fanout work IDs are invalid');
  const allowed = new Set(workIds);
  const pageBindingIssues = [];
  if (!Array.isArray(value.pageBindings)) {
    pageBindingIssues.push('authority fanout page bindings are invalid');
    return Object.freeze({ pageBindingIssues: Object.freeze(pageBindingIssues) });
  }
  const boundWorkIds = new Set();
  for (const [index, row] of value.pageBindings.entries()) {
    try {
      assertExactFields(row, BINDING_FIELDS, `authority fanout pageBindings[${index}]`);
      if (!allowed.has(row.workId) || boundWorkIds.has(row.workId) || !VNDB_ID_PATTERN.test(row.currentVndbId) || !VNDB_ID_PATTERN.test(row.targetVndbId)) throw new TypeError('authority fanout page binding is invalid');
      assertExactFields(row.ratings, BINDING_RATINGS_FIELDS, `authority fanout ratings ${row.workId}`);
      if (row.ratings.path !== 'data/egs-tier-vndb-ratings-v1.json' || row.ratings.sha256 !== ratingsSha256 || row.ratings.vndbId !== row.targetVndbId) throw new TypeError('authority fanout ratings binding does not match the runtime pin');
      boundWorkIds.add(row.workId);
    } catch (error) {
      pageBindingIssues.push(error instanceof Error ? error.message : `authority fanout page binding ${index} is invalid`);
    }
  }
  return Object.freeze({ pageBindingIssues: Object.freeze(pageBindingIssues) });
}

/** Apply current Backend final selection after the immutable G1 clearance proof. */
export function prepareAuthorityFanoutProjection(value, { catalogSnapshotId, catalogSha256, workIds, ratingsSha256 } = {}) {
  const mediaProjection = prepareAuthorityFanoutMediaProjection(value, { catalogSnapshotId, catalogSha256, workIds });
  const pageBindingProjection = prepareAuthorityFanoutPageBindings(value, { catalogSnapshotId, catalogSha256, workIds, ratingsSha256 });
  return Object.freeze({
    selectedMediaByWorkId: mediaProjection.selectedMediaByWorkId,
    pageBindingIssues: pageBindingProjection.pageBindingIssues
  });
}

export function applyAuthorityFanoutMediaToWork(work, selectedMediaByWorkId) {
  const selected = selectedMediaByWorkId?.get?.(work?.workId);
  if (!selected) return work;
  return Object.freeze({ ...work, projectedThumbnailPath: selected.thumbnail.path, projectedPreviewPath: selected.preview.path, mediaProjection: Object.freeze({ ...(work.mediaProjection ?? {}), finalSelectionSource: selected.source, selectionAuthority: 'authority-fanout-v1' }) });
}
