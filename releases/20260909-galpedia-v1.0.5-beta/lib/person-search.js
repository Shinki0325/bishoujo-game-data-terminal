import {
  augmentSearchHaystack,
  buildSearchHaystack,
  buildPinyinSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText
} from './search-normalization.js';

function personSearchValues(person) {
  return [
    person?.canonicalName,
    person?.displayName,
    ...(Array.isArray(person?.aliases) ? person.aliases : []),
    ...(Array.isArray(person?.nameVariants) ? person.nameVariants.map(item => item?.name) : []),
    ...(Array.isArray(person?.nameVariants) ? person.nameVariants.map(item => item?.latin) : [])
  ];
}

export function buildPersonSearchKey(person) {
  if (typeof person?.searchKey === 'string' && person.searchKey) {
    return augmentSearchHaystack(person.searchKey, { separator: ' ' });
  }
  return buildSearchHaystack(personSearchValues(person), { loose: true, separator: ' ' });
}

export function buildPersonPinyinSearchKey(person) {
  const values = personSearchValues(person);
  if (typeof person?.searchKey === 'string' && person.searchKey) {
    values.push(...person.searchKey.split(/\s+/u));
  }
  return buildPinyinSearchHaystack(values, { separator: ' ' });
}

export function withCjkPersonSearchKey(person) {
  return {
    ...person,
    searchKey: buildPersonSearchKey(person),
    pinyinSearchKey: buildPersonPinyinSearchKey(person)
  };
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
