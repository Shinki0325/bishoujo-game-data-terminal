import { MAX_TIERS, MIN_TIERS } from './tier-config.js';

const MAX_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TOGGLE_INPUT_FIELDS = new Set([
  'tiers',
  'resultWorkIds',
  'selectedWorkIds',
  'tierOrder',
  'bulkConfirmThreshold'
]);
const REQUIRED_TOGGLE_FIELDS = ['tiers', 'resultWorkIds', 'selectedWorkIds', 'tierOrder'];
const INTERNAL_SELECTION_ERRORS = new WeakMap();
let activeInvocation = null;

export class SelectionValidationError extends Error {}

function selectionError(code, message, path, cause) {
  const error = new SelectionValidationError(message);
  error.name = 'SelectionValidationError';
  error.code = code;
  if (path !== undefined) {
    error.path = path;
  }
  if (cause !== undefined) {
    error.cause = cause;
  }
  INTERNAL_SELECTION_ERRORS.set(error, activeInvocation);
  return error;
}

function runSelectionInvocation(operation) {
  const previousInvocation = activeInvocation;
  activeInvocation = {};
  try {
    return operation();
  } finally {
    activeInvocation = previousInvocation;
  }
}

function withValidationBoundary(operation) {
  return runSelectionInvocation(() => {
    try {
      return operation();
    } catch (error) {
      if (
        activeInvocation !== null
        && INTERNAL_SELECTION_ERRORS.get(error) === activeInvocation
      ) {
        throw error;
      }
      throw selectionError(
        'UNEXPECTED_INPUT',
        'Unexpected failure while validating selection input',
        undefined,
        error
      );
    }
  });
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotIdList(value, path, invalidCode = 'INVALID_INPUT') {
  if (!Array.isArray(value)) {
    throw selectionError(invalidCode, `${path} must be an Array`, path);
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw selectionError(invalidCode, `${path} must use the standard Array prototype`, path);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw selectionError(invalidCode, `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(value);
  const indexKeys = new Set();
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      throw selectionError(invalidCode, `${path} contains an unexpected property`, path);
    }
    indexKeys.add(key);
  }
  if (indexKeys.size !== length) {
    throw selectionError(invalidCode, `${path} must not be sparse`, path);
  }

  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const indexPath = `${path}[${index}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw selectionError(invalidCode, `${indexPath} must be a data property`, indexPath);
    }
    const workId = descriptor.value;
    if (typeof workId !== 'string' || workId.length === 0) {
      throw selectionError(invalidCode, `${indexPath} must be a non-empty string`, indexPath);
    }
    snapshot.push(workId);
  }
  return snapshot;
}

function snapshotPlainObject(value, path, invalidCode) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw selectionError(invalidCode, `${path} must be a plain object`, path);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw selectionError(invalidCode, `${path} must be a plain object`, path);
  }
  return value;
}

function assertUniqueIds(ids, path) {
  const seen = new Set();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (seen.has(id)) {
      throw selectionError(
        'DUPLICATE_ID',
        `${path} contains duplicate work ID ${id}`,
        `${path}[${index}]`
      );
    }
    seen.add(id);
  }
}

function snapshotUniqueIdList(value, path, invalidCode = 'INVALID_INPUT') {
  const snapshot = snapshotIdList(value, path, invalidCode);
  assertUniqueIds(snapshot, path);
  return snapshot;
}

function snapshotTierIds(tiers) {
  const values = snapshotIdListLike(tiers, 'tiers');
  if (values.length < MIN_TIERS || values.length > MAX_TIERS) {
    throw selectionError(
      'INVALID_TIERS',
      `tiers must contain ${MIN_TIERS} to ${MAX_TIERS} tiers`,
      'tiers'
    );
  }
  const tierIds = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const tier = values[index];
    const path = `tiers[${index}]`;
    if (
      tier === null
      || typeof tier !== 'object'
      || Array.isArray(tier)
      || Object.getPrototypeOf(tier) !== Object.prototype
    ) {
      throw selectionError('INVALID_TIERS', `${path} must be a standard plain object`, path);
    }
    const keys = Reflect.ownKeys(tier);
    if (
      keys.length !== 3
      || keys.some(key => typeof key !== 'string' || !['id', 'name', 'colorId'].includes(key))
    ) {
      throw selectionError('INVALID_TIERS', `${path} has an invalid shape`, path);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(tier, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw selectionError('INVALID_TIERS', `${path}.${key} must be a data property`, `${path}.${key}`);
      }
    }
    const id = Object.getOwnPropertyDescriptor(tier, 'id').value;
    if (
      typeof id !== 'string'
      || id.length > MAX_ID_LENGTH
      || !SAFE_ID_PATTERN.test(id)
      || UNSAFE_PROPERTY_KEYS.has(id)
    ) {
      throw selectionError('INVALID_TIERS', `${path}.id must be a safe tier ID`, `${path}.id`);
    }
    if (seen.has(id)) {
      throw selectionError('DUPLICATE_TIER_ID', `tiers contains duplicate tier ID ${id}`, `${path}.id`);
    }
    seen.add(id);
    tierIds.push(id);
  }
  return tierIds;
}

function snapshotIdListLike(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw selectionError('INVALID_TIERS', `${path} must use the standard Array prototype`, path);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw selectionError('INVALID_TIERS', `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_TIERS) {
    throw selectionError('INVALID_TIERS', `${path} has an invalid length`, path);
  }
  const keys = Reflect.ownKeys(value);
  const indexes = new Set();
  for (const key of keys) {
    if (key === 'length') continue;
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      throw selectionError('INVALID_TIERS', `${path} contains an unexpected property`, path);
    }
    indexes.add(key);
  }
  if (indexes.size !== length) {
    throw selectionError('INVALID_TIERS', `${path} must not be sparse`, path);
  }
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw selectionError('INVALID_TIERS', `${path}[${index}] must be a data property`, `${path}[${index}]`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function assertAuthorityContains(ids, authority, path) {
  const authoritySet = new Set(authority);
  for (let index = 0; index < ids.length; index += 1) {
    if (!authoritySet.has(ids[index])) {
      throw selectionError(
        'UNKNOWN_WORK_ID',
        `${path}[${index}] contains work ID ${ids[index]} outside the authority set`,
        `${path}[${index}]`
      );
    }
  }
}

function snapshotTierOrder(value, tierIds, selectedWorkIds) {
  snapshotPlainObject(value, 'tierOrder', 'INVALID_TIER_ORDER');
  const keys = Reflect.ownKeys(value);
  const tierIdSet = new Set(tierIds);
  if (keys.length !== tierIds.length || keys.some(key => !tierIdSet.has(key))) {
    throw selectionError(
      'INVALID_TIER_ORDER',
      'tierOrder must contain exactly the current tier rows',
      'tierOrder'
    );
  }

  const selectedSet = new Set(selectedWorkIds);
  const rankedSet = new Set();
  const snapshot = {};
  for (const tierId of tierIds) {
    const descriptor = Object.getOwnPropertyDescriptor(value, tierId);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw selectionError(
        'INVALID_TIER_ORDER',
        `tierOrder.${tierId} must be a data property`,
        `tierOrder.${tierId}`
      );
    }
    const row = snapshotIdList(
      descriptor.value,
      `tierOrder.${tierId}`,
      'INVALID_TIER_ORDER'
    );
    for (let index = 0; index < row.length; index += 1) {
      const workId = row[index];
      if (rankedSet.has(workId)) {
        throw selectionError(
          'DUPLICATE_TIER_PLACEMENT',
          `work ID ${workId} appears in more than one tier`,
          `tierOrder.${tierId}[${index}]`
        );
      }
      if (!selectedSet.has(workId)) {
        throw selectionError(
          'UNSELECTED_RANKED_WORK',
          `tierOrder.${tierId} contains unselected work ID ${workId}`,
          `tierOrder.${tierId}[${index}]`
        );
      }
      rankedSet.add(workId);
    }
    snapshot[tierId] = row;
  }

  return { tierOrder: snapshot, rankedSet };
}

function snapshotToggleInput(input) {
  snapshotPlainObject(input, 'input', 'INVALID_INPUT');
  const keys = Reflect.ownKeys(input);
  if (keys.some(key => !TOGGLE_INPUT_FIELDS.has(key))) {
    throw selectionError('INVALID_INPUT', 'input contains an unexpected property', 'input');
  }

  const fields = {};
  for (const field of REQUIRED_TOGGLE_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor) {
      throw selectionError('MISSING_INPUT_FIELD', `input.${field} is required`, `input.${field}`);
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      throw selectionError('INVALID_INPUT', `input.${field} must be a data property`, `input.${field}`);
    }
    fields[field] = descriptor.value;
  }

  const thresholdDescriptor = Object.getOwnPropertyDescriptor(input, 'bulkConfirmThreshold');
  if (thresholdDescriptor) {
    if (!Object.hasOwn(thresholdDescriptor, 'value')) {
      throw selectionError(
        'INVALID_INPUT',
        'input.bulkConfirmThreshold must be a data property',
        'input.bulkConfirmThreshold'
      );
    }
    fields.bulkConfirmThreshold = thresholdDescriptor.value;
  } else {
    fields.bulkConfirmThreshold = 200;
  }
  return fields;
}

function validateSelectionAndTiers(tiers, selectedWorkIds, tierOrder) {
  const tierIds = snapshotTierIds(tiers);
  const selected = snapshotUniqueIdList(selectedWorkIds, 'selectedWorkIds');
  const order = snapshotTierOrder(tierOrder, tierIds, selected);
  return { tierIds, selected, tierOrder: order.tierOrder, rankedSet: order.rankedSet };
}

function assertDeselectIds(workIds, selected) {
  const selectedSet = new Set(selected);
  for (let index = 0; index < workIds.length; index += 1) {
    if (!selectedSet.has(workIds[index])) {
      throw selectionError(
        'WORK_ID_NOT_SELECTED',
        `workIds[${index}] contains work ID ${workIds[index]} that is not selected`,
        `workIds[${index}]`
      );
    }
  }
}

export function selectionStateForResults(resultWorkIds, selectedWorkIds) {
  return withValidationBoundary(() => {
    const results = snapshotUniqueIdList(resultWorkIds, 'resultWorkIds');
    const selected = snapshotUniqueIdList(selectedWorkIds, 'selectedWorkIds');
    if (results.length === 0) {
      return 'none';
    }

    const selectedSet = new Set(selected);
    const selectedCount = results.filter(workId => selectedSet.has(workId)).length;
    if (selectedCount === 0) {
      return 'none';
    }
    return selectedCount === results.length ? 'all' : 'some';
  });
}

export function selectWorks(selectedWorkIds, workIds, authorityWorkIds) {
  return withValidationBoundary(() => {
    const selected = snapshotUniqueIdList(selectedWorkIds, 'selectedWorkIds');
    const candidates = snapshotUniqueIdList(workIds, 'workIds');
    const authority = snapshotUniqueIdList(authorityWorkIds, 'authorityWorkIds');
    assertAuthorityContains(selected, authority, 'selectedWorkIds');
    assertAuthorityContains(candidates, authority, 'workIds');

    const selectedSet = new Set(selected);
    const nextSelectedWorkIds = selected.map(workId => workId);
    for (const workId of candidates) {
      if (!selectedSet.has(workId)) {
        selectedSet.add(workId);
        nextSelectedWorkIds.push(workId);
      }
    }
    return nextSelectedWorkIds;
  });
}

export function planDeselectWorks(tiers, selectedWorkIds, tierOrder, workIds) {
  return withValidationBoundary(() => {
    const validated = validateSelectionAndTiers(tiers, selectedWorkIds, tierOrder);
    const workIdsSnapshot = snapshotUniqueIdList(workIds, 'workIds');
    assertDeselectIds(workIdsSnapshot, validated.selected);
    const rankedWorkIds = workIdsSnapshot.filter(workId => validated.rankedSet.has(workId));

    return {
      action: 'deselect',
      workIds: workIdsSnapshot,
      rankedWorkIds,
      requiresRankedConfirmation: rankedWorkIds.length > 0
    };
  });
}

export function applyDeselectWorks(tiers, selectedWorkIds, tierOrder, workIds) {
  return withValidationBoundary(() => {
    const validated = validateSelectionAndTiers(tiers, selectedWorkIds, tierOrder);
    const workIdsSnapshot = snapshotUniqueIdList(workIds, 'workIds');
    assertDeselectIds(workIdsSnapshot, validated.selected);
    const removeSet = new Set(workIdsSnapshot);

    return {
      selectedWorkIds: validated.selected.filter(workId => !removeSet.has(workId)),
      tierOrder: Object.fromEntries(
        validated.tierIds.map(tierId => [
          tierId,
          validated.tierOrder[tierId].filter(workId => !removeSet.has(workId))
        ])
      )
    };
  });
}

export function planCurrentResultToggle(input) {
  return withValidationBoundary(() => {
    const {
      resultWorkIds,
      tiers,
      selectedWorkIds,
      tierOrder,
      bulkConfirmThreshold
    } = snapshotToggleInput(input);
    if (!Number.isInteger(bulkConfirmThreshold) || bulkConfirmThreshold < 0) {
      throw selectionError(
        'INVALID_INPUT',
        'input.bulkConfirmThreshold must be a non-negative integer',
        'input.bulkConfirmThreshold'
      );
    }

    const results = snapshotUniqueIdList(resultWorkIds, 'resultWorkIds');
    const validated = validateSelectionAndTiers(tiers, selectedWorkIds, tierOrder);
    const selectedSet = new Set(validated.selected);
    const selectedCount = results.filter(workId => selectedSet.has(workId)).length;
    const selectionState = selectedCount === 0
      ? 'none'
      : selectedCount === results.length ? 'all' : 'some';

    if (selectionState !== 'all') {
      const workIds = results.filter(workId => !selectedSet.has(workId));
      return {
        action: 'select',
        workIds,
        requiresLargeSelectionConfirmation: workIds.length > bulkConfirmThreshold
      };
    }

    const rankedWorkIds = results.filter(workId => validated.rankedSet.has(workId));
    return {
      action: 'deselect',
      workIds: results,
      rankedWorkIds,
      requiresRankedConfirmation: rankedWorkIds.length > 0,
      requiresLargeSelectionConfirmation: false
    };
  });
}

export function deriveUnrankedWorkIds(tiers, selectedWorkIds, tierOrder) {
  return withValidationBoundary(() => {
    const validated = validateSelectionAndTiers(tiers, selectedWorkIds, tierOrder);
    return validated.selected.filter(workId => !validated.rankedSet.has(workId));
  });
}
