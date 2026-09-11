import { basicToFormula, parseFormula } from './formula.js';
import { snapshotSearchText } from './search-text.js';

const searchTextInstallers = new WeakMap();
const searchTextWarmers = new WeakMap();
export function warmQuerySearchText(index, options) {
  const warm = searchTextWarmers.get(index);
  if (!warm) throw new TypeError('unknown query index');
  return warm(options);
}
export function installQuerySearchText(index, searchText) {
  const install = searchTextInstallers.get(index);
  if (!install) throw new TypeError('unknown query index');
  install(searchText);
}
import { attributeSelectionsToFormula } from './attribute-filters.js';
import {
  RELEASE_DATE_DEFAULT_MAX_YEAR,
  RELEASE_DATE_MIN_YEAR,
  releaseDateSortCompare,
  releaseStatusMatches,
  releaseYear,
  releaseYearMatches
} from './work-release-date.js';
import {
  buildPinyinSearchHaystack,
  buildSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText,
  normalizeSearchText
} from './search-normalization.js';
import {
  normalizePersonWorkIndex,
  PERSON_WORK_ROLES
} from './person-work-index.js';

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
  return normalizeSearchText(source);
}

// Search should tolerate the typography used by different source catalogs
// (full-width punctuation, brackets, separators, and spacing) while retaining
// the original normalized form for queries where punctuation is meaningful.
function normalizeLooseTitle(source) {
  return normalizeLooseSearchText(source);
}

function releaseDateOf(work) {
  return typeof work.releaseDate === 'string' ? work.releaseDate : '9999-12-31';
}

function groupIdOf(work) {
  return typeof work.workGroupId === 'string' && work.workGroupId.length > 0
    ? work.workGroupId
    : work.workId;
}

const YEAR_WORD_BITS = 32;
const YEAR_SPAN = RELEASE_DATE_DEFAULT_MAX_YEAR - RELEASE_DATE_MIN_YEAR + 1;

function countDistinctGroups(index, positions) {
  const groupIds = new Set();
  for (const position of positions) groupIds.add(groupIdOf(index.works[position]));
  return groupIds.size;
}

function createYearProjection(index, positions) {
  // A group can contain editions released in different years. Keep one
  // two-word year mask per group so every histogram bucket is deduplicated,
  // while the client can answer cross-year ranges without receiving IDs.
  const groupMasks = new Map();
  for (const position of positions) {
    const work = index.works[position];
    const groupId = groupIdOf(work);
    let mask = groupMasks.get(groupId);
    if (mask === undefined) {
      mask = [0, 0];
      groupMasks.set(groupId, mask);
    }
    const year = releaseYear(work.releaseDate);
    const offset = year === null ? -1 : year - RELEASE_DATE_MIN_YEAR;
    if (!Number.isInteger(offset) || offset < 0 || offset >= YEAR_SPAN) continue;
    if (offset < YEAR_WORD_BITS) mask[0] = (mask[0] | (1 << offset)) >>> 0;
    else mask[1] = (mask[1] | (1 << (offset - YEAR_WORD_BITS))) >>> 0;
  }

  const yearCounts = {};
  const groupedMasks = new Map();
  for (const [lo, hi] of groupMasks.values()) {
    if (lo === 0 && hi === 0) continue;
    const key = `${lo}:${hi}`;
    const entry = groupedMasks.get(key);
    if (entry) entry.count += 1;
    else groupedMasks.set(key, { lo, hi, count: 1 });
    for (let offset = 0; offset < YEAR_SPAN; offset += 1) {
      const word = offset < YEAR_WORD_BITS ? lo : hi;
      const bit = offset < YEAR_WORD_BITS ? offset : offset - YEAR_WORD_BITS;
      if ((word & (1 << bit)) !== 0) {
        const year = RELEASE_DATE_MIN_YEAR + offset;
        yearCounts[year] = (yearCounts[year] ?? 0) + 1;
      }
    }
  }
  const yearRangeGroups = [...groupedMasks.values()]
    .sort((left, right) => left.lo - right.lo || left.hi - right.hi)
    .map(({ lo, hi, count }) => [lo, hi, count]);
  return { yearCounts, yearRangeGroups, yearUniverseCount: groupMasks.size };
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

function personMask(index, personIds, personRole) {
  if (!Array.isArray(personIds) || personIds.length === 0) return null;
  const mask = new Uint8Array(index.works.length);
  // A non-empty person condition must fail closed until the matching
  // projection is available.  Silently ignoring it would show unrelated
  // works and make the filter look successful while being incorrect.
  if (!(index.personWorkPositions instanceof Map)) return mask;
  const role = personRole === undefined || personRole === 'all' ? null : personRole;
  if (role !== null && !PERSON_WORK_ROLES.includes(role)) return mask;
  for (const personId of personIds) {
    const roleMap = index.personWorkPositions.get(personId);
    if (!roleMap) continue;
    const positions = role === null
      ? [...roleMap.values()].flat()
      : (roleMap.get(role) ?? []);
    for (const position of positions) mask[position] = 1;
  }
  return mask;
}

function matchingPositions(index, filterState, selectedWorkIds) {
  const normalizedQuery = normalizeTitle(filterState.titleQuery);
  const normalizedLooseQuery = normalizeLooseTitle(filterState.titleQuery);
  const normalizedPinyinQuery = normalizeGeneratedPinyinQuery(filterState.titleQuery);
  const exactCompanyIds = normalizedQuery ? index.companyQueryIds.get(normalizedQuery) : null;
  const looseCompanyIds = normalizedLooseQuery ? index.companyLooseQueryIds.get(normalizedLooseQuery) : null;
  const companyQuery = Boolean(exactCompanyIds || looseCompanyIds);
  const queryFilterState = companyQuery
    ? {
        ...filterState,
        excludeNukige: false,
        // `pov-205` is the persisted default "排除拔作" facet.  A direct
        // company lookup should reveal the company's complete catalog, while
        // preserving any other user-selected content exclusions.
        excludedFilterIds: (filterState.excludedFilterIds ?? [])
          .filter(filterId => filterId !== 'pov-205'),
        attributeSelections: filterState.attributeSelections === undefined
          ? filterState.attributeSelections
          : { ...filterState.attributeSelections, platform: [] }
      }
    : filterState;
  const matches = formulaMask(index, queryFilterState);
  const companies = companyMask(index, filterState.brandIds);
  const people = personMask(index, filterState.personIds, filterState.personRole);
  const selected = filterState.selectedOnly ? new Set(selectedWorkIds) : null;
  const positions = [];
  for (let position = 0; position < matches.length; position += 1) {
    const work = index.works[position];
    const companyQueryMatch = Boolean(
      exactCompanyIds?.has(work.brandId)
      || looseCompanyIds?.has(work.brandId)
    );
    if (
      !matches[position]
      || (companies !== null && !companies[position])
      || (people !== null && !people[position])
    ) continue;
    const median = index.numeric.median[position];
    const medianFails = median === null
      ? filterState.minimumScore > 0 && normalizedQuery.length === 0 && index.works[position].externalAdmissionVisible !== true
      : typeof median !== 'number' || median < filterState.minimumScore;
    const voteCount = index.numeric.voteCount[position];
    const voteCountFails = voteCount === null
      ? filterState.minimumVoteCount > 0 && normalizedQuery.length === 0 && index.works[position].externalAdmissionVisible !== true
      : typeof voteCount !== 'number' || voteCount < filterState.minimumVoteCount;
    if (medianFails || voteCountFails) continue;
    if (!releaseYearMatches(work.releaseDate, filterState.releaseYearStart, filterState.releaseYearEnd)) continue;
    if (!releaseStatusMatches(work.releaseDate, filterState.releaseStatus)) continue;
    if (
      normalizedQuery
      && !companyQueryMatch
      && !index.normalizedTitles[position].includes(normalizedQuery)
      && (!normalizedLooseQuery || !index.normalizedLooseTitles[position].includes(normalizedLooseQuery))
      && (!normalizedPinyinQuery || !index.pinyinTitles[position].includes(normalizedPinyinQuery))
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
    comparison = releaseDateSortCompare(
      index.groupReleaseDates[leftPosition],
      index.groupReleaseDates[rightPosition],
      { direction: filterState.sortDirection }
    );
    if (comparison === 0) {
      comparison = releaseDateSortCompare(
        index.numeric.releaseDate[leftPosition],
        index.numeric.releaseDate[rightPosition],
        { direction: filterState.sortDirection }
      );
    }
    if (comparison !== 0) return comparison;
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

function addCompanyQuery(map, value, brandId) {
  const normalized = normalizeTitle(value);
  if (!normalized) return;
  const ids = map.get(normalized) ?? new Set();
  ids.add(brandId);
  map.set(normalized, ids);
}

function addCompanyLooseQuery(map, value, brandId) {
  const normalized = normalizeLooseTitle(value);
  if (!normalized) return;
  const ids = map.get(normalized) ?? new Set();
  ids.add(brandId);
  map.set(normalized, ids);
}

export function createSearchTextCarrier(index) {
  // Adjacent normal/loose forms share much more HTTP compression context than
  // three distant whole-catalog arrays. Bump this schema when search rules change.
  const normal=index.normalizedTitles, loose=index.normalizedLooseTitles, pinyin=index.pinyinTitles;
  return {schema:'query-search-text-v2', workIds:index.works.map(work => work.workId),
    rows:index.works.map((_,i)=>[normal[i],loose[i],pinyin[i]])};
}

const personWorkInstallers = new WeakMap();

export function installQueryPersonWorkIndex(index, value) {
  const install = personWorkInstallers.get(index);
  if (!install) throw new TypeError('query index has not been initialized');
  install(value);
}

function compilePersonWorkPositions(workSnapshots, personWorkIndex) {
  let personWorkPositions = null;
  if (personWorkIndex !== null && personWorkIndex !== undefined) {
    const normalizedPersonWorkIndex = normalizePersonWorkIndex(personWorkIndex);
    if (
      normalizedPersonWorkIndex.workOrder !== undefined
      && (
        normalizedPersonWorkIndex.workOrder.length !== workSnapshots.length
        || normalizedPersonWorkIndex.workOrder.some((workId, position) => workId !== workSnapshots[position].workId)
      )
    ) {
      throw new TypeError('personWorkIndex.workOrder must match the validated catalog work order');
    }
    const positionByWorkId = new Map(workSnapshots.map((work, position) => [work.workId, position]));
    personWorkPositions = new Map();
    for (const [personId, roles] of Object.entries(normalizedPersonWorkIndex.persons)) {
      const rolePositions = new Map();
      for (const [role, workIds] of Object.entries(roles)) {
        const positions = [];
        for (const workId of workIds) {
          const position = positionByWorkId.get(workId);
          if (position !== undefined) positions.push(position);
        }
        if (positions.length > 0) rolePositions.set(role, Object.freeze(positions));
      }
      if (rolePositions.size > 0) personWorkPositions.set(personId, rolePositions);
    }
  }
  return personWorkPositions;
}

export function createQueryIndex({
  works,
  knownFilterIds,
  brands = [],
  backendIndexes = null,
  workAliasesById = null,
  workPinyinById = null,
  companyAliasesById = null,
  companyPinyinById = null,
  personWorkIndex = null,
  searchText = null
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
  let personWorkPositions = compilePersonWorkPositions(workSnapshots, personWorkIndex);
  const groups = buildGroups(workSnapshots);
  const groupReleaseDates = workSnapshots.map(work => groups.get(groupIdOf(work)).earliestReleaseDate);
  const companyQueryIds = new Map();
  const companyLooseQueryIds = new Map();
  for (const brand of brands) {
    addCompanyQuery(companyQueryIds, brand.brandName, brand.brandId);
    addCompanyLooseQuery(companyLooseQueryIds, brand.brandName, brand.brandId);
    for (const alias of brand.searchAliases ?? brand.aliases ?? []) {
      addCompanyQuery(companyQueryIds, alias, brand.brandId);
      addCompanyLooseQuery(companyLooseQueryIds, alias, brand.brandId);
    }
    for (const alias of companyAliasesById?.get?.(brand.brandId) ?? []) {
      addCompanyQuery(companyQueryIds, alias, brand.brandId);
      addCompanyLooseQuery(companyLooseQueryIds, alias, brand.brandId);
    }
    for (const alias of companyPinyinById?.get?.(brand.brandId) ?? []) {
      addCompanyQuery(companyQueryIds, alias, brand.brandId);
      addCompanyLooseQuery(companyLooseQueryIds, alias, brand.brandId);
    }
  }
  // Empty-query browsing and numeric/facet filtering do not need the costly
  // CJK/pinyin text carriers. Keep their exact contents, materialized on first
  // access inside the worker rather than delaying every workspace's first row.
  let normalizedTitles, normalizedLooseTitles, pinyinTitles;
  const installSearchText = carrier => {
    const snapshot = snapshotSearchText(carrier, workSnapshots.map(w=>w.workId));
    [normalizedTitles, normalizedLooseTitles, pinyinTitles] = snapshot;
  };
  if (searchText !== null) installSearchText(searchText);
  const partial = [[], [], []];
  const buildText = (work, column) => {
    const aliases = workAliasesById?.get?.(work.workId);
    const names = [work.title, ...(Array.isArray(aliases) ? aliases : [])];
    if (column === 2) return buildPinyinSearchHaystack(names);
    const pinyin = workPinyinById?.get?.(work.workId);
    const companyAliases = companyAliasesById?.get?.(work.brandId);
    const companyPinyin = companyPinyinById?.get?.(work.brandId);
    return [
      buildSearchHaystack([...names, ...(Array.isArray(pinyin) ? pinyin : [])], {loose:column === 1}),
      [...(Array.isArray(companyAliases) ? companyAliases : []), ...(Array.isArray(companyPinyin) ? companyPinyin : [])]
        .map(column === 1 ? normalizeLooseTitle : normalizeTitle).filter(Boolean).join('\n')
    ].filter(Boolean).join('\n');
  };
  const materialize = column => Object.freeze(workSnapshots.map((work, i) => partial[column][i] ??= buildText(work, column)));
  let warming = null;
  const index = Object.freeze({
    works: Object.freeze(workSnapshots),
    knownFilterIds: Object.freeze(filterIds),
    brands: Object.freeze(Array.isArray(brands) ? brands.map(brand => ({ ...brand })) : []),
    groups,
    backendIndexes: sourceIndexes,
    facetMasks: compilePositionMasks(workSnapshots.length, sourceIndexes.facets),
    companyMasks: compilePositionMasks(workSnapshots.length, sourceIndexes.companies),
    get personWorkPositions() { return personWorkPositions; },
    numeric: sourceIndexes.numeric,
    companyQueryIds,
    companyLooseQueryIds,
    get normalizedTitles() { return normalizedTitles ??= materialize(0); },
    get normalizedLooseTitles() { return normalizedLooseTitles ??= materialize(1); },
    get pinyinTitles() { return pinyinTitles ??= materialize(2); },
    groupReleaseDates: Object.freeze(groupReleaseDates)
  });
  personWorkInstallers.set(index, value => {
    // Compile and validate before swapping, so rejected updates are atomic.
    const next = compilePersonWorkPositions(workSnapshots, value);
    personWorkPositions = next;
  });
  searchTextInstallers.set(index, installSearchText);
  searchTextWarmers.set(index, ({batchSize = 128, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)), cancelled = () => false} = {}) => {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new TypeError('invalid search batch size');
    return warming ??= (async () => {
      // Yield before the first batch so initial numeric queries can run first.
      for (let start = 0; start < workSnapshots.length; start += batchSize) {
        if (normalizedTitles && normalizedLooseTitles && pinyinTitles) return;
        await yieldTask();
        if (cancelled()) return;
        for (let i = start; i < Math.min(start + batchSize, workSnapshots.length); i++) {
          for (let column = 0; column < 3; column++) {
            if ([normalizedTitles, normalizedLooseTitles, pinyinTitles][column]) continue;
            partial[column][i] ??= buildText(workSnapshots[i], column);
          }
        }
      }
      normalizedTitles ??= materialize(0);
      normalizedLooseTitles ??= materialize(1);
      pinyinTitles ??= materialize(2);
    })().finally(() => { warming = null; });
  });
  return index;
}

export function queryIndexedCatalog(index, filterState, selectedWorkIds = EMPTY_SELECTED_WORK_IDS) {
  const positions = matchingPositions(index, filterState, selectedWorkIds);
  positions.sort((left, right) => comparePositions(index, left, right, filterState));
  return positions.map(position => index.works[position]);
}

export function countIndexedPatches(index, filterState, patches, selectedWorkIds = EMPTY_SELECTED_WORK_IDS) {
  return patches.map(patch => (
    countDistinctGroups(index, matchingPositions(index, mergeFilterPatch(filterState, patch), selectedWorkIds))
  ));
}

export function projectedCountsForIndex(
  index,
  filterState,
  selectedWorkIds = EMPTY_SELECTED_WORK_IDS,
  { visibleBrands = index.brands, companyLimit = 24 } = {}
) {
  const currentPositions = matchingPositions(index, filterState, selectedWorkIds);
  const current = countDistinctGroups(index, currentPositions);
  const filters = {};
  const brands = {};
  // Year bars represent the current non-year filters, not the whole catalog.
  // Widen the year range for this pass, then aggregate the matching positions
  // by group and release year in one scan.  The widened range is the
  // intentional full release-date window, which also admits TBD/unknown rows
  // for yearUniverseCount.
  const yearPositions = matchingPositions(index, {
    ...filterState,
    releaseYearStart: RELEASE_DATE_MIN_YEAR,
    releaseYearEnd: RELEASE_DATE_DEFAULT_MAX_YEAR
  }, selectedWorkIds);
  const yearProjection = createYearProjection(index, yearPositions);
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
  return { filters, brands, ...yearProjection };
}
