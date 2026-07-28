import { validateRelativeAssetPath } from './asset-url.js';

const BACKEND_SCHEMA_VERSION = 'egs-tier-beta-v1';
const RUNTIME_SCHEMA_VERSION = 'egs-tier-sample-document-v3';
const BACKEND_INDEX_FORMAT = 'egs-tier-beta-index-v1';
const REVIEW_QUEUE_SCHEMA_VERSION = 'egs-tier-work-group-review-queue-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function assertArray(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function assertObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function requiredString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function displayGroup(filter) {
  return filter.kind === 'genre' ? 'game-type' : 'content';
}

function displayGroupTitle(filter) {
  return filter.kind === 'genre' ? 'Game type' : 'Content';
}

function labelFor(filter) {
  return requiredString(
    filter.labelZh ?? filter.label ?? filter.displayTitle,
    'filter.label'
  );
}

function adaptFilter(filter) {
  assertObject(filter, 'filter');
  return {
    filterId: requiredString(filter.filterId, 'filter.filterId'),
    displayTitle: labelFor(filter),
    groupId: typeof filter.groupId === 'string' && filter.groupId.length > 0
      ? filter.groupId
      : displayGroup(filter),
    groupTitleZh: typeof filter.groupTitleZh === 'string' && filter.groupTitleZh.length > 0
      ? filter.groupTitleZh
      : displayGroupTitle(filter),
    displayOrder: Number.isInteger(filter.publicDisplayOrder)
      ? filter.publicDisplayOrder
      : Number.isInteger(filter.displayOrder) ? filter.displayOrder : 0,
    isSensitive: Boolean(filter.isSensitive)
  };
}

function adaptFilterAuthority(authority) {
  assertObject(authority, 'filterAuthority');
  return {
    contentFilters: assertArray(authority.contentFacets, 'filterAuthority.contentFacets').map(adaptFilter),
    genreFilters: assertArray(authority.genreFacets, 'filterAuthority.genreFacets').map(adaptFilter),
    platformFilters: assertArray(authority.platformFacets, 'filterAuthority.platformFacets').map(adaptFilter)
  };
}

function adaptBrand(company) {
  assertObject(company, 'company');
  const aliases = assertArray(company.aliases ?? [], 'company.aliases').map(alias => (
    requiredString(alias, 'company.aliases[]')
  ));
  return {
    brandId: requiredString(company.companyId, 'company.companyId'),
    brandName: requiredString(company.name, 'company.name'),
    aliases,
    searchAliases: [...aliases]
  };
}

function brandNameFor(companyById, companyId) {
  const company = companyById.get(companyId);
  if (!company) throw new TypeError(`unknown companyId ${companyId}`);
  return company.brandName;
}

function reviewEditionIds(reviewQueue) {
  if (reviewQueue === undefined || reviewQueue === null) return new Set();
  assertObject(reviewQueue, 'reviewQueue');
  if (reviewQueue.schemaVersion !== REVIEW_QUEUE_SCHEMA_VERSION) {
    throw new TypeError('review queue schema mismatch');
  }
  if (reviewQueue.status !== 'open') throw new TypeError('review queue status mismatch');
  const result = new Set();
  for (const candidate of assertArray(reviewQueue.candidates ?? [], 'reviewQueue.candidates')) {
    assertObject(candidate, 'reviewQueue.candidates[]');
    if (candidate.schemaVersion !== REVIEW_QUEUE_SCHEMA_VERSION) {
      throw new TypeError('review queue candidate schema mismatch');
    }
    if (candidate.status !== 'needs-human-review') {
      throw new TypeError('review queue candidate status mismatch');
    }
    if (candidate.publicBetaDisposition !== 'remain-separate') {
      throw new TypeError('review queue candidate public beta disposition mismatch');
    }
    for (const workId of assertArray(candidate.candidateEditionWorkIds ?? [], 'candidate.candidateEditionWorkIds')) {
      result.add(requiredString(workId, 'candidate.candidateEditionWorkIds[]'));
    }
  }
  return result;
}

function assertSourceHashIntegrity(candidate, sourceHashes, backendIndexes = null) {
  if (sourceHashes === undefined || sourceHashes === null) return;
  assertObject(sourceHashes, 'sourceHashes');
  const integrity = assertObject(candidate.integrity, 'fixture.integrity');
  const inputHashes = assertObject(integrity.inputHashes, 'fixture.integrity.inputHashes');
  const outputHashes = assertObject(integrity.outputHashes, 'fixture.integrity.outputHashes');
  const authorities = assertObject(candidate.authorities, 'fixture.authorities');
  const expected = {
    indexes: outputHashes.indexes,
    assetsManifest: outputHashes.assetsManifest,
    filterAuthority: inputHashes.filterAuthority,
    workGroupAuthority: inputHashes.workGroupAuthority
  };
  if (sourceHashes.reviewQueue !== undefined || inputHashes.reviewQueue !== undefined) {
    expected.reviewQueue = inputHashes.reviewQueue;
  }
  for (const [name, declaredHash] of Object.entries(expected)) {
    const actualHash = sourceHashes[name];
    if (!SHA256_PATTERN.test(actualHash ?? '') || declaredHash !== actualHash) {
      throw new TypeError(`${name} hash mismatch`);
    }
  }
  const authorityNames = ['filterAuthority', 'workGroupAuthority'];
  if (expected.reviewQueue !== undefined) authorityNames.push('reviewQueue');
  for (const name of authorityNames) {
    const authorityHash = assertObject(
      authorities[name],
      `fixture.authorities.${name}`
    ).sha256;
    if (authorityHash !== sourceHashes[name]) {
      throw new TypeError(`${name} authority hash mismatch`);
    }
  }
  if (backendIndexes?.authorities !== undefined) {
    const indexAuthorities = assertObject(
      backendIndexes.authorities,
      'backendIndexes.authorities'
    );
    for (const name of authorityNames) {
      const indexHash = assertObject(
        indexAuthorities[name],
        `backendIndexes.authorities.${name}`
      ).sha256;
      if (indexHash !== sourceHashes[name]) {
        throw new TypeError(`${name} index authority hash mismatch`);
      }
    }
  }
}

function workGroupMap(authority) {
  if (authority === undefined || authority === null) return new Map();
  assertObject(authority, 'workGroupAuthority');
  return new Map(Object.entries(assertObject(
    authority.workGroupByEditionWorkId ?? {},
    'workGroupAuthority.workGroupByEditionWorkId'
  )));
}

function authorityWorkGroups(authority, fallbackGroups) {
  if (authority === undefined || authority === null) return fallbackGroups;
  assertObject(authority, 'workGroupAuthority');
  return assertArray(authority.groups ?? [], 'workGroupAuthority.groups').map(group => ({ ...group }));
}

function workGroupIdFor(work, authorityGroups, reviewedAmbiguousIds, hasGroupAuthority) {
  const workId = requiredString(work.workId, 'work.workId');
  if (reviewedAmbiguousIds.has(workId)) return workId;
  const confirmedGroupId = authorityGroups.get(workId);
  if (confirmedGroupId) return confirmedGroupId;
  if (hasGroupAuthority) return workId;
  return typeof work.workGroupId === 'string' && work.workGroupId.length > 0
    ? work.workGroupId
    : workId;
}

function assetManifestByWorkId(assetsManifest) {
  if (assetsManifest === undefined || assetsManifest === null) return null;
  assertObject(assetsManifest, 'assetsManifest');
  const assets = assertArray(assetsManifest.assets ?? [], 'assetsManifest.assets');
  const result = new Map();
  for (const asset of assets) {
    assertObject(asset, 'assetsManifest.assets[]');
    const workId = requiredString(asset.workId, 'asset.workId');
    if (result.has(workId)) throw new TypeError(`asset manifest contains duplicate work ${workId}`);
    result.set(workId, asset);
  }
  return result;
}

function assertManifestAsset(work, thumbnail, manifestByWorkId) {
  if (manifestByWorkId === null) return;
  const asset = manifestByWorkId.get(work.workId);
  if (!asset) throw new TypeError(`asset manifest missing work ${work.workId}`);
  if (
    asset.url !== thumbnail.url
    || asset.width !== thumbnail.width
    || asset.height !== thumbnail.height
    || asset.sha256 !== thumbnail.sha256
  ) {
    throw new TypeError(`asset manifest mismatch for work ${work.workId}`);
  }
}

function assertPositionArray(actual, expected, label) {
  const positions = assertArray(actual, label);
  if (positions.length !== expected.length) throw new TypeError(label);
  for (let index = 0; index < positions.length; index += 1) {
    if (!Number.isSafeInteger(positions[index]) || positions[index] !== expected[index]) {
      throw new TypeError(label);
    }
  }
}

function expectedPositionMap(works, idsForWork, authorityIds = []) {
  const result = new Map(authorityIds.map(id => [id, []]));
  for (let position = 0; position < works.length; position += 1) {
    for (const id of idsForWork(works[position])) {
      const positions = result.get(id) ?? [];
      positions.push(position);
      result.set(id, positions);
    }
  }
  return result;
}

function assertPositionMap(actual, expected, label) {
  const source = assertObject(actual, `backendIndexes.${label}`);
  const entries = Object.entries(source);
  if (entries.length !== expected.size) throw new TypeError(`${label} index mismatch: keys`);
  for (const [id, positions] of expected) {
    if (!Object.hasOwn(source, id)) throw new TypeError(`${label} index missing ${id}`);
    assertPositionArray(source[id], positions, `${label} index mismatch for ${id}`);
  }
}

function assertBackendIndexes(backendIndexes, works, catalog = null) {
  if (backendIndexes === undefined || backendIndexes === null) return null;
  assertObject(backendIndexes, 'backendIndexes');
  if (catalog !== null) {
    const catalogIndexes = assertObject(catalog.indexes, 'fixture.indexes');
    const expectedFormat = requiredString(catalogIndexes.format, 'fixture.indexes.format');
    if (backendIndexes.format !== expectedFormat) throw new TypeError('backend index format mismatch');
  } else if (backendIndexes.format !== BACKEND_INDEX_FORMAT) {
    throw new TypeError('backend index format mismatch');
  }
  const workOrder = assertArray(backendIndexes.workOrder ?? [], 'backendIndexes.workOrder');
  if (workOrder.length !== works.length) {
    throw new TypeError('backendIndexes.workOrder must cover every fixture work');
  }
  for (let position = 0; position < works.length; position += 1) {
    if (workOrder[position] !== requiredString(works[position].workId, 'work.workId')) {
      throw new TypeError(`backendIndexes.workOrder mismatch at ${position}`);
    }
  }

  assertPositionMap(
    backendIndexes.facets,
    expectedPositionMap(works, work => [
      ...assertArray(work.filterIds, 'work.filterIds'),
      ...assertArray(work.genreIds, 'work.genreIds'),
      requiredString(work.platformId, 'work.platformId')
    ], assertArray(catalog?.filters ?? [], 'fixture.filters').map(filter => (
      requiredString(filter.filterId, 'fixture.filters[].filterId')
    ))),
    'facet'
  );
  assertPositionMap(
    backendIndexes.companies,
    expectedPositionMap(
      works,
      work => [requiredString(work.companyId, 'work.companyId')],
      assertArray(catalog?.companies ?? [], 'fixture.companies').map(company => (
        requiredString(company.companyId, 'fixture.companies[].companyId')
      ))
    ),
    'company'
  );

  const numeric = assertObject(backendIndexes.numeric, 'backendIndexes.numeric');
  for (const [field, sourceField] of [
    ['median', 'median'],
    ['voteCount', 'voteCount'],
    ['releaseDate', 'releaseDate']
  ]) {
    const values = assertArray(numeric[field], `backendIndexes.numeric.${field}`);
    if (values.length !== works.length) throw new TypeError(`numeric index ${field} mismatch`);
    for (let position = 0; position < works.length; position += 1) {
      if (values[position] !== works[position][sourceField]) {
        throw new TypeError(`numeric index ${field} mismatch at ${position}`);
      }
    }
  }
  return backendIndexes;
}

function adaptWork(
  work,
  companyById,
  authorityGroups,
  reviewedAmbiguousIds,
  manifestByWorkId,
  hasGroupAuthority
) {
  assertObject(work, 'work');
  const thumbnail = assertObject(work.thumbnail, 'work.thumbnail');
  assertManifestAsset(work, thumbnail, manifestByWorkId);
  const thumbnailPath = validateRelativeAssetPath(
    requiredString(thumbnail.url, 'work.thumbnail.url'),
    'work.thumbnail.url'
  );
  const width = thumbnail.width;
  const height = thumbnail.height;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError('work.thumbnail dimensions must be positive integers');
  }
  const brandId = requiredString(work.companyId, 'work.companyId');
  const workGroupId = workGroupIdFor(
    work,
    authorityGroups,
    reviewedAmbiguousIds,
    hasGroupAuthority
  );
  return {
    workId: requiredString(work.workId, 'work.workId'),
    title: requiredString(work.title, 'work.title'),
    furigana: typeof work.furigana === 'string' ? work.furigana : '',
    releaseDate: requiredString(work.releaseDate, 'work.releaseDate'),
    brandId,
    brandName: brandNameFor(companyById, brandId),
    median: work.median,
    voteCount: work.voteCount,
    rawFilterIds: [...assertArray(work.filterIds, 'work.filterIds')],
    filterIds: [...work.filterIds],
    rawGenre: '',
    genreFilterIds: [...assertArray(work.genreIds, 'work.genreIds')].sort(),
    platformFilterId: requiredString(work.platformId, 'work.platformId'),
    workGroupId,
    thumbnailPath,
    coverPath: thumbnailPath,
    coverWidth: width,
    coverHeight: height
  };
}

export function isBackendBetaFixture(candidate) {
  return candidate?.schemaVersion === BACKEND_SCHEMA_VERSION;
}

export function prepareBackendBetaFixture(candidate, {
  filterAuthority = null,
  workGroupAuthority = null,
  reviewQueue = null,
  backendIndexes = null,
  assetsManifest = null,
  sourceHashes = null
} = {}) {
  assertObject(candidate, 'fixture');
  if (candidate.schemaVersion !== BACKEND_SCHEMA_VERSION) {
    throw new TypeError(`fixture.schemaVersion must be ${BACKEND_SCHEMA_VERSION}`);
  }
  assertSourceHashIntegrity(candidate, sourceHashes, backendIndexes);
  if (filterAuthority !== null) {
    const expectedVersion = requiredString(
      candidate.authorities?.filterAuthority?.version,
      'fixture.authorities.filterAuthority.version'
    );
    if (filterAuthority.authorityVersion !== expectedVersion) {
      throw new TypeError('filter authority version mismatch');
    }
  }
  if (workGroupAuthority !== null) {
    const expectedVersion = requiredString(
      candidate.authorities?.workGroupAuthority?.version,
      'fixture.authorities.workGroupAuthority.version'
    );
    if (workGroupAuthority.authorityVersion !== expectedVersion) {
      throw new TypeError('work group authority version mismatch');
    }
  }
  if (assetsManifest !== null) {
    const expectedManifestVersion = requiredString(
      candidate.assets?.manifestVersion,
      'fixture.assets.manifestVersion'
    );
    if (assetsManifest.manifestVersion !== expectedManifestVersion) {
      throw new TypeError('asset manifest version mismatch');
    }
  }
  const sampleId = requiredString(candidate.snapshot?.snapshotId, 'fixture.snapshot.snapshotId');
  const authorityFilters = filterAuthority === null
    ? null
    : adaptFilterAuthority(filterAuthority);
  const filters = authorityFilters === null
    ? assertArray(candidate.filters, 'fixture.filters').map(adaptFilter)
    : [
        ...authorityFilters.contentFilters,
        ...authorityFilters.genreFilters,
        ...authorityFilters.platformFilters
      ];
  const brands = assertArray(candidate.companies, 'fixture.companies').map(adaptBrand);
  const companyById = new Map(brands.map(brand => [brand.brandId, brand]));
  const contentFilters = filters.filter(filter => (
    filter.groupId !== 'game-type' && filter.groupId !== 'platform'
  ));
  const genreFilters = filters.filter(filter => filter.groupId === 'game-type');
  const platformFilters = filters.filter(filter => filter.groupId === 'platform');
  const authorityGroups = workGroupMap(workGroupAuthority);
  const reviewedAmbiguousIds = reviewEditionIds(reviewQueue);
  for (const workId of reviewedAmbiguousIds) {
    if (authorityGroups.has(workId)) {
      throw new TypeError(
        `review queue overlaps confirmed work group mapping for ${workId}`
      );
    }
  }
  const manifestByWorkId = assetManifestByWorkId(assetsManifest);
  const fallbackGroups = assertArray(candidate.workGroups ?? [], 'fixture.workGroups').map(group => ({ ...group }));
  const works = assertArray(candidate.works, 'fixture.works');
  if (manifestByWorkId !== null && manifestByWorkId.size !== works.length) {
    throw new TypeError('asset manifest must cover every fixture work exactly once');
  }
  const validatedIndexes = assertBackendIndexes(
    backendIndexes === null ? candidate.indexes ?? null : backendIndexes,
    works,
    candidate
  );
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    sampleId,
    brands,
    filters: contentFilters,
    genreFilters,
    platformFilters,
    workGroups: authorityWorkGroups(workGroupAuthority, fallbackGroups),
    backendIndexes: validatedIndexes,
    assetsManifest: assetsManifest === null ? candidate.assets ?? null : assetsManifest,
    reviewQueueSummary: reviewQueue?.summary ? { ...reviewQueue.summary } : null,
    works: works.map(work => (
      adaptWork(
        work,
        companyById,
        authorityGroups,
        reviewedAmbiguousIds,
        manifestByWorkId,
        workGroupAuthority !== null
      )
    ))
  };
}
