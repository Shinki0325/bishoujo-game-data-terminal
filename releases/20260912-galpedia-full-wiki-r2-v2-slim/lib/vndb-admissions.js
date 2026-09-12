const SCHEMA_VERSION = 'egs-tier-vndb-admissions-v1';
const WORK_ID = /^[1-9][0-9]*$/;
const VNDB_ID = /^v[1-9][0-9]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ASSET_KEYS = new Set(['url', 'sha256', 'bytes', 'width', 'height']);

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertAsset(value, label) {
  const asset = assertObject(value, label);
  if (Object.keys(asset).some(key => !ASSET_KEYS.has(key)) || Object.keys(asset).length !== ASSET_KEYS.size) throw new TypeError(`${label} fields are invalid`);
  if (typeof asset.url !== 'string' || !asset.url.startsWith('assets/') || !SHA256.test(asset.sha256)) throw new TypeError(`${label} identity is invalid`);
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !Number.isSafeInteger(asset.width) || asset.width <= 0 || !Number.isSafeInteger(asset.height) || asset.height <= 0) throw new TypeError(`${label} dimensions are invalid`);
  return Object.freeze({ ...asset });
}

export function prepareVndbAdmissionsSidecar(value, { catalogSnapshotId, catalogSha256, workIds }) {
  const sidecar = assertObject(value, 'VNDB admissions sidecar');
  const required = ['schemaVersion', 'sourceCatalogSnapshotId', 'sourceCatalogSha256', 'generatedAt', 'publicationPolicy', 'works'];
  if (Object.keys(sidecar).some(key => !required.includes(key)) || Object.keys(sidecar).length !== required.length) throw new TypeError('VNDB admissions sidecar fields are invalid');
  if (sidecar.schemaVersion !== SCHEMA_VERSION || sidecar.sourceCatalogSnapshotId !== catalogSnapshotId || sidecar.sourceCatalogSha256 !== catalogSha256 || typeof sidecar.generatedAt !== 'string' || Number.isNaN(Date.parse(sidecar.generatedAt)) || typeof sidecar.publicationPolicy !== 'string') throw new TypeError('VNDB admissions sidecar binding is invalid');
  if (!Array.isArray(sidecar.works)) throw new TypeError('VNDB admissions works must be an array');
  const known = new Set(workIds);
  const seen = new Set();
  const admissions = sidecar.works.map((row, index) => {
    const item = assertObject(row, `VNDB admissions works[${index}]`);
    const keys = ['egsWorkId', 'title', 'furigana', 'releaseDate', 'companyId', 'platform', 'median', 'voteCount', 'vndbId', 'admissionSource', 'admissionThreshold', 'thumbnail', 'preview', 'sourceCatalogSha256'];
    if (Object.keys(item).some(key => !keys.includes(key)) || (Object.keys(item).length !== keys.length && Object.keys(item).length !== keys.length - 1)) throw new TypeError(`VNDB admissions works[${index}] fields are invalid`);
    if ((item.sourceCatalogSha256 !== undefined && item.sourceCatalogSha256 !== catalogSha256) || !WORK_ID.test(item.egsWorkId) || known.has(item.egsWorkId) || seen.has(item.egsWorkId) || typeof item.title !== 'string' || !item.title || !VNDB_ID.test(item.vndbId) || item.admissionSource !== 'vndb-vote-threshold' || JSON.stringify(item.admissionThreshold) !== JSON.stringify({ field: 'vndbVoteCount', operator: '>=', value: 100 })) throw new TypeError(`VNDB admissions works[${index}] identity is invalid`);
    if (item.releaseDate !== null && typeof item.releaseDate !== 'string') throw new TypeError(`VNDB admissions works[${index}] releaseDate is invalid`);
    if (item.companyId !== null && typeof item.companyId !== 'string') throw new TypeError(`VNDB admissions works[${index}] companyId is invalid`);
    if (item.platform !== null && typeof item.platform !== 'string') throw new TypeError(`VNDB admissions works[${index}] platform is invalid`);
    if (item.median !== null && typeof item.median !== 'number') throw new TypeError(`VNDB admissions works[${index}] median is invalid`);
    if (item.voteCount !== null && (!Number.isSafeInteger(item.voteCount) || item.voteCount < 0)) throw new TypeError(`VNDB admissions works[${index}] voteCount is invalid`);
    seen.add(item.egsWorkId);
    return Object.freeze({
      workId: item.egsWorkId,
      title: item.title,
      furigana: item.furigana,
      releaseDate: item.releaseDate ?? '',
      companyId: item.companyId,
      platform: item.platform,
      median: item.median,
      voteCount: item.voteCount,
      vndbId: item.vndbId,
      thumbnail: assertAsset(item.thumbnail, `VNDB admissions works[${index}].thumbnail`),
      preview: assertAsset(item.preview, `VNDB admissions works[${index}].preview`)
    });
  });
  return Object.freeze({ works: Object.freeze(admissions), workIds: new Set(seen) });
}

export const VNDB_ADMISSIONS_SCHEMA_VERSION = SCHEMA_VERSION;
