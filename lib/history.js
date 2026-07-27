import { MAX_TIERS, MIN_TIERS, TIER_NAME_MAX_LENGTH } from './tier-config.js';
import { TIER_COLOR_IDS } from './tier-palette.js';

const TIER_COLOR_ID_SET = new Set(TIER_COLOR_IDS);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_WORK_IDS = 100;
const MAX_ID_LENGTH = 128;
const MAX_HISTORY_LIMIT = 100;
const INTERNAL_HISTORY_ERRORS = new WeakMap();
let activeInvocation = null;

export class HistoryValidationError extends Error {
  constructor(message, { code = 'INVALID_HISTORY_INPUT', path, cause } = {}) {
    super(message);
    this.name = 'HistoryValidationError';
    this.code = code;
    if (path !== undefined) {
      this.path = path;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function historyError(code, message, path, cause) {
  const error = new HistoryValidationError(message, { code, path, cause });
  INTERNAL_HISTORY_ERRORS.set(error, activeInvocation);
  return error;
}

function withValidationBoundary(operation) {
  const previousInvocation = activeInvocation;
  const invocation = {};
  activeInvocation = invocation;
  try {
    try {
      return operation();
    } catch (error) {
      if (INTERNAL_HISTORY_ERRORS.get(error) === invocation) {
        throw error;
      }
      throw historyError(
        'UNEXPECTED_INPUT',
        'Unexpected failure while validating history input',
        undefined,
        error
      );
    }
  } finally {
    activeInvocation = previousInvocation;
  }
}

function createDataObject(entries) {
  const result = Object.create(Object.prototype);
  for (const [key, value] of entries) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  }
  return result;
}

function assertPlainObject(value, path, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw historyError(code, `${path} must be a standard plain object`, path);
  }
}

function ownDataProperty(value, key, path, code) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw historyError(code, `${path} must be an own data property`, path);
  }
  return descriptor.value;
}

function assertExactKeys(value, expectedKeys, path, code) {
  const keys = Reflect.ownKeys(value);
  const expected = new Set(expectedKeys);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expected.has(key))
  ) {
    throw historyError(
      code,
      `${path} must contain exactly ${expectedKeys.join(', ')}`,
      path
    );
  }
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotArray(value, { path, code, maxLength }) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw historyError(code, `${path} must use the standard Array prototype`, path);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw historyError(code, `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  if (length > maxLength) {
    throw historyError(code, `${path} exceeds the ${maxLength} item limit`, path);
  }

  const keys = Reflect.ownKeys(value);
  const indexes = new Set();
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      throw historyError(code, `${path} contains an unexpected property`, path);
    }
    indexes.add(key);
  }
  if (indexes.size !== length) {
    throw historyError(code, `${path} must not be sparse`, path);
  }

  const result = [];
  for (let index = 0; index < length; index += 1) {
    result.push(ownDataProperty(value, String(index), `${path}[${index}]`, code));
  }
  return result;
}

function isSafeWorkId(value) {
  return typeof value === 'string'
    && value.length <= MAX_ID_LENGTH
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_PROPERTY_KEYS.has(value);
}

function snapshotSelectedWorkIds(value, path, code) {
  const selectedWorkIds = snapshotArray(value, {
    path,
    code,
    maxLength: MAX_WORK_IDS
  });
  const selectedSet = new Set();
  for (let index = 0; index < selectedWorkIds.length; index += 1) {
    const workId = selectedWorkIds[index];
    const itemPath = `${path}[${index}]`;
    if (!isSafeWorkId(workId)) {
      throw historyError(code, `${itemPath} must be a safe work ID`, itemPath);
    }
    if (selectedSet.has(workId)) {
      throw historyError(code, `${path} contains duplicate work ID ${workId}`, itemPath);
    }
    selectedSet.add(workId);
  }
  return { selectedWorkIds, selectedSet };
}

function snapshotTiers(value, path, code) {
  const rawTiers = snapshotArray(value, { path, code, maxLength: MAX_TIERS });
  if (rawTiers.length < MIN_TIERS) {
    throw historyError(
      code,
      `${path} must contain ${MIN_TIERS} to ${MAX_TIERS} tiers`,
      path
    );
  }

  const tiers = [];
  const tierIds = new Set();
  for (let index = 0; index < rawTiers.length; index += 1) {
    const tier = rawTiers[index];
    const tierPath = `${path}[${index}]`;
    assertPlainObject(tier, tierPath, code);
    assertExactKeys(tier, ['id', 'name', 'colorId'], tierPath, code);
    const id = ownDataProperty(tier, 'id', `${tierPath}.id`, code);
    const name = ownDataProperty(tier, 'name', `${tierPath}.name`, code);
    const colorId = ownDataProperty(tier, 'colorId', `${tierPath}.colorId`, code);
    if (!isSafeWorkId(id)) {
      throw historyError(code, `${tierPath}.id must be a safe tier ID`, `${tierPath}.id`);
    }
    if (tierIds.has(id)) {
      throw historyError(code, `${path} contains duplicate tier ID ${id}`, `${tierPath}.id`);
    }
    if (
      typeof name !== 'string'
      || [...name.trim()].length < 1
      || [...name.trim()].length > TIER_NAME_MAX_LENGTH
    ) {
      throw historyError(code, `${tierPath}.name is invalid`, `${tierPath}.name`);
    }
    if (typeof colorId !== 'string' || !TIER_COLOR_ID_SET.has(colorId)) {
      throw historyError(code, `${tierPath}.colorId is invalid`, `${tierPath}.colorId`);
    }
    tierIds.add(id);
    tiers.push(createDataObject([
      ['id', id],
      ['name', name.trim()],
      ['colorId', colorId]
    ]));
  }
  return tiers;
}

function snapshotTierOrder(value, tiers, selectedSet, path, code) {
  assertPlainObject(value, path, code);
  const tierIds = tiers.map(tier => tier.id);
  assertExactKeys(value, tierIds, path, code);

  const ranked = new Set();
  const rows = new Map();
  for (const tierId of tierIds) {
    const tierPath = `${path}.${tierId}`;
    const row = snapshotArray(
      ownDataProperty(value, tierId, tierPath, code),
      { path: tierPath, code, maxLength: MAX_WORK_IDS }
    );
    for (let index = 0; index < row.length; index += 1) {
      const workId = row[index];
      const itemPath = `${tierPath}[${index}]`;
      if (!isSafeWorkId(workId)) {
        throw historyError(code, `${itemPath} must be a safe work ID`, itemPath);
      }
      if (ranked.has(workId)) {
        throw historyError(code, `work ID ${workId} appears in multiple tiers`, itemPath);
      }
      if (!selectedSet.has(workId)) {
        throw historyError(code, `${itemPath} is not selected`, itemPath);
      }
      ranked.add(workId);
      if (ranked.size > MAX_WORK_IDS) {
        throw historyError(code, `${path} exceeds the ${MAX_WORK_IDS} work limit`, path);
      }
    }
    rows.set(tierId, row);
  }

  return createDataObject(tierIds.map(tierId => [tierId, rows.get(tierId)]));
}

function snapshotEdit(value, {
  path = 'snapshot',
  exact = true,
  containerCode = 'INVALID_SNAPSHOT',
  selectedCode = 'INVALID_SELECTED_WORK_IDS',
  tiersCode = 'INVALID_TIERS',
  tierCode = 'INVALID_TIER_ORDER'
} = {}) {
  assertPlainObject(value, path, containerCode);
  if (exact) {
    assertExactKeys(value, ['selectedWorkIds', 'tiers', 'tierOrder'], path, containerCode);
  }

  const selectedPath = `${path}.selectedWorkIds`;
  const tiersPath = `${path}.tiers`;
  const tierPath = `${path}.tierOrder`;
  const { selectedWorkIds, selectedSet } = snapshotSelectedWorkIds(
    ownDataProperty(value, 'selectedWorkIds', selectedPath, containerCode),
    selectedPath,
    selectedCode
  );
  const tiers = snapshotTiers(
    ownDataProperty(value, 'tiers', tiersPath, containerCode),
    tiersPath,
    tiersCode
  );
  const tierOrder = snapshotTierOrder(
    ownDataProperty(value, 'tierOrder', tierPath, containerCode),
    tiers,
    selectedSet,
    tierPath,
    tierCode
  );

  return createDataObject([
    ['selectedWorkIds', selectedWorkIds],
    ['tiers', tiers],
    ['tierOrder', tierOrder]
  ]);
}

function snapshotOptions(options) {
  if (options === undefined) {
    return MAX_HISTORY_LIMIT;
  }
  assertPlainObject(options, 'options', 'INVALID_HISTORY_OPTIONS');
  const keys = Reflect.ownKeys(options);
  if (
    keys.length > 1
    || keys.some(key => key !== 'limit')
  ) {
    throw historyError(
      'INVALID_HISTORY_OPTIONS',
      'options may contain only limit',
      'options'
    );
  }
  const suppliedLimit = keys.length === 0
    ? undefined
    : ownDataProperty(options, 'limit', 'options.limit', 'INVALID_HISTORY_OPTIONS');
  const limit = suppliedLimit === undefined ? MAX_HISTORY_LIMIT : suppliedLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
    throw historyError(
      'INVALID_HISTORY_LIMIT',
      `limit must be an integer from 1 through ${MAX_HISTORY_LIMIT}`,
      'options.limit'
    );
  }
  return limit;
}

function createHistoryObject(past, present, future, limit) {
  return createDataObject([
    ['past', past],
    ['present', present],
    ['future', future],
    ['limit', limit]
  ]);
}

function snapshotHistory(value) {
  assertPlainObject(value, 'history', 'INVALID_HISTORY');
  assertExactKeys(
    value,
    ['past', 'present', 'future', 'limit'],
    'history',
    'INVALID_HISTORY'
  );

  const limit = ownDataProperty(value, 'limit', 'history.limit', 'INVALID_HISTORY');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
    throw historyError(
      'INVALID_HISTORY',
      `history.limit must be an integer from 1 through ${MAX_HISTORY_LIMIT}`,
      'history.limit'
    );
  }

  const snapshotConfig = {
    containerCode: 'INVALID_HISTORY',
    selectedCode: 'INVALID_HISTORY',
    tiersCode: 'INVALID_HISTORY',
    tierCode: 'INVALID_HISTORY'
  };
  const rawPast = snapshotArray(
    ownDataProperty(value, 'past', 'history.past', 'INVALID_HISTORY'),
    { path: 'history.past', code: 'INVALID_HISTORY', maxLength: limit }
  );
  const present = snapshotEdit(
    ownDataProperty(value, 'present', 'history.present', 'INVALID_HISTORY'),
    { ...snapshotConfig, path: 'history.present' }
  );
  const rawFuture = snapshotArray(
    ownDataProperty(value, 'future', 'history.future', 'INVALID_HISTORY'),
    { path: 'history.future', code: 'INVALID_HISTORY', maxLength: limit }
  );
  if (rawPast.length + rawFuture.length > limit) {
    throw historyError(
      'INVALID_HISTORY',
      'history past and future entries must not exceed history.limit',
      'history'
    );
  }
  const past = rawPast.map((snapshot, index) => snapshotEdit(snapshot, {
    ...snapshotConfig,
    path: `history.past[${index}]`
  }));
  const future = rawFuture.map((snapshot, index) => snapshotEdit(snapshot, {
    ...snapshotConfig,
    path: `history.future[${index}]`
  }));

  return createHistoryObject(past, present, future, limit);
}

function snapshotsEqual(left, right) {
  if (left.selectedWorkIds.length !== right.selectedWorkIds.length) {
    return false;
  }
  for (let index = 0; index < left.selectedWorkIds.length; index += 1) {
    if (left.selectedWorkIds[index] !== right.selectedWorkIds[index]) {
      return false;
    }
  }
  if (left.tiers.length !== right.tiers.length) {
    return false;
  }
  for (let index = 0; index < left.tiers.length; index += 1) {
    const leftTier = left.tiers[index];
    const rightTier = right.tiers[index];
    if (
      leftTier.id !== rightTier.id
      || leftTier.name !== rightTier.name
      || leftTier.colorId !== rightTier.colorId
    ) {
      return false;
    }
  }
  for (const { id: tierId } of left.tiers) {
    const leftRow = left.tierOrder[tierId];
    const rightRow = right.tierOrder[tierId];
    if (leftRow.length !== rightRow.length) {
      return false;
    }
    for (let index = 0; index < leftRow.length; index += 1) {
      if (leftRow[index] !== rightRow[index]) {
        return false;
      }
    }
  }
  return true;
}

export function createEditSnapshot(input) {
  return withValidationBoundary(() => snapshotEdit(input, {
    exact: false,
    path: 'snapshot'
  }));
}

export function createHistory(initialSnapshot, options) {
  return withValidationBoundary(() => createHistoryObject(
    [],
    snapshotEdit(initialSnapshot),
    [],
    snapshotOptions(options)
  ));
}

export function commitHistory(history, nextSnapshot) {
  return withValidationBoundary(() => {
    const current = snapshotHistory(history);
    const next = snapshotEdit(nextSnapshot);
    if (snapshotsEqual(current.present, next)) {
      return current;
    }

    const past = [...current.past, current.present];
    if (past.length > current.limit) {
      past.splice(0, past.length - current.limit);
    }
    return createHistoryObject(past, next, [], current.limit);
  });
}

export function undoHistory(history) {
  return withValidationBoundary(() => {
    const current = snapshotHistory(history);
    if (current.past.length === 0) {
      return current;
    }

    const present = current.past[current.past.length - 1];
    const past = current.past.slice(0, -1);
    const future = [current.present, ...current.future];
    return createHistoryObject(past, present, future, current.limit);
  });
}

export function redoHistory(history) {
  return withValidationBoundary(() => {
    const current = snapshotHistory(history);
    if (current.future.length === 0) {
      return current;
    }

    const past = [...current.past, current.present];
    if (past.length > current.limit) {
      past.splice(0, past.length - current.limit);
    }
    return createHistoryObject(
      past,
      current.future[0],
      current.future.slice(1),
      current.limit
    );
  });
}

export function resetHistory(history, snapshot) {
  return withValidationBoundary(() => {
    const current = snapshotHistory(history);
    const present = snapshotEdit(snapshot);
    return createHistoryObject([], present, [], current.limit);
  });
}

export function canUndo(history) {
  return withValidationBoundary(() => snapshotHistory(history).past.length > 0);
}

export function canRedo(history) {
  return withValidationBoundary(() => snapshotHistory(history).future.length > 0);
}
