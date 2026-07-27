import {
  FormulaSyntaxError,
  formatFormula,
  parseFormula
} from './formula.js';

const MAX_FORMULA_LENGTH = 4096;
const RESERVED_TOKENS = new Set(['AND', 'OR', 'NOT']);

function normalizeLabel(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP');
}

function displayAuthority(filters) {
  if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
  const labelToId = new Map();
  const idToLabel = new Map();

  for (const filter of filters) {
    if (filter === null || typeof filter !== 'object') {
      throw new TypeError('filters entries must be objects');
    }
    const { filterId, displayTitle } = filter;
    if (typeof filterId !== 'string' || filterId.length === 0) {
      throw new TypeError('filterId must be a non-empty string');
    }
    if (
      typeof displayTitle !== 'string'
      || displayTitle.length === 0
      || /[\s()]/u.test(displayTitle)
      || RESERVED_TOKENS.has(displayTitle.toUpperCase())
    ) {
      throw new TypeError('displayTitle must be one safe non-operator token');
    }
    const normalized = normalizeLabel(displayTitle);
    if (labelToId.has(normalized)) {
      throw new TypeError('displayTitle values must be unique after normalization');
    }
    if (idToLabel.has(filterId)) {
      throw new TypeError('filterId values must be unique');
    }
    labelToId.set(normalized, filterId);
    idToLabel.set(filterId, displayTitle);
  }

  return { labelToId, idToLabel, knownIds: [...idToLabel.keys()] };
}

function assertSource(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula exceeds ${MAX_FORMULA_LENGTH} characters`,
      'FORMULA_TOO_LONG',
      MAX_FORMULA_LENGTH
    );
  }
}

function translateTokens(source, resolveToken, unknownNoun) {
  const output = [];
  const offsetMap = [];
  let offset = 0;

  function append(value, displayStart, displayLength) {
    output.push(value);
    const finalIndex = Math.max(0, displayLength - 1);
    for (let index = 0; index < value.length; index += 1) {
      offsetMap.push(displayStart + Math.min(index, finalIndex));
    }
  }

  while (offset < source.length) {
    const character = source[offset];
    if (/\s/u.test(character) || character === '(' || character === ')') {
      append(character, offset, 1);
      offset += 1;
      continue;
    }

    const start = offset;
    while (
      offset < source.length
      && !/\s/u.test(source[offset])
      && source[offset] !== '('
      && source[offset] !== ')'
    ) {
      offset += 1;
    }
    const token = source.slice(start, offset);
    const keyword = token.toUpperCase();
    const replacement = RESERVED_TOKENS.has(keyword)
      ? token
      : resolveToken(token);
    if (replacement === undefined) {
      throw new FormulaSyntaxError(
        `Unknown ${unknownNoun} "${token}" at offset ${start}`,
        'UNKNOWN_FILTER',
        start
      );
    }
    append(replacement, start, token.length);
  }

  offsetMap.push(source.length);
  return { source: output.join(''), offsetMap };
}

function mapSyntaxError(error, offsetMap) {
  if (!(error instanceof FormulaSyntaxError)) throw error;
  const visibleOffset = offsetMap[Math.min(error.offset, offsetMap.length - 1)];
  const message = error.message.replace(/offset \d+/gu, `offset ${visibleOffset}`);
  return new FormulaSyntaxError(message, error.code, visibleOffset);
}

function displayTranslation(source, authority) {
  return translateTokens(
    source,
    token => authority.labelToId.get(normalizeLabel(token)),
    'filter label'
  );
}

function parseTranslatedDisplay(source, authority) {
  const translated = displayTranslation(source, authority);
  try {
    return {
      ast: parseFormula(translated.source, authority.knownIds),
      canonicalSource: translated.source
    };
  } catch (error) {
    throw mapSyntaxError(error, translated.offsetMap);
  }
}

export function displayToCanonicalFormula(source, filters) {
  assertSource(source);
  const authority = displayAuthority(filters);
  if (source.trim().length === 0) return source;
  return parseTranslatedDisplay(source, authority).canonicalSource;
}

export function canonicalToDisplayFormula(source, filters) {
  assertSource(source);
  const authority = displayAuthority(filters);
  if (source.trim().length === 0) return source;
  parseFormula(source, authority.knownIds);
  return translateTokens(
    source,
    token => authority.idToLabel.get(token),
    'filter ID'
  ).source;
}

export function parseDisplayFormula(source, filters) {
  assertSource(source);
  const authority = displayAuthority(filters);
  return parseTranslatedDisplay(source, authority).ast;
}

export function formatDisplayFormula(ast, filters) {
  const authority = displayAuthority(filters);
  const canonical = formatFormula(ast);
  parseFormula(canonical, authority.knownIds);
  return translateTokens(
    canonical,
    token => authority.idToLabel.get(token),
    'filter ID'
  ).source;
}
