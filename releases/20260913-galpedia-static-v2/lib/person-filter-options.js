import { yieldMainThread } from './yield-main-thread.js';
import {
  PRECOMPUTED_PERSON_SEARCH_KEYS,
  buildPersonPinyinSearchKey,
  buildPersonSearchKey
} from './person-search.js';

// The filter surface needs a small projection of a directory row. Full-wiki
// rows also expose enumerable lazy getters; reading or spreading those rows
// here would materialise activity, representative works, and name variants
// for every person before the first suggestion can be shown.
const text = value => typeof value === 'string' ? value : value == null ? '' : String(value);
const matchKey = values => values.filter(Boolean).map(text).join('\u0000').toLocaleLowerCase('zh-Hans');

const yieldToHost = yieldMainThread;

function staticValue(person, key) {
  const descriptor = person && typeof person === 'object'
    ? Object.getOwnPropertyDescriptor(person, key)
    : null;
  // A getter is deliberately excluded from the light projection. The only
  // search getters we may read are installed below and are evaluated on an
  // actual query, after the option list is ready.
  if (descriptor && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return undefined;
  return descriptor ? descriptor.value : person?.[key];
}

function searchGetter(person, key, fallback) {
  let value;
  let ready = false;
  return () => {
    if (!ready) {
      const precomputed = person?.[PRECOMPUTED_PERSON_SEARCH_KEYS]?.[key];
      if (typeof precomputed === 'string') value = precomputed;
      else {
        const descriptor = person && typeof person === 'object'
          ? Object.getOwnPropertyDescriptor(person, key)
          : null;
        value = descriptor && !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ? person[key] : fallback(person);
      }
      ready = true;
    }
    return value;
  };
}

export function projectPersonFilterOption(person) {
  const rawId = staticValue(person, 'entityId') ?? staticValue(person, 'personId');
  const personId = text(rawId);
  if (!personId) return null;
  const canonicalName = text(staticValue(person, 'canonicalName') ?? staticValue(person, 'name'));
  const displayName = text(staticValue(person, 'displayName')) || canonicalName || personId;
  const aliases = staticValue(person, 'aliases');
  const roles = staticValue(person, 'roles');
  const primaryRole = staticValue(person, 'primaryRole');
  const option = {
    entityId: personId,
    personId,
    canonicalName,
    displayName,
    aliases: Array.isArray(aliases) ? aliases : [],
    roles: roles && typeof roles === 'object' ? roles : {},
    primaryRole
  };
  const precomputed = person?.[PRECOMPUTED_PERSON_SEARCH_KEYS];
  if (typeof precomputed?.searchKey === 'string' && typeof precomputed?.pinyinSearchKey === 'string') {
    option.searchKey = precomputed.searchKey;
    option.pinyinSearchKey = precomputed.pinyinSearchKey;
    option.matchKey = matchKey([
      option.displayName, option.canonicalName, ...option.aliases,
      option.searchKey, option.pinyinSearchKey
    ]);
  } else {
    let cachedMatchKey;
    Object.defineProperties(option, {
      searchKey: { enumerable: true, configurable: true, get: searchGetter(person, 'searchKey', buildPersonSearchKey) },
      pinyinSearchKey: { enumerable: true, configurable: true, get: searchGetter(person, 'pinyinSearchKey', buildPersonPinyinSearchKey) },
      matchKey: { enumerable: true, configurable: true, get: () => cachedMatchKey ??= matchKey([
        option.displayName, option.canonicalName, ...option.aliases,
        option.searchKey, option.pinyinSearchKey
      ]) }
    });
  }
  return option;
}

export async function projectPersonFilterOptions(records, personWorkIndex) {
  const indexedPersonIds = personWorkIndex instanceof Set ? personWorkIndex : new Set(Object.keys(personWorkIndex?.persons ?? {}));
  const options = [];
  const source = Array.isArray(records) ? records : [];
  for (let index = 0; index < source.length; index += 1) {
    const person = source[index];
    const rawId = staticValue(person, 'entityId') ?? staticValue(person, 'personId');
    if (indexedPersonIds.has(text(rawId))) {
      const candidate = projectPersonFilterOption(person);
      if (candidate) options.push(candidate);
    }
    if ((index + 1) % 512 === 0 && index + 1 < source.length) await yieldToHost();
  }
  return options;
}
