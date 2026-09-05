import { foldCjkSearchVariants } from './cjk-search-variants.js';
import { buildMandarinPinyinKeyFromFolded } from './cjk-search-pinyin.js';

export const GENERATED_PINYIN_QUERY_MIN_LENGTH = 4;

export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja');
}

export function normalizeLooseSearchText(value) {
  return normalizeSearchText(value).replace(/[\p{P}\p{S}\s]+/gu, '');
}

export function buildSearchHaystack(values, { loose = false, separator = '\n' } = {}) {
  const normalize = loose ? normalizeLooseSearchText : normalizeSearchText;
  const keys = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const original = normalize(value);
    if (!original) continue;
    const folded = foldCjkSearchVariants(original);
    for (const key of [original, folded]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.join(separator);
}

export function augmentSearchHaystack(value, { separator = '\n' } = {}) {
  const original = String(value ?? '');
  if (!original) return '';
  const folded = foldCjkSearchVariants(original);
  return folded === original ? original : `${original}${separator}${folded}`;
}

export function normalizeGeneratedPinyinQuery(value) {
  const query = normalizeLooseSearchText(value);
  return query.length >= GENERATED_PINYIN_QUERY_MIN_LENGTH && /^[a-z0-9]+$/u.test(query)
    ? query
    : '';
}

export function buildPinyinSearchHaystack(values, { separator = '\n' } = {}) {
  const keys = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const normalized = normalizeSearchText(value);
    if (!normalized) continue;
    const folded = foldCjkSearchVariants(normalized);
    const key = buildMandarinPinyinKeyFromFolded(folded);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys.join(separator);
}
