import {
  buildPinyinSearchHaystack,
  buildSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText,
  normalizeSearchText
} from './search-normalization.js';
import { filterPersonsBySearch, withCjkPersonSearchKey } from './person-search.js';
import { searchCompanyDirectory } from './company-directory.js';
import { createQueryIndex, queryIndexedCatalog } from './query-index.js';

const RESULT_LIMIT = 5;

function arrayValues(source) {
  return Array.isArray(source) ? source.filter(value => typeof value === 'string' && value.length > 0) : [];
}

function mapValues(map, id) {
  const value = map?.get?.(id);
  return Array.isArray(value) ? value : [];
}

function valuesFromWork(work, enrichment = null) {
  // These are the fields used by query-index's enrichment adapters.  Keep
  // this list deliberately narrow: a display-only field must not become a
  // new, undocumented search surface by accident.
  const aliases = [
    ...arrayValues(work?.searchAliases),
    ...arrayValues(mapValues(enrichment?.workAliasesById, workIdOf(work))),
    ...arrayValues(work?.displayTitle === work?.title ? [] : [work?.displayTitle]),
    ...arrayValues(mapValues(enrichment?.workDisplayTitlesById, workIdOf(work)))
  ];
  const pinyin = [
    ...arrayValues(work?.searchPinyin),
    ...arrayValues(mapValues(enrichment?.workPinyinById, workIdOf(work)))
  ];
  return { aliases, pinyin };
}

function valuesFromCompany(company) {
  return [
    company?.brandName,
    // buildCompanyDirectory keeps enrichment pinyin in this non-enumerable
    // normalized key, so retain it as a search-only value without exposing it
    // in the result object.
    company?._searchText,
    ...arrayValues(company?.searchAliases),
    ...arrayValues(company?.aliases),
    ...arrayValues(company?.searchPinyin),
    ...arrayValues(company?.pinyin)
  ];
}

function valuesFromPerson(person) {
  return [
    person?.canonicalName,
    person?.displayName,
    ...(Array.isArray(person?.aliases) ? person.aliases : []),
    ...(Array.isArray(person?.nameVariants)
      ? person.nameVariants.flatMap(item => [item?.name, item?.latin])
      : [])
  ];
}

function sourceRecords(source, collectionKey) {
  if (Array.isArray(source)) return source;
  if (source instanceof Map) return [...source.values()];
  if (Array.isArray(source?.[collectionKey])) return source[collectionKey];
  if (source?.[collectionKey] instanceof Map) return [...source[collectionKey].values()];
  return [];
}

function workIdOf(work) {
  return typeof work?.workId === 'string' ? work.workId : '';
}

function companyIdOf(company) {
  if (typeof company?.companyId === 'string') return company.companyId;
  if (typeof company?.brandId === 'string') return company.brandId;
  return '';
}

function personIdOf(person) {
  if (typeof person?.entityId === 'string') return person.entityId;
  if (typeof person?.personId === 'string') return person.personId;
  return '';
}

function queryInfo(query) {
  const source = String(query ?? '');
  return {
    source,
    normalized: normalizeSearchText(source),
    loose: normalizeLooseSearchText(source),
    pinyin: normalizeGeneratedPinyinQuery(source)
  };
}

function normalizedValues(values) {
  return values
    .filter(value => typeof value === 'string')
    .map(value => normalizeSearchText(value))
    .filter(Boolean);
}

function prepareRankValues(primaryValues, aliasValues, pinyinValues) {
  const primary = normalizedValues(primaryValues);
  const aliases = normalizedValues(aliasValues);
  const all = [...primary, ...aliases];
  const loosePrimary = buildSearchHaystack(primaryValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const looseAliases = buildSearchHaystack(aliasValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const regularPrimary = buildSearchHaystack(primaryValues, { separator: '\n' }).split('\n').filter(Boolean);
  const regularAliases = buildSearchHaystack(aliasValues, { separator: '\n' }).split('\n').filter(Boolean);
  const pinyin = buildPinyinSearchHaystack(
    [...primaryValues, ...aliasValues, ...pinyinValues],
    { separator: '\n' }
  );
  const explicitPinyin = normalizedValues(pinyinValues).join('\n');
  return { primary, aliases, all, loosePrimary, looseAliases, regularPrimary, regularAliases, pinyin, explicitPinyin };
}

function rankValues(prepared, info) {
  if (!info.loose) return Number.POSITIVE_INFINITY;
  const {
    primary,
    aliases,
    all,
    loosePrimary,
    looseAliases,
    regularPrimary,
    regularAliases,
    pinyin,
    explicitPinyin
  } = prepared;

  // Keep an exact canonical/display name ahead of a matching alias.  Folded
  // CJK, loose punctuation/spacing, and pinyin retain the same compatibility
  // as the existing person and query-index adapters.
  if (primary.includes(info.normalized)) return 0;
  if (aliases.includes(info.normalized)) return 1;
  if (regularPrimary.some(value => value !== info.normalized && value.includes(info.normalized))) return 2;
  if (regularAliases.some(value => value.includes(info.normalized))) return 3;
  if (loosePrimary.some(value => value === info.loose)) return 4;
  if (looseAliases.some(value => value === info.loose)) return 5;
  if (loosePrimary.some(value => value.includes(info.loose))) return 6;
  if (looseAliases.some(value => value.includes(info.loose))) return 7;
  if (info.pinyin && (pinyin.includes(info.pinyin) || explicitPinyin.includes(info.pinyin))) return 8;
  // This final check is useful for ASCII aliases whose pinyin key is already
  // materialized by the enrichment sidecar rather than generated from CJK.
  if (info.normalized && all.some(value => value.includes(info.normalized))) return 9;
  return Number.POSITIVE_INFINITY;
}

function makeSearchEntries(records, fields) {
  return records.map(record => ({
    record,
    search: prepareRankValues(
      fields.primary(record),
      fields.aliases(record),
      fields.pinyin(record)
    )
  }));
}

function rankEntries(entries, info, baseOrder = null) {
  const order = baseOrder ?? new Map(entries.map((entry, index) => [entry.record, index]));
  return entries
    .map((entry, index) => ({
      record: entry.record,
      index: order.get(entry.record) ?? index,
      rank: rankValues(entry.search, info)
    }))
    .filter(item => Number.isFinite(item.rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(item => item.record);
}

function workSubtitle(work) {
  const values = [];
  if (typeof work?.brandName === 'string' && work.brandName.trim()) values.push(work.brandName);
  if (typeof work?.releaseDate === 'string' && /^\d{4}/u.test(work.releaseDate)) {
    values.push(work.releaseDate.slice(0, 4));
  }
  return values.join(' · ');
}

function companySubtitle(company) {
  if (Number.isSafeInteger(company?.workCount)) return `${company.workCount} 部作品`;
  return '';
}

function personDisplayName(person) {
  if (typeof person?.displayName === 'string' && person.displayName.trim()) return person.displayName;
  if (typeof person?.canonicalName === 'string' && person.canonicalName.trim()) return person.canonicalName;
  return '';
}

function personSubtitle(person) {
  const display = personDisplayName(person);
  const canonical = typeof person?.canonicalName === 'string' ? person.canonicalName : '';
  return display && canonical && display !== canonical ? canonical : '';
}

function workSearchIndex(records, companies, enrichment = null) {
  const workAliasesById = new Map();
  const workPinyinById = new Map();
  for (const work of records) {
    const id = workIdOf(work);
    if (!id) continue;
    const fields = valuesFromWork(work, enrichment);
    workAliasesById.set(id, fields.aliases);
    workPinyinById.set(id, fields.pinyin);
  }
  const brands = companies.map(company => ({
    brandId: companyIdOf(company),
    brandName: typeof company?.brandName === 'string' ? company.brandName : '',
    searchAliases: arrayValues(company?.searchAliases ?? company?.aliases),
    searchPinyin: arrayValues(company?.searchPinyin ?? company?.pinyin)
  })).filter(brand => brand.brandId && brand.brandName);
  const companyAliasesById = new Map(brands.map(brand => [brand.brandId, brand.searchAliases]));
  const companyPinyinById = new Map(brands.map(brand => [brand.brandId, brand.searchPinyin]));
  const knownFilterIds = new Set();
  const indexWorks = records.map(work => {
    for (const filterId of [
      ...(Array.isArray(work?.filterIds) ? work.filterIds : []),
      ...(Array.isArray(work?.genreFilterIds) ? work.genreFilterIds : []),
      ...(typeof work?.platformFilterId === 'string' ? [work.platformFilterId] : [])
    ]) knownFilterIds.add(filterId);
    return {
      ...work,
      filterIds: Array.isArray(work?.filterIds) ? work.filterIds : [],
      genreFilterIds: Array.isArray(work?.genreFilterIds) ? work.genreFilterIds : [],
      median: work?.median ?? null,
      voteCount: work?.voteCount ?? null,
      releaseDate: typeof work?.releaseDate === 'string' ? work.releaseDate : '9999-12-31'
    };
  });
  try {
    return createQueryIndex({
      works: indexWorks,
      knownFilterIds,
      brands,
      workAliasesById,
      workPinyinById,
      companyAliasesById,
      companyPinyinById
    });
  } catch {
    // A local/custom work may not satisfy the full catalog index shape. The
    // adapter still has the same normalization matcher as a safe fallback.
    return null;
  }
}

function indexedWorkResults(index, query) {
  if (!index) return [];
  try {
    const state = {
      mode: 'normal',
      titleQuery: query,
      minimumScore: 0,
      minimumVoteCount: 0,
      releaseYearStart: 0,
      releaseYearEnd: 9999,
      brandIds: [],
      attributeSelections: { 'game-type': [], platform: [], length: [] },
      basicOperator: 'AND',
      positiveFilterIds: [],
      excludedFilterIds: [],
      excludeNukige: false,
      advancedExpression: '',
      sortKey: 'title',
      sortDirection: 'asc',
      selectedOnly: false
    };
    return queryIndexedCatalog(index, state);
  } catch {
    return [];
  }
}

function matchCompanies(model, entries, info) {
  const companies = entries.map(entry => entry.record);
  let baseline = [];
  if (model?.companies && companies.every(company => typeof company?._searchText === 'string')) {
    try {
      baseline = searchCompanyDirectory(model, info.source);
    } catch {
      baseline = [];
    }
  }
  const baselineOrder = new Map(baseline.map((company, index) => [company, index]));
  return rankEntries(entries, info, baselineOrder);
}

function personRecordsFrom(source) {
  if (Array.isArray(source)) return source;
  if (source instanceof Map) return [...source.values()];
  if (Array.isArray(source?.records)) return source.records;
  if (source?.records instanceof Map) return [...source.records.values()];
  return [];
}

async function resolvePersons(loadPersons) {
  const loaded = await loadPersons();
  return personRecordsFrom(loaded)
    .filter(person => person !== null && typeof person === 'object')
    .map(person => (
      typeof person.searchKey === 'string' && typeof person.pinyinSearchKey === 'string'
        ? person
        : withCjkPersonSearchKey(person)
    ));
}

export function createGalpediaSearch({ works, companyDirectory, loadPersons, enrichment = null } = {}) {
  const workRecords = sourceRecords(works, 'works');
  const companies = sourceRecords(companyDirectory, 'companies');
  if (typeof loadPersons !== 'function') throw new TypeError('loadPersons must be a function');

  const workById = new Map(workRecords.map(work => [workIdOf(work), work]));
  const companyById = new Map(companies
    .map(company => [companyIdOf(company), company])
    .filter(([id]) => id));
  const index = workSearchIndex(workRecords, companies, enrichment);
  const workEntries = makeSearchEntries(workRecords, {
    primary: work => [work?.title],
    aliases: work => [
      ...valuesFromWork(work, enrichment).aliases,
      ...(typeof work?.brandName === 'string' ? [work.brandName] : []),
      ...valuesFromCompany(companyById.get(work?.brandId))
    ],
    pinyin: work => valuesFromWork(work, enrichment).pinyin
  });
  const companyEntries = makeSearchEntries(companies, {
    primary: company => [company?.brandName],
    aliases: company => valuesFromCompany(company),
    pinyin: company => arrayValues(company?.searchPinyin ?? company?.pinyin)
  });
  let personsPromise = null;
  let personEntries = null;

  async function search(query) {
    const info = queryInfo(query);
    if (!info.loose) return { works: [], companies: [], persons: [] };

    const indexed = indexedWorkResults(index, info.source);
    const indexedOrder = new Map();
    for (const [position, item] of indexed.entries()) {
      const original = workById.get(workIdOf(item));
      if (original) indexedOrder.set(original, position);
    }
    const matchedWorks = rankEntries(
      workEntries,
      info,
      indexedOrder.size > 0 ? indexedOrder : null
    ).slice(0, RESULT_LIMIT);

    const matchedCompanies = matchCompanies(companyDirectory, companyEntries, info).slice(0, RESULT_LIMIT);
    if (personsPromise === null) {
      personsPromise = resolvePersons(loadPersons).catch(error => {
        personsPromise = null;
        throw error;
      });
    }
    const loadedPersons = await personsPromise;
    if (personEntries === null) {
      personEntries = makeSearchEntries(loadedPersons, {
        primary: person => [person?.displayName, person?.canonicalName],
        aliases: person => valuesFromPerson(person),
        pinyin: person => [person?.pinyinSearchKey]
      });
    }
    // Call the established person adapter first. It preserves same-name rows
    // and applies its generated pinyin/variant semantics; ranking below only
    // changes order and never merges records.
    const filteredPersons = filterPersonsBySearch(loadedPersons, info.source);
    const filteredPersonSet = new Set(filteredPersons);
    const matchedPersons = rankEntries(
      personEntries.filter(entry => filteredPersonSet.has(entry.record)),
      info
    ).slice(0, RESULT_LIMIT);

    return {
      works: matchedWorks
        .filter(work => workIdOf(work))
        .map(work => ({ id: work.workId, name: work.title, subtitle: workSubtitle(work) })),
      companies: matchedCompanies
        .filter(company => companyIdOf(company))
        .map(company => ({ id: companyIdOf(company), name: company.brandName, subtitle: companySubtitle(company) })),
      persons: matchedPersons
        .filter(person => personIdOf(person) && personDisplayName(person))
        .map(person => ({ id: personIdOf(person), name: personDisplayName(person), subtitle: personSubtitle(person) }))
    };
  }

  // The public contract is a callable async search function. A non-enumerable
  // alias keeps integration code that prefers `adapter.search(query)` safe
  // without changing the direct function contract.
  Object.defineProperty(search, 'search', { value: search, enumerable: false });
  return search;
}
