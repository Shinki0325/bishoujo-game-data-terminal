import { basicToFormula, parseFormula } from './formula.js';
import { attributeSelectionsToFormula } from './attribute-filters.js';

const EMPTY_SELECTED_WORK_IDS = Object.freeze([]);
const INDEX_FORMAT = 'egs-tier-beta-index-v1';
const NUMERIC_SORT_KEYS = Object.freeze([
  'median', 'voteCount',
  'egsScore',
  'vndbScore', 'vndbVoteCount',
  'bangumiScore', 'bangumiVoteCount'
]);
const compareJapanese = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base'
}).compare;

function normalizeTitle(source) {
  return String(source ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja');
}

// Search should tolerate the typography used by different source catalogs
// (full-width punctuation, brackets, separators, and spacing) while retaining
// the original normalized form for queries where punctuation is meaningful.
function normalizeLooseTitle(source) {
  return normalizeTitle(source).replace(/[\p{P}\p{S}\s]+/gu, '');
}

function releaseDateOf(work) {
  return typeof work.releaseDate === 'string' ? work.releaseDate : '9999-12-31';
}

function groupIdOf(work) {
  return typeof work.workGroupId === 'string' && work.workGroupId.length > 0
    ? work.workGroupId
    : work.workId;
}

function buildGroups(works) {
  const groups = new Map();
  for (const work of works) {
    const groupId = groupIdOf(work);
    const existing = groups.get(groupId);
    if (!existing) {
      groups.set(groupId, {
        workGroupId: groupId,
        editionWorkIds: [work.workId],
        earliestReleaseDate: releaseDateOf(work)
      });
      continue;
    }
    existing.editionWorkIds.push(work.workId);
    if (releaseDateOf(work) < existing.earliestReleaseDate) {
      existing.earliestReleaseDate = releaseDateOf(work);
    }
  }
  return groups;
}

function deriveIndexes(works, knownFilterIds) {
  const facets = Object.fromEntries(knownFilterIds.map(filterId => [filterId, []]));
  const companies = {};
  const numeric = Object.fromEntries(NUMERIC_SORT_KEYS.map(field => [field, []]));
  numeric.releaseDate = [];
  for (let position = 0; position < works.length; position += 1) {
    const work = works[position];
    const workFilterIds = [...work.filterIds, ...work.genreFilterIds];
    if (typeof work.platformFilterId === 'string') {
      workFilterIds.push(work.platformFilterId);
    }
    for (const filterId of workFilterIds) {
      (facets[filterId] ??= []).push(position);
    }
    (companies[work.brandId] ??= []).push(position);
    for (const field of NUMERIC_SORT_KEYS) numeric[field].push(work[field] ?? null);
    numeric.releaseDate.push(work.releaseDate);
  }
  return {
    format: INDEX_FORMAT,
    workOrder: works.map(work => work.workId),
    facets,
    companies,
    numeric
  };
}

function assertBackendIndexes(backendIndexes, works, knownFilterIds) {
  if (
    backendIndexes === null
    || typeof backendIndexes !== 'object'
    || Array.isArray(backendIndexes)
    || backendIndexes.format !== INDEX_FORMAT
    || !Array.isArray(backendIndexes.workOrder)
    || backendIndexes.workOrder.length !== works.length
    || backendIndexes.workOrder.some((workId, index) => workId !== works[index].workId)
    || backendIndexes.facets === null
    || typeof backendIndexes.facets !== 'object'
    || backendIndexes.companies === null
    || typeof backendIndexes.companies !== 'object'
    || backendIndexes.numeric === null
    || typeof backendIndexes.numeric !== 'object'
  ) {
    throw new TypeError('backendIndexes must match the validated catalog work order');
  }
  for (const filterId of knownFilterIds) {
    if (!Array.isArray(backendIndexes.facets[filterId])) {
      throw new TypeError(`backendIndexes.facets must contain ${filterId}`);
    }
  }
  for (const field of ['median', 'voteCount', 'releaseDate']) {
    if (!Array.isArray(backendIndexes.numeric[field]) || backendIndexes.numeric[field].length !== works.length) {
      throw new TypeError(`backendIndexes.numeric.${field} must cover the catalog`);
    }
  }
  return backendIndexes;
}

function withRatingSortIndexes(sourceIndexes, works) {
  const numeric = { ...sourceIndexes.numeric };
  for (const field of ['egsScore', 'vndbScore', 'vndbVoteCount', 'bangumiScore', 'bangumiVoteCount']) {
    numeric[field] = works.map(work => work[field] ?? null);
  }
  return { ...sourceIndexes, numeric };
}

function maskFromPositions(size, positions) {
  const mask = new Uint8Array(size);
  for (const position of positions) mask[position] = 1;
  return mask;
}

function compilePositionMasks(size, source) {
  return new Map(Object.entries(source).map(([id, positions]) => [
    id,
    maskFromPositions(size, positions)
  ]));
}

function evaluateAstMask(ast, index) {
  if (ast.type === 'filter') {
    const source = index.facetMasks.get(ast.id);
    if (!source) throw new TypeError(`unknown filter ID ${ast.id}`);
    return source.slice();
  }
  if (ast.type === 'not') {
    const value = evaluateAstMask(ast.value, index);
    for (let position = 0; position < value.length; position += 1) value[position] ^= 1;
    return value;
  }
  const left = evaluateAstMask(ast.left, index);
  const right = evaluateAstMask(ast.right, index);
  for (let position = 0; position < left.length; position += 1) {
    left[position] = ast.type === 'and'
      ? left[position] & right[position]
      : left[position] | right[position];
  }
  return left;
}

function formulaMask(index, filterState) {
  let source = filterState.advancedExpression;
  if (filterState.mode !== 'advanced') {
    const attributeSource = filterState.attributeSelections === undefined
      ? ''
      : attributeSelectionsToFormula(filterState.attributeSelections);
    const contentSource = basicToFormula(
      filterState.positiveFilterIds,
      filterState.excludedFilterIds,
      filterState.basicOperator
    );
    source = [attributeSource, contentSource]
      .filter(Boolean)
      .map(value => `(${value})`)
      .join(' AND ');
  }
  if (source.trim().length === 0) return new Uint8Array(index.works.length).fill(1);
  return evaluateAstMask(parseFormula(source, index.knownFilterIds), index);
}

function companyMask(index, brandIds) {
  if (brandIds.length === 0) return null;
  const mask = new Uint8Array(index.works.length);
  for (const brandId of brandIds) {
    const source = index.companyMasks.get(brandId);
    if (!source) continue;
    for (let position = 0; position < mask.length; position += 1) mask[position] |= source[position];
  }
  return mask;
}

function matchingPositions(index, filterState, selectedWorkIds) {
  const matches = formulaMask(index, filterState);
  const companies = companyMask(index, filterState.brandIds);
  const selected = filterState.selectedOnly ? new Set(selectedWorkIds) : null;
  const normalizedQuery = normalizeTitle(filterState.titleQuery);
  const normalizedLooseQuery = normalizeLooseTitle(filterState.titleQuery);
  const positions = [];
  for (let position = 0; position < matches.length; position += 1) {
    if (!matches[position] || (companies !== null && !companies[position])) continue;
    if (filterState.excludeNukige && index.works[position].isNukige === true) continue;
    const median = index.numeric.median[position];
    const medianFails = median === null
      ? normalizedQuery.length === 0 && index.works[position].externalAdmissionVisible !== true
      : typeof median !== 'number' || median < filterState.minimumScore;
    const voteCount = index.numeric.voteCount[position];
    const voteCountFails = voteCount === null
      ? normalizedQuery.length === 0 && index.works[position].externalAdmissionVisible !== true
      : typeof voteCount !== 'number' || voteCount < filterState.minimumVoteCount;
    if (medianFails || voteCountFails) continue;
    const releaseYear = Number(index.numeric.releaseDate[position].slice(0, 4));
    if (releaseYear < filterState.releaseYearStart || releaseYear > filterState.releaseYearEnd) continue;
    if (
      normalizedQuery
      && !index.normalizedTitles[position].includes(normalizedQuery)
      && (!normalizedLooseQuery || !index.normalizedLooseTitles[position].includes(normalizedLooseQuery))
    ) continue;
    if (selected !== null && !selected.has(index.works[position].workId)) continue;
    positions.push(position);
  }
  return positions;
}

function comparePositions(index, leftPosition, rightPosition, filterState) {
  const left = index.works[leftPosition];
  const right = index.works[rightPosition];
  let comparison;
  if (NUMERIC_SORT_KEYS.includes(filterState.sortKey)) {
    if (index.numeric[filterState.sortKey][leftPosition] === null || index.numeric[filterState.sortKey][rightPosition] === null) {
      if (index.numeric[filterState.sortKey][leftPosition] === index.numeric[filterState.sortKey][rightPosition]) {
        return leftPosition - rightPosition;
      }
      return index.numeric[filterState.sortKey][leftPosition] === null ? 1 : -1;
    }
    comparison = index.numeric[filterState.sortKey][leftPosition]
      - index.numeric[filterState.sortKey][rightPosition];
  } else if (filterState.sortKey === 'releaseDate') {
    comparison = compareJapanese(
      index.groupReleaseDates[leftPosition],
      index.groupReleaseDates[rightPosition]
    );
    if (comparison === 0) {
      comparison = compareJapanese(
        index.numeric.releaseDate[leftPosition],
        index.numeric.releaseDate[rightPosition]
      );
    }
  } else {
    comparison = compareJapanese(left[filterState.sortKey], right[filterState.sortKey]);
  }
  if (comparison !== 0) return filterState.sortDirection === 'asc' ? comparison : -comparison;
  return leftPosition - rightPosition;
}

function mergeFilterPatch(filterState, patch) {
  return { ...filterState, ...patch };
}

function visibleCompanyRequests(filterState, brands, limit = 24) {
  if (!Array.isArray(brands)) return [];
  const selected = new Set(filterState.brandIds ?? []);
  const seen = new Set();
  return brands
    .filter(brand => {
      if (!brand || typeof brand.brandId !== 'string' || seen.has(brand.brandId)) return false;
      seen.add(brand.brandId);
      return true;
    })
    .slice(0, limit)
    .map(brand => ({
      brandId: brand.brandId,
      patch: selected.has(brand.brandId)
        ? null
        : { brandIds: [...selected, brand.brandId] }
    }));
}

export function createQueryIndex({
  works,
  knownFilterIds,
  brands = [],
  backendIndexes = null,
  workAliasesById = null,
  workPinyinById = null,
  companyAliasesById = null,
  companyPinyinById = null
}) {
  if (!Array.isArray(works)) throw new TypeError('works must be an array');
  if (!Array.isArray(knownFilterIds) && !(knownFilterIds instanceof Set)) {
    throw new TypeError('knownFilterIds must be an Array or Set');
  }
  const workSnapshots = works.map(work => ({ ...work }));
  const filterIds = Array.from(knownFilterIds);
  const sourceIndexes = withRatingSortIndexes(assertBackendIndexes(
    backendIndexes ?? deriveIndexes(workSnapshots, filterIds),
    workSnapshots,
    filterIds
  ), workSnapshots);
  const groups = buildGroups(workSnapshots);
  const groupReleaseDates = workSnapshots.map(work => groups.get(groupIdOf(work)).earliestReleaseDate);
  return Object.freeze({
    works: Object.freeze(workSnapshots),
    knownFilterIds: Object.freeze(filterIds),
    brands: Object.freeze(Array.isArray(brands) ? brands.map(brand => ({ ...brand })) : []),
    groups,
    backendIndexes: sourceIndexes,
    facetMasks: compilePositionMasks(workSnapshots.length, sourceIndexes.facets),
    companyMasks: compilePositionMasks(workSnapshots.length, sourceIndexes.companies),
    numeric: sourceIndexes.numeric,
    normalizedTitles: Object.freeze(workSnapshots.map(work => {
      const aliases = workAliasesById?.get?.(work.workId);
      const pinyin = workPinyinById?.get?.(work.workId);
      const companyAliases = companyAliasesById?.get?.(work.brandId);
      const companyPinyin = companyPinyinById?.get?.(work.brandId);
      const values = [
        work.title,
        ...(Array.isArray(aliases) ? aliases : []),
        ...(Array.isArray(pinyin) ? pinyin : []),
        ...(Array.isArray(companyAliases) ? companyAliases : []),
        ...(Array.isArray(companyPinyin) ? companyPinyin : [])
      ];
      return values.map(normalizeTitle).filter(Boolean).join('\n');
    })),
    normalizedLooseTitles: Object.freeze(workSnapshots.map(work => {
      const aliases = workAliasesById?.get?.(work.workId);
      const pinyin = workPinyinById?.get?.(work.workId);
      const companyAliases = companyAliasesById?.get?.(work.brandId);
      const companyPinyin = companyPinyinById?.get?.(work.brandId);
      const values = [
        work.title,
        ...(Array.isArray(aliases) ? aliases : []),
        ...(Array.isArray(pinyin) ? pinyin : []),
        ...(Array.isArray(companyAliases) ? companyAliases : []),
        ...(Array.isArray(companyPinyin) ? companyPinyin : [])
      ];
      return values.map(normalizeLooseTitle).filter(Boolean).join('\n');
    })),
    groupReleaseDates: Object.freeze(groupReleaseDates)
  });
}

export function queryIndexedCatalog(index, filterState, selectedWorkIds = EMPTY_SELECTED_WORK_IDS) {
  const positions = matchingPositions(index, filterState, selectedWorkIds);
  positions.sort((left, right) => comparePositions(index, left, right, filterState));
  return positions.map(position => index.works[position]);
}

export function countIndexedPatches(index, filterState, patches, selectedWorkIds = EMPTY_SELECTED_WORK_IDS) {
  return patches.map(patch => (
    matchingPositions(index, mergeFilterPatch(filterState, patch), selectedWorkIds).length
  ));
}

export function projectedCountsForIndex(
  index,
  filterState,
  selectedWorkIds = EMPTY_SELECTED_WORK_IDS,
  { visibleBrands = index.brands, companyLimit = 24 } = {}
) {
  const current = matchingPositions(index, filterState, selectedWorkIds).length;
  const filters = {};
  const brands = {};
  const requests = [];
  const patches = [];
  for (const filterId of index.knownFilterIds) {
    const active = filterState.positiveFilterIds?.includes(filterId)
      || filterState.excludedFilterIds?.includes(filterId);
    if (active) {
      filters[filterId] = current;
      continue;
    }
    requests.push({ type: 'filter', id: filterId });
    patches.push({
      positiveFilterIds: [
        ...(filterState.positiveFilterIds ?? []).filter(id => id !== filterId),
        filterId
      ],
      excludedFilterIds: (filterState.excludedFilterIds ?? []).filter(id => id !== filterId)
    });
  }
  for (const request of visibleCompanyRequests(filterState, visibleBrands, companyLimit)) {
    if (request.patch === null) {
      brands[request.brandId] = current;
      continue;
    }
    requests.push({ type: 'brand', id: request.brandId });
    patches.push(request.patch);
  }
  const counts = countIndexedPatches(index, filterState, patches, selectedWorkIds);
  for (let position = 0; position < requests.length; position += 1) {
    const request = requests[position];
    if (request.type === 'filter') filters[request.id] = counts[position];
    else brands[request.id] = counts[position];
  }
  return { filters, brands };
}
