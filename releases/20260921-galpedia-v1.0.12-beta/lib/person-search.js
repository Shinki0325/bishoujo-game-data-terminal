import {
  augmentSearchHaystack,
  buildSearchHaystack,
  buildPinyinSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText
} from './search-normalization.js';

// Build-time directory indexes may carry verified search keys without making
// them enumerable record fields.  A global symbol survives the descriptor
// copy used by the lazy wrapper while remaining invisible to the historical
// row shape and diagnostic spreads.
export const PRECOMPUTED_PERSON_SEARCH_KEYS = Symbol.for('egs.person.precomputed-search-keys.v1');
// Full-wiki directory rows are created by the trusted directory projection
// below.  The marker lets the hot wrapper avoid descriptor allocation for
// every ordinary data field while leaving arbitrary external records on the
// fully generic descriptor-preserving path.
export const FULL_WIKI_DIRECTORY_RECORD = Symbol.for('egs.person.full-wiki-directory-record.v1');
const FULL_WIKI_LAZY_FIELDS = new Set(['nameVariants', 'activity', 'representativeWorks']);

function personSearchValues(person) {
  return [
    person?.canonicalName,
    person?.displayName,
    ...(Array.isArray(person?.aliases) ? person.aliases : []),
    ...(Array.isArray(person?.nameVariants) ? person.nameVariants.map(item => item?.name) : []),
    ...(Array.isArray(person?.nameVariants) ? person.nameVariants.map(item => item?.latin) : [])
  ];
}

// Copy descriptors instead of using object spread.  Full-wiki directory
// rows expose several enumerable cached getters; spreading them here would
// eagerly compute all 53,075 rows before the first visible page renders.
// Descriptor copying keeps the existing enumerable/public field contract and
// lets direct consumers continue to read the getter-backed values.
function copyPersonDescriptors(person, omit = []) {
  const source = person && typeof person === 'object' ? person : {};
  if (source[FULL_WIKI_DIRECTORY_RECORD] === true) {
    const result = Object.create(Object.getPrototypeOf(source));
    for (const key of Reflect.ownKeys(source)) {
      if (typeof key === 'symbol') {
        Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(source, key));
        continue;
      }
      if (omit.includes(key)) continue;
      if (FULL_WIKI_LAZY_FIELDS.has(key)) {
        Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(source, key));
      } else {
        // Full-wiki marker guarantees these are ordinary enumerable data
        // fields; assignment preserves their historical public descriptors.
        result[key] = source[key];
      }
    }
    return result;
  }
  const descriptors = Object.getOwnPropertyDescriptors(source);
  for (const key of omit) delete descriptors[key];
  return Object.defineProperties(Object.create(Object.getPrototypeOf(source)), descriptors);
}

export function buildPersonSearchKey(person) {
  const precomputed = person?.[PRECOMPUTED_PERSON_SEARCH_KEYS];
  if (typeof precomputed?.searchKey === 'string') return precomputed.searchKey;
  if (typeof person?.searchKey === 'string' && person.searchKey) {
    return augmentSearchHaystack(person.searchKey, { separator: ' ' });
  }
  return buildSearchHaystack(personSearchValues(person), { loose: true, separator: ' ' });
}

export function buildPersonPinyinSearchKey(person) {
  const precomputed = person?.[PRECOMPUTED_PERSON_SEARCH_KEYS];
  if (typeof precomputed?.pinyinSearchKey === 'string') return precomputed.pinyinSearchKey;
  const values = personSearchValues(person);
  if (typeof person?.searchKey === 'string' && person.searchKey) {
    values.push(...person.searchKey.split(/\s+/u));
  }
  return buildPinyinSearchHaystack(values, { separator: ' ' });
}

export function withCjkPersonSearchKey(person) {
  const result = copyPersonDescriptors(person, ['searchKey', 'pinyinSearchKey']);
  Object.defineProperties(result, {
    searchKey: { value: buildPersonSearchKey(person), enumerable: true, configurable: true, writable: true },
    pinyinSearchKey: { value: buildPersonPinyinSearchKey(person), enumerable: true, configurable: true, writable: true }
  });
  return result;
}

export function withLazyCjkPersonSearchKey(person) {
  let searchKey, pinyinSearchKey;
  const result = copyPersonDescriptors(person, ['searchKey', 'pinyinSearchKey']);
  Object.defineProperties(result, {
    searchKey: { enumerable: true, configurable: true, get: () => searchKey ??= buildPersonSearchKey(person) },
    pinyinSearchKey: { enumerable: true, configurable: true, get: () => pinyinSearchKey ??= buildPersonPinyinSearchKey(person) }
  });
  return result;
}

function personMatchesNeedle(person, needle, pinyinNeedle) {
  if (!needle) return true;
  const haystack = typeof person?.searchKey === 'string' && person.searchKey
    ? person.searchKey
    : buildPersonSearchKey(person);
  if (haystack.includes(needle)) return true;
  if (!pinyinNeedle) return false;
  const pinyinHaystack = typeof person?.pinyinSearchKey === 'string'
    ? person.pinyinSearchKey
    : buildPersonPinyinSearchKey(person);
  return pinyinHaystack.includes(pinyinNeedle);
}

export function personMatchesSearch(person, query) {
  return personMatchesNeedle(
    person,
    normalizeLooseSearchText(query),
    normalizeGeneratedPinyinQuery(query)
  );
}

export function filterPersonsBySearch(persons, query) {
  const records = Array.isArray(persons) ? persons : [];
  const needle = normalizeLooseSearchText(query);
  const pinyinNeedle = normalizeGeneratedPinyinQuery(query);
  return needle
    ? records.filter(person => personMatchesNeedle(person, needle, pinyinNeedle))
    : records;
}
