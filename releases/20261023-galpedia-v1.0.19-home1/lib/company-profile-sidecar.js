const SCHEMA_VERSION = 'egs-tier-full-company-profile-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[1-9][0-9]*$/u;
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'sourceCatalogSnapshotId',
  'sourceCatalogSha256',
  'generatedAt',
  'companies'
]);
const COMPANY_FIELDS = new Set(['companyId', 'avatar']);
const AVATAR_FIELDS = new Set(['path', 'sha256', 'bytes', 'width', 'height', 'mime']);

function assertObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function assertFields(value, allowed, name) {
  assertObject(value, name);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${name} contains an unsupported field: ${key}`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
  return value;
}

function assertSafePath(value, name) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || value.startsWith('/')
    || value.includes('//')
    || value.split('/').some(part => part === '.' || part === '..' || part.length === 0)
    || !value.startsWith('company/v1/avatars/')
    || !value.endsWith('.webp')
  ) {
    throw new TypeError(`${name} must be a safe company avatar path`);
  }
  return value;
}

function assertPositiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function prepareAvatar(value, name) {
  assertFields(value, AVATAR_FIELDS, name);
  if (value.mime !== 'image/webp') throw new TypeError(`${name}.mime must be image/webp`);
  return Object.freeze({
    path: assertSafePath(value.path, `${name}.path`),
    sha256: assertSha256(value.sha256, `${name}.sha256`),
    bytes: assertPositiveInteger(value.bytes, `${name}.bytes`),
    width: assertPositiveInteger(value.width, `${name}.width`, 512),
    height: assertPositiveInteger(value.height, `${name}.height`, 512),
    mime: value.mime
  });
}

function readonlyMap(entries) {
  const source = new Map(entries);
  return Object.freeze({
    get(id) { return source.get(id); },
    has(id) { return source.has(id); },
    entries() { return source.entries(); },
    [Symbol.iterator]() { return source[Symbol.iterator](); },
    get size() { return source.size; }
  });
}

export function prepareCompanyProfileSidecar(sidecar, binding) {
  assertFields(sidecar, TOP_LEVEL_FIELDS, 'company profile sidecar');
  assertObject(binding, 'catalog binding');
  if (sidecar.schemaVersion !== SCHEMA_VERSION) throw new TypeError('company profile schemaVersion is unsupported');
  if (sidecar.sourceCatalogSnapshotId !== binding.catalogSnapshotId) {
    throw new TypeError('company profile catalog snapshot does not match the catalog');
  }
  if (sidecar.sourceCatalogSha256 !== binding.catalogSha256) {
    throw new TypeError('company profile catalog SHA-256 does not match the catalog');
  }
  if (typeof sidecar.generatedAt !== 'string' || Number.isNaN(Date.parse(sidecar.generatedAt))) {
    throw new TypeError('company profile generatedAt must be an ISO date-time string');
  }
  if (!(binding.companyIds instanceof Set)) throw new TypeError('catalog binding must include companyIds');
  if (!Array.isArray(sidecar.companies)) throw new TypeError('company profile companies must be an array');
  const seen = new Set();
  const entries = [];
  for (const [index, item] of sidecar.companies.entries()) {
    const name = `companies[${index}]`;
    assertFields(item, COMPANY_FIELDS, name);
    if (typeof item.companyId !== 'string' || !ID_PATTERN.test(item.companyId)) {
      throw new TypeError(`${name}.companyId must be a public numeric ID`);
    }
    if (seen.has(item.companyId)) throw new TypeError(`companies contains a duplicate company ID`);
    if (!binding.companyIds.has(item.companyId)) throw new TypeError(`${name} contains an unknown company ID`);
    seen.add(item.companyId);
    if (item.avatar === undefined) continue;
    entries.push([item.companyId, prepareAvatar(item.avatar, `${name}.avatar`)]);
  }
  return Object.freeze({ avatarByCompanyId: readonlyMap(entries) });
}
