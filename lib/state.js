import { compileFilterState } from './filter-engine.js';
import {
  ATTRIBUTE_GROUP_IDS,
  DEFAULT_ATTRIBUTE_SELECTIONS,
  attributeSelectionsToFormula,
  cloneAttributeSelections,
  isAttributeFilter
} from './attribute-filters.js';
import { FormulaSyntaxError, basicToFormula } from './formula.js';
import { DEFAULT_TIERS, normalizeTierColor } from './tier-palette.js';
import { MAX_TIERS, MIN_TIERS, TIER_NAME_MAX_LENGTH } from './tier-config.js';
import { USER_WORK_LIMIT } from './work-limit.js';

export { USER_WORK_LIMIT };

export const STATE_SCHEMA_VERSION = 'egs-tier-state-v5';
export const LEGACY_V4_STATE_SCHEMA_VERSION = 'egs-tier-state-v4';
export const LEGACY_V3_STATE_SCHEMA_VERSION = 'egs-tier-state-v3';
export const LEGACY_V2_STATE_SCHEMA_VERSION = 'egs-tier-state-v2';
export const LEGACY_STATE_SCHEMA_VERSION = 'egs-tier-state-v1';
export const STORAGE_KEY = 'egs-tier-terminal:egs-tier-100-v1';

const V4_TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion',
  'sampleId',
  'filterState',
  'selectedWorkIds',
  'selectedWorkRefs',
  'tiers',
  'tierOrder',
  'workspaceMode',
  'selectionCardView',
  'savedAt'
]);
const V3_TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion',
  'sampleId',
  'filterState',
  'selectedWorkIds',
  'tiers',
  'tierOrder',
  'workspaceMode',
  'selectionCardView',
  'savedAt'
]);
const V2_TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion',
  'sampleId',
  'filterState',
  'selectedWorkIds',
  'tierOrder',
  'workspaceMode',
  'selectionCardView',
  'savedAt'
]);
const V1_TOP_LEVEL_FIELDS = Object.freeze([
  'schemaVersion',
  'sampleId',
  'filterState',
  'tierAssignments',
  'updatedAt'
]);
const V5_FILTER_STATE_FIELDS = Object.freeze([
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
const LEGACY_V5_FILTER_STATE_FIELDS = Object.freeze(
  V5_FILTER_STATE_FIELDS.filter(field => field !== 'excludeNukige')
);
const V4_FILTER_STATE_FIELDS = Object.freeze([
  'mode',
  'titleQuery',
  'minimumScore',
  'minimumVoteCount',
  'brandIds',
  'basicOperator',
  'positiveFilterIds',
  'excludedFilterIds',
  'advancedExpression',
  'releaseYearStart',
  'releaseYearEnd',
  'sortKey',
  'sortDirection',
  'selectedOnly'
]);
const V3_FILTER_STATE_FIELDS = Object.freeze([
  'mode',
  'titleQuery',
  'minimumScore',
  'minimumVoteCount',
  'brandIds',
  'basicOperator',
  'positiveFilterIds',
  'excludedFilterIds',
  'advancedExpression',
  'sortKey',
  'sortDirection',
  'selectedOnly'
]);
const V1_FILTER_STATE_FIELDS = Object.freeze([
  'mode',
  'minimumScore',
  'minimumVoteCount',
  'brandIds',
  'basicOperator',
  'positiveFilterIds',
  'excludedFilterIds',
  'advancedExpression'
]);
const LEGACY_TIER_IDS = Object.freeze(['S', 'A', 'B', 'C', 'D']);
const VALID_LEGACY_TIERS = new Set([...LEGACY_TIER_IDS, 'unranked']);
const TIER_FIELDS = Object.freeze(['id', 'name', 'colorId']);
const VALID_SORT_KEYS = new Set([
  'voteCount', 'median',
  'vndbScore', 'vndbVoteCount',
  'bangumiScore', 'bangumiVoteCount',
  'title', 'brandName', 'releaseDate'
]);
const VALID_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const VALID_WORKSPACE_MODES = new Set(['selection', 'ranking']);
const VALID_CARD_VIEWS = new Set(['full', 'compact']);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_FILTER_IDS = new Set(['AND', 'OR', 'NOT']);
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UTC_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const MAX_JSON_SOURCE_LENGTH = 256 * 1024;
const MAX_WORK_IDS = USER_WORK_LIMIT;
const MAX_AUTHORITY_WORK_IDS = 8000;
const MAX_FILTER_IDS = 62;
const MAX_BRAND_IDS = 100;
const MAX_ID_LENGTH = 128;
const MAX_SAMPLE_ID_LENGTH = 128;
const MAX_TITLE_QUERY_LENGTH = 512;
const MAX_ADVANCED_EXPRESSION_LENGTH = 4096;
const MAX_TIMESTAMP_LENGTH = 64;
const NATIVE_SET_SIZE = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const NATIVE_SET_VALUES = Set.prototype.values;
const NATIVE_SET_ITERATOR_NEXT = Object.getPrototypeOf(
  NATIVE_SET_VALUES.call(new Set())
).next;
const INTERNAL_STATE_ERRORS = new WeakMap();
const TRUSTED_FILTER_ERRORS = new WeakMap();
const RECOVERABLE_STORED_STATE_ERRORS = new WeakMap();
const RECOVERABLE_STORED_STATE_CODES = new Set([
  'INVALID_JSON',
  'SCHEMA_MISMATCH',
  'SAMPLE_MISMATCH',
  'UNKNOWN_WORK',
  'UNKNOWN_FILTER'
]);
let activeInvocation = null;
let latestLoadStateRecoveryToken = null;

function ownObject(entries) {
  return Object.fromEntries(entries);
}

function frozenDefaultFilterState() {
  return Object.freeze(ownObject([
    ['mode', 'basic'],
    ['titleQuery', ''],
    ['minimumScore', 0],
    ['minimumVoteCount', 30],
    ['brandIds', Object.freeze([])],
    ['attributeSelections', DEFAULT_ATTRIBUTE_SELECTIONS],
    ['basicOperator', 'AND'],
    ['positiveFilterIds', Object.freeze([])],
    ['excludedFilterIds', Object.freeze([])],
    ['excludeNukige', true],
    ['advancedExpression', ''],
    ['releaseYearStart', 1987],
    ['releaseYearEnd', 2026],
    ['sortKey', 'voteCount'],
    ['sortDirection', 'desc'],
    ['selectedOnly', false]
  ]));
}

export const DEFAULT_FILTER_STATE = frozenDefaultFilterState();

export class StateValidationError extends Error {
  constructor(message, { code = 'INVALID_STATE', cause, path } = {}) {
    super(message);
    Object.defineProperties(this, {
      name: { configurable: true, value: 'StateValidationError', writable: true },
      code: { configurable: true, enumerable: true, value: code, writable: true }
    });
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
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
  }
}

function stateError(code, message, path, cause) {
  const error = new StateValidationError(message, { code, cause, path });
  INTERNAL_STATE_ERRORS.set(error, activeInvocation);
  return error;
}

function runValidationInvocation(operation) {
  const previousInvocation = activeInvocation;
  activeInvocation = {};
  try {
    return operation();
  } finally {
    activeInvocation = previousInvocation;
  }
}

function isTrustedForCurrentInvocation(registry, error) {
  return activeInvocation !== null && registry.get(error) === activeInvocation;
}

function trustFilterError(error) {
  TRUSTED_FILTER_ERRORS.set(error, activeInvocation);
}

function throwUnexpected(error, code, message, path) {
  if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) {
    throw error;
  }
  throw stateError(code, message, path, error);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeId(value) {
  return typeof value === 'string'
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_PROPERTY_KEYS.has(value);
}

function assertStringLength(value, limit, path) {
  if (typeof value === 'string' && value.length > limit) {
    throw stateError(
      'STATE_TOO_LARGE',
      `${path} exceeds the ${limit} character limit`,
      path
    );
  }
}

function assertPlainObject(value, path, code = 'INVALID_STATE') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw stateError(code, `${path} must be an object`, path);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw stateError(code, `${path} must be a plain object`, path);
  }
}

function dataPropertyValue(object, field, path, code = 'INVALID_STATE') {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor) {
    throw stateError(code, `${path}.${field} is required`, `${path}.${field}`);
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw stateError(code, `${path}.${field} must be a data property`, `${path}.${field}`);
  }
  return descriptor.value;
}

function exactSnapshot(value, expectedFields, path) {
  assertPlainObject(value, path);
  const keys = Reflect.ownKeys(value);
  const expected = new Set(expectedFields);

  for (const key of keys) {
    if (typeof key !== 'string' || !expected.has(key)) {
      throw stateError(
        'INVALID_STATE',
        `${path} contains an unexpected field`,
        typeof key === 'string' ? `${path}.${key}` : path
      );
    }
  }
  if (keys.length !== expectedFields.length) {
    const missing = expectedFields.find(field => !Object.hasOwn(value, field));
    throw stateError(
      'INVALID_STATE',
      `${path}.${missing ?? 'field'} is required`,
      missing === undefined ? path : `${path}.${missing}`
    );
  }

  return ownObject(expectedFields.map(field => [
    field,
    dataPropertyValue(value, field, path)
  ]));
}

function immutableArraySnapshot(value, path, limit) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw new TypeError(`${path}.length must be a data property`);
  }
  const length = lengthDescriptor.value;
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`${path}.length must be a non-negative integer`);
  }
  if (length > limit) {
    throw stateError(
      'STATE_TOO_LARGE',
      `${path} exceeds the ${limit} entry limit`,
      path
    );
  }

  const snapshot = new Array(length);
  let indexCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new TypeError(`${path} must contain only indexed data properties`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${path}[${key}] must be a data property`);
    }
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true
    });
    indexCount += 1;
  }
  if (indexCount !== length) {
    throw new TypeError(`${path} must not be sparse`);
  }
  return Object.freeze(snapshot);
}

function appendArrayDataProperty(array, value) {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw new TypeError('append target length must be a data property');
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0 || length >= 0xffffffff) {
    throw new RangeError('append target length is invalid');
  }
  Object.defineProperty(array, String(length), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
  const updatedLength = Object.getOwnPropertyDescriptor(array, 'length');
  if (!updatedLength || updatedLength.value !== length + 1) {
    throw new TypeError('append target length could not be updated safely');
  }
  return updatedLength.value;
}

function normalizeAuthorityCollection(value, name, kind, limit) {
  const isArray = Array.isArray(value);
  if (
    !isArray
    && (
      value === null
      || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Set.prototype
    )
  ) {
    throw stateError(
      'INVALID_AUTHORITY',
      `authority.${name} must be an Array or Set`,
      `authority.${name}`
    );
  }

  const path = `authority.${name}`;
  let ids;
  if (isArray) {
    ids = immutableArraySnapshot(value, path, limit);
  } else {
    const size = Reflect.apply(NATIVE_SET_SIZE, value, []);
    if (size > limit) {
      throw stateError(
        'STATE_TOO_LARGE',
        `${path} exceeds the ${limit} entry limit`,
        path
      );
    }

    ids = [];
    const iterator = Reflect.apply(NATIVE_SET_VALUES, value, []);
    for (let index = 0; index < size; index += 1) {
      const step = Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []);
      if (step.done) {
        throw stateError(
          'INVALID_AUTHORITY',
          `${path} native iterator ended before its declared size`,
          path
        );
      }
      appendArrayDataProperty(ids, step.value);
    }
    if (!Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []).done) {
      throw stateError(
        'INVALID_AUTHORITY',
        `${path} native iterator exceeded its declared size`,
        path
      );
    }
  }

  const seen = new Set();
  for (const id of ids) {
    assertStringLength(id, MAX_ID_LENGTH, path);
    const valid = kind === 'filter'
      ? isSafeId(id) && !RESERVED_FILTER_IDS.has(id.toUpperCase())
      : isSafeId(id);
    if (!valid) {
      throw stateError(
        'INVALID_AUTHORITY',
        `authority.${name} contains an unsafe ID`,
        path
      );
    }
    if (seen.has(id)) {
      throw stateError(
        'INVALID_AUTHORITY',
        `authority.${name} contains a duplicate ID`,
        path
      );
    }
    seen.add(id);
  }
  return ownObject([
    ['ids', Array.from(ids)],
    ['idSet', seen]
  ]);
}

function normalizeAuthority(authority) {
  try {
    assertPlainObject(authority, 'authority', 'INVALID_AUTHORITY');
    const sampleId = dataPropertyValue(authority, 'sampleId', 'authority', 'INVALID_AUTHORITY');
    const sourceWorkIds = dataPropertyValue(authority, 'workIds', 'authority', 'INVALID_AUTHORITY');
    const sourceFilterIds = dataPropertyValue(authority, 'filterIds', 'authority', 'INVALID_AUTHORITY');
    if (!isNonEmptyString(sampleId)) {
      throw stateError(
        'INVALID_AUTHORITY',
        'authority.sampleId must be a non-empty string',
        'authority.sampleId'
      );
    }
    assertStringLength(sampleId, MAX_SAMPLE_ID_LENGTH, 'authority.sampleId');
    const work = normalizeAuthorityCollection(
      sourceWorkIds,
      'workIds',
      'work',
      MAX_AUTHORITY_WORK_IDS
    );
    const filter = normalizeAuthorityCollection(sourceFilterIds, 'filterIds', 'filter', MAX_FILTER_IDS);
    const attributeGroupSource = Object.hasOwn(authority, 'attributeGroupByFilterId')
      ? dataPropertyValue(
        authority,
        'attributeGroupByFilterId',
        'authority',
        'INVALID_AUTHORITY'
      )
      : null;
    const attributeGroupByFilterId = ownObject([]);
    if (attributeGroupSource !== null) {
      assertPlainObject(
        attributeGroupSource,
        'authority.attributeGroupByFilterId',
        'INVALID_AUTHORITY'
      );
      for (const filterId of Reflect.ownKeys(attributeGroupSource)) {
        if (typeof filterId !== 'string' || !filter.idSet.has(filterId)) {
          throw stateError(
            'INVALID_AUTHORITY',
            'authority.attributeGroupByFilterId contains an unknown filter ID',
            'authority.attributeGroupByFilterId'
          );
        }
        const groupId = dataPropertyValue(
          attributeGroupSource,
          filterId,
          'authority.attributeGroupByFilterId',
          'INVALID_AUTHORITY'
        );
        if (!ATTRIBUTE_GROUP_IDS.includes(groupId)) {
          throw stateError(
            'INVALID_AUTHORITY',
            'authority.attributeGroupByFilterId contains an invalid group ID',
            `authority.attributeGroupByFilterId.${filterId}`
          );
        }
        attributeGroupByFilterId[filterId] = groupId;
      }
    }
    for (const filterId of filter.ids) {
      if (Object.hasOwn(attributeGroupByFilterId, filterId)) continue;
      if (filterId.startsWith('platform-')) attributeGroupByFilterId[filterId] = 'platform';
      else if (filterId.startsWith('genre-')) attributeGroupByFilterId[filterId] = 'game-type';
      else if (filterId.startsWith('length-')) attributeGroupByFilterId[filterId] = 'length';
    }
    const groupSource = Object.hasOwn(authority, 'workGroupByEditionWorkId')
      ? dataPropertyValue(
        authority,
        'workGroupByEditionWorkId',
        'authority',
        'INVALID_AUTHORITY'
      )
      : null;
    const workGroupByEditionWorkId = new Map();
    const workGroupIdSet = new Set();
    if (groupSource !== null) {
      assertPlainObject(
        groupSource,
        'authority.workGroupByEditionWorkId',
        'INVALID_AUTHORITY'
      );
      const groupKeys = Reflect.ownKeys(groupSource);
      if (
        groupKeys.length !== work.ids.length
        || groupKeys.some(key => typeof key !== 'string' || !work.idSet.has(key))
      ) {
        throw stateError(
          'INVALID_AUTHORITY',
          'authority.workGroupByEditionWorkId must cover every work ID exactly once',
          'authority.workGroupByEditionWorkId'
        );
      }
    }
    for (const editionWorkId of work.ids) {
      const workGroupId = groupSource === null
        ? editionWorkId
        : dataPropertyValue(
          groupSource,
          editionWorkId,
          'authority.workGroupByEditionWorkId',
          'INVALID_AUTHORITY'
        );
      assertStringLength(workGroupId, MAX_ID_LENGTH, 'authority.workGroupByEditionWorkId');
      if (!isSafeId(workGroupId)) {
        throw stateError(
          'INVALID_AUTHORITY',
          'authority.workGroupByEditionWorkId contains an unsafe group ID',
          `authority.workGroupByEditionWorkId.${editionWorkId}`
        );
      }
      workGroupByEditionWorkId.set(editionWorkId, workGroupId);
      workGroupIdSet.add(workGroupId);
    }
    return ownObject([
      ['sampleId', sampleId],
      ['workIds', work.ids],
      ['workIdSet', work.idSet],
      ['filterIds', filter.ids],
      ['filterIdSet', filter.idSet],
      ['attributeGroupByFilterId', attributeGroupByFilterId],
      ['workGroupByEditionWorkId', workGroupByEditionWorkId],
      ['workGroupIdSet', workGroupIdSet]
    ]);
  } catch (error) {
    throwUnexpected(error, 'INVALID_AUTHORITY', 'authority could not be validated', 'authority');
  }
}

function stableUnique(values) {
  return [...new Set(values)];
}

function inferredFilterIds(filterState) {
  const ids = [];
  if (filterState.attributeSelections !== null && typeof filterState.attributeSelections === 'object') {
    for (const groupId of ATTRIBUTE_GROUP_IDS) {
      if (!Array.isArray(filterState.attributeSelections[groupId])) continue;
      for (const id of filterState.attributeSelections[groupId]) appendArrayDataProperty(ids, id);
    }
  }
  if (Array.isArray(filterState.positiveFilterIds)) {
    for (const id of filterState.positiveFilterIds) appendArrayDataProperty(ids, id);
  }
  if (Array.isArray(filterState.excludedFilterIds)) {
    for (const id of filterState.excludedFilterIds) appendArrayDataProperty(ids, id);
  }
  if (typeof filterState.advancedExpression === 'string') {
    const tokens = filterState.advancedExpression.match(/[^\s()]+/gu) ?? [];
    for (const token of tokens) {
      if (!RESERVED_FILTER_IDS.has(token.toUpperCase())) {
        appendArrayDataProperty(ids, token);
      }
    }
  }
  return stableUnique(ids);
}

function filterValidationError(cause) {
  if (
    isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, cause)
    && cause.code === 'STATE_TOO_LARGE'
  ) {
    return cause;
  }
  const code = isTrustedForCurrentInvocation(TRUSTED_FILTER_ERRORS, cause)
    && cause.code === 'UNKNOWN_FILTER'
    ? 'UNKNOWN_FILTER'
    : 'INVALID_FILTER_STATE';
  return stateError(
    code,
    `filterState is invalid: ${cause instanceof Error ? cause.message : 'unknown error'}`,
    'state.filterState',
    cause
  );
}

function normalizeFilterState(source, authoritySnapshot) {
  const filterFields = Object.hasOwn(source, 'excludeNukige')
    ? V5_FILTER_STATE_FIELDS
    : LEGACY_V5_FILTER_STATE_FIELDS;
  const filterState = exactSnapshot(source, filterFields, 'state.filterState');
  try {
    const collectionLimits = ownObject([
      ['brandIds', MAX_BRAND_IDS],
      ['positiveFilterIds', MAX_FILTER_IDS],
      ['excludedFilterIds', MAX_FILTER_IDS]
    ]);
    for (const [field, limit] of Object.entries(collectionLimits)) {
      filterState[field] = immutableArraySnapshot(
        filterState[field],
        `state.filterState.${field}`,
        limit
      );
    }
    for (const id of filterState.brandIds) {
      assertStringLength(id, MAX_ID_LENGTH, 'state.filterState.brandIds');
    }
    for (const field of ['positiveFilterIds', 'excludedFilterIds']) {
      for (const id of filterState[field]) {
        assertStringLength(id, MAX_ID_LENGTH, `state.filterState.${field}`);
      }
    }
    filterState.attributeSelections = cloneAttributeSelections(
      filterState.attributeSelections,
      authoritySnapshot?.attributeGroupByFilterId ?? Object.fromEntries(
        ATTRIBUTE_GROUP_IDS.flatMap(groupId => (
          filterState.attributeSelections[groupId].map(filterId => [filterId, groupId])
        ))
      )
    );
    if (typeof filterState.titleQuery !== 'string') {
      throw new TypeError('state.filterState.titleQuery must be a string');
    }
    assertStringLength(
      filterState.titleQuery,
      MAX_TITLE_QUERY_LENGTH,
      'state.filterState.titleQuery'
    );
    assertStringLength(
      filterState.advancedExpression,
      MAX_ADVANCED_EXPRESSION_LENGTH,
      'state.filterState.advancedExpression'
    );
    if (!VALID_SORT_KEYS.has(filterState.sortKey)) {
      throw new RangeError('state.filterState.sortKey is invalid');
    }
    if (!VALID_SORT_DIRECTIONS.has(filterState.sortDirection)) {
      throw new RangeError('state.filterState.sortDirection is invalid');
    }
    if (!Number.isInteger(filterState.releaseYearStart) || !Number.isInteger(filterState.releaseYearEnd)) {
      throw new TypeError('state.filterState release years must be integers');
    }
    if (
      filterState.releaseYearStart < 1987
      || filterState.releaseYearEnd > 2026
      || filterState.releaseYearStart > filterState.releaseYearEnd
    ) {
      throw new RangeError('state.filterState release years are outside the available range');
    }
    if (typeof filterState.selectedOnly !== 'boolean') {
      throw new TypeError('state.filterState.selectedOnly must be a boolean');
    }
    if (filterState.excludeNukige !== undefined && typeof filterState.excludeNukige !== 'boolean') {
      throw new TypeError('state.filterState.excludeNukige must be a boolean');
    }
  } catch (error) {
    throw filterValidationError(error);
  }

  const knownFilterIds = authoritySnapshot?.filterIds ?? inferredFilterIds(filterState);
  let compiled;
  try {
    compiled = compileFilterState(filterState, knownFilterIds);
  } catch (error) {
    throw filterValidationError(error);
  }
  if (compiled.error !== null) {
    if (compiled.error instanceof FormulaSyntaxError) {
      trustFilterError(compiled.error);
    }
    throw filterValidationError(compiled.error);
  }

  if (authoritySnapshot !== null) {
    for (const field of ['positiveFilterIds', 'excludedFilterIds']) {
      for (const id of filterState[field]) {
        if (!authoritySnapshot.filterIdSet.has(id)) {
          const cause = new Error(`Unknown filter ID "${id}"`);
          Object.defineProperty(cause, 'code', { value: 'UNKNOWN_FILTER' });
          throw stateError(
            'UNKNOWN_FILTER',
            `filterState contains unknown filter ID "${id}"`,
            `state.filterState.${field}`,
            cause
          );
        }
      }
    }
  }

  return ownObject([
    ['mode', filterState.mode],
    ['titleQuery', filterState.titleQuery],
    ['minimumScore', Object.is(filterState.minimumScore, -0) ? 0 : filterState.minimumScore],
    ['minimumVoteCount', filterState.minimumVoteCount],
    ['brandIds', stableUnique(filterState.brandIds)],
    ['attributeSelections', ownObject(ATTRIBUTE_GROUP_IDS.map(groupId => [
      groupId,
      Array.from(filterState.attributeSelections[groupId])
    ]))],
    ['basicOperator', filterState.basicOperator],
    ['positiveFilterIds', stableUnique(filterState.positiveFilterIds)],
    ['excludedFilterIds', stableUnique(filterState.excludedFilterIds)],
    ...(filterState.excludeNukige === undefined ? [] : [['excludeNukige', filterState.excludeNukige]]),
    ['advancedExpression', filterState.advancedExpression],
    ['releaseYearStart', filterState.releaseYearStart],
    ['releaseYearEnd', filterState.releaseYearEnd],
    ['sortKey', filterState.sortKey],
    ['sortDirection', filterState.sortDirection],
    ['selectedOnly', filterState.selectedOnly]
  ]);
}

function normalizeV3FilterState(source, authoritySnapshot) {
  const legacy = exactSnapshot(source, V3_FILTER_STATE_FIELDS, 'state.filterState');
  const candidate = ownObject([
    ['mode', legacy.mode],
    ['titleQuery', DEFAULT_FILTER_STATE.titleQuery],
    ['minimumScore', legacy.minimumScore],
    ['minimumVoteCount', legacy.minimumVoteCount],
    ['brandIds', legacy.brandIds],
    ['basicOperator', legacy.basicOperator],
    ['positiveFilterIds', legacy.positiveFilterIds],
    ['excludedFilterIds', legacy.excludedFilterIds],
    ['advancedExpression', legacy.advancedExpression],
    ['releaseYearStart', DEFAULT_FILTER_STATE.releaseYearStart],
    ['releaseYearEnd', DEFAULT_FILTER_STATE.releaseYearEnd],
    ['sortKey', legacy.sortKey],
    ['sortDirection', legacy.sortDirection],
    ['selectedOnly', legacy.selectedOnly]
  ]);
  return migrateV4FilterState(candidate, authoritySnapshot);
}

function normalizeLegacyFilterState(source, authoritySnapshot) {
  const legacy = exactSnapshot(source, V1_FILTER_STATE_FIELDS, 'state.filterState');
  return normalizeV3FilterState(ownObject([
    ['mode', legacy.mode],
    ['titleQuery', DEFAULT_FILTER_STATE.titleQuery],
    ['minimumScore', legacy.minimumScore],
    ['minimumVoteCount', legacy.minimumVoteCount],
    ['brandIds', legacy.brandIds],
    ['basicOperator', legacy.basicOperator],
    ['positiveFilterIds', legacy.positiveFilterIds],
    ['excludedFilterIds', legacy.excludedFilterIds],
    ['advancedExpression', legacy.advancedExpression],
    ['sortKey', DEFAULT_FILTER_STATE.sortKey],
    ['sortDirection', DEFAULT_FILTER_STATE.sortDirection],
    ['selectedOnly', DEFAULT_FILTER_STATE.selectedOnly]
  ]), authoritySnapshot);
}

function defaultAttributeSelectionsClone() {
  return ownObject(ATTRIBUTE_GROUP_IDS.map(groupId => [
    groupId,
    Array.from(DEFAULT_ATTRIBUTE_SELECTIONS[groupId])
  ]));
}

function v5CandidateFromV4Filter(legacy) {
  return ownObject([
    ['mode', legacy.mode],
    ['titleQuery', legacy.titleQuery],
    ['minimumScore', legacy.minimumScore],
    ['minimumVoteCount', legacy.minimumVoteCount],
    ['brandIds', legacy.brandIds],
    ['attributeSelections', defaultAttributeSelectionsClone()],
    ['basicOperator', legacy.basicOperator],
    ['positiveFilterIds', legacy.positiveFilterIds],
    ['excludedFilterIds', legacy.excludedFilterIds],
    ['advancedExpression', legacy.advancedExpression],
    ['releaseYearStart', legacy.releaseYearStart],
    ['releaseYearEnd', legacy.releaseYearEnd],
    ['sortKey', legacy.sortKey],
    ['sortDirection', legacy.sortDirection],
    ['selectedOnly', legacy.selectedOnly]
  ]);
}

function withDefaultPlatformFormula(source) {
  const platformSource = attributeSelectionsToFormula(DEFAULT_ATTRIBUTE_SELECTIONS);
  const trimmed = source.trim();
  return trimmed.length === 0 ? platformSource : `${platformSource} AND (${source})`;
}

function migrateV4FilterState(source, authoritySnapshot) {
  const legacy = exactSnapshot(source, V4_FILTER_STATE_FIELDS, 'state.filterState');
  const normalized = normalizeFilterState(v5CandidateFromV4Filter(legacy), authoritySnapshot);
  if (normalized.mode === 'advanced') {
    return normalizeFilterState({
      ...normalized,
      advancedExpression: withDefaultPlatformFormula(normalized.advancedExpression)
    }, authoritySnapshot);
  }

  const groupById = authoritySnapshot?.attributeGroupByFilterId ?? {};
  const attributePositiveIds = normalized.positiveFilterIds.filter(filterId => (
    isAttributeFilter(filterId, groupById)
  ));
  const attributeExcludedIds = normalized.excludedFilterIds.filter(filterId => (
    isAttributeFilter(filterId, groupById)
  ));
  const contentPositiveIds = normalized.positiveFilterIds.filter(filterId => (
    !isAttributeFilter(filterId, groupById)
  ));
  const contentExcludedIds = normalized.excludedFilterIds.filter(filterId => (
    !isAttributeFilter(filterId, groupById)
  ));
  const positiveGroups = attributePositiveIds.map(filterId => groupById[filterId]);
  const groupedCounts = new Map(ATTRIBUTE_GROUP_IDS.map(groupId => [groupId, 0]));
  for (const groupId of positiveGroups) groupedCounts.set(groupId, groupedCounts.get(groupId) + 1);

  const representable = attributeExcludedIds.length === 0 && (
    normalized.basicOperator === 'AND'
      ? [...groupedCounts.values()].every(count => count <= 1)
      : (
        attributePositiveIds.length === 0
        || (
          contentPositiveIds.length === 0
          && new Set(positiveGroups).size <= 1
        )
      )
  );
  if (!representable) {
    const legacyFormula = basicToFormula(
      normalized.positiveFilterIds,
      normalized.excludedFilterIds,
      normalized.basicOperator
    );
    return normalizeFilterState({
      ...normalized,
      mode: 'advanced',
      advancedExpression: withDefaultPlatformFormula(legacyFormula)
    }, authoritySnapshot);
  }

  const attributeSelections = defaultAttributeSelectionsClone();
  for (const filterId of attributePositiveIds) {
    const groupId = groupById[filterId];
    if (groupId === 'platform') attributeSelections.platform = [];
  }
  for (const filterId of attributePositiveIds) {
    attributeSelections[groupById[filterId]].push(filterId);
  }
  return normalizeFilterState({
    ...normalized,
    attributeSelections,
    positiveFilterIds: contentPositiveIds,
    excludedFilterIds: contentExcludedIds
  }, authoritySnapshot);
}

function normalizeWorkIdArray(source, path, authoritySnapshot, duplicateCode) {
  let workIds;
  try {
    workIds = immutableArraySnapshot(source, path, MAX_WORK_IDS);
  } catch (error) {
    if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) throw error;
    throw stateError('INVALID_STATE', `${path} must be a dense data-property array`, path, error);
  }

  const seen = new Set();
  for (const workId of workIds) {
    assertStringLength(workId, MAX_ID_LENGTH, path);
    if (!isSafeId(workId)) {
      throw stateError('UNKNOWN_WORK', `${path} contains an unsafe work ID`, path);
    }
    if (authoritySnapshot !== null && !authoritySnapshot.workIdSet.has(workId)) {
      throw stateError('UNKNOWN_WORK', `Unknown work ID "${workId}"`, path);
    }
    if (seen.has(workId)) {
      throw stateError(duplicateCode, `${path} contains a duplicate work ID`, path);
    }
    seen.add(workId);
  }
  return Array.from(workIds);
}

function createEditionRefs(selectedWorkIds, authoritySnapshot) {
  return selectedWorkIds.map(editionWorkId => ownObject([
    ['workGroupId', authoritySnapshot.workGroupByEditionWorkId.get(editionWorkId)],
    ['editionWorkId', editionWorkId]
  ]));
}

function normalizeSelectedWorkRefs(source, selectedWorkIds, authoritySnapshot) {
  let refs;
  try {
    refs = immutableArraySnapshot(source, 'state.selectedWorkRefs', MAX_WORK_IDS);
  } catch (error) {
    if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) throw error;
    throw stateError('INVALID_STATE', 'state.selectedWorkRefs must be a dense data-property array', 'state.selectedWorkRefs', error);
  }
  if (refs.length !== selectedWorkIds.length) {
    throw stateError('INVALID_STATE', 'state.selectedWorkRefs must match selectedWorkIds', 'state.selectedWorkRefs');
  }
  const selected = new Set(selectedWorkIds);
  const editions = new Set();
  const normalized = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = exactSnapshot(refs[index], ['workGroupId', 'editionWorkId'], `state.selectedWorkRefs[${index}]`);
    for (const field of ['workGroupId', 'editionWorkId']) {
      assertStringLength(ref[field], MAX_ID_LENGTH, `state.selectedWorkRefs[${index}].${field}`);
      if (!isSafeId(ref[field])) {
        throw stateError('UNKNOWN_WORK', `state.selectedWorkRefs[${index}].${field} must be a safe ID`, `state.selectedWorkRefs[${index}].${field}`);
      }
    }
    if (!selected.has(ref.editionWorkId) || editions.has(ref.editionWorkId)) {
      throw stateError('INVALID_STATE', 'state.selectedWorkRefs must identify each selected edition exactly once', `state.selectedWorkRefs[${index}]`);
    }
    if (
      authoritySnapshot !== null
      && authoritySnapshot.workGroupByEditionWorkId.get(ref.editionWorkId) !== ref.workGroupId
    ) {
      throw stateError(
        'UNKNOWN_WORK',
        `Unknown work group "${ref.workGroupId}" for edition "${ref.editionWorkId}"`,
        `state.selectedWorkRefs[${index}].workGroupId`
      );
    }
    editions.add(ref.editionWorkId);
    appendArrayDataProperty(normalized, ref);
  }
  return normalized;
}

function normalizeTiers(source) {
  let sourceTiers;
  try {
    sourceTiers = immutableArraySnapshot(source, 'state.tiers', MAX_WORK_IDS);
  } catch (error) {
    if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) throw error;
    throw stateError(
      'INVALID_STATE',
      'state.tiers must be a dense data-property array',
      'state.tiers',
      error
    );
  }
  if (sourceTiers.length < MIN_TIERS || sourceTiers.length > MAX_TIERS) {
    throw stateError(
      'INVALID_TIER',
      `state.tiers must contain ${MIN_TIERS} to ${MAX_TIERS} tiers`,
      'state.tiers'
    );
  }

  const normalized = [];
  const ids = new Set();
  for (let index = 0; index < sourceTiers.length; index += 1) {
    const path = `state.tiers[${index}]`;
    const tier = exactSnapshot(sourceTiers[index], TIER_FIELDS, path);
    assertStringLength(tier.id, MAX_ID_LENGTH, `${path}.id`);
    if (!isSafeId(tier.id)) {
      throw stateError('INVALID_TIER', `${path}.id must be a safe ID`, `${path}.id`);
    }
    if (ids.has(tier.id)) {
      throw stateError('INVALID_TIER', `Duplicate tier ID "${tier.id}"`, `${path}.id`);
    }
    ids.add(tier.id);

    if (typeof tier.name !== 'string') {
      throw stateError('INVALID_TIER', `${path}.name must be a string`, `${path}.name`);
    }
    const name = tier.name.trim();
    const nameLength = [...name].length;
    if (nameLength < 1 || nameLength > TIER_NAME_MAX_LENGTH) {
      throw stateError(
        'INVALID_TIER',
        `${path}.name must contain 1 to ${TIER_NAME_MAX_LENGTH} characters after trimming`,
        `${path}.name`
      );
    }
    let colorId;
    try {
      colorId = normalizeTierColor(tier.colorId);
    } catch {
      throw stateError(
        'INVALID_TIER',
        `${path}.colorId must be a preset or #rrggbb tier color`,
        `${path}.colorId`
      );
    }
    appendArrayDataProperty(normalized, ownObject([
      ['id', tier.id],
      ['name', name],
      ['colorId', colorId]
    ]));
  }
  return normalized;
}

function normalizeTierOrder(source, tiers, selectedWorkIds, authoritySnapshot) {
  const tierIds = tiers.map(tier => tier.id);
  const rows = exactSnapshot(source, tierIds, 'state.tierOrder');
  const selected = new Set(selectedWorkIds);
  const placed = new Set();
  const normalizedEntries = [];
  let totalPlacements = 0;

  for (const tier of tierIds) {
    let row;
    try {
      row = immutableArraySnapshot(rows[tier], `state.tierOrder.${tier}`, MAX_WORK_IDS);
    } catch (error) {
      if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) throw error;
      throw stateError(
        'INVALID_STATE',
        `state.tierOrder.${tier} must be a dense data-property array`,
        `state.tierOrder.${tier}`,
        error
      );
    }
    totalPlacements += row.length;
    if (totalPlacements > MAX_WORK_IDS) {
      throw stateError(
        'STATE_TOO_LARGE',
        `state.tierOrder exceeds the ${MAX_WORK_IDS} placement limit`,
        'state.tierOrder'
      );
    }
    for (const workId of row) {
      assertStringLength(workId, MAX_ID_LENGTH, `state.tierOrder.${tier}`);
      if (!isSafeId(workId)) {
        throw stateError('UNKNOWN_WORK', 'state.tierOrder contains an unsafe work ID', `state.tierOrder.${tier}`);
      }
      if (authoritySnapshot !== null && !authoritySnapshot.workIdSet.has(workId)) {
        throw stateError('UNKNOWN_WORK', `Unknown work ID "${workId}"`, `state.tierOrder.${tier}`);
      }
      if (placed.has(workId)) {
        throw stateError('INVALID_TIER', `Work ID "${workId}" is placed more than once`, `state.tierOrder.${tier}`);
      }
      if (!selected.has(workId)) {
        throw stateError('INVALID_TIER', `Work ID "${workId}" is not selected`, `state.tierOrder.${tier}`);
      }
      placed.add(workId);
    }
    appendArrayDataProperty(normalizedEntries, [tier, Array.from(row)]);
  }
  return ownObject(normalizedEntries);
}

function normalizeLegacyTierOrder(source, selectedWorkIds, authoritySnapshot) {
  const rows = exactSnapshot(source, LEGACY_TIER_IDS, 'state.tierOrder');
  const selected = new Set(selectedWorkIds);
  const placed = new Set();
  const normalizedEntries = [];
  let totalPlacements = 0;

  for (const tier of LEGACY_TIER_IDS) {
    let row;
    try {
      row = immutableArraySnapshot(rows[tier], `state.tierOrder.${tier}`, MAX_WORK_IDS);
    } catch (error) {
      if (isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)) throw error;
      throw stateError(
        'INVALID_STATE',
        `state.tierOrder.${tier} must be a dense data-property array`,
        `state.tierOrder.${tier}`,
        error
      );
    }
    totalPlacements += row.length;
    if (totalPlacements > MAX_WORK_IDS) {
      throw stateError(
        'STATE_TOO_LARGE',
        `state.tierOrder exceeds the ${MAX_WORK_IDS} placement limit`,
        'state.tierOrder'
      );
    }
    for (const workId of row) {
      assertStringLength(workId, MAX_ID_LENGTH, `state.tierOrder.${tier}`);
      if (!isSafeId(workId)) {
        throw stateError('UNKNOWN_WORK', 'state.tierOrder contains an unsafe work ID', `state.tierOrder.${tier}`);
      }
      if (authoritySnapshot !== null && !authoritySnapshot.workIdSet.has(workId)) {
        throw stateError('UNKNOWN_WORK', `Unknown work ID "${workId}"`, `state.tierOrder.${tier}`);
      }
      if (placed.has(workId)) {
        throw stateError('INVALID_TIER', `Work ID "${workId}" is placed more than once`, `state.tierOrder.${tier}`);
      }
      if (!selected.has(workId)) {
        throw stateError('INVALID_TIER', `Work ID "${workId}" is not selected`, `state.tierOrder.${tier}`);
      }
      placed.add(workId);
    }
    appendArrayDataProperty(normalizedEntries, [tier, Array.from(row)]);
  }
  return ownObject(normalizedEntries);
}

function cloneDefaultTiers() {
  const cloned = [];
  for (const tier of DEFAULT_TIERS) {
    appendArrayDataProperty(cloned, ownObject([
      ['id', tier.id],
      ['name', tier.name],
      ['colorId', tier.colorId]
    ]));
  }
  return cloned;
}

function migrateLegacyTierOrder(legacyTierOrder) {
  const entries = [];
  for (let index = 0; index < DEFAULT_TIERS.length; index += 1) {
    appendArrayDataProperty(entries, [
      DEFAULT_TIERS[index].id,
      Array.from(legacyTierOrder[LEGACY_TIER_IDS[index]])
    ]);
  }
  return ownObject(entries);
}

function normalizeLegacyAssignments(source, authoritySnapshot) {
  assertPlainObject(source, 'state.tierAssignments');
  const keys = Reflect.ownKeys(source);
  if (keys.length > MAX_WORK_IDS) {
    throw stateError(
      'STATE_TOO_LARGE',
      `state.tierAssignments exceeds the ${MAX_WORK_IDS} entry limit`,
      'state.tierAssignments'
    );
  }

  const assignments = new Map();
  for (const workId of keys) {
    assertStringLength(workId, MAX_ID_LENGTH, 'state.tierAssignments');
    if (typeof workId !== 'string' || !isSafeId(workId)) {
      throw stateError('UNKNOWN_WORK', 'state.tierAssignments contains an unsafe work ID', 'state.tierAssignments');
    }
    if (!authoritySnapshot.workIdSet.has(workId)) {
      throw stateError('UNKNOWN_WORK', `Unknown work ID "${workId}"`, `state.tierAssignments.${workId}`);
    }
    const tier = dataPropertyValue(source, workId, 'state.tierAssignments', 'INVALID_TIER');
    if (!VALID_LEGACY_TIERS.has(tier)) {
      throw stateError('INVALID_TIER', `Invalid tier for work ID "${workId}"`, `state.tierAssignments.${workId}`);
    }
    assignments.set(workId, tier);
  }
  return assignments;
}

function isValidUtcIsoString(value) {
  if (typeof value !== 'string') return false;
  const match = UTC_ISO_PATTERN.exec(value);
  if (!match) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  const expectedParts = match.slice(1, 7).map(Number);
  const actualParts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  ];
  return expectedParts.every((part, index) => part === actualParts[index]);
}

function assertSampleAndTimestamp(sampleId, timestamp, timestampField, authoritySnapshot) {
  assertStringLength(sampleId, MAX_SAMPLE_ID_LENGTH, 'state.sampleId');
  assertStringLength(timestamp, MAX_TIMESTAMP_LENGTH, `state.${timestampField}`);
  if (authoritySnapshot === null) {
    if (!isNonEmptyString(sampleId)) {
      throw stateError('INVALID_STATE', 'state.sampleId must be a non-empty string', 'state.sampleId');
    }
  } else if (sampleId !== authoritySnapshot.sampleId) {
    throw stateError(
      'SAMPLE_MISMATCH',
      `Expected sampleId "${authoritySnapshot.sampleId}"`,
      'state.sampleId'
    );
  }
  if (!isValidUtcIsoString(timestamp)) {
    throw stateError(
      'INVALID_STATE',
      `state.${timestampField} must be a valid ISO-8601 UTC string`,
      `state.${timestampField}`
    );
  }
}

function schemaVersionOf(candidate) {
  assertPlainObject(candidate, 'state');
  return dataPropertyValue(candidate, 'schemaVersion', 'state');
}

function normalizeV5State(candidate, authoritySnapshot) {
  try {
    const schemaVersion = schemaVersionOf(candidate);
    if (schemaVersion !== STATE_SCHEMA_VERSION) {
      throw stateError(
        'SCHEMA_MISMATCH',
        `Expected schemaVersion "${STATE_SCHEMA_VERSION}"`,
        'state.schemaVersion'
      );
    }
    const state = exactSnapshot(candidate, V4_TOP_LEVEL_FIELDS, 'state');
    assertSampleAndTimestamp(state.sampleId, state.savedAt, 'savedAt', authoritySnapshot);
    const filterState = normalizeFilterState(state.filterState, authoritySnapshot);
    const selectedWorkIds = normalizeWorkIdArray(
      state.selectedWorkIds,
      'state.selectedWorkIds',
      authoritySnapshot,
      'INVALID_STATE'
    );
    const selectedWorkRefs = normalizeSelectedWorkRefs(
      state.selectedWorkRefs,
      selectedWorkIds,
      authoritySnapshot
    );
    const tiers = normalizeTiers(state.tiers);
    const tierOrder = normalizeTierOrder(
      state.tierOrder,
      tiers,
      selectedWorkIds,
      authoritySnapshot
    );
    if (!VALID_WORKSPACE_MODES.has(state.workspaceMode)) {
      throw stateError('INVALID_STATE', 'state.workspaceMode is invalid', 'state.workspaceMode');
    }
    if (!VALID_CARD_VIEWS.has(state.selectionCardView)) {
      throw stateError('INVALID_STATE', 'state.selectionCardView is invalid', 'state.selectionCardView');
    }
    return ownObject([
      ['schemaVersion', STATE_SCHEMA_VERSION],
      ['sampleId', state.sampleId],
      ['filterState', filterState],
      ['selectedWorkIds', selectedWorkIds],
      ['selectedWorkRefs', selectedWorkRefs],
      ['tiers', tiers],
      ['tierOrder', tierOrder],
      ['workspaceMode', state.workspaceMode],
      ['selectionCardView', state.selectionCardView],
      ['savedAt', state.savedAt]
    ]);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be validated', 'state');
  }
}

function normalizeV4State(candidate, authoritySnapshot) {
  try {
    const schemaVersion = schemaVersionOf(candidate);
    if (schemaVersion !== LEGACY_V4_STATE_SCHEMA_VERSION) {
      throw stateError(
        'SCHEMA_MISMATCH',
        `Expected schemaVersion "${LEGACY_V4_STATE_SCHEMA_VERSION}"`,
        'state.schemaVersion'
      );
    }
    const state = exactSnapshot(candidate, V4_TOP_LEVEL_FIELDS, 'state');
    return normalizeV5State(ownObject([
      ['schemaVersion', STATE_SCHEMA_VERSION],
      ['sampleId', state.sampleId],
      ['filterState', migrateV4FilterState(state.filterState, authoritySnapshot)],
      ['selectedWorkIds', state.selectedWorkIds],
      ['selectedWorkRefs', state.selectedWorkRefs],
      ['tiers', state.tiers],
      ['tierOrder', state.tierOrder],
      ['workspaceMode', state.workspaceMode],
      ['selectionCardView', state.selectionCardView],
      ['savedAt', state.savedAt]
    ]), authoritySnapshot);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be migrated', 'state');
  }
}

function normalizeV3State(candidate, authoritySnapshot) {
  try {
    const schemaVersion = schemaVersionOf(candidate);
    if (schemaVersion !== LEGACY_V3_STATE_SCHEMA_VERSION) {
      throw stateError(
        'SCHEMA_MISMATCH',
        `Expected schemaVersion "${LEGACY_V3_STATE_SCHEMA_VERSION}"`,
        'state.schemaVersion'
      );
    }
    const state = exactSnapshot(candidate, V3_TOP_LEVEL_FIELDS, 'state');
    const selectedWorkIds = normalizeWorkIdArray(
      state.selectedWorkIds,
      'state.selectedWorkIds',
      authoritySnapshot,
      'INVALID_STATE'
    );
    return normalizeV5State(ownObject([
      ['schemaVersion', STATE_SCHEMA_VERSION],
      ['sampleId', state.sampleId],
      ['filterState', normalizeV3FilterState(state.filterState, authoritySnapshot)],
      ['selectedWorkIds', selectedWorkIds],
      ['selectedWorkRefs', createEditionRefs(selectedWorkIds, authoritySnapshot)],
      ['tiers', state.tiers],
      ['tierOrder', state.tierOrder],
      ['workspaceMode', state.workspaceMode],
      ['selectionCardView', state.selectionCardView],
      ['savedAt', state.savedAt]
    ]), authoritySnapshot);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be migrated', 'state');
  }
}

function normalizeV2State(candidate, authoritySnapshot) {
  try {
    const schemaVersion = schemaVersionOf(candidate);
    if (schemaVersion !== LEGACY_V2_STATE_SCHEMA_VERSION) {
      throw stateError(
        'SCHEMA_MISMATCH',
        `Expected schemaVersion "${LEGACY_V2_STATE_SCHEMA_VERSION}"`,
        'state.schemaVersion'
      );
    }
    const state = exactSnapshot(candidate, V2_TOP_LEVEL_FIELDS, 'state');
    assertSampleAndTimestamp(state.sampleId, state.savedAt, 'savedAt', authoritySnapshot);
    const filterState = normalizeV3FilterState(state.filterState, authoritySnapshot);
    const selectedWorkIds = normalizeWorkIdArray(
      state.selectedWorkIds,
      'state.selectedWorkIds',
      authoritySnapshot,
      'INVALID_STATE'
    );
    const legacyTierOrder = normalizeLegacyTierOrder(
      state.tierOrder,
      selectedWorkIds,
      authoritySnapshot
    );
    if (!VALID_WORKSPACE_MODES.has(state.workspaceMode)) {
      throw stateError('INVALID_STATE', 'state.workspaceMode is invalid', 'state.workspaceMode');
    }
    if (!VALID_CARD_VIEWS.has(state.selectionCardView)) {
      throw stateError('INVALID_STATE', 'state.selectionCardView is invalid', 'state.selectionCardView');
    }
    return ownObject([
      ['schemaVersion', STATE_SCHEMA_VERSION],
      ['sampleId', state.sampleId],
      ['filterState', filterState],
      ['selectedWorkIds', selectedWorkIds],
      ['selectedWorkRefs', createEditionRefs(selectedWorkIds, authoritySnapshot)],
      ['tiers', cloneDefaultTiers()],
      ['tierOrder', migrateLegacyTierOrder(legacyTierOrder)],
      ['workspaceMode', state.workspaceMode],
      ['selectionCardView', state.selectionCardView],
      ['savedAt', state.savedAt]
    ]);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be migrated', 'state');
  }
}

function normalizeV1State(candidate, authoritySnapshot) {
  try {
    const schemaVersion = schemaVersionOf(candidate);
    if (schemaVersion !== LEGACY_STATE_SCHEMA_VERSION) {
      throw stateError(
        'SCHEMA_MISMATCH',
        `Expected schemaVersion "${LEGACY_STATE_SCHEMA_VERSION}"`,
        'state.schemaVersion'
      );
    }
    const state = exactSnapshot(candidate, V1_TOP_LEVEL_FIELDS, 'state');
    assertSampleAndTimestamp(state.sampleId, state.updatedAt, 'updatedAt', authoritySnapshot);
    const filterState = normalizeLegacyFilterState(state.filterState, authoritySnapshot);
    const assignments = normalizeLegacyAssignments(state.tierAssignments, authoritySnapshot);
    const selectedWorkIds = authoritySnapshot.workIds.filter(workId => assignments.has(workId));
    const legacyTierOrder = ownObject(LEGACY_TIER_IDS.map(tier => [
      tier,
      authoritySnapshot.workIds.filter(workId => assignments.get(workId) === tier)
    ]));
    return ownObject([
      ['schemaVersion', STATE_SCHEMA_VERSION],
      ['sampleId', state.sampleId],
      ['filterState', filterState],
      ['selectedWorkIds', selectedWorkIds],
      ['selectedWorkRefs', createEditionRefs(selectedWorkIds, authoritySnapshot)],
      ['tiers', cloneDefaultTiers()],
      ['tierOrder', migrateLegacyTierOrder(legacyTierOrder)],
      ['workspaceMode', 'selection'],
      ['selectionCardView', 'full'],
      ['savedAt', state.updatedAt]
    ]);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be migrated', 'state');
  }
}

function normalizeImportedState(candidate, authoritySnapshot) {
  let schemaVersion;
  try {
    schemaVersion = schemaVersionOf(candidate);
  } catch (error) {
    throwUnexpected(error, 'INVALID_STATE', 'state could not be validated', 'state');
  }
  if (schemaVersion === STATE_SCHEMA_VERSION) {
    return normalizeV5State(candidate, authoritySnapshot);
  }
  if (schemaVersion === LEGACY_V4_STATE_SCHEMA_VERSION) {
    return normalizeV4State(candidate, authoritySnapshot);
  }
  if (schemaVersion === LEGACY_V3_STATE_SCHEMA_VERSION) {
    return normalizeV3State(candidate, authoritySnapshot);
  }
  if (schemaVersion === LEGACY_V2_STATE_SCHEMA_VERSION) {
    return normalizeV2State(candidate, authoritySnapshot);
  }
  if (schemaVersion === LEGACY_STATE_SCHEMA_VERSION) {
    return normalizeV1State(candidate, authoritySnapshot);
  }
  throw stateError(
    'SCHEMA_MISMATCH',
    `Unsupported schemaVersion "${String(schemaVersion)}"`,
    'state.schemaVersion'
  );
}

function parseState(source) {
  if (typeof source !== 'string') {
    throw stateError('INVALID_JSON', 'State JSON source must be a string');
  }
  if (source.length > MAX_JSON_SOURCE_LENGTH) {
    throw stateError(
      'STATE_TOO_LARGE',
      `State JSON exceeds the ${MAX_JSON_SOURCE_LENGTH} character limit`
    );
  }
  try {
    return JSON.parse(source);
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    throw stateError('INVALID_JSON', 'State JSON could not be parsed', undefined, cause);
  }
}

function cloneDefaultFilterState() {
  return ownObject([
    ['mode', DEFAULT_FILTER_STATE.mode],
    ['titleQuery', DEFAULT_FILTER_STATE.titleQuery],
    ['minimumScore', DEFAULT_FILTER_STATE.minimumScore],
    ['minimumVoteCount', DEFAULT_FILTER_STATE.minimumVoteCount],
    ['brandIds', Array.from(DEFAULT_FILTER_STATE.brandIds)],
    ['attributeSelections', defaultAttributeSelectionsClone()],
    ['basicOperator', DEFAULT_FILTER_STATE.basicOperator],
    ['positiveFilterIds', Array.from(DEFAULT_FILTER_STATE.positiveFilterIds)],
    ['excludedFilterIds', Array.from(DEFAULT_FILTER_STATE.excludedFilterIds)],
    ['excludeNukige', DEFAULT_FILTER_STATE.excludeNukige],
    ['advancedExpression', DEFAULT_FILTER_STATE.advancedExpression],
    ['releaseYearStart', DEFAULT_FILTER_STATE.releaseYearStart],
    ['releaseYearEnd', DEFAULT_FILTER_STATE.releaseYearEnd],
    ['sortKey', DEFAULT_FILTER_STATE.sortKey],
    ['sortDirection', DEFAULT_FILTER_STATE.sortDirection],
    ['selectedOnly', DEFAULT_FILTER_STATE.selectedOnly]
  ]);
}

function emptyTierOrder(tiers) {
  return ownObject(tiers.map(tier => [tier.id, []]));
}

function createDefaultStateInternal(sampleId) {
  assertStringLength(sampleId, MAX_SAMPLE_ID_LENGTH, 'sampleId');
  if (!isNonEmptyString(sampleId)) {
    throw stateError('INVALID_STATE', 'sampleId must be a non-empty string', 'sampleId');
  }
  const tiers = cloneDefaultTiers();
  return ownObject([
    ['schemaVersion', STATE_SCHEMA_VERSION],
    ['sampleId', sampleId],
    ['filterState', cloneDefaultFilterState()],
    ['selectedWorkIds', []],
    ['selectedWorkRefs', []],
    ['tiers', tiers],
    ['tierOrder', emptyTierOrder(tiers)],
    ['workspaceMode', 'selection'],
    ['selectionCardView', 'full'],
    ['savedAt', new Date().toISOString()]
  ]);
}

export function createDefaultState(sampleId) {
  return runValidationInvocation(() => createDefaultStateInternal(sampleId));
}

export function validateState(candidate, authority) {
  return runValidationInvocation(() => {
    const authoritySnapshot = normalizeAuthority(authority);
    return normalizeV5State(candidate, authoritySnapshot);
  });
}

export function migrateV1State(candidate, authority) {
  return runValidationInvocation(() => {
    const authoritySnapshot = normalizeAuthority(authority);
    return normalizeV1State(candidate, authoritySnapshot);
  });
}

export function loadState(storage, authority) {
  const recoveryToken = {};
  latestLoadStateRecoveryToken = recoveryToken;
  return runValidationInvocation(() => {
    const authoritySnapshot = normalizeAuthority(authority);
    let source;
    try {
      if (storage === null || typeof storage !== 'object') {
        throw new TypeError('storage must provide getItem');
      }
      const getItem = storage.getItem;
      if (typeof getItem !== 'function') {
        throw new TypeError('storage.getItem must be a function');
      }
      source = getItem.call(storage, STORAGE_KEY);
    } catch (cause) {
      throw stateError('STORAGE_READ_FAILED', 'Stored state could not be read', undefined, cause);
    }
    if (source === null) {
      return createDefaultStateInternal(authoritySnapshot.sampleId);
    }
    try {
      return normalizeImportedState(parseState(source), authoritySnapshot);
    } catch (error) {
      if (
        isTrustedForCurrentInvocation(INTERNAL_STATE_ERRORS, error)
        && RECOVERABLE_STORED_STATE_CODES.has(error.code)
      ) {
        RECOVERABLE_STORED_STATE_ERRORS.set(error, recoveryToken);
      }
      throw error;
    }
  });
}

export function consumeRecoverableStoredStateError(error) {
  if (RECOVERABLE_STORED_STATE_ERRORS.get(error) !== latestLoadStateRecoveryToken) return false;
  RECOVERABLE_STORED_STATE_ERRORS.delete(error);
  latestLoadStateRecoveryToken = null;
  return true;
}

export function saveState(storage, state) {
  return runValidationInvocation(() => {
    const normalized = normalizeV5State(state, null);
    const payload = `${JSON.stringify(normalized, null, 2)}\n`;
    try {
      if (storage === null || typeof storage !== 'object') {
        throw new TypeError('storage must provide setItem');
      }
      const setItem = storage.setItem;
      if (typeof setItem !== 'function') {
        throw new TypeError('storage.setItem must be a function');
      }
      setItem.call(storage, STORAGE_KEY, payload);
    } catch (cause) {
      throw stateError('STORAGE_WRITE_FAILED', 'State could not be stored', undefined, cause);
    }
    return payload;
  });
}

export function exportState(state) {
  return runValidationInvocation(() => {
    const normalized = normalizeV5State(state, null);
    return `${JSON.stringify(normalized, null, 2)}\n`;
  });
}

export function importState(source, authority) {
  return runValidationInvocation(() => {
    const authoritySnapshot = normalizeAuthority(authority);
    return normalizeImportedState(parseState(source), authoritySnapshot);
  });
}
