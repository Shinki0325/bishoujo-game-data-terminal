import { countFilteredWorksBatch, filterWorks } from './filter-engine.js';
import { cloneAttributeSelections } from './attribute-filters.js';
import { USER_WORK_LIMIT } from './work-limit.js';

export const SORT_KEYS = Object.freeze(['voteCount', 'median', 'title', 'brandName', 'releaseDate']);

const FILTER_STATE_FIELDS = Object.freeze([
  'mode',
  'titleQuery',
  'minimumScore',
  'minimumVoteCount',
  'brandIds',
  'attributeSelections',
  'basicOperator',
  'positiveFilterIds',
  'excludedFilterIds',
  'excludeNukige',
  'advancedExpression',
  'releaseYearStart',
  'releaseYearEnd',
  'sortKey',
  'sortDirection',
  'selectedOnly'
]);
const LEGACY_FILTER_STATE_FIELDS = Object.freeze(
  FILTER_STATE_FIELDS.filter(field => field !== 'excludeNukige')
);
const FILTER_STATE_ARRAY_FIELDS = new Set([
  'brandIds',
  'positiveFilterIds',
  'excludedFilterIds'
]);
const PATCH_FIELDS = new Set(FILTER_STATE_FIELDS);
const SORT_KEY_SET = new Set(SORT_KEYS);
const SORT_DIRECTIONS = new Set(['asc', 'desc']);
const REQUIRED_WORK_FIELDS = Object.freeze([
  'workId',
  'title',
  'furigana',
  'brandName',
  'median',
  'voteCount',
  'brandId',
  'rawFilterIds',
  'filterIds',
  'rawGenre',
  'genreFilterIds',
  'platformFilterId',
  'releaseDate'
]);
const COUNT_INPUT_FIELDS = Object.freeze([
  'works',
  'filterState',
  'knownFilterIds',
  'selectedWorkIds',
  'patch'
]);
const BATCH_COUNT_INPUT_FIELDS = Object.freeze([
  'works',
  'filterState',
  'knownFilterIds',
  'selectedWorkIds',
  'patches'
]);
const BATCH_PATCH_FIELDS = new Set([
  'brandIds',
  'positiveFilterIds',
  'excludedFilterIds'
]);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_FILTER_IDS = new Set(['AND', 'OR', 'NOT']);
const UNSAFE_IDS = new Set(['__proto__', 'constructor', 'prototype']);
export const CATALOG_WORK_LIMIT = 7000;
const MAX_SELECTED_WORK_IDS = USER_WORK_LIMIT;
const MAX_CONTENT_FILTER_IDS = 45;
const MAX_GENRE_FILTER_IDS = 4;
const MAX_KNOWN_FILTER_IDS = 62;
const MAX_STATE_FILTER_IDS = 62;
const MAX_BRAND_IDS = 100;
const MAX_ID_LENGTH = 128;
const MAX_RAW_GENRE_LENGTH = 512;
const MAX_TITLE_QUERY_LENGTH = 512;
const MAX_BATCH_PATCHES = 256;
const MIN_RELEASE_YEAR = 1987;
const MAX_RELEASE_YEAR = 2026;
const RELEASE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const NATIVE_SET_SIZE = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const NATIVE_SET_VALUES = Set.prototype.values;
const NATIVE_SET_ITERATOR_NEXT = Object.getPrototypeOf(
  NATIVE_SET_VALUES.call(new Set())
).next;
const INTERNAL_CATALOG_ERRORS = new WeakMap();
const compareJapanese = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base'
}).compare;
let activeInvocation = null;

export class CatalogValidationError extends Error {
  constructor(message, { code, path, cause } = {}) {
    super(message);
    Object.defineProperty(this, 'name', {
      configurable: true,
      value: 'CatalogValidationError',
      writable: true
    });
    if (code !== undefined) {
      Object.defineProperty(this, 'code', {
        configurable: true,
        enumerable: true,
        value: code,
        writable: true
      });
    }
    if (path !== undefined) {
      Object.defineProperty(this, 'path', {
        configurable: true,
        enumerable: true,
        value: path,
        writable: true
      });
    }
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
        writable: true
      });
    }
  }
}

function catalogError(code, message, path, cause) {
  const error = new CatalogValidationError(message, { code, path, cause });
  INTERNAL_CATALOG_ERRORS.set(error, activeInvocation);
  return error;
}

function runCatalogInvocation(operation) {
  const previousInvocation = activeInvocation;
  activeInvocation = {};
  try {
    return operation();
  } finally {
    activeInvocation = previousInvocation;
  }
}

function withCatalogBoundary(operation) {
  return runCatalogInvocation(() => {
    try {
      return operation();
    } catch (error) {
      if (
        activeInvocation !== null
        && INTERNAL_CATALOG_ERRORS.get(error) === activeInvocation
      ) {
        throw error;
      }
      throw catalogError(
        'UNEXPECTED_INPUT',
        'Unexpected failure while validating catalog input',
        undefined,
        error
      );
    }
  });
}

function appendDataProperty(array, value) {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value >= 0xffffffff
  ) {
    throw catalogError('INVALID_ARRAY', 'append target has an invalid length', 'array.length');
  }
  const index = lengthDescriptor.value;
  Object.defineProperty(array, String(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
  const nextLength = Object.getOwnPropertyDescriptor(array, 'length');
  if (!nextLength || nextLength.value !== index + 1) {
    throw catalogError('INVALID_ARRAY', 'append target length did not advance', 'array.length');
  }
}

function assertPlainObject(value, path, code = 'INVALID_INPUT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw catalogError(code, `${path} must be a plain object`, path);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw catalogError(code, `${path} must use a plain object prototype`, path);
  }
}

function ownDataValue(object, field, path, code = 'INVALID_INPUT') {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor) {
    throw catalogError(code, `${path}.${field} is required`, `${path}.${field}`);
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw catalogError(
      code,
      `${path}.${field} must be an own data property`,
      `${path}.${field}`
    );
  }
  return descriptor.value;
}

function exactObjectEntries(value, fields, path, code = 'INVALID_INPUT') {
  assertPlainObject(value, path, code);
  const keys = Reflect.ownKeys(value);
  const expected = new Set(fields);
  if (
    keys.length !== fields.length
    || keys.some(key => typeof key !== 'string' || !expected.has(key))
  ) {
    throw catalogError(code, `${path} must contain exactly the required fields`, path);
  }
  const entries = [];
  for (const field of fields) {
    appendDataProperty(entries, [field, ownDataValue(value, field, path, code)]);
  }
  return entries;
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotDenseArray(value, path, limit, limitCode = 'INVALID_INPUT') {
  if (!Array.isArray(value)) {
    throw catalogError('INVALID_INPUT', `${path} must be an Array`, path);
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw catalogError('INVALID_INPUT', `${path} must use the standard Array prototype`, path);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw catalogError('INVALID_INPUT', `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  if (length > limit) {
    throw catalogError(limitCode, `${path} exceeds the ${limit} entry limit`, path);
  }

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length + 1
    || keys.some(key => key !== 'length' && (!isCanonicalArrayIndex(key) || Number(key) >= length))
  ) {
    throw catalogError('INVALID_INPUT', `${path} must be dense and contain only indexes`, path);
  }

  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw catalogError(
        'INVALID_INPUT',
        `${path}[${index}] must be an own data property`,
        `${path}[${index}]`
      );
    }
    appendDataProperty(snapshot, descriptor.value);
  }
  return snapshot;
}

function isSafeId(value) {
  return typeof value === 'string'
    && value.length <= MAX_ID_LENGTH
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_IDS.has(value);
}

function isSafeFilterId(value) {
  return isSafeId(value) && !RESERVED_FILTER_IDS.has(value.toUpperCase());
}

function assertUniqueIds(ids, path) {
  const seen = new Set();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (seen.has(id)) {
      throw catalogError('DUPLICATE_ID', `${path} contains duplicate ID ${id}`, `${path}[${index}]`);
    }
    seen.add(id);
  }
  return seen;
}

function snapshotFilterIds(value, path, limit) {
  const ids = snapshotDenseArray(value, path, limit);
  for (let index = 0; index < ids.length; index += 1) {
    if (!isSafeFilterId(ids[index])) {
      throw catalogError('INVALID_WORK', `${path}[${index}] is not a safe filter ID`, `${path}[${index}]`);
    }
  }
  assertUniqueIds(ids, path);
  return ids;
}

function snapshotWork(work, index) {
  const path = `works[${index}]`;
  assertPlainObject(work, path, 'INVALID_WORK');
  const values = new Map();
  for (const field of REQUIRED_WORK_FIELDS) {
    values.set(field, ownDataValue(work, field, path, 'INVALID_WORK'));
  }

  const workId = values.get('workId');
  const title = values.get('title');
  const furigana = values.get('furigana');
  const brandName = values.get('brandName');
  const median = values.get('median');
  const voteCount = values.get('voteCount');
  const brandId = values.get('brandId');
  const rawGenre = values.get('rawGenre');
  const platformFilterId = values.get('platformFilterId');
  const releaseDate = values.get('releaseDate');
  const isNukige = Object.hasOwn(work, 'isNukige')
    ? ownDataValue(work, 'isNukige', path, 'INVALID_WORK')
    : false;
  if (!isSafeId(workId)) {
    throw catalogError('INVALID_WORK', `${path}.workId must be a safe ID`, `${path}.workId`);
  }
  if (typeof title !== 'string' || title.length === 0) {
    throw catalogError('INVALID_WORK', `${path}.title must be a non-empty string`, `${path}.title`);
  }
  if (typeof furigana !== 'string') {
    throw catalogError('INVALID_WORK', `${path}.furigana must be a string`, `${path}.furigana`);
  }
  if (typeof brandName !== 'string' || brandName.length === 0) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.brandName must be a non-empty string`,
      `${path}.brandName`
    );
  }
  if (typeof median !== 'number' || !Number.isFinite(median) || median < 0) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.median must be a finite non-negative number`,
      `${path}.median`
    );
  }
  if (typeof voteCount !== 'number' || !Number.isInteger(voteCount) || voteCount < 0) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.voteCount must be a non-negative integer`,
      `${path}.voteCount`
    );
  }
  if (!isSafeId(brandId)) {
    throw catalogError('INVALID_WORK', `${path}.brandId must be a safe ID`, `${path}.brandId`);
  }
  if (typeof rawGenre !== 'string') {
    throw catalogError('INVALID_WORK', `${path}.rawGenre must be a string`, `${path}.rawGenre`);
  }
  if (rawGenre.length > MAX_RAW_GENRE_LENGTH) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.rawGenre exceeds ${MAX_RAW_GENRE_LENGTH} characters`,
      `${path}.rawGenre`
    );
  }
  if (!isSafeFilterId(platformFilterId)) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.platformFilterId must be a safe filter ID`,
      `${path}.platformFilterId`
    );
  }
  if (!isValidReleaseDate(releaseDate)) {
    throw catalogError(
      'INVALID_WORK',
      `${path}.releaseDate must be YYYY-MM-DD from ${MIN_RELEASE_YEAR} through ${MAX_RELEASE_YEAR}`,
      `${path}.releaseDate`
    );
  }
  if (typeof isNukige !== 'boolean') {
    throw catalogError('INVALID_WORK', `${path}.isNukige must be a boolean when present`, `${path}.isNukige`);
  }

  return Object.fromEntries([
    ['workId', workId],
    ['title', title],
    ['furigana', furigana],
    ['brandName', brandName],
    ['median', median],
    ['voteCount', voteCount],
    ['brandId', brandId],
    ['isNukige', isNukige],
    [
      'rawFilterIds',
      snapshotFilterIds(
        values.get('rawFilterIds'),
        `${path}.rawFilterIds`,
        MAX_CONTENT_FILTER_IDS
      )
    ],
    [
      'filterIds',
      snapshotFilterIds(values.get('filterIds'), `${path}.filterIds`, MAX_CONTENT_FILTER_IDS)
    ],
    ['rawGenre', rawGenre],
    [
      'genreFilterIds',
      snapshotFilterIds(
        values.get('genreFilterIds'),
        `${path}.genreFilterIds`,
        MAX_GENRE_FILTER_IDS
      )
    ],
    ['platformFilterId', platformFilterId],
    ['releaseDate', releaseDate],
    ['workGroupId', optionalWorkGroupId(work, workId)]
  ]);
}

function isValidReleaseDate(value) {
  if (typeof value !== 'string') return false;
  const match = RELEASE_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_RELEASE_YEAR || year > MAX_RELEASE_YEAR) return false;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function releaseYearOf(releaseDate) {
  return Number(releaseDate.slice(0, 4));
}

function optionalWorkGroupId(work, fallbackWorkId) {
  const descriptor = Object.getOwnPropertyDescriptor(work, 'workGroupId');
  if (!descriptor) return fallbackWorkId;
  if (!Object.hasOwn(descriptor, 'value') || !isSafeId(descriptor.value)) {
    throw catalogError('INVALID_WORK', 'work.workGroupId must be a safe ID', 'work.workGroupId');
  }
  return descriptor.value;
}

function snapshotWorks(works) {
  const source = snapshotDenseArray(works, 'works', CATALOG_WORK_LIMIT, 'TOO_MANY_WORKS');
  const records = [];
  const workIds = [];
  const earliestReleaseByGroup = new Map();
  for (let index = 0; index < source.length; index += 1) {
    const snapshot = snapshotWork(source[index], index);
    appendDataProperty(workIds, snapshot.workId);
    appendDataProperty(records, Object.fromEntries([
      ['original', source[index]],
      ['snapshot', snapshot],
      ['index', index]
    ]));
    const currentEarliest = earliestReleaseByGroup.get(snapshot.workGroupId);
    if (currentEarliest === undefined || snapshot.releaseDate < currentEarliest) {
      earliestReleaseByGroup.set(snapshot.workGroupId, snapshot.releaseDate);
    }
  }
  for (const record of records) {
    record.snapshot.groupEarliestReleaseDate = earliestReleaseByGroup.get(record.snapshot.workGroupId)
      ?? record.snapshot.releaseDate;
  }
  return Object.freeze({
    records,
    workIdSet: assertUniqueIds(workIds, 'works')
  });
}

function snapshotKnownFilterIds(value) {
  let ids;
  if (Array.isArray(value)) {
    ids = snapshotDenseArray(
      value,
      'knownFilterIds',
      MAX_KNOWN_FILTER_IDS,
      'INVALID_FILTER_AUTHORITY'
    );
  } else {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Set.prototype) {
      throw catalogError(
        'INVALID_FILTER_AUTHORITY',
        'knownFilterIds must be a standard Array or Set',
        'knownFilterIds'
      );
    }
    const size = Reflect.apply(NATIVE_SET_SIZE, value, []);
    if (size > MAX_KNOWN_FILTER_IDS) {
      throw catalogError(
        'INVALID_FILTER_AUTHORITY',
        `knownFilterIds exceeds the ${MAX_KNOWN_FILTER_IDS} entry limit`,
        'knownFilterIds'
      );
    }
    ids = [];
    const iterator = Reflect.apply(NATIVE_SET_VALUES, value, []);
    for (let index = 0; index < size; index += 1) {
      const step = Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []);
      if (step.done) {
        throw catalogError(
          'INVALID_FILTER_AUTHORITY',
          'knownFilterIds native iterator ended before its declared size',
          'knownFilterIds'
        );
      }
      appendDataProperty(ids, step.value);
    }
    if (!Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []).done) {
      throw catalogError(
        'INVALID_FILTER_AUTHORITY',
        'knownFilterIds native iterator exceeded its declared size',
        'knownFilterIds'
      );
    }
  }
  for (let index = 0; index < ids.length; index += 1) {
    if (!isSafeFilterId(ids[index])) {
      throw catalogError(
        'INVALID_FILTER_AUTHORITY',
        `knownFilterIds[${index}] is not a safe filter ID`,
        `knownFilterIds[${index}]`
      );
    }
  }
  assertUniqueIds(ids, 'knownFilterIds');
  return ids;
}

function snapshotSelectedWorkIds(value, authority) {
  const ids = snapshotDenseArray(value, 'selectedWorkIds', MAX_SELECTED_WORK_IDS);
  const selectedSet = assertUniqueIds(ids, 'selectedWorkIds');
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!isSafeId(id)) {
      throw catalogError(
        'INVALID_SELECTED_WORK_ID',
        `selectedWorkIds[${index}] must be a safe ID`,
        `selectedWorkIds[${index}]`
      );
    }
    if (!authority.has(id)) {
      throw catalogError(
        'UNKNOWN_WORK_ID',
        `selectedWorkIds[${index}] is outside the work authority`,
        `selectedWorkIds[${index}]`
      );
    }
  }
  return selectedSet;
}

function assertSort(sortKey, sortDirection) {
  if (!SORT_KEY_SET.has(sortKey)) {
    throw catalogError('INVALID_SORT', 'sortKey is invalid', 'sortKey');
  }
  if (!SORT_DIRECTIONS.has(sortDirection)) {
    throw catalogError('INVALID_SORT', 'sortDirection is invalid', 'sortDirection');
  }
}

function snapshotFilterState(value) {
  const fields = Object.hasOwn(value, 'excludeNukige')
    ? FILTER_STATE_FIELDS
    : LEGACY_FILTER_STATE_FIELDS;
  const entries = exactObjectEntries(value, fields, 'filterState', 'INVALID_FILTER_STATE');
  const snapshotEntries = [];
  for (const [field, source] of entries) {
    let normalized = source;
    if (FILTER_STATE_ARRAY_FIELDS.has(field)) {
      const limit = field === 'brandIds' ? MAX_BRAND_IDS : MAX_STATE_FILTER_IDS;
      normalized = snapshotDenseArray(source, `filterState.${field}`, limit);
    } else if (field === 'attributeSelections') {
      try {
        normalized = cloneAttributeSelections(source);
      } catch (error) {
        throw catalogError(
          'INVALID_FILTER_STATE',
          'filterState.attributeSelections is invalid',
          'filterState.attributeSelections',
          error
        );
      }
    }
    appendDataProperty(snapshotEntries, [field, normalized]);
  }
  if (!Object.hasOwn(value, 'excludeNukige')) {
    appendDataProperty(snapshotEntries, ['excludeNukige', false]);
  }
  const snapshot = Object.fromEntries(snapshotEntries);
  if (typeof snapshot.titleQuery !== 'string') {
    throw catalogError(
      'INVALID_FILTER_STATE',
      'filterState.titleQuery must be a string',
      'filterState.titleQuery'
    );
  }
  if (snapshot.titleQuery.length > MAX_TITLE_QUERY_LENGTH) {
    throw catalogError(
      'INVALID_FILTER_STATE',
      `filterState.titleQuery exceeds ${MAX_TITLE_QUERY_LENGTH} characters`,
      'filterState.titleQuery'
    );
  }
  if (typeof snapshot.selectedOnly !== 'boolean') {
    throw catalogError(
      'INVALID_FILTER_STATE',
      'filterState.selectedOnly must be a boolean',
      'filterState.selectedOnly'
    );
  }
  if (typeof snapshot.excludeNukige !== 'boolean') {
    throw catalogError('INVALID_FILTER_STATE', 'filterState.excludeNukige must be a boolean', 'filterState.excludeNukige');
  }
  if (
    !Number.isInteger(snapshot.releaseYearStart)
    || !Number.isInteger(snapshot.releaseYearEnd)
    || snapshot.releaseYearStart < MIN_RELEASE_YEAR
    || snapshot.releaseYearEnd > MAX_RELEASE_YEAR
    || snapshot.releaseYearStart > snapshot.releaseYearEnd
  ) {
    throw catalogError(
      'INVALID_FILTER_STATE',
      `filterState release years must stay within ${MIN_RELEASE_YEAR}-${MAX_RELEASE_YEAR}`,
      'filterState.releaseYearStart'
    );
  }
  assertSort(snapshot.sortKey, snapshot.sortDirection);
  return snapshot;
}

function copyDenseArray(value) {
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    appendDataProperty(copy, value[index]);
  }
  return copy;
}

function withNumericPrototypeGuards(operation) {
  const changes = [];
  try {
    for (const prototype of [Array.prototype, Object.prototype]) {
      for (const key of Reflect.ownKeys(prototype)) {
        if (!isCanonicalArrayIndex(key)) {
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (
          descriptor
          && Object.hasOwn(descriptor, 'value')
          && descriptor.writable === true
        ) {
          continue;
        }
        if (!descriptor || descriptor.configurable !== true) {
          throw catalogError(
            'UNSAFE_PROTOTYPE',
            'numeric prototype properties must be configurable data properties',
            `${prototype === Array.prototype ? 'Array' : 'Object'}.prototype[${key}]`
          );
        }
        appendDataProperty(changes, Object.fromEntries([
          ['prototype', prototype],
          ['key', key],
          ['descriptor', descriptor]
        ]));
        Object.defineProperty(prototype, key, {
          configurable: true,
          enumerable: descriptor.enumerable,
          value: undefined,
          writable: true
        });
      }
    }
    return operation();
  } finally {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index];
      Object.defineProperty(change.prototype, change.key, change.descriptor);
    }
  }
}

function compareRecords(left, right, sortKey, sortDirection) {
  let comparison;
  if (sortKey === 'voteCount' || sortKey === 'median') {
    comparison = left.snapshot[sortKey] - right.snapshot[sortKey];
  } else if (sortKey === 'releaseDate') {
    comparison = compareJapanese(
      left.snapshot.groupEarliestReleaseDate,
      right.snapshot.groupEarliestReleaseDate
    );
    if (comparison === 0) {
      comparison = compareJapanese(left.snapshot.releaseDate, right.snapshot.releaseDate);
    }
  } else {
    comparison = compareJapanese(left.snapshot[sortKey], right.snapshot[sortKey]);
  }
  if (comparison !== 0) {
    return sortDirection === 'asc' ? comparison : -comparison;
  }
  return left.index - right.index;
}

function sortRecords(records, sortKey, sortDirection) {
  assertSort(sortKey, sortDirection);
  const sorted = copyDenseArray(records);
  for (let index = 1; index < sorted.length; index += 1) {
    const candidate = sorted[index];
    let position = index;
    while (
      position > 0
      && compareRecords(candidate, sorted[position - 1], sortKey, sortDirection) < 0
    ) {
      sorted[position] = sorted[position - 1];
      position -= 1;
    }
    sorted[position] = candidate;
  }
  return sorted;
}

function originalWorks(records) {
  const result = [];
  for (const record of records) {
    appendDataProperty(result, record.original);
  }
  return result;
}

export function normalizeTitleQuery(source) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  return source.normalize('NFKC').trim().toLocaleLowerCase('ja');
}

function sortCatalogInternal(works, sortKey, sortDirection) {
  const authority = snapshotWorks(works);
  return originalWorks(sortRecords(authority.records, sortKey, sortDirection));
}

export function sortCatalog(works, sortKey, sortDirection) {
  return withCatalogBoundary(() => sortCatalogInternal(works, sortKey, sortDirection));
}

function queryCatalogInternal(works, filterState, knownFilterIds, selectedWorkIds) {
  const authority = snapshotWorks(works);
  const state = snapshotFilterState(filterState);
  const knownIds = snapshotKnownFilterIds(knownFilterIds);
  const selectedSet = snapshotSelectedWorkIds(selectedWorkIds, authority.workIdSet);
  const recordBySnapshot = new Map();
  const workSnapshots = [];
  for (const record of authority.records) {
    recordBySnapshot.set(record.snapshot, record);
    appendDataProperty(workSnapshots, record.snapshot);
  }

  let engineResult;
  try {
    engineResult = withNumericPrototypeGuards(
      () => filterWorks(workSnapshots, state, knownIds)
    );
  } catch (cause) {
    throw catalogError(
      'INVALID_FILTER_STATE',
      'filterState could not be evaluated',
      'filterState',
      cause
    );
  }

  const filteredWorks = snapshotDenseArray(engineResult, 'filterResult', CATALOG_WORK_LIMIT);
  const normalizedQuery = normalizeTitleQuery(state.titleQuery);
  const filteredRecords = [];
  for (const workSnapshot of filteredWorks) {
    const record = recordBySnapshot.get(workSnapshot);
    if (!record) {
      throw catalogError('INVALID_FILTER_RESULT', 'filter engine returned an unknown work');
    }
    if (
      normalizedQuery.length > 0
      && !normalizeTitleQuery(record.snapshot.title).includes(normalizedQuery)
    ) {
      continue;
    }
    const releaseYear = releaseYearOf(record.snapshot.releaseDate);
    if (releaseYear < state.releaseYearStart || releaseYear > state.releaseYearEnd) {
      continue;
    }
    if (state.selectedOnly && !selectedSet.has(record.snapshot.workId)) {
      continue;
    }
    appendDataProperty(filteredRecords, record);
  }

  return originalWorks(sortRecords(filteredRecords, state.sortKey, state.sortDirection));
}

export function queryCatalog(works, filterState, knownFilterIds, selectedWorkIds) {
  return withCatalogBoundary(
    () => queryCatalogInternal(works, filterState, knownFilterIds, selectedWorkIds)
  );
}

function snapshotPatch(value, allowedFields = PATCH_FIELDS) {
  assertPlainObject(value, 'patch', 'INVALID_PATCH');
  const patchEntries = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedFields.has(key)) {
      throw catalogError('INVALID_PATCH', 'patch contains a forbidden field', 'patch');
    }
    appendDataProperty(patchEntries, [key, ownDataValue(value, key, 'patch', 'INVALID_PATCH')]);
  }
  return new Map(patchEntries);
}

function mergeFilterState(current, patch) {
  const mergedEntries = [];
  for (const field of FILTER_STATE_FIELDS) {
    appendDataProperty(mergedEntries, [
      field,
      patch.has(field) ? patch.get(field) : current[field]
    ]);
  }
  return Object.fromEntries(mergedEntries);
}

function countInput(value) {
  return Object.fromEntries(
    exactObjectEntries(value, COUNT_INPUT_FIELDS, 'input', 'INVALID_INPUT')
  );
}

export function countWithFilterPatch(input) {
  return withCatalogBoundary(() => {
    const source = countInput(input);
    const current = snapshotFilterState(source.filterState);
    const patch = snapshotPatch(source.patch);
    const merged = mergeFilterState(current, patch);
    return queryCatalogInternal(
      source.works,
      merged,
      source.knownFilterIds,
      source.selectedWorkIds
    ).length;
  });
}

export function countWithFilterPatches(input) {
  return withCatalogBoundary(() => {
    const source = Object.fromEntries(
      exactObjectEntries(input, BATCH_COUNT_INPUT_FIELDS, 'input', 'INVALID_INPUT')
    );
    const authority = snapshotWorks(source.works);
    const current = snapshotFilterState(source.filterState);
    const knownIds = snapshotKnownFilterIds(source.knownFilterIds);
    const selectedSet = snapshotSelectedWorkIds(source.selectedWorkIds, authority.workIdSet);
    const patchInputs = snapshotDenseArray(
      source.patches,
      'patches',
      MAX_BATCH_PATCHES,
      'INVALID_PATCH'
    );
    const states = [];
    for (let index = 0; index < patchInputs.length; index += 1) {
      const patch = snapshotPatch(patchInputs[index], BATCH_PATCH_FIELDS);
      appendDataProperty(states, mergeFilterState(current, patch));
    }

    const normalizedQuery = normalizeTitleQuery(current.titleQuery);
    const eligibleWorks = [];
    for (const record of authority.records) {
      if (
        normalizedQuery.length > 0
        && !normalizeTitleQuery(record.snapshot.title).includes(normalizedQuery)
      ) {
        continue;
      }
      const releaseYear = releaseYearOf(record.snapshot.releaseDate);
      if (releaseYear < current.releaseYearStart || releaseYear > current.releaseYearEnd) {
        continue;
      }
      if (current.selectedOnly && !selectedSet.has(record.snapshot.workId)) continue;
      appendDataProperty(eligibleWorks, record.snapshot);
    }

    try {
      return withNumericPrototypeGuards(
        () => countFilteredWorksBatch(eligibleWorks, states, knownIds)
      );
    } catch (cause) {
      throw catalogError(
        'INVALID_FILTER_STATE',
        'filter patches could not be evaluated',
        'patches',
        cause
      );
    }
  });
}
