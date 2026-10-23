import {
  buildPinyinSearchHaystack,
  buildSearchHaystack,
  normalizeGeneratedPinyinQuery,
  normalizeLooseSearchText
} from './search-normalization.js';

export const RANKING_LOCATOR_DEFAULT_LIMIT = 30;
export const RANKING_LOCATOR_MAX_LIMIT = 100;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextList(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => asText(item) ? [asText(item)] : []);
}

function aliasValues(value) {
  if (typeof value === 'string' || Array.isArray(value)) return asTextList(value);
  if (!isObject(value)) return [];
  return [
    ...asTextList(value.fullWikiDisplayAliases),
    ...asTextList(value.alias),
    ...asTextList(value.aliases),
    ...asTextList(value.searchAlias),
    ...asTextList(value.searchAliases),
    ...asTextList(value.nameVariants),
    ...asTextList(value.titleVariants),
    ...asTextList(value.searchPinyin),
    ...asTextList(value.pinyin)
  ];
}

function uniqueText(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = value.normalize('NFKC').toLocaleLowerCase('ja');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function idFor(item) {
  if (!isObject(item)) return '';
  return asText(item.workId) || asText(item.companyId) || asText(item.id);
}

function titleFor(item) {
  if (!isObject(item)) return '';
  const company = isObject(item.company) ? item.company : null;
  return asText(item.displayTitle)
    || asText(item.title)
    || asText(item.brandName)
    || asText(item.name)
    || asText(company?.brandName)
    || asText(company?.name);
}

function aliasesFor(item) {
  if (!isObject(item)) return [];
  const company = isObject(item.company) ? item.company : null;
  return uniqueText([
    ...asTextList(item.title),
    ...asTextList(item.originalTitle),
    ...asTextList(item.displayTitle),
    ...asTextList(item.brandName),
    ...asTextList(item.alias),
    ...asTextList(item.aliases),
    ...asTextList(item.fullWikiDisplayAliases),
    ...asTextList(item.searchAlias),
    ...asTextList(item.searchAliases),
    ...asTextList(item.nameVariants),
    ...asTextList(item.titleVariants),
    ...asTextList(item.searchPinyin),
    ...asTextList(item.pinyin),
    ...asTextList(item.brandAliases),
    ...asTextList(company?.alias),
    ...asTextList(company?.aliases),
    ...asTextList(company?.searchAlias),
    ...asTextList(company?.searchAliases),
    ...asTextList(company?.nameVariants),
    ...asTextList(company?.searchPinyin),
    ...asTextList(company?.pinyin)
  ]);
}

function aliasSourceFor(aliasesById, workId) {
  if (!aliasesById || !workId) return null;
  if (typeof aliasesById.get === 'function') return aliasesById.get(workId) ?? null;
  if (isObject(aliasesById)) return aliasesById[workId] ?? null;
  return null;
}

/**
 * Add an externally loaded alias lookup to a ranking model without mutating
 * the board entities. Worker-owned fullWiki data intentionally keeps aliases
 * out of the UI model until the locator is opened.
 */
export function projectRankingLocatorModel(model, { aliasesById = null } = {}) {
  assertModel(model);
  if (!aliasesById) return model;
  const projectItem = item => {
    if (!isObject(item)) return item;
    const source = aliasSourceFor(aliasesById, idFor(item));
    const additions = aliasValues(source);
    if (additions.length === 0) return item;
    const existing = aliasValues(item.fullWikiDisplayAliases);
    const merged = uniqueText([...existing, ...additions]);
    if (merged.length === existing.length && merged.every((value, index) => value === existing[index])) return item;
    return { ...item, fullWikiDisplayAliases: merged };
  };
  const tiers = model.tiers.map(tier => isObject(tier) && Array.isArray(tier.works)
    ? { ...tier, works: tier.works.map(projectItem) } : tier);
  const candidateWorks = model.candidateWorks ?? model.candidates;
  return {
    ...model,
    tiers,
    ...(Array.isArray(candidateWorks)
      ? { candidateWorks: candidateWorks.map(projectItem) } : {})
  };
}

function normalizeLimit(value) {
  if (!Number.isFinite(value)) return RANKING_LOCATOR_DEFAULT_LIMIT;
  return Math.max(1, Math.min(RANKING_LOCATOR_MAX_LIMIT, Math.floor(value)));
}

function assertModel(model) {
  if (!isObject(model)) throw new TypeError('ranking model must be an object');
  if (!Array.isArray(model.tiers)) throw new TypeError('ranking model.tiers must be an array');
  if (model.candidateWorks !== undefined && !Array.isArray(model.candidateWorks)) {
    throw new TypeError('ranking model.candidateWorks must be an array');
  }
}

function locationForTier(tier, itemIndex) {
  const tierId = asText(tier?.id);
  const tierName = asText(tier?.name) || tierId || '未命名等级';
  return {
    locationType: 'tier',
    tierId,
    tierName,
    locationLabel: tierName,
    itemIndex
  };
}

function createEntry(item, location, sourceIndex) {
  const workId = idFor(item);
  const title = titleFor(item);
  if (!workId || !title) return null;
  const aliases = aliasesFor(item).filter(alias => alias.normalize('NFKC') !== title.normalize('NFKC'));
  const fields = [title, ...aliases];
  return {
    workId,
    title,
    aliases,
    locationType: location.locationType,
    tierId: location.tierId ?? '',
    tierName: location.tierName,
    locationLabel: location.locationLabel,
    isRanked: location.locationType === 'tier',
    sourceIndex,
    searchText: buildSearchHaystack(fields, { loose: true }),
    pinyinText: buildPinyinSearchHaystack(fields)
  };
}

/**
 * Project the currently supplied ranking model into a small searchable index.
 * The input is deliberately the already-loaded ranking model; this module does
 * not load catalog, worker, or media payloads.
 */
export function buildRankingLocatorEntries(model) {
  assertModel(model);
  const entries = [];
  const seen = new Set();
  let sourceIndex = 0;

  for (const tier of model.tiers) {
    if (!isObject(tier) || !Array.isArray(tier.works)) continue;
    const location = locationForTier(tier, 0);
    for (const item of tier.works) {
      const entry = createEntry(item, { ...location, itemIndex: sourceIndex }, sourceIndex);
      sourceIndex += 1;
      if (!entry || seen.has(entry.workId)) continue;
      seen.add(entry.workId);
      entries.push(entry);
    }
  }

  const candidateWorks = model.candidateWorks ?? model.candidates ?? [];
  for (const item of candidateWorks) {
    const entry = createEntry(item, {
      locationType: 'candidate',
      tierId: '',
      tierName: '候选区',
      locationLabel: '候选区',
      itemIndex: sourceIndex
    }, sourceIndex);
    sourceIndex += 1;
    if (!entry || seen.has(entry.workId)) continue;
    seen.add(entry.workId);
    entries.push(entry);
  }

  return entries;
}

function entryMatches(entry, query) {
  const normalizedQuery = normalizeLooseSearchText(query);
  if (!normalizedQuery) return true;
  if (entry.searchText.includes(normalizedQuery)) return true;
  const pinyinQuery = normalizeGeneratedPinyinQuery(query);
  return Boolean(pinyinQuery && entry.pinyinText.includes(pinyinQuery));
}

/**
 * Search without changing board order. `total` describes all matches while
 * `results` is intentionally bounded for a compact dialog on small screens.
 */
export function searchRankingLocator(model, query = '', { limit = RANKING_LOCATOR_DEFAULT_LIMIT } = {}) {
  const entries = buildRankingLocatorEntries(model);
  const matches = entries.filter(entry => entryMatches(entry, query));
  const boundedLimit = normalizeLimit(limit);
  return {
    query: typeof query === 'string' ? query : String(query ?? ''),
    total: matches.length,
    limited: matches.length > boundedLimit,
    results: matches.slice(0, boundedLimit)
  };
}

export function rankingLocatorEntryMatches(entry, query) {
  if (!isObject(entry) || typeof entry.searchText !== 'string' || typeof entry.pinyinText !== 'string') {
    throw new TypeError('entry must be a ranking locator entry');
  }
  return entryMatches(entry, query);
}
