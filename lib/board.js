import { USER_WORK_LIMIT } from './work-limit.js';

export const TIER_IDS = Object.freeze(['S', 'A', 'B', 'C', 'D']);

const TIER_ID_SET = new Set(TIER_IDS);
const DESTINATION_SET = new Set([...TIER_IDS, 'unranked']);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_WORK_IDS = USER_WORK_LIMIT;
const MAX_WORKS = USER_WORK_LIMIT;
const MAX_TIER_ASSIGNMENTS = USER_WORK_LIMIT;
const MAX_WORK_DATA_COLLECTION_SIZE = USER_WORK_LIMIT;
const MAX_ID_LENGTH = 128;
const MAX_DATA_DEPTH = 100;
const INTERNAL_BOARD_ERRORS = new WeakMap();
let activeInvocation = null;

export class BoardValidationError extends Error {
  constructor(message, { code = 'INVALID_BOARD_INPUT', cause, path } = {}) {
    super(message);
    this.name = 'BoardValidationError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (path !== undefined) {
      this.path = path;
    }
  }
}

function boardError(code, message, path, cause) {
  const error = new BoardValidationError(message, { code, cause, path });
  INTERNAL_BOARD_ERRORS.set(error, activeInvocation);
  return error;
}

function runBoardInvocation(operation) {
  const previousInvocation = activeInvocation;
  activeInvocation = {};
  try {
    return operation();
  } finally {
    activeInvocation = previousInvocation;
  }
}

function throwUnexpected(error, code, message, path) {
  if (
    activeInvocation !== null
    && INTERNAL_BOARD_ERRORS.get(error) === activeInvocation
  ) {
    throw error;
  }
  throw boardError(code, message, path, error);
}

function isSafeId(value) {
  return typeof value === 'string'
    && SAFE_ID_PATTERN.test(value)
    && !UNSAFE_PROPERTY_KEYS.has(value);
}

function assertIdLength(value, path) {
  if (typeof value === 'string' && value.length > MAX_ID_LENGTH) {
    throw boardError(
      'BOARD_TOO_LARGE',
      `${path} exceeds the ${MAX_ID_LENGTH} character limit`,
      path
    );
  }
}

function assertPlainObject(value, path, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw boardError(code, `${path} must be an object`, path);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw boardError(code, `${path} must be a plain object`, path);
  }
}

function dataPropertyValue(object, field, path, code) {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor) {
    throw boardError(code, `${path} is required`, path);
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw boardError(code, `${path} must be a data property`, path);
  }
  return descriptor.value;
}

function snapshotArray(value, path, code, limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw boardError(code, `${path} must be an Array`, path);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw boardError(code, `${path}.length must be a data property`, path);
  }
  const length = lengthDescriptor.value;
  if (!Number.isInteger(length) || length < 0) {
    throw boardError(code, `${path}.length must be a non-negative integer`, path);
  }
  if (length > limit) {
    throw boardError(
      'BOARD_TOO_LARGE',
      `${path} exceeds the ${limit} entry limit`,
      path
    );
  }

  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key)) {
      throw boardError(code, `${path} contains an unexpected property`, path);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= length) {
      throw boardError(code, `${path} contains an invalid index`, path);
    }
  }

  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    snapshot.push(dataPropertyValue(value, String(index), `${path}[${index}]`, code));
  }
  return snapshot;
}

function snapshotSet(value, path, code, limit) {
  if (!(value instanceof Set) || Object.getPrototypeOf(value) !== Set.prototype) {
    throw boardError(code, `${path} must be an Array or Set`, path);
  }
  const sizeGetter = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
  const size = sizeGetter.call(value);
  if (size > limit) {
    throw boardError(
      'BOARD_TOO_LARGE',
      `${path} exceeds the ${limit} entry limit`,
      path
    );
  }
  return [...Set.prototype.values.call(value)];
}

function assertPassiveDataTree(value, path, ancestors = new WeakSet(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (typeof value !== 'object') {
    throw boardError('INVALID_WORKS', `${path} must contain JSON data`, path);
  }
  if (depth > MAX_DATA_DEPTH) {
    throw boardError('INVALID_WORKS', `${path} is nested too deeply`, path);
  }
  if (ancestors.has(value)) {
    throw boardError('INVALID_WORKS', `${path} must not contain cycles`, path);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = snapshotArray(
        value,
        path,
        'INVALID_WORKS',
        MAX_WORK_DATA_COLLECTION_SIZE
      );
      for (let index = 0; index < items.length; index += 1) {
        assertPassiveDataTree(items[index], `${path}[${index}]`, ancestors, depth + 1);
      }
      return;
    }

    assertPlainObject(value, path, 'INVALID_WORKS');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw boardError(
          'INVALID_WORKS',
          `${path} contains an unexpected property`,
          path
        );
      }
      const childPath = `${path}.${key}`;
      const child = dataPropertyValue(value, key, childPath, 'INVALID_WORKS');
      assertPassiveDataTree(child, childPath, ancestors, depth + 1);
    }
  } finally {
    ancestors.delete(value);
  }
}

function normalizeAuthority(authority) {
  try {
    assertPlainObject(authority, 'authority', 'INVALID_AUTHORITY');
    const sourceWorkIds = dataPropertyValue(
      authority,
      'workIds',
      'authority.workIds',
      'INVALID_AUTHORITY'
    );
    const workIds = Array.isArray(sourceWorkIds)
      ? snapshotArray(
        sourceWorkIds,
        'authority.workIds',
        'INVALID_AUTHORITY',
        MAX_WORK_IDS
      )
      : snapshotSet(
        sourceWorkIds,
        'authority.workIds',
        'INVALID_AUTHORITY',
        MAX_WORK_IDS
      );
    const workIdSet = new Set();

    for (const workId of workIds) {
      assertIdLength(workId, 'authority.workIds');
      if (!isSafeId(workId)) {
        throw boardError(
          'INVALID_AUTHORITY',
          'authority.workIds contains an unsafe ID',
          'authority.workIds'
        );
      }
      if (workIdSet.has(workId)) {
        throw boardError(
          'INVALID_AUTHORITY',
          'authority.workIds contains a duplicate ID',
          'authority.workIds'
        );
      }
      workIdSet.add(workId);
    }
    return workIdSet;
  } catch (error) {
    throwUnexpected(
      error,
      'INVALID_AUTHORITY',
      'authority could not be validated',
      'authority'
    );
  }
}

function normalizeAssignments(assignments, knownWorkIds) {
  try {
    assertPlainObject(assignments, 'assignments', 'INVALID_ASSIGNMENTS');
    const normalized = {};
    const workIds = Reflect.ownKeys(assignments);
    if (workIds.length > MAX_TIER_ASSIGNMENTS) {
      throw boardError(
        'BOARD_TOO_LARGE',
        `assignments exceeds the ${MAX_TIER_ASSIGNMENTS} entry limit`,
        'assignments'
      );
    }

    for (const workId of workIds) {
      assertIdLength(workId, 'assignments');
      if (typeof workId !== 'string' || !isSafeId(workId)) {
        throw boardError(
          'INVALID_ASSIGNMENTS',
          'assignments contains an unsafe work ID',
          'assignments'
        );
      }
      if (knownWorkIds !== null && !knownWorkIds.has(workId)) {
        throw boardError(
          'UNKNOWN_WORK',
          `Unknown work ID "${workId}"`,
          `assignments.${workId}`
        );
      }

      const path = `assignments.${workId}`;
      const destination = dataPropertyValue(
        assignments,
        workId,
        path,
        'INVALID_ASSIGNMENTS'
      );
      if (!DESTINATION_SET.has(destination)) {
        throw boardError(
          'INVALID_ASSIGNMENTS',
          `Invalid assignment for work ID "${workId}"`,
          path
        );
      }
      normalized[workId] = destination;
    }
    return normalized;
  } catch (error) {
    throwUnexpected(
      error,
      'INVALID_ASSIGNMENTS',
      'assignments could not be validated',
      'assignments'
    );
  }
}

function normalizeWorks(works) {
  try {
    const items = snapshotArray(works, 'works', 'INVALID_WORKS', MAX_WORKS);
    const workIds = [];
    const workIdSet = new Set();

    for (let index = 0; index < items.length; index += 1) {
      const work = items[index];
      const path = `works[${index}]`;
      assertPlainObject(work, path, 'INVALID_WORKS');
      assertPassiveDataTree(work, path);
      const workId = dataPropertyValue(
        work,
        'workId',
        `${path}.workId`,
        'INVALID_WORKS'
      );
      assertIdLength(workId, `${path}.workId`);
      if (!isSafeId(workId)) {
        throw boardError(
          'INVALID_WORKS',
          `${path}.workId must be a safe ID`,
          `${path}.workId`
        );
      }
      if (workIdSet.has(workId)) {
        throw boardError(
          'INVALID_WORKS',
          `Duplicate work ID "${workId}"`,
          `${path}.workId`
        );
      }
      workIds.push(workId);
      workIdSet.add(workId);
    }
    return { items, workIds, workIdSet };
  } catch (error) {
    throwUnexpected(error, 'INVALID_WORKS', 'works could not be validated', 'works');
  }
}

export function moveAssignment(assignments, workId, destination, authority) {
  return runBoardInvocation(() => {
    const knownWorkIds = normalizeAuthority(authority);
    assertIdLength(workId, 'workId');
    if (!isSafeId(workId)) {
      throw boardError(
        'INVALID_WORK_ID',
        'workId must be a safe string ID',
        'workId'
      );
    }
    if (!knownWorkIds.has(workId)) {
      throw boardError('UNKNOWN_WORK', `Unknown work ID "${workId}"`, 'workId');
    }
    if (!DESTINATION_SET.has(destination)) {
      throw boardError(
        'INVALID_DESTINATION',
        'destination must be S, A, B, C, D, or unranked',
        'destination'
      );
    }

    const normalized = normalizeAssignments(assignments, knownWorkIds);
    normalized[workId] = destination;
    return normalized;
  });
}

export function worksForTier(works, assignments, tierId) {
  return runBoardInvocation(() => {
    const workSnapshot = normalizeWorks(works);
    const assignmentSnapshot = normalizeAssignments(
      assignments,
      workSnapshot.workIdSet
    );
    if (!TIER_ID_SET.has(tierId)) {
      throw boardError(
        'INVALID_TIER',
        'tierId must be S, A, B, C, or D',
        'tierId'
      );
    }

    return workSnapshot.items.filter((work, index) => (
      assignmentSnapshot[workSnapshot.workIds[index]] === tierId
    ));
  });
}

export function unrankedWorks(works, assignments) {
  return runBoardInvocation(() => {
    const workSnapshot = normalizeWorks(works);
    const assignmentSnapshot = normalizeAssignments(
      assignments,
      workSnapshot.workIdSet
    );

    return workSnapshot.items.filter((work, index) => {
      const workId = workSnapshot.workIds[index];
      return !Object.hasOwn(assignmentSnapshot, workId)
        || assignmentSnapshot[workId] === 'unranked';
    });
  });
}
