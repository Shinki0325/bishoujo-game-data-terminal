import { sortCatalog } from './catalog.js';

const SIDECAR_SCHEMA_VERSION = 'egs-tier-full-presentation-families-v1';
const MAX_FAMILIES = 7000;
const MAX_MEMBERS = 7000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const WORK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const PRESENTATION_WORK_ID_PATTERN = /^vndb:v[1-9][0-9]*$/u;
const ROOT_FIELDS = new Set([
  'families',
  'generatedAt',
  'schemaVersion',
  'selectionPolicy',
  'sourceCatalogSha256',
  'sourceCatalogSnapshotId',
  'workToPresentationWorkId'
]);
const FAMILY_FIELDS = new Set([
  'catalogMemberWorkIds',
  'defaultWorkId',
  'members',
  'presentationWorkId',
  'status',
  'title',
  'vndbId'
]);
const MEMBER_FIELDS = new Set([
  'default',
  'label',
  'platform',
  'releaseDate',
  'title',
  'workId'
]);

function assertPlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain object`);
  }
}

function assertExactFields(value, expected, name) {
  assertPlainObject(value, name);
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some(key => !expected.has(key))) {
    throw new TypeError(`${name} contains unsupported fields`);
  }
}

function assertText(value, name, { pattern = null, allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  if (pattern !== null && !pattern.test(value)) {
    throw new TypeError(`${name} has an invalid format`);
  }
  return value;
}

function assertArray(value, name, limit) {
  if (!Array.isArray(value) || value.length > limit) {
    throw new TypeError(`${name} must be an array within the supported limit`);
  }
  return value;
}

function snapshotWorkIds(value, name, allowedWorkIds) {
  const values = assertArray(value, name, MAX_MEMBERS);
  const seen = new Set();
  return values.map((workId, index) => {
    assertText(workId, `${name}[${index}]`, { pattern: WORK_ID_PATTERN });
    if (!allowedWorkIds.has(workId) || seen.has(workId)) {
      throw new TypeError(`${name}[${index}] is unknown or duplicated`);
    }
    seen.add(workId);
    return workId;
  });
}

function snapshotMember(value, index, allowedWorkIds) {
  const name = `families[${index}].members`;
  assertExactFields(value, MEMBER_FIELDS, `${name}[${index}]`);
  const workId = assertText(value.workId, `${name}[${index}].workId`, { pattern: WORK_ID_PATTERN });
  if (!allowedWorkIds.has(workId)) throw new TypeError(`${name}[${index}].workId is unknown`);
  if (typeof value.default !== 'boolean') throw new TypeError(`${name}[${index}].default must be a boolean`);
  return Object.freeze({
    default: value.default,
    label: assertText(value.label, `${name}[${index}].label`),
    platform: assertText(value.platform, `${name}[${index}].platform`),
    releaseDate: assertText(value.releaseDate, `${name}[${index}].releaseDate`),
    title: assertText(value.title, `${name}[${index}].title`),
    workId
  });
}

function snapshotFamily(value, index, allowedWorkIds) {
  const name = `families[${index}]`;
  assertExactFields(value, FAMILY_FIELDS, name);
  if (value.status !== 'auto-version-family') throw new TypeError(`${name}.status is unsupported`);
  const presentationWorkId = assertText(value.presentationWorkId, `${name}.presentationWorkId`, {
    pattern: PRESENTATION_WORK_ID_PATTERN
  });
  const vndbId = assertText(value.vndbId, `${name}.vndbId`, { pattern: /^v[1-9][0-9]*$/u });
  if (presentationWorkId !== `vndb:${vndbId}`) throw new TypeError(`${name}.vndbId does not match presentationWorkId`);
  const catalogMemberWorkIds = snapshotWorkIds(value.catalogMemberWorkIds, `${name}.catalogMemberWorkIds`, allowedWorkIds);
  if (catalogMemberWorkIds.length < 2) throw new TypeError(`${name} must contain at least two public members`);
  const members = assertArray(value.members, `${name}.members`, MAX_MEMBERS)
    .map((member, memberIndex) => snapshotMember(member, memberIndex, allowedWorkIds));
  if (members.length !== catalogMemberWorkIds.length) throw new TypeError(`${name} member count does not match catalog members`);
  const memberIds = members.map(member => member.workId);
  if (new Set(memberIds).size !== memberIds.length) throw new TypeError(`${name}.members contains duplicate work IDs`);
  if (memberIds.some(workId => !catalogMemberWorkIds.includes(workId))) {
    throw new TypeError(`${name}.members does not match catalog members`);
  }
  const defaultMembers = members.filter(member => member.default);
  const defaultWorkId = assertText(value.defaultWorkId, `${name}.defaultWorkId`, { pattern: WORK_ID_PATTERN });
  if (
    defaultMembers.length !== 1
    || defaultMembers[0].workId !== defaultWorkId
    || !catalogMemberWorkIds.includes(defaultWorkId)
  ) {
    throw new TypeError(`${name} must have exactly one declared default member`);
  }
  return Object.freeze({
    catalogMemberWorkIds: Object.freeze([...catalogMemberWorkIds]),
    defaultWorkId,
    members: Object.freeze(members),
    presentationWorkId,
    status: value.status,
    title: assertText(value.title, `${name}.title`),
    vndbId
  });
}

function presentationSelectionState(works, selectedWorkIds) {
  const selected = new Set(selectedWorkIds);
  const selectedCount = works.filter(work => selected.has(work.workId)).length;
  if (selectedCount === 0) return 'none';
  return selectedCount === works.length ? 'all' : 'some';
}

export function preparePresentationFamiliesSidecar(value, {
  catalogSnapshotId,
  catalogSha256,
  workIds
} = {}) {
  assertExactFields(value, ROOT_FIELDS, 'presentation families sidecar');
  if (value.schemaVersion !== SIDECAR_SCHEMA_VERSION) {
    throw new TypeError('presentation families sidecar schema version is unsupported');
  }
  assertText(catalogSnapshotId, 'catalogSnapshotId');
  assertText(catalogSha256, 'catalogSha256', { pattern: SHA256_PATTERN });
  if (value.sourceCatalogSnapshotId !== catalogSnapshotId || value.sourceCatalogSha256 !== catalogSha256) {
    throw new TypeError('presentation families sidecar catalog binding does not match');
  }
  if (!Array.isArray(workIds)) throw new TypeError('workIds must be an array');
  const allowedWorkIds = new Set(workIds);
  if (allowedWorkIds.size !== workIds.length) throw new TypeError('workIds must be unique');
  const families = assertArray(value.families, 'families', MAX_FAMILIES)
    .map((family, index) => snapshotFamily(family, index, allowedWorkIds));
  const familyByWorkId = new Map();
  const familyByPresentationWorkId = new Map();
  for (const family of families) {
    if (familyByPresentationWorkId.has(family.presentationWorkId)) {
      throw new TypeError('presentation families sidecar contains duplicate presentation IDs');
    }
    familyByPresentationWorkId.set(family.presentationWorkId, family);
    for (const workId of family.catalogMemberWorkIds) {
      if (familyByWorkId.has(workId)) throw new TypeError('presentation families sidecar overlaps members');
      familyByWorkId.set(workId, family);
    }
  }
  assertPlainObject(value.workToPresentationWorkId, 'workToPresentationWorkId');
  const mappedEntries = Object.entries(value.workToPresentationWorkId);
  if (mappedEntries.length !== familyByWorkId.size) throw new TypeError('workToPresentationWorkId has an unexpected member count');
  for (const [workId, presentationWorkId] of mappedEntries) {
    const family = familyByWorkId.get(workId);
    if (!family || presentationWorkId !== family.presentationWorkId) {
      throw new TypeError('workToPresentationWorkId does not match the public family members');
    }
  }
  return Object.freeze({
    familyCount: families.length,
    memberCount: familyByWorkId.size,
    families: Object.freeze(families),
    familyForWork(workId) {
      return familyByWorkId.get(workId) ?? null;
    },
    projectVisibleWorks(visibleWorks, { sortKey, sortDirection, workById = null } = {}) {
      if (!Array.isArray(visibleWorks)) throw new TypeError('visibleWorks must be an array');
      const visibleWorkById = new Map(visibleWorks.map(work => [work.workId, work]));
      const output = [];
      const emittedPresentationIds = new Set();
      for (const work of visibleWorks) {
        const family = familyByWorkId.get(work.workId);
        if (family === undefined) {
          output.push(work);
          continue;
        }
        if (emittedPresentationIds.has(family.presentationWorkId)) continue;
        emittedPresentationIds.add(family.presentationWorkId);
        const defaultWork = workById?.get?.(family.defaultWorkId)
          ?? visibleWorkById.get(family.defaultWorkId);
        if (defaultWork === undefined) {
          throw new TypeError(`presentation family default work ${family.defaultWorkId} is unavailable`);
        }
        output.push(Object.freeze({
          ...defaultWork,
          presentationFamily: family,
          presentationMemberCount: family.members.length
        }));
      }
      if (sortKey === undefined || sortDirection === undefined) return output;
      return sortCatalog(output, sortKey, sortDirection);
    },
    presentationSelectionState
  });
}
