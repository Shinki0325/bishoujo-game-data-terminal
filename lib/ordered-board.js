const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
import { MAX_TIERS, MIN_TIERS } from './tier-config.js';
import { USER_WORK_LIMIT } from './work-limit.js';

const MAX_WORK_IDS = USER_WORK_LIMIT;
const MAX_ID_LENGTH = 128;
const INTERNAL_ORDERED_BOARD_ERRORS = new WeakMap();
let activeInvocation = null;

export class OrderedBoardValidationError extends Error {
  constructor(message, { code = 'INVALID_ORDERED_BOARD_INPUT', path, cause } = {}) {
    super(message);
    this.name = 'OrderedBoardValidationError';
    this.code = code;
    if (path !== undefined) {
      this.path = path;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function orderedBoardError(code, message, path, cause) {
  const error = new OrderedBoardValidationError(message, { code, path, cause });
  INTERNAL_ORDERED_BOARD_ERRORS.set(error, activeInvocation);
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
      if (INTERNAL_ORDERED_BOARD_ERRORS.get(error) === invocation) {
        throw error;
      }
      throw orderedBoardError(
        'UNEXPECTED_INPUT',
        'Unexpected failure while validating ordered board input',
        undefined,
        error
      );
    }
  } finally {
    activeInvocation = previousInvocation;
  }
}

function isSafeWorkId(value) {
  return typeof value === 'string'
    && value.length <= MAX_ID_LENGTH
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_PROPERTY_KEYS.has(value);
}

function assertSafeWorkId(value, path, code) {
  if (!isSafeWorkId(value)) {
    throw orderedBoardError(code, `${path} must be a safe work ID`, path);
  }
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotArray(
  value,
  path,
  code,
  maxLength = MAX_WORK_IDS,
  tooLargeCode = 'ORDERED_BOARD_TOO_LARGE'
) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw orderedBoardError(code, `${path} must use the standard Array prototype`, path);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw orderedBoardError(code, `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  if (length > maxLength) {
    throw orderedBoardError(
      tooLargeCode,
      `${path} exceeds the ${maxLength} item limit`,
      path
    );
  }

  const keys = Reflect.ownKeys(value);
  const indexes = new Set();
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      throw orderedBoardError(code, `${path} contains an unexpected property`, path);
    }
    indexes.add(key);
  }
  if (indexes.size !== length) {
    throw orderedBoardError(code, `${path} must not be sparse`, path);
  }

  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw orderedBoardError(code, `${itemPath} must be a data property`, itemPath);
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function snapshotTierIds(tiers) {
  const values = snapshotArray(
    tiers,
    'tiers',
    'INVALID_TIERS',
    MAX_TIERS,
    'INVALID_TIERS'
  );
  if (values.length < MIN_TIERS) {
    throw orderedBoardError(
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
      throw orderedBoardError('INVALID_TIERS', `${path} must be a standard plain object`, path);
    }
    const keys = Reflect.ownKeys(tier);
    if (
      keys.length !== 3
      || keys.some(key => typeof key !== 'string' || !['id', 'name', 'colorId'].includes(key))
    ) {
      throw orderedBoardError('INVALID_TIERS', `${path} has an invalid shape`, path);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(tier, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw orderedBoardError('INVALID_TIERS', `${path}.${key} must be a data property`, `${path}.${key}`);
      }
    }
    const id = Object.getOwnPropertyDescriptor(tier, 'id').value;
    if (!isSafeWorkId(id)) {
      throw orderedBoardError('INVALID_TIER_ID', `${path}.id must be a safe tier ID`, `${path}.id`);
    }
    if (seen.has(id)) {
      throw orderedBoardError('DUPLICATE_TIER_ID', `tiers contains duplicate tier ID ${id}`, `${path}.id`);
    }
    seen.add(id);
    tierIds.push(id);
  }
  return tierIds;
}

function snapshotSelectedWorkIds(selectedWorkIds) {
  const selected = snapshotArray(
    selectedWorkIds,
    'selectedWorkIds',
    'INVALID_SELECTED_WORK_IDS'
  );
  const selectedSet = new Set();
  for (let index = 0; index < selected.length; index += 1) {
    const workId = selected[index];
    const path = `selectedWorkIds[${index}]`;
    assertSafeWorkId(workId, path, 'INVALID_SELECTED_WORK_IDS');
    if (selectedSet.has(workId)) {
      throw orderedBoardError(
        'DUPLICATE_ID',
        `selectedWorkIds contains duplicate work ID ${workId}`,
        path
      );
    }
    selectedSet.add(workId);
  }
  return { selected, selectedSet };
}

function createTierOrder(tierIds, rowForTier) {
  return Object.fromEntries(
    tierIds.map(tierId => [tierId, rowForTier(tierId)])
  );
}

function snapshotTierOrder(tierOrder, tierIds, selectedSet = null) {
  if (
    tierOrder === null
    || typeof tierOrder !== 'object'
    || Array.isArray(tierOrder)
    || Object.getPrototypeOf(tierOrder) !== Object.prototype
  ) {
    throw orderedBoardError(
      'INVALID_TIER_ORDER',
      'tierOrder must be a standard plain object',
      'tierOrder'
    );
  }

  const keys = Reflect.ownKeys(tierOrder);
  if (
    keys.length !== tierIds.length
    || keys.some(key => typeof key !== 'string' || !tierIds.includes(key))
  ) {
    throw orderedBoardError(
      'INVALID_TIER_ORDER',
      'tierOrder must contain exactly the current tier IDs',
      'tierOrder'
    );
  }

  const rows = new Map();
  const ranked = new Set();
  for (const tierId of tierIds) {
    const tierPath = `tierOrder.${tierId}`;
    const descriptor = Object.getOwnPropertyDescriptor(tierOrder, tierId);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw orderedBoardError(
        'INVALID_TIER_ORDER',
        `${tierPath} must be a data property`,
        tierPath
      );
    }

    const row = snapshotArray(descriptor.value, tierPath, 'INVALID_TIER_ORDER');
    for (let index = 0; index < row.length; index += 1) {
      const workId = row[index];
      const path = `${tierPath}[${index}]`;
      assertSafeWorkId(workId, path, 'INVALID_TIER_ORDER');
      if (ranked.has(workId)) {
        throw orderedBoardError(
          'DUPLICATE_TIER_PLACEMENT',
          `work ID ${workId} appears more than once in tierOrder`,
          path
        );
      }
      if (selectedSet !== null && !selectedSet.has(workId)) {
        throw orderedBoardError(
          'UNSELECTED_RANKED_WORK',
          `${path} contains work ID ${workId} that is not selected`,
          path
        );
      }
      ranked.add(workId);
      if (ranked.size > MAX_WORK_IDS) {
        throw orderedBoardError(
          'ORDERED_BOARD_TOO_LARGE',
          `tierOrder exceeds the ${MAX_WORK_IDS} ranked work limit`,
          'tierOrder'
        );
      }
    }
    rows.set(tierId, row);
  }
  return createTierOrder(tierIds, tierId => rows.get(tierId));
}

function cloneWithoutWork(tierIds, tierOrder, workId) {
  return createTierOrder(tierIds, tierId => (
    tierOrder[tierId].filter(rankedWorkId => rankedWorkId !== workId)
  ));
}

function assertKnownSelectedWork(workId, selectedSet) {
  assertSafeWorkId(workId, 'workId', 'INVALID_WORK_ID');
  if (!selectedSet.has(workId)) {
    throw orderedBoardError(
      'UNKNOWN_WORK_ID',
      `workId ${workId} is not present in selectedWorkIds`,
      'workId'
    );
  }
}

export function createEmptyTierOrder(tiers) {
  return withValidationBoundary(() => createTierOrder(snapshotTierIds(tiers), () => []));
}

export function validateTierOrder(tiers, tierOrder, selectedWorkIds) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tiers);
    const { selectedSet } = snapshotSelectedWorkIds(selectedWorkIds);
    return snapshotTierOrder(tierOrder, tierIds, selectedSet);
  });
}

export function findPlacement(tiers, tierOrder, workId) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tiers);
    assertSafeWorkId(workId, 'workId', 'INVALID_WORK_ID');
    const order = snapshotTierOrder(tierOrder, tierIds);
    for (const tierId of tierIds) {
      const index = order[tierId].indexOf(workId);
      if (index !== -1) {
        return { tierId, index };
      }
    }
    return null;
  });
}

export function insertIntoTier(
  tierConfig,
  tierOrder,
  workId,
  destinationTierId,
  insertionIndex,
  selectedWorkIds
) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tierConfig);
    const tierIdSet = new Set(tierIds);
    const { selectedSet } = snapshotSelectedWorkIds(selectedWorkIds);
    const tiers = snapshotTierOrder(tierOrder, tierIds, selectedSet);
    assertKnownSelectedWork(workId, selectedSet);
    if (!tierIdSet.has(destinationTierId)) {
      throw orderedBoardError(
        'INVALID_TIER_ID',
        'destinationTierId must be a current tier ID',
        'destinationTierId'
      );
    }

    const next = cloneWithoutWork(tierIds, tiers, workId);
    const destination = next[destinationTierId];
    if (
      !Number.isSafeInteger(insertionIndex)
      || insertionIndex < 0
      || insertionIndex > destination.length
    ) {
      throw orderedBoardError(
        'INVALID_INSERTION_INDEX',
        `insertionIndex must be between 0 and ${destination.length}`,
        'insertionIndex'
      );
    }
    destination.splice(insertionIndex, 0, workId);
    return next;
  });
}

export function removeFromTiers(tierConfig, tierOrder, workId, selectedWorkIds) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tierConfig);
    const { selectedSet } = snapshotSelectedWorkIds(selectedWorkIds);
    const tiers = snapshotTierOrder(tierOrder, tierIds, selectedSet);
    assertKnownSelectedWork(workId, selectedSet);
    return cloneWithoutWork(tierIds, tiers, workId);
  });
}

export function clearTierOrder(tierConfig, tierOrder, selectedWorkIds) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tierConfig);
    const { selectedSet } = snapshotSelectedWorkIds(selectedWorkIds);
    snapshotTierOrder(tierOrder, tierIds, selectedSet);
    return createTierOrder(tierIds, () => []);
  });
}

export function rankedWorkIds(tierConfig, tierOrder) {
  return withValidationBoundary(() => {
    const tierIds = snapshotTierIds(tierConfig);
    const tiers = snapshotTierOrder(tierOrder, tierIds);
    const ranked = [];
    for (const tierId of tierIds) {
      ranked.push(...tiers[tierId]);
    }
    return ranked;
  });
}
