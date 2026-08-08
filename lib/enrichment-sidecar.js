const SCHEMA_VERSION = 'egs-tier-full-enrichment-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[1-9][0-9]*$/;
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'sourceCatalogSnapshotId',
  'sourceCatalogSha256',
  'sourceAliasAuthoritySha256',
  'generatedAt',
  'works',
  'companies'
]);
const WORK_FIELDS = new Set(['workId', 'searchAliases']);
const COMPANY_FIELDS = new Set(['companyId', 'searchAliases']);

function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function assertExactFields(value, fields, name) {
  assertPlainObject(value, name);
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new TypeError(`${name} contains an unsupported field: ${key}`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
  return value;
}

function normalizeAlias(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}

function assertAliases(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty alias list`);
  }
  const seen = new Set();
  const aliases = [];
  for (const alias of value) {
    if (typeof alias !== 'string' || normalizeAlias(alias).length === 0) {
      throw new TypeError(`${name} entries must be non-empty strings`);
    }
    const normalized = normalizeAlias(alias);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(alias.trim());
  }
  return Object.freeze(aliases);
}

function createReadonlyAliasMap(entries) {
  const source = new Map(entries);
  return Object.freeze({
    get(id) { return source.get(id); },
    has(id) { return source.has(id); },
    entries() { return source.entries(); },
    [Symbol.iterator]() { return source[Symbol.iterator](); },
    get size() { return source.size; }
  });
}

function assertBinding(binding) {
  assertPlainObject(binding, 'catalog binding');
  if (typeof binding.catalogSnapshotId !== 'string' || binding.catalogSnapshotId.length === 0) {
    throw new TypeError('catalog binding must include catalogSnapshotId');
  }
  assertSha256(binding.catalogSha256, 'catalog binding catalogSha256');
  if (!(binding.workIds instanceof Set) || !(binding.companyIds instanceof Set)) {
    throw new TypeError('catalog binding must include workIds and companyIds');
  }
  return binding;
}

function prepareEntries(entries, {
  name,
  idField,
  allowedFields,
  knownIds
}) {
  if (!Array.isArray(entries)) throw new TypeError(`${name} must be an array`);
  const seenIds = new Set();
  const prepared = [];
  for (const [index, entry] of entries.entries()) {
    const entryName = `${name}[${index}]`;
    assertExactFields(entry, allowedFields, entryName);
    const id = entry[idField];
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      throw new TypeError(`${entryName}.${idField} must be a public numeric ID`);
    }
    if (seenIds.has(id)) {
      const label = idField === 'workId' ? 'work ID' : 'company ID';
      throw new TypeError(`${name} contains a duplicate ${label}`);
    }
    if (!knownIds.has(id)) {
      const label = idField === 'workId' ? 'work ID' : 'company ID';
      throw new TypeError(`${name} contains an unknown ${label}`);
    }
    seenIds.add(id);
    prepared.push([id, assertAliases(entry.searchAliases, `${entryName}.searchAliases`)]);
  }
  return prepared;
}

export function prepareEnrichmentSidecar(sidecar, binding) {
  assertExactFields(sidecar, TOP_LEVEL_FIELDS, 'enrichment sidecar');
  const catalogBinding = assertBinding(binding);
  if (sidecar.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError('enrichment sidecar schemaVersion is unsupported');
  }
  if (sidecar.sourceCatalogSnapshotId !== catalogBinding.catalogSnapshotId) {
    throw new TypeError('enrichment sidecar catalog snapshot does not match the catalog');
  }
  if (sidecar.sourceCatalogSha256 !== catalogBinding.catalogSha256) {
    throw new TypeError('enrichment sidecar catalog SHA-256 does not match the catalog');
  }
  assertSha256(sidecar.sourceAliasAuthoritySha256, 'sourceAliasAuthoritySha256');
  if (
    typeof sidecar.generatedAt !== 'string'
    || Number.isNaN(Date.parse(sidecar.generatedAt))
  ) {
    throw new TypeError('generatedAt must be an ISO date-time string');
  }
  const works = prepareEntries(sidecar.works, {
    name: 'works',
    idField: 'workId',
    allowedFields: WORK_FIELDS,
    knownIds: catalogBinding.workIds
  });
  const companies = prepareEntries(sidecar.companies, {
    name: 'companies',
    idField: 'companyId',
    allowedFields: COMPANY_FIELDS,
    knownIds: catalogBinding.companyIds
  });
  return Object.freeze({
    workAliasesById: createReadonlyAliasMap(works),
    companyAliasesById: createReadonlyAliasMap(companies)
  });
}
