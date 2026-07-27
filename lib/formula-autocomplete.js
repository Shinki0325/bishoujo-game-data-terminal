const DEFAULT_LIMIT = 6;
const RESERVED_TOKENS = new Set(['AND', 'OR', 'NOT']);

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP');
}

function isBoundary(character) {
  return character === undefined || /\s/u.test(character) || character === '(' || character === ')';
}

function validateInputs({ source, cursor, filters, limit }) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > source.length) {
    throw new RangeError('cursor must be an integer inside source');
  }
  if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer from 1 through 100');
  }
}

function safeItem(filter, index) {
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
  const order = Number.isFinite(filter.displayOrder) ? filter.displayOrder : index;
  return { filterId, displayTitle, order, index };
}

export function formulaCompletions({
  source,
  cursor,
  filters,
  limit = DEFAULT_LIMIT
}) {
  validateInputs({ source, cursor, filters, limit });
  let start = cursor;
  let end = cursor;
  while (start > 0 && !isBoundary(source[start - 1])) start -= 1;
  while (end < source.length && !isBoundary(source[end])) end += 1;
  const query = source.slice(start, end);
  const normalizedQuery = normalize(query);

  if (
    query.length === 0
    || RESERVED_TOKENS.has(query.toUpperCase())
    || query === '('
    || query === ')'
  ) {
    return { start, end, query, items: [] };
  }

  const items = filters
    .map(safeItem)
    .map(item => {
      const normalizedTitle = normalize(item.displayTitle);
      return {
        ...item,
        normalizedTitle,
        prefix: normalizedTitle.startsWith(normalizedQuery)
      };
    })
    .filter(item => item.normalizedTitle.includes(normalizedQuery))
    .sort((left, right) => (
      Number(right.prefix) - Number(left.prefix)
      || left.order - right.order
      || left.index - right.index
    ))
    .slice(0, limit)
    .map(({ filterId, displayTitle }) => ({ filterId, displayTitle }));

  return { start, end, query, items };
}

export function applyFormulaCompletion(source, completion, displayTitle) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (completion === null || typeof completion !== 'object') {
    throw new TypeError('completion must be an object');
  }
  const { start, end } = completion;
  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end < start
    || end > source.length
  ) {
    throw new RangeError('completion range is invalid');
  }
  if (
    typeof displayTitle !== 'string'
    || displayTitle.length === 0
    || /[\s()]/u.test(displayTitle)
    || RESERVED_TOKENS.has(displayTitle.toUpperCase())
  ) {
    throw new TypeError('displayTitle must be one safe non-operator token');
  }
  const nextSource = `${source.slice(0, start)}${displayTitle}${source.slice(end)}`;
  return { source: nextSource, cursor: start + displayTitle.length };
}
