import { TIER_COLOR_IDS } from './tier-palette.js';

export const MIN_TIERS = 3;
export const MAX_TIERS = 8;
export const TIER_MIN_COUNT = MIN_TIERS;
export const TIER_MAX_COUNT = MAX_TIERS;
export const TIER_NAME_MAX_LENGTH = 24;

const MAX_ID_LENGTH = 128;
const MAX_WORK_IDS = 100;
const UUID_ATTEMPTS = 16;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const COLOR_ID_SET = new Set(TIER_COLOR_IDS);
const TIER_FIELDS = new Set(['id', 'name', 'colorId']);
const PATCH_FIELDS = new Set(['name', 'colorId']);
const APPLY_FIELDS = new Set(['currentTiers', 'currentTierOrder', 'nextTiers']);
const INTERNAL_ERRORS = new WeakMap();
let activeInvocation = null;

export class TierConfigValidationError extends Error {
  constructor(message, { code = 'INVALID_TIER_CONFIG', path, cause } = {}) {
    super(message);
    this.name = 'TierConfigValidationError';
    this.code = code;
    if (path !== undefined) this.path = path;
    if (cause !== undefined) this.cause = cause;
  }
}

function configError(code, message, path, cause) {
  const error = new TierConfigValidationError(message, { code, path, cause });
  INTERNAL_ERRORS.set(error, activeInvocation);
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
      if (INTERNAL_ERRORS.get(error) === invocation) throw error;
      throw configError(
        'UNEXPECTED_INPUT',
        'Unexpected failure while validating tier configuration input',
        undefined,
        error
      );
    }
  } finally {
    activeInvocation = previousInvocation;
  }
}

function isSafeId(value) {
  return typeof value === 'string'
    && value.length <= MAX_ID_LENGTH
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_PROPERTY_KEYS.has(value);
}

function assertSafeId(value, path, code = 'INVALID_TIER_ID') {
  if (!isSafeId(value)) {
    throw configError(code, `${path} must be a safe ID`, path);
  }
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotDenseArray(value, path, code, maxLength) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw configError(code, `${path} must use the standard Array prototype`, path);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw configError(code, `${path}.length must be a data property`, `${path}.length`);
  }
  const length = lengthDescriptor.value;
  if (length > maxLength) {
    throw configError(code, `${path} exceeds its maximum length`, path);
  }

  const indexKeys = new Set();
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (!isCanonicalArrayIndex(key) || Number(key) >= length) {
      throw configError(code, `${path} contains an unexpected property`, path);
    }
    indexKeys.add(key);
  }
  if (indexKeys.size !== length) {
    throw configError(code, `${path} must not be sparse`, path);
  }

  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw configError(code, `${itemPath} must be a data property`, itemPath);
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function snapshotPlainDataObject(value, path, allowedFields, requiredFields, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw configError(code, `${path} must be a standard plain object`, path);
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowedFields.has(key))) {
    throw configError(code, `${path} contains an unexpected property`, path);
  }
  for (const field of requiredFields) {
    if (!keys.includes(field)) {
      throw configError(code, `${path}.${field} is required`, `${path}.${field}`);
    }
  }

  const snapshot = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw configError(code, `${path}.${key} must be a data property`, `${path}.${key}`);
    }
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptor.value
    });
  }
  return snapshot;
}

function snapshotTier(tier, path) {
  const data = snapshotPlainDataObject(
    tier,
    path,
    TIER_FIELDS,
    TIER_FIELDS,
    'INVALID_TIER'
  );
  assertSafeId(data.id, `${path}.id`);

  if (typeof data.name !== 'string') {
    throw configError('INVALID_TIER_NAME', `${path}.name must be a string`, `${path}.name`);
  }
  const name = data.name.trim();
  const characterCount = [...name].length;
  if (characterCount < 1 || characterCount > TIER_NAME_MAX_LENGTH) {
    throw configError(
      'INVALID_TIER_NAME',
      `${path}.name must contain 1 to ${TIER_NAME_MAX_LENGTH} characters after trimming`,
      `${path}.name`
    );
  }

  if (typeof data.colorId !== 'string' || !COLOR_ID_SET.has(data.colorId)) {
    throw configError(
      'INVALID_TIER_COLOR',
      `${path}.colorId must be a known tier color`,
      `${path}.colorId`
    );
  }

  return { id: data.id, name, colorId: data.colorId };
}

function snapshotTiers(tiers, path = 'tiers') {
  const values = snapshotDenseArray(
    tiers,
    path,
    'INVALID_TIERS',
    MAX_TIERS
  );
  if (values.length < MIN_TIERS || values.length > MAX_TIERS) {
    throw configError(
      'INVALID_TIER_COUNT',
      `${path} must contain ${MIN_TIERS} to ${MAX_TIERS} tiers`,
      path
    );
  }

  const snapshot = [];
  const ids = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const tier = snapshotTier(values[index], `${path}[${index}]`);
    if (ids.has(tier.id)) {
      throw configError(
        'DUPLICATE_TIER_ID',
        `${path} contains duplicate tier ID ${tier.id}`,
        `${path}[${index}].id`
      );
    }
    ids.add(tier.id);
    snapshot.push(tier);
  }
  return snapshot;
}

function snapshotTierId(tierId) {
  assertSafeId(tierId, 'id');
  return tierId;
}

function snapshotPatch(patch) {
  return snapshotPlainDataObject(
    patch,
    'patch',
    PATCH_FIELDS,
    [],
    'INVALID_TIER_PATCH'
  );
}

function snapshotTierOrder(tierOrder, tiers) {
  if (
    tierOrder === null
    || typeof tierOrder !== 'object'
    || Array.isArray(tierOrder)
    || Object.getPrototypeOf(tierOrder) !== Object.prototype
  ) {
    throw configError(
      'INVALID_TIER_ORDER',
      'currentTierOrder must be a standard plain object',
      'currentTierOrder'
    );
  }

  const expectedIds = new Set(tiers.map(tier => tier.id));
  const keys = Reflect.ownKeys(tierOrder);
  if (
    keys.length !== expectedIds.size
    || keys.some(key => typeof key !== 'string' || !expectedIds.has(key))
  ) {
    throw configError(
      'INVALID_TIER_ORDER',
      'currentTierOrder must contain exactly the current tier IDs',
      'currentTierOrder'
    );
  }

  const rows = new Map();
  const workIds = new Set();
  for (const tier of tiers) {
    const rowPath = `currentTierOrder.${tier.id}`;
    const descriptor = Object.getOwnPropertyDescriptor(tierOrder, tier.id);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw configError(
        'INVALID_TIER_ORDER',
        `${rowPath} must be a data property`,
        rowPath
      );
    }
    const row = snapshotDenseArray(
      descriptor.value,
      rowPath,
      'INVALID_TIER_ORDER',
      MAX_WORK_IDS
    );
    for (let index = 0; index < row.length; index += 1) {
      const workId = row[index];
      const workPath = `${rowPath}[${index}]`;
      assertSafeId(workId, workPath, 'INVALID_WORK_ID');
      if (workIds.has(workId)) {
        throw configError(
          'DUPLICATE_WORK_ID',
          `work ID ${workId} appears more than once in currentTierOrder`,
          workPath
        );
      }
      workIds.add(workId);
      if (workIds.size > MAX_WORK_IDS) {
        throw configError(
          'TIER_ORDER_TOO_LARGE',
          `currentTierOrder exceeds ${MAX_WORK_IDS} works`,
          'currentTierOrder'
        );
      }
    }
    rows.set(tier.id, row);
  }
  return rows;
}

export function normalizeTiers(tiers) {
  return withValidationBoundary(() => snapshotTiers(tiers));
}

export function tierIds(tiers) {
  return withValidationBoundary(() => snapshotTiers(tiers).map(tier => tier.id));
}

export function createEmptyTierOrder(tiers) {
  return withValidationBoundary(() => Object.fromEntries(
    snapshotTiers(tiers).map(tier => [tier.id, []])
  ));
}

export function updateTier(tiers, id, patch) {
  return withValidationBoundary(() => {
    const current = snapshotTiers(tiers);
    const tierId = snapshotTierId(id);
    const changes = snapshotPatch(patch);
    const next = current.map(tier => {
      if (tier.id !== tierId) return { ...tier };
      return {
        id: tier.id,
        name: Object.hasOwn(changes, 'name') ? changes.name : tier.name,
        colorId: Object.hasOwn(changes, 'colorId') ? changes.colorId : tier.colorId
      };
    });
    return snapshotTiers(next);
  });
}

export function moveTier(tiers, id, direction) {
  return withValidationBoundary(() => {
    const next = snapshotTiers(tiers);
    const tierId = snapshotTierId(id);
    if (direction !== -1 && direction !== 1) {
      throw configError(
        'INVALID_MOVE_DIRECTION',
        'direction must be -1 or 1',
        'direction'
      );
    }
    const from = next.findIndex(tier => tier.id === tierId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= next.length) return next;
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  });
}

export function appendTier(tiers, randomUUID) {
  return withValidationBoundary(() => {
    const current = snapshotTiers(tiers);
    if (current.length >= MAX_TIERS) {
      throw configError(
        'MAX_TIERS_REACHED',
        `No more than ${MAX_TIERS} tiers are allowed`,
        'tiers'
      );
    }
    if (typeof randomUUID !== 'function') {
      throw configError(
        'INVALID_UUID_SOURCE',
        'randomUUID must be a function',
        'randomUUID'
      );
    }

    const usedIds = new Set(current.map(tier => tier.id));
    let id = null;
    for (let attempt = 0; attempt < UUID_ATTEMPTS; attempt += 1) {
      const generated = randomUUID();
      if (typeof generated !== 'string') continue;
      const candidate = `tier-${generated}`;
      if (isSafeId(candidate) && !usedIds.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (id === null) {
      throw configError(
        'TIER_ID_COLLISION',
        `Could not create a unique tier ID after ${UUID_ATTEMPTS} attempts`,
        'randomUUID'
      );
    }

    const usedColors = new Set(current.map(tier => tier.colorId));
    const colorId = TIER_COLOR_IDS.find(token => !usedColors.has(token)) ?? 'crimson';
    return [...current, { id, name: '新等级', colorId }];
  });
}

export function removeTier(tiers, id) {
  return withValidationBoundary(() => {
    const current = snapshotTiers(tiers);
    const tierId = snapshotTierId(id);
    const index = current.findIndex(tier => tier.id === tierId);
    if (index === -1) return current;
    if (current.length <= MIN_TIERS) {
      throw configError(
        'MIN_TIERS_REACHED',
        `At least ${MIN_TIERS} tiers are required`,
        'tiers'
      );
    }
    current.splice(index, 1);
    return current;
  });
}

export function applyTierConfig(input) {
  return withValidationBoundary(() => {
    const data = snapshotPlainDataObject(
      input,
      'config',
      APPLY_FIELDS,
      APPLY_FIELDS,
      'INVALID_APPLY_CONFIG'
    );
    const currentTiers = snapshotTiers(data.currentTiers, 'currentTiers');
    const nextTiers = snapshotTiers(data.nextTiers, 'nextTiers');
    const currentTierOrder = snapshotTierOrder(data.currentTierOrder, currentTiers);
    const currentIds = new Set(currentTiers.map(tier => tier.id));
    const nextIds = new Set(nextTiers.map(tier => tier.id));

    const tierOrder = Object.fromEntries(nextTiers.map(tier => [
      tier.id,
      currentIds.has(tier.id) ? [...currentTierOrder.get(tier.id)] : []
    ]));
    const deletedWorkIds = [];
    for (const tier of currentTiers) {
      if (!nextIds.has(tier.id)) {
        deletedWorkIds.push(...currentTierOrder.get(tier.id));
      }
    }

    return {
      tiers: nextTiers,
      tierOrder,
      deletedWorkIds
    };
  });
}
