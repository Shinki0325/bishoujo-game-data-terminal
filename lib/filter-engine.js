import {
  FormulaSyntaxError,
  basicToFormula,
  evaluateFormula,
  parseFormula
} from './formula.js';
import {
  ATTRIBUTE_GROUP_IDS,
  attributeSelectionsToFormula,
  cloneAttributeSelections
} from './attribute-filters.js';

const FILTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_FILTER_IDS = new Set(['AND', 'OR', 'NOT']);
const UNSAFE_FILTER_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_CONTENT_FILTER_IDS = 45;
const MAX_GENRE_FILTER_IDS = 4;
const MAX_KNOWN_FILTER_IDS = 62;
const MAX_RAW_GENRE_LENGTH = 512;
const MAX_WORKS = 8000;
const MAX_BATCH_STATES = 256;
const KNOWN_FILTER_SENTINEL = 'filter-engine-known-sentinel';
const NATIVE_SET_SIZE = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const NATIVE_SET_VALUES = Set.prototype.values;
const NATIVE_SET_ITERATOR_NEXT = Object.getPrototypeOf(
  NATIVE_SET_VALUES.call(new Set())
).next;
const COMPILED_METADATA = new WeakMap();
const FORMULA_ERROR_INVOCATIONS = new WeakMap();
let activeCompileInvocation = null;

const STATE_FIELDS = [
  'mode',
  'minimumScore',
  'minimumVoteCount',
  'brandIds',
  'attributeSelections',
  'basicOperator',
  'positiveFilterIds',
  'excludedFilterIds',
  'excludeNukige',
  'advancedExpression',
  'personIds',
  'personRole'
];

const WORK_FIELDS = [
  'median',
  'voteCount',
  'brandId',
  'rawFilterIds',
  'filterIds',
  'rawGenre',
  'genreFilterIds'
];
const INVALID_OBJECT_VALUE = Object.freeze({ invalidStateValue: true });
const EMPTY_ATTRIBUTE_SELECTIONS = Object.freeze({
  'game-type': Object.freeze([]),
  platform: Object.freeze([]),
  length: Object.freeze([])
});

function assertObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function ownDataValue(value, field, name) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor) {
    throw new TypeError(`${name}.${field} is required`);
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new TypeError(`${name}.${field} must be a data property`);
  }
  return descriptor.value;
}

function immutableStateScalar(value) {
  if (
    value !== null
    && (typeof value === 'object' || typeof value === 'function')
  ) {
    return INVALID_OBJECT_VALUE;
  }
  return value;
}

function immutableArraySnapshot(value, name, limit = Infinity) {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw new TypeError(`${name}.length must be a data property`);
  }
  const length = lengthDescriptor.value;
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`${name}.length must be a non-negative integer`);
  }
  if (length > limit) {
    return null;
  }

  const snapshot = new Array(length);
  let indexCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') {
      continue;
    }
    const index = typeof key === 'string' ? Number(key) : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new TypeError(`${name} must contain only indexed data properties`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${name}[${key}] must be a data property`);
    }
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: immutableStateScalar(descriptor.value),
      writable: true
    });
    indexCount += 1;
  }
  if (indexCount !== length) {
    throw new TypeError(`${name} must not be sparse`);
  }
  return Object.freeze(snapshot);
}

function immutableStandardSetSnapshot(value, name, limit) {
  if (
    value === null
    || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Set.prototype
  ) {
    throw new TypeError(`${name} must use the standard Set prototype`);
  }

  const size = Reflect.apply(NATIVE_SET_SIZE, value, []);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new TypeError(`${name}.size must be a non-negative safe integer`);
  }
  if (size > limit) {
    return null;
  }

  const iterator = Reflect.apply(NATIVE_SET_VALUES, value, []);
  const snapshot = new Array(size);
  for (let index = 0; index < size; index += 1) {
    const step = Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []);
    if (step.done) {
      throw new TypeError(`${name} native iterator ended before its declared size`);
    }
    Object.defineProperty(snapshot, String(index), {
      configurable: true,
      enumerable: true,
      value: immutableStateScalar(step.value),
      writable: true
    });
  }
  if (!Reflect.apply(NATIVE_SET_ITERATOR_NEXT, iterator, []).done) {
    throw new TypeError(`${name} native iterator exceeded its declared size`);
  }
  return Object.freeze(snapshot);
}

function snapshotWorksArray(works) {
  if (!Array.isArray(works)) {
    throw new TypeError('works must be an array');
  }
  if (Object.getPrototypeOf(works) !== Array.prototype) {
    throw new TypeError('works must use the standard Array prototype');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(works, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw new TypeError('works.length must be a non-negative safe integer data property');
  }
  const length = lengthDescriptor.value;
  if (length > MAX_WORKS) {
    throw new RangeError(`works exceeds the ${MAX_WORKS} entry limit`);
  }

  const snapshot = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(works, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`works[${index}] must be an own data property`);
    }
    Object.defineProperty(snapshot, String(index), {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true
    });
  }
  return Object.freeze(snapshot);
}

function snapshotBatchStates(states) {
  if (!Array.isArray(states) || Object.getPrototypeOf(states) !== Array.prototype) {
    throw new TypeError('states must be a standard array');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(states, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw new TypeError('states.length must be a non-negative safe integer data property');
  }
  if (lengthDescriptor.value > MAX_BATCH_STATES) {
    throw new RangeError(`states exceeds the ${MAX_BATCH_STATES} entry limit`);
  }
  const snapshot = new Array(lengthDescriptor.value);
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(states, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`states[${index}] must be an own data property`);
    }
    Object.defineProperty(snapshot, String(index), {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true
    });
  }
  return snapshot;
}

function appendArrayDataProperty(array, value) {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value >= 0xffffffff
  ) {
    throw new TypeError('result array length is invalid');
  }
  Object.defineProperty(array, String(lengthDescriptor.value), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

function immutableStateValue(value, field) {
  if (field === 'attributeSelections') {
    const authority = Object.fromEntries(ATTRIBUTE_GROUP_IDS.flatMap(groupId => {
      const values = value?.[groupId];
      return Array.isArray(values) ? values.map(filterId => [filterId, groupId]) : [];
    }));
    return cloneAttributeSelections(value, authority);
  }
  if (!Array.isArray(value)) {
    return immutableStateScalar(value);
  }
  return immutableArraySnapshot(value, `state.${field}`);
}

function snapshotState(state) {
  try {
    assertObject(state, 'state');
    const entries = STATE_FIELDS.map(field => [
      field,
      immutableStateValue(
        field === 'attributeSelections' && !Object.hasOwn(state, field)
          ? EMPTY_ATTRIBUTE_SELECTIONS
          : field === 'excludeNukige' && !Object.hasOwn(state, field)
            ? false
            : field === 'personIds' && !Object.hasOwn(state, field)
              ? []
            : field === 'personRole' && !Object.hasOwn(state, field)
              ? 'all'
              : ownDataValue(state, field, 'state'),
        field
      )
    ]);
    const titleQuery = Object.hasOwn(state, 'titleQuery')
      ? ownDataValue(state, 'titleQuery', 'state')
      : '';
    if (typeof titleQuery !== 'string') throw new TypeError('state.titleQuery must be a string when present');
    return Object.freeze({
      ...Object.fromEntries(entries),
      hasTitleQuery: titleQuery.trim().length > 0
    });
  } catch (cause) {
    throw new TypeError('state could not be snapshotted', { cause });
  }
}

function assertCoreState(state) {
  if (typeof state.mode !== 'string') {
    throw new TypeError('state.mode must be basic or advanced');
  }
  if (state.mode !== 'basic' && state.mode !== 'advanced') {
    throw new RangeError('state.mode must be basic or advanced');
  }

  if (typeof state.minimumScore !== 'number') {
    throw new TypeError('state.minimumScore must be a finite number');
  }
  if (!Number.isFinite(state.minimumScore) || state.minimumScore < 0) {
    throw new RangeError('state.minimumScore must be finite and non-negative');
  }

  if (typeof state.minimumVoteCount !== 'number') {
    throw new TypeError('state.minimumVoteCount must be an integer');
  }
  if (!Number.isInteger(state.minimumVoteCount) || state.minimumVoteCount < 0) {
    throw new RangeError('state.minimumVoteCount must be a non-negative integer');
  }

  if (!Array.isArray(state.brandIds)) {
    throw new TypeError('state.brandIds must be an array');
  }
  if (typeof state.excludeNukige !== 'boolean') {
    throw new TypeError('state.excludeNukige must be a boolean');
  }
  if (!Array.isArray(state.personIds)) {
    throw new TypeError('state.personIds must be an array');
  }
  if (typeof state.personRole !== 'string') {
    throw new TypeError('state.personRole must be a string');
  }
  cloneAttributeSelections(
    state.attributeSelections,
    Object.fromEntries(ATTRIBUTE_GROUP_IDS.flatMap(groupId => (
      state.attributeSelections[groupId].map(filterId => [filterId, groupId])
    )))
  );
  for (const brandId of state.brandIds) {
    if (typeof brandId !== 'string' || brandId.length === 0) {
      throw new TypeError('state.brandIds entries must be non-empty strings');
    }
  }
}

function filterIdError(id, name) {
  if (
    typeof id !== 'string'
    || !FILTER_ID_PATTERN.test(id)
    || RESERVED_FILTER_IDS.has(id.toUpperCase())
    || UNSAFE_FILTER_IDS.has(id)
  ) {
    return new TypeError(
      `${name} must match ${FILTER_ID_PATTERN} and must not be AND, OR, or NOT`
    );
  }
  return null;
}

function tagStateError(state) {
  if (typeof state.basicOperator !== 'string') {
    return new TypeError('state.basicOperator must be AND or OR');
  }
  if (state.basicOperator !== 'AND' && state.basicOperator !== 'OR') {
    return new RangeError('state.basicOperator must be AND or OR');
  }
  if (!Array.isArray(state.positiveFilterIds)) {
    return new TypeError('state.positiveFilterIds must be an array');
  }
  if (!Array.isArray(state.excludedFilterIds)) {
    return new TypeError('state.excludedFilterIds must be an array');
  }

  for (const id of state.positiveFilterIds) {
    const error = filterIdError(id, 'state.positiveFilterIds entries');
    if (error) {
      return error;
    }
  }
  for (const id of state.excludedFilterIds) {
    const error = filterIdError(id, 'state.excludedFilterIds entries');
    if (error) {
      return error;
    }
  }

  if (typeof state.advancedExpression !== 'string') {
    return new TypeError('state.advancedExpression must be a string');
  }
  return null;
}

function validateKnownFilterIds(knownFilterIds) {
  let knownIds;
  try {
    knownIds = Array.isArray(knownFilterIds)
      ? immutableArraySnapshot(knownFilterIds, 'knownFilterIds', MAX_KNOWN_FILTER_IDS)
      : immutableStandardSetSnapshot(
          knownFilterIds,
          'knownFilterIds',
          MAX_KNOWN_FILTER_IDS
        );
  } catch (cause) {
    throw new TypeError('knownFilterIds could not be snapshotted', { cause });
  }
  if (knownIds === null) {
    throw new RangeError(`knownFilterIds exceeds the ${MAX_KNOWN_FILTER_IDS} entry limit`);
  }
  parseFormula(KNOWN_FILTER_SENTINEL, [...knownIds, KNOWN_FILTER_SENTINEL]);
  return knownIds;
}

function runCompileInvocation(operation) {
  const previousInvocation = activeCompileInvocation;
  activeCompileInvocation = {};
  try {
    return operation();
  } finally {
    activeCompileInvocation = previousInvocation;
  }
}

function acceptFormulaError(error) {
  if (!(error instanceof FormulaSyntaxError)) {
    return false;
  }
  if (FORMULA_ERROR_INVOCATIONS.has(error)) {
    throw new TypeError('formula compiler error cannot be reused', { cause: error });
  }
  FORMULA_ERROR_INVOCATIONS.set(error, activeCompileInvocation);
  return true;
}

function assertFormulaErrorConstructionBoundary() {
  for (const field of ['name', 'code', 'offset']) {
    let prototype = FormulaSyntaxError.prototype;
    while (prototype !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, field);
      if (descriptor) {
        if (!Object.hasOwn(descriptor, 'value') || descriptor.writable !== true) {
          throw new TypeError(
            `FormulaSyntaxError.${field} must not be intercepted by an inherited property`
          );
        }
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
  }
}

function signatureScalar(value) {
  if (value === null) {
    return ['null'];
  }

  switch (typeof value) {
    case 'string':
      return ['string', value];
    case 'number':
      if (Number.isNaN(value)) {
        return ['number', 'NaN'];
      }
      if (Object.is(value, -0)) {
        return ['number', '-0'];
      }
      return ['number', String(value)];
    case 'boolean':
      return ['boolean', value];
    case 'undefined':
      return ['undefined'];
    case 'bigint':
      return ['bigint', String(value)];
    case 'symbol':
      return ['symbol'];
    case 'function':
      return ['function'];
    default:
      return ['object'];
  }
}

function signatureField(value) {
  if (!Array.isArray(value)) {
    return signatureScalar(value);
  }
  return ['array', ...value.map(signatureScalar)];
}

function tagSignature(state) {
  const fields = [
    state.mode,
    state.basicOperator,
    ...ATTRIBUTE_GROUP_IDS.map(groupId => state.attributeSelections[groupId]),
    state.positiveFilterIds,
    state.excludedFilterIds,
    state.advancedExpression
  ];
  return JSON.stringify(fields.map(signatureField));
}

function freezeAst(ast) {
  if (ast === null) {
    return null;
  }

  const stack = [ast];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'not') {
      stack.push(node.value);
    } else if (node.type === 'and' || node.type === 'or') {
      stack.push(node.left, node.right);
    }
    Object.freeze(node);
  }
  return ast;
}

function createCompiled(stateSnapshot, signature, ast, error) {
  const frozenAst = freezeAst(ast);
  const compiled = Object.freeze({ ast: frozenAst, error });
  const metadata = Object.freeze({
    ast: frozenAst,
    error,
    tagSignature: signature,
    stateSnapshot,
    brandIds: new Set(stateSnapshot.brandIds)
  });
  COMPILED_METADATA.set(compiled, metadata);
  return compiled;
}

function compiledMetadata(compiled) {
  assertObject(compiled, 'compiled');
  const metadata = COMPILED_METADATA.get(compiled);
  if (!metadata) {
    throw new TypeError('compiled must be created by compileFilterState');
  }
  if (compiled.error !== null && !(compiled.error instanceof Error)) {
    throw new TypeError('compiled.error must be an Error or null');
  }
  if (compiled.ast !== metadata.ast || compiled.error !== metadata.error) {
    throw new TypeError('compiled does not match its registered metadata');
  }
  return metadata;
}

function snapshotWorkFilterIds(value, name, limit, { allowSet = false } = {}) {
  let ids;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(`${name} must use the standard Array prototype`);
    }
    ids = immutableArraySnapshot(value, name, limit);
  } else if (allowSet) {
    ids = immutableStandardSetSnapshot(value, name, limit);
  } else {
    throw new TypeError(`${name} must be an array${allowSet ? ' or Set' : ''}`);
  }
  if (ids === null) {
    throw new RangeError(`${name} exceeds the ${limit} entry limit`);
  }

  const seen = new Set();
  for (const id of ids) {
    const error = filterIdError(id, `${name} entries`);
    if (error) {
      throw error;
    }
    if (seen.has(id)) {
      throw new TypeError(`${name} must contain unique IDs`);
    }
    seen.add(id);
  }
  return ids;
}

function assertWork(work) {
  assertObject(work, 'work');
  const values = new Map(WORK_FIELDS.map(field => [
    field,
    ownDataValue(work, field, 'work')
  ]));
  const median = values.get('median');
  const voteCount = values.get('voteCount');
  const brandId = values.get('brandId');
  const rawGenre = values.get('rawGenre');

  if (median !== null && typeof median !== 'number') {
    throw new TypeError('work.median must be null or a finite number');
  }
  if (median !== null && !Number.isFinite(median)) {
    throw new RangeError('work.median must be null or finite');
  }

  if (voteCount !== null && typeof voteCount !== 'number') {
    throw new TypeError('work.voteCount must be null or an integer');
  }
  if (voteCount !== null && (!Number.isInteger(voteCount) || voteCount < 0)) {
    throw new RangeError('work.voteCount must be null or a non-negative integer');
  }

  if (typeof brandId !== 'string' || brandId.length === 0) {
    throw new TypeError('work.brandId must be a non-empty string');
  }
  if (typeof rawGenre !== 'string') {
    throw new TypeError('work.rawGenre must be a string');
  }
  if (rawGenre.length > MAX_RAW_GENRE_LENGTH) {
    throw new RangeError(`work.rawGenre exceeds ${MAX_RAW_GENRE_LENGTH} characters`);
  }
  snapshotWorkFilterIds(
    values.get('rawFilterIds'),
    'work.rawFilterIds',
    MAX_CONTENT_FILTER_IDS
  );
  const filterIds = snapshotWorkFilterIds(
    values.get('filterIds'),
    'work.filterIds',
    MAX_CONTENT_FILTER_IDS,
    { allowSet: true }
  );
  const genreFilterIds = snapshotWorkFilterIds(
    values.get('genreFilterIds'),
    'work.genreFilterIds',
    MAX_GENRE_FILTER_IDS
  );
  const platformFilterId = Object.hasOwn(work, 'platformFilterId')
    ? ownDataValue(work, 'platformFilterId', 'work')
    : filterIds.find(filterId => filterId.startsWith('platform-')) ?? 'platform-pc';
  const platformError = filterIdError(platformFilterId, 'work.platformFilterId');
  if (platformError) throw platformError;
  const isNukige = Object.hasOwn(work, 'isNukige')
    ? ownDataValue(work, 'isNukige', 'work')
    : false;
  if (typeof isNukige !== 'boolean') throw new TypeError('work.isNukige must be a boolean when present');
  const externalAdmissionVisible = Object.hasOwn(work, 'externalAdmissionVisible')
    ? ownDataValue(work, 'externalAdmissionVisible', 'work')
    : false;
  if (typeof externalAdmissionVisible !== 'boolean') throw new TypeError('work.externalAdmissionVisible must be a boolean when present');

  return {
    median,
    voteCount,
    brandId,
    filterIds: new Set([...filterIds, ...genreFilterIds, platformFilterId]),
    isNukige,
    externalAdmissionVisible
  };
}

function preparedWorkSnapshotMatches(workSnapshot, ast, prepared) {
  const state = prepared.stateSnapshot;
  const hasTitleQuery = state.hasTitleQuery;
  const medianFails = workSnapshot.median === null
    ? !hasTitleQuery && !workSnapshot.externalAdmissionVisible
    : workSnapshot.median < state.minimumScore;
  const voteCountFails = workSnapshot.voteCount === null
    ? !hasTitleQuery && !workSnapshot.externalAdmissionVisible
    : workSnapshot.voteCount < state.minimumVoteCount;

  if (medianFails || voteCountFails) {
    return false;
  }
  if (prepared.brandIds.size > 0 && !prepared.brandIds.has(workSnapshot.brandId)) {
    return false;
  }
  if (state.excludeNukige && workSnapshot.isNukige) return false;
  if (state.personIds.length > 0) return false;
  return ast === null || evaluateFormula(ast, workSnapshot.filterIds);
}

function preparedWorkMatches(work, ast, prepared) {
  return preparedWorkSnapshotMatches(assertWork(work), ast, prepared);
}

function compileFilterStateInternal(state, knownFilterIds) {
  const stateSnapshot = snapshotState(state);
  assertCoreState(stateSnapshot);
  const knownIds = validateKnownFilterIds(knownFilterIds);
  const signature = tagSignature(stateSnapshot);
  const validationError = tagStateError(stateSnapshot);
  if (validationError) {
    return createCompiled(stateSnapshot, signature, null, validationError);
  }

  assertFormulaErrorConstructionBoundary();

  let source;
  if (stateSnapshot.mode === 'basic') {
    try {
      const sources = [
        attributeSelectionsToFormula(stateSnapshot.attributeSelections),
        basicToFormula(
        stateSnapshot.positiveFilterIds,
        stateSnapshot.excludedFilterIds,
        stateSnapshot.basicOperator
        )
      ].filter(Boolean);
      source = sources.map(value => `(${value})`).join(' AND ');
    } catch (error) {
      if (acceptFormulaError(error)) {
        return createCompiled(stateSnapshot, signature, null, error);
      }
      throw error;
    }
  } else {
    source = stateSnapshot.advancedExpression;
  }

  if (source.length === 0 || (stateSnapshot.mode === 'advanced' && source.trim().length === 0)) {
    return createCompiled(stateSnapshot, signature, null, null);
  }

  try {
    const ast = parseFormula(source, knownIds);
    return createCompiled(stateSnapshot, signature, ast, null);
  } catch (error) {
    if (acceptFormulaError(error)) {
      return createCompiled(stateSnapshot, signature, null, error);
    }
    throw error;
  }
}

export function compileFilterState(state, knownFilterIds) {
  return runCompileInvocation(() => compileFilterStateInternal(state, knownFilterIds));
}

export function workMatches(work, state, compiled) {
  const metadata = compiledMetadata(compiled);
  const stateSnapshot = snapshotState(state);
  assertCoreState(stateSnapshot);
  const currentSignature = tagSignature(stateSnapshot);
  if (currentSignature !== metadata.tagSignature) {
    throw new RangeError('compiled does not match the current tag state');
  }

  const validationError = tagStateError(stateSnapshot);
  if (compiled.error !== null) {
    throw compiled.error;
  }
  if (validationError) {
    throw validationError;
  }

  const prepared = {
    stateSnapshot,
    brandIds: new Set(stateSnapshot.brandIds)
  };
  return preparedWorkMatches(work, compiled.ast, prepared);
}

export function filterWorks(works, state, knownFilterIds) {
  const compiled = compileFilterState(state, knownFilterIds);
  const metadata = compiledMetadata(compiled);
  if (compiled.error !== null) {
    throw compiled.error;
  }

  const workSnapshot = snapshotWorksArray(works);
  const result = [];
  for (let index = 0; index < workSnapshot.length; index += 1) {
    const work = workSnapshot[index];
    if (preparedWorkMatches(work, compiled.ast, metadata)) {
      appendArrayDataProperty(result, work);
    }
  }
  return result;
}

export function countFilteredWorksBatch(works, states, knownFilterIds) {
  const workInputs = snapshotWorksArray(works);
  const workSnapshots = workInputs.map(work => assertWork(work));
  const stateInputs = snapshotBatchStates(states);
  const preparedStates = stateInputs.map(state => {
    const compiled = compileFilterState(state, knownFilterIds);
    if (compiled.error !== null) throw compiled.error;
    return { ast: compiled.ast, metadata: compiledMetadata(compiled) };
  });

  return preparedStates.map(prepared => {
    let count = 0;
    for (const workSnapshot of workSnapshots) {
      if (preparedWorkSnapshotMatches(workSnapshot, prepared.ast, prepared.metadata)) count += 1;
    }
    return count;
  });
}
