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
import { yieldMainThread } from './yield-main-thread.js';

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

function valueList(source) {
  if (Array.isArray(source)) return arrayValues(source);
  if (source instanceof Set) return arrayValues([...source]);
  return typeof source === 'string' && source.length > 0 ? [source] : [];
}

function distinctValues(values) {
  const seen = new Set();
  return values.filter(value => {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function prepareRankValues(primaryValues, aliasValues, pinyinValues) {
  const primary = normalizedValues(primaryValues);
  const aliases = normalizedValues(aliasValues);
  const all = [...primary, ...aliases];
  const loosePrimary = buildSearchHaystack(primaryValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const looseAliases = buildSearchHaystack(aliasValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const regularPrimary = buildSearchHaystack(primaryValues, { separator: '\n' }).split('\n').filter(Boolean);
  const regularAliases = buildSearchHaystack(aliasValues, { separator: '\n' }).split('\n').filter(Boolean);
  let pinyin;
  let explicitPinyin;
  const prepared = {
    primary,
    aliases,
    all,
    loosePrimary,
    looseAliases,
    regularPrimary,
    regularAliases
  };
  // Pinyin is only needed for an ASCII pinyin-shaped query.  Keep both the
  // generated and explicit projections lazy so a Japanese/CJK query does not
  // materialize them for every company/work candidate.
  Object.defineProperties(prepared, {
    pinyin: {
      enumerable: true,
      get() {
        return pinyin ??= buildPinyinSearchHaystack(
          [...primaryValues, ...aliasValues, ...pinyinValues],
          { separator: '\n' }
        );
      }
    },
    explicitPinyin: {
      enumerable: true,
      get() {
        return explicitPinyin ??= normalizedValues(pinyinValues).join('\n');
      }
    }
  });
  return prepared;
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
    regularAliases
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
  if (info.pinyin) {
    if (prepared.pinyin.includes(info.pinyin) || prepared.explicitPinyin.includes(info.pinyin)) return 8;
  }
  // This final check is useful for ASCII aliases whose pinyin key is already
  // materialized by the enrichment sidecar rather than generated from CJK.
  if (info.normalized && all.some(value => value.includes(info.normalized))) return 9;
  return Number.POSITIVE_INFINITY;
}

// This is deliberately the text-only prefix of rankValues.  Match hints must
// not call an ASCII alias "pinyin" merely because it happens to be at least
// four characters long; the query must have a lower-priority, explicit pinyin
// hit after all canonical/alias text evidence has been considered.
function rankTextValues(primaryValues, aliasValues, info) {
  if (!info.loose) return Number.POSITIVE_INFINITY;
  const primary = normalizedValues(primaryValues);
  const aliases = normalizedValues(aliasValues);
  const loosePrimary = buildSearchHaystack(primaryValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const looseAliases = buildSearchHaystack(aliasValues, { loose: true, separator: '\n' }).split('\n').filter(Boolean);
  const regularPrimary = buildSearchHaystack(primaryValues, { separator: '\n' }).split('\n').filter(Boolean);
  const regularAliases = buildSearchHaystack(aliasValues, { separator: '\n' }).split('\n').filter(Boolean);

  if (primary.includes(info.normalized)) return 0;
  if (aliases.includes(info.normalized)) return 1;
  if (regularPrimary.some(value => value !== info.normalized && value.includes(info.normalized))) return 2;
  if (regularAliases.some(value => value.includes(info.normalized))) return 3;
  if (loosePrimary.some(value => value === info.loose)) return 4;
  if (looseAliases.some(value => value === info.loose)) return 5;
  if (loosePrimary.some(value => value.includes(info.loose))) return 6;
  if (looseAliases.some(value => value.includes(info.loose))) return 7;
  return Number.POSITIVE_INFINITY;
}

function hasPinyinEvidence(generatedValues, explicitPinyinValues, privateSearchText, privateTextValues, info) {
  if (!info.pinyin) return false;
  const generated = buildPinyinSearchHaystack(generatedValues, { separator: '\n' });
  const explicit = normalizedValues(explicitPinyinValues).join('\n');
  if (generated.includes(info.pinyin) || explicit.includes(info.pinyin)) return true;
  // Company directories keep their enrichment projection in a non-enumerable
  // normalized index.  It is still evidence, unlike the query's ASCII shape.
  if (Number.isFinite(rankTextValues(privateTextValues ?? [], [], info))) return false;
  return typeof privateSearchText === 'string' && privateSearchText.includes(info.pinyin);
}

function matchHint(fields, info) {
  const canonicalRank = rankTextValues(fields.primary, [], info);
  let aliasRank = Number.POSITIVE_INFINITY;
  let aliasValue = '';
  for (const value of distinctValues(fields.aliases)) {
    const rank = rankTextValues([], [value], info);
    if (rank < aliasRank) {
      aliasRank = rank;
      aliasValue = value;
    }
  }
  // rankValues checks canonical fields before alias fields at equal rank.  A
  // strict comparison keeps a duplicated canonical value from becoming an
  // apparent alias, including folded CJK and punctuation/spacing variants.
  if (Number.isFinite(aliasRank) && aliasRank < canonicalRank) {
    return { kind: 'alias', label: `匹配别名：${aliasValue}` };
  }

  const privateCanonicalRank = rankTextValues(fields.privateTextValues ?? [], [], info);
  const pinyinRank = Number.isFinite(privateCanonicalRank)
    ? Number.POSITIVE_INFINITY
    : (hasPinyinEvidence(
      fields.generated,
      fields.pinyin,
      fields.privateSearchText,
      fields.privateTextValues,
      info
    ) ? 8 : Number.POSITIVE_INFINITY);
  if (pinyinRank < Math.min(canonicalRank, aliasRank)) {
    return { kind: 'pinyin', label: '通过拼音匹配' };
  }
  return null;
}

// Person rows already carry a build-time searchKey/pinyinSearchKey.  Keep the
// expensive rank projection out of the first query's full-directory path: the
// existing person adapter narrows the candidates first, then we prepare only
// those rows.  A batch is deliberately small because a broad ASCII query can
// still match most of the 53k-row directory.
const PERSON_RANK_BATCH_SIZE = 256;

function yieldSearchBatch() {
  return yieldMainThread();
}

function makePersonSearchEntry(person, cache) {
  const cached = cache.get(person);
  if (cached) return cached;

  // Keep these arrays byte-for-byte compatible with the old full-directory
  // rank projection
  // call.  The separate hint fields mirror personMatchFields, which omits the
  // canonical/display duplicates from the alias label.
  const primary = [person?.displayName, person?.canonicalName];
  const variants = Array.isArray(person?.nameVariants)
    ? person.nameVariants.flatMap(item => [item?.name, item?.latin])
    : [];
  const aliases = valuesFromPerson(person);
  const hintAliases = [
    ...arrayValues(person?.aliases),
    ...variants
  ];
  const hintFields = {
    primary,
    aliases: hintAliases,
    generated: [...primary, ...hintAliases],
    pinyin: [person?.pinyinSearchKey]
  };
  const entry = {
    record: person,
    search: prepareRankValues(primary, aliases, [person?.pinyinSearchKey]),
    hint: hintFields
  };
  cache.set(person, entry);
  return entry;
}

function compareRankedItems(left, right) {
  return left.rank - right.rank || left.index - right.index;
}

async function rankCandidateRecords(records, info, makeEntry, baseOrder = null) {
  const order = baseOrder ?? new Map(records.map((record, index) => [record, index]));
  const best = [];
  for (let index = 0; index < records.length; index += 1) {
    const entry = makeEntry(records[index]);
    const rank = rankValues(entry.search, info);
    if (Number.isFinite(rank)) {
      best.push({ record: entry.record, entry, rank, index: order.get(entry.record) ?? index });
      best.sort(compareRankedItems);
      if (best.length > RESULT_LIMIT) best.pop();
    }
    if ((index + 1) % PERSON_RANK_BATCH_SIZE === 0 && index + 1 < records.length) {
      await yieldSearchBatch();
    }
  }
  return best;
}

// Some secondary search surfaces (notably a company's substring/private text)
// are wider than query-index's exact company lookup.  Collect all finite
// company matches in batches so they can supply work candidates without ever
// rebuilding a synchronous full entry array.
async function collectMatchingRecords(records, info, makeEntry) {
  const matches = [];
  for (let index = 0; index < records.length; index += 1) {
    const entry = makeEntry(records[index]);
    const rank = rankValues(entry.search, info);
    if (Number.isFinite(rank)) matches.push({ record: entry.record, entry, rank, index });
    if ((index + 1) % PERSON_RANK_BATCH_SIZE === 0 && index + 1 < records.length) {
      await yieldSearchBatch();
    }
  }
  return matches;
}

function topRankedRecords(matches, baseOrder = null) {
  return matches
    .map((item, index) => ({
      ...item,
      index: baseOrder?.get(item.record) ?? item.index ?? index
    }))
    .sort(compareRankedItems)
    .slice(0, RESULT_LIMIT)
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

function companyMatchFields(company) {
  const privateTokens = valueList(company?.searchTokens);
  const aliases = [
    ...arrayValues(company?.searchAliases),
    ...arrayValues(company?.aliases),
    ...privateTokens
  ];
  const brandName = typeof company?.brandName === 'string' ? company.brandName : '';
  return {
    primary: [brandName],
    aliases,
    generated: [brandName, ...aliases],
    pinyin: [
      ...arrayValues(company?.searchPinyin),
      ...arrayValues(company?.pinyin)
    ],
    privateSearchText: typeof company?._searchText === 'string' ? company._searchText : '',
    privateTextValues: [brandName]
  };
}

function workMatchFields(work, enrichment, company) {
  const workFields = valuesFromWork(work, enrichment);
  const companyFields = companyMatchFields(company);
  return {
    primary: [work?.title],
    aliases: [
      ...workFields.aliases,
      ...companyFields.aliases
    ],
    generated: [
      work?.title,
      ...workFields.aliases,
      ...companyFields.generated
    ],
    pinyin: [
      ...workFields.pinyin,
      ...companyFields.pinyin
    ],
    privateSearchText: companyFields.privateSearchText,
    privateTextValues: companyFields.privateTextValues
  };
}

function personMatchFields(person) {
  const primary = [person?.displayName, person?.canonicalName];
  const aliases = [
    ...arrayValues(person?.aliases),
    ...(Array.isArray(person?.nameVariants)
      ? person.nameVariants.flatMap(item => [item?.name, item?.latin])
      : [])
  ];
  return {
    primary,
    aliases,
    generated: [...primary, ...aliases],
    pinyin: [person?.pinyinSearchKey]
  };
}

function addMatchHint(result, fields, info) {
  const match = matchHint(fields, info);
  return match ? { ...result, match } : result;
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
  if (!index) return { records: [], failed: true };
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
    return { records: queryIndexedCatalog(index, state), failed: false };
  } catch {
    // A present but unusable index must keep the historical all-record
    // fallback.  An empty successful result is different: it is a proven
    // no-title/no-alias candidate set and should not trigger a cold full scan.
    return { records: [], failed: true };
  }
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

export function createGalpediaSearch({ works, companyDirectory, loadPersons, enrichment = null, searchWorks = null } = {}) {
  if (searchWorks !== null && typeof searchWorks !== 'function') throw new TypeError('searchWorks must be a function');
  const workRecords = searchWorks ? [] : sourceRecords(works, 'works');
  const companies = sourceRecords(companyDirectory, 'companies');
  if (typeof loadPersons !== 'function') throw new TypeError('loadPersons must be a function');

  const workById = new Map(workRecords.map(work => [workIdOf(work), work]));
  const companyById = new Map(companies
    .map(company => [companyIdOf(company), company])
    .filter(([id]) => id));
  const index = searchWorks ? null : workSearchIndex(workRecords, companies, enrichment);
  const workEntryCache = new WeakMap();
  const companyEntryCache = new WeakMap();
  const makeWorkEntry = work => {
    const cached = workEntryCache.get(work);
    if (cached) return cached;
    const fields = {
      primary: [work?.title],
      aliases: [
        ...valuesFromWork(work, enrichment).aliases,
        ...(typeof work?.brandName === 'string' ? [work.brandName] : []),
        ...valuesFromCompany(companyById.get(work?.brandId))
      ],
      pinyin: valuesFromWork(work, enrichment).pinyin
    };
    const entry = { record: work, search: prepareRankValues(fields.primary, fields.aliases, fields.pinyin), fields };
    workEntryCache.set(work, entry);
    return entry;
  };
  const makeCompanyEntry = company => {
    const cached = companyEntryCache.get(company);
    if (cached) return cached;
    const fields = {
      primary: [company?.brandName],
      aliases: valuesFromCompany(company),
      pinyin: arrayValues(company?.searchPinyin ?? company?.pinyin)
    };
    const entry = { record: company, search: prepareRankValues(fields.primary, fields.aliases, fields.pinyin), fields };
    companyEntryCache.set(company, entry);
    return entry;
  };
  let personsPromise = null;
  let personEntryCache = new WeakMap();
  const personSearchCache = new Map();
  const PERSON_QUERY_CACHE_LIMIT = 32;

  function searchPersons(loadedPersons, info) {
    const cacheKey = info.source;
    const cached = personSearchCache.get(cacheKey);
    if (cached) {
      personSearchCache.delete(cacheKey);
      personSearchCache.set(cacheKey, cached);
      return cached;
    }

    const pending = Promise.resolve().then(async () => {
      // The directory adapter already uses the pinned search keys and preserves
      // directory order.  Do not prepare rank fields for the non-matching
      // rows; this is the critical difference from the old full-directory
      // preparation
      // call.
      const filteredPersons = filterPersonsBySearch(loadedPersons, info.source);
      const ranked = await rankCandidateRecords(
        filteredPersons,
        info,
        person => makePersonSearchEntry(person, personEntryCache)
      );
      return ranked.map(item => item.record);
    });
    while (personSearchCache.size >= PERSON_QUERY_CACHE_LIMIT) {
      const oldest = personSearchCache.keys().next().value;
      if (oldest === undefined) break;
      personSearchCache.delete(oldest);
    }
    personSearchCache.set(cacheKey, pending);
    pending.catch(() => {
      // A failed lazy field or directory load must not poison a later retry.
      if (personSearchCache.get(cacheKey) === pending) personSearchCache.delete(cacheKey);
    });
    return pending;
  }

  async function search(query) {
    const info = queryInfo(query);
    if (!info.loose) return { works: [], companies: [], persons: [] };
    // Start the Worker request alongside local company/person preparation.
    // Wrap rejection immediately so a slower person loader cannot leave an
    // unhandled Worker rejection between the two awaits.
    const delegated = searchWorks ? Promise.resolve().then(() => searchWorks(info.source))
      .then(works => ({works}), error => ({error})) : null;

    const indexedResult = indexedWorkResults(index, info.source);
    const indexed = indexedResult.records;
    const indexedOrder = new Map();
    const indexedCandidates = [];
    for (const [position, item] of indexed.entries()) {
      const original = workById.get(workIdOf(item));
      if (original) {
        indexedOrder.set(original, position);
        indexedCandidates.push(original);
      }
    }

    let companyOrder = null;
    const hasCompanySearchIndex = Boolean(companyDirectory?.companies)
      && companies.every(company => typeof company?._searchText === 'string');
    if (hasCompanySearchIndex) {
      try {
        const baselineCompanies = searchCompanyDirectory(companyDirectory, info.source);
        companyOrder = new Map(baselineCompanies.map((company, position) => [company, position]));
      } catch {
        // Keep the generic rank fallback for a custom directory whose private
        // search projection is present but not queryable.
        companyOrder = new Map();
      }
    }

    // Rank every company lazily in batches.  The old path ranked every entry
    // even when searchCompanyDirectory returned a smaller tie-order subset;
    // using that subset as the candidate set would lose substring/private or
    // generated-pinyin matches.  These complete matches also identify works
    // whose company surface is wider than query-index's exact lookup.
    const companyMatchesPromise = collectMatchingRecords(
      companies,
      info,
      makeCompanyEntry
    );
    const matchedCompaniesPromise = companyMatchesPromise.then(matches => (
      topRankedRecords(matches, companyOrder ?? new Map())
    ));

    // A custom work can carry a brandName without a matching directory row.
    // Preserve the old work rank surface with a small brand-only candidate
    // pass; it does not build the full work rank projection.
    const workBrandRecords = workRecords.filter(work => {
      const brandName = typeof work?.brandName === 'string' ? work.brandName : '';
      if (!brandName) return false;
      const company = companyById.get(typeof work?.brandId === 'string' ? work.brandId : '');
      return !company || company.brandName !== brandName;
    });
    const workBrandMatchesPromise = collectMatchingRecords(
      workBrandRecords,
      info,
      work => ({
        record: work,
        search: prepareRankValues(
          [work?.brandName],
          [],
          []
        )
      })
    );
    const matchedWorksPromise = Promise.all([companyMatchesPromise, workBrandMatchesPromise])
      .then(([companyMatches, workBrandMatches]) => {
        const candidateSet = new Set();
        if (indexedResult.failed) {
          for (const work of workRecords) candidateSet.add(work);
        } else {
          for (const work of indexedCandidates) candidateSet.add(work);
          const matchingCompanyIds = new Set(
            companyMatches.map(item => companyIdOf(item.record)).filter(Boolean)
          );
          for (const work of workRecords) {
            if (matchingCompanyIds.has(typeof work?.brandId === 'string' ? work.brandId : '')) {
              candidateSet.add(work);
            }
          }
          for (const item of workBrandMatches) candidateSet.add(item.record);
        }
        // Keep source order while narrowing the set.  The indexed tie order
        // is applied below for indexed rows, and source order must remain the
        // stable fallback for supplemental rows with the same rank/index.
        const workCandidates = workRecords.filter(work => candidateSet.has(work));
        const workOrder = new Map(workRecords.map((work, position) => [work, position]));
        for (const [work, position] of indexedOrder) workOrder.set(work, position);
        return rankCandidateRecords(
          workCandidates,
          info,
          makeWorkEntry,
          workOrder
        ).then(items => items.map(item => item.record));
      });

    if (personsPromise === null) {
      personsPromise = resolvePersons(loadPersons).catch(error => {
        personsPromise = null;
        personSearchCache.clear();
        personEntryCache = new WeakMap();
        throw error;
      });
    }
    // Attach all three local branches immediately.  Work/company ranking can
    // reject while the directory transport is still loading; awaiting the
    // loader first would leave that rejection briefly unhandled in browsers.
    // The person branch intentionally starts only after the shared loader has
    // resolved, while Promise.all observes its rejection from the start.
    const matchedPersonsPromise = personsPromise.then(loadedPersons => {
      // Call the established person adapter first. It preserves same-name rows
      // and applies its generated pinyin/variant semantics. Ranking below only
      // changes order and never merges records; the result promise is cached per
      // source query so focus/input retries share the same in-flight work.
      return searchPersons(loadedPersons, info);
    });
    const [matchedWorks, matchedCompanies, matchedPersons] = await Promise.all([
      matchedWorksPromise,
      matchedCompaniesPromise,
      matchedPersonsPromise
    ]);

    const delegatedResult = delegated ? await delegated : null;
    if (delegatedResult && Object.hasOwn(delegatedResult, 'error')) throw delegatedResult.error;
    return {
      works: delegatedResult ? delegatedResult.works : matchedWorks
        .filter(work => workIdOf(work))
        .map(work => addMatchHint(
          { id: work.workId, name: work.title, subtitle: workSubtitle(work) },
          workMatchFields(work, enrichment, companyById.get(work?.brandId)),
          info
        )),
      companies: matchedCompanies
        .filter(company => companyIdOf(company))
        .map(company => addMatchHint(
          { id: companyIdOf(company), name: company.brandName, subtitle: companySubtitle(company) },
          companyMatchFields(company),
          info
        )),
      persons: matchedPersons
        .filter(person => personIdOf(person) && personDisplayName(person))
        .map(person => {
          const entry = makePersonSearchEntry(person, personEntryCache);
          return addMatchHint(
            { id: personIdOf(person), name: personDisplayName(person), subtitle: personSubtitle(person) },
            entry.hint,
            info
          );
        })
    };
  }

  // The public contract is a callable async search function. A non-enumerable
  // alias keeps integration code that prefers `adapter.search(query)` safe
  // without changing the direct function contract.
  Object.defineProperty(search, 'search', { value: search, enumerable: false });
  return search;
}
