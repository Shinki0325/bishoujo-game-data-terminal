/**
 * Build the small reverse projection used by the catalogue filter.
 *
 * The public person graph is intentionally not consumed by the filter worker:
 * it contains names, evidence, character rows and images which are not needed
 * to answer a work query.  This projection keeps only canonical person ids,
 * their credited function, and the catalogue work ids.  Character identity is
 * deliberately not represented here.
 */

export const PERSON_WORK_INDEX_FORMAT = 'egs-tier-person-work-index-v1';

export const PERSON_WORK_ROLES = Object.freeze([
  'voice-actor',
  'scenario',
  'artwork',
  'music',
  'unknown'
]);

const PERSON_ID_PATTERN = /^per_[A-Za-z0-9]+$/u;
const ROLE_SET = new Set(PERSON_WORK_ROLES);

function ownWorkIdSet(workIds) {
  if (workIds === undefined || workIds === null) return null;
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array when provided');
  const result = new Set();
  for (const workId of workIds) {
    if (typeof workId !== 'string' || workId.length === 0) {
      throw new TypeError('workIds entries must be non-empty strings');
    }
    if (result.has(workId)) throw new TypeError('workIds must be unique');
    result.add(workId);
  }
  return result;
}

function personIdOf(record) {
  const value = record?.entityId ?? record?.personId;
  return typeof value === 'string' && PERSON_ID_PATTERN.test(value) ? value : null;
}

function roleOfCredit(credit) {
  if (credit?.creditType === 'character-voiced-by' || credit?.roleCode === 'voice-actor') {
    return 'voice-actor';
  }
  const role = typeof credit?.roleCode === 'string' ? credit.roleCode : '';
  return ROLE_SET.has(role) ? role : 'unknown';
}

function workIdOfCredit(credit) {
  const value = credit?.workId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

/**
 * Build a serialisable reverse index from M2 person records or performance
 * relation-shard records.  Records without a canonical person id, unresolved
 * work id, or (when supplied) a work outside the catalogue are ignored.
 */
export function createPersonWorkIndex(records, { workIds = null } = {}) {
  if (!Array.isArray(records)) throw new TypeError('person records must be an array');
  const workSet = ownWorkIdSet(workIds);
  const persons = new Map();
  for (const record of records) {
    const personId = personIdOf(record);
    if (personId === null) continue;
    const roleMap = persons.get(personId) ?? new Map();
    const credits = Array.isArray(record?.credits) ? record.credits : [];
    for (const credit of credits) {
      const workId = workIdOfCredit(credit);
      if (workId === null || (workSet !== null && !workSet.has(workId))) continue;
      const role = roleOfCredit(credit);
      const workSetForRole = roleMap.get(role) ?? new Set();
      workSetForRole.add(workId);
      roleMap.set(role, workSetForRole);
    }
    if (roleMap.size > 0) persons.set(personId, roleMap);
  }
  const personEntries = {};
  for (const personId of [...persons.keys()].sort((left, right) => left.localeCompare(right, 'en'))) {
    const roleMap = persons.get(personId);
    const roles = {};
    for (const role of PERSON_WORK_ROLES) {
      const values = roleMap.get(role);
      if (values?.size) roles[role] = sortedUnique(values);
    }
    if (Object.keys(roles).length > 0) personEntries[personId] = roles;
  }
  return Object.freeze({
    format: PERSON_WORK_INDEX_FORMAT,
    ...(workIds === undefined || workIds === null ? {} : { workOrder: Object.freeze([...workIds]) }),
    persons: Object.freeze(personEntries)
  });
}

function assertIndexId(value, name) {
  if (typeof value !== 'string' || !PERSON_ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a canonical person id`);
  }
}

/**
 * Validate the worker-facing shape without retaining references to mutable
 * caller-owned arrays.  Query-index performs the work-order check separately.
 */
export function normalizePersonWorkIndex(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('personWorkIndex must be an object');
  }
  if (value.format !== PERSON_WORK_INDEX_FORMAT) {
    throw new TypeError('personWorkIndex format is unsupported');
  }
  if (value.workOrder !== undefined) {
    if (!Array.isArray(value.workOrder)) throw new TypeError('personWorkIndex.workOrder must be an array');
    const seen = new Set();
    for (const workId of value.workOrder) {
      if (typeof workId !== 'string' || workId.length === 0 || seen.has(workId)) {
        throw new TypeError('personWorkIndex.workOrder must contain unique work ids');
      }
      seen.add(workId);
    }
  }
  if (value.persons === null || typeof value.persons !== 'object' || Array.isArray(value.persons)) {
    throw new TypeError('personWorkIndex.persons must be an object');
  }
  const persons = {};
  for (const [personId, sourceRoles] of Object.entries(value.persons)) {
    assertIndexId(personId, `personWorkIndex.persons.${personId}`);
    if (sourceRoles === null || typeof sourceRoles !== 'object' || Array.isArray(sourceRoles)) {
      throw new TypeError(`personWorkIndex.persons.${personId} must be an object`);
    }
    const roles = {};
    for (const [role, sourceWorkIds] of Object.entries(sourceRoles)) {
      if (!ROLE_SET.has(role)) throw new TypeError(`personWorkIndex role ${role} is unsupported`);
      if (!Array.isArray(sourceWorkIds)) throw new TypeError(`personWorkIndex ${personId}.${role} must be an array`);
      const workIds = [];
      const seen = new Set();
      for (const workId of sourceWorkIds) {
        if (typeof workId !== 'string' || workId.length === 0 || seen.has(workId)) {
          throw new TypeError(`personWorkIndex ${personId}.${role} must contain unique work ids`);
        }
        seen.add(workId);
        workIds.push(workId);
      }
      if (workIds.length > 0) roles[role] = Object.freeze(workIds);
    }
    if (Object.keys(roles).length > 0) persons[personId] = Object.freeze(roles);
  }
  return Object.freeze({
    format: PERSON_WORK_INDEX_FORMAT,
    ...(value.workOrder === undefined ? {} : { workOrder: Object.freeze([...value.workOrder]) }),
    persons: Object.freeze(persons)
  });
}

export function personWorkIndexStats(index) {
  const normalized = normalizePersonWorkIndex(index);
  let relationCount = 0;
  let personCount = 0;
  const workIds = new Set();
  for (const roles of Object.values(normalized.persons)) {
    personCount += 1;
    for (const ids of Object.values(roles)) {
      relationCount += ids.length;
      for (const workId of ids) workIds.add(workId);
    }
  }
  return Object.freeze({ personCount, relationCount, workCount: workIds.size });
}

