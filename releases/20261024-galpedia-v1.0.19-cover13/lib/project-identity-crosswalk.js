const PERSON_ID = /^per_[A-Za-z0-9]+$/u;
const CHARACTER_ID = /^ch_[A-Za-z0-9]+$/u;
const STAFF_ID = /^s[1-9][0-9]*$/u;
const CHARACTER_SOURCE_ID = /^(?:[1-9][0-9]*|c[1-9][0-9]*)$/u;
const ROLE_VALUES = new Set(['main', 'side', 'appears', null]);

function sourceKey(source, id) {
  return `${source}:${String(id)}`;
}

function castSourceIdentity(entry) {
  const explicit = entry?.source === 'egs' || entry?.source === 'vndb' ? entry.source : null;
  const vndbId = typeof entry?.vndbCharacterId === 'string' && /^c[1-9][0-9]*$/u.test(entry.vndbCharacterId)
    ? entry.vndbCharacterId
    : (typeof entry?.characterId === 'string' && /^c[1-9][0-9]*$/u.test(entry.characterId) ? entry.characterId : null);
  const egsId = typeof entry?.characterId === 'number' && Number.isSafeInteger(entry.characterId) && entry.characterId > 0
    ? String(entry.characterId)
    : (typeof entry?.characterId === 'string' && /^[1-9][0-9]*$/u.test(entry.characterId) ? entry.characterId : null);
  if (explicit === 'vndb' && vndbId !== null) return sourceKey('vndb', vndbId);
  if (explicit === 'egs' && egsId !== null) return sourceKey('egs', egsId);
  if (vndbId !== null) return sourceKey('vndb', vndbId);
  if (egsId !== null) return sourceKey('egs', egsId);
  return null;
}

function actorSourceIdentity(actor) {
  if (typeof actor?.vndbStaffId === 'string' && STAFF_ID.test(actor.vndbStaffId)) return sourceKey('vndb', actor.vndbStaffId);
  if (typeof actor?.creatorId === 'string' && /^[1-9][0-9]*$/u.test(actor.creatorId)) return sourceKey('egs', actor.creatorId);
  if (typeof actor?.id === 'string' && /^s[1-9][0-9]*$/u.test(actor.id)) return sourceKey('vndb', actor.id);
  if (typeof actor?.id === 'string' && /^[1-9][0-9]*$/u.test(actor.id)) return sourceKey('egs', actor.id);
  return null;
}

export function prepareProjectIdentityCrosswalk(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('project identity crosswalk must be an object');
  if (value.schemaVersion !== 'terminal-wiki-m2-cross-source-crosswalk-v1'
    || value.projection !== 'cross-source-crosswalk'
    || value.publicationStatus !== 'source-only') {
    throw new TypeError('project identity crosswalk contract mismatch');
  }
  const persons = value.records?.persons;
  const characters = value.records?.characters;
  if (!Array.isArray(persons) || !Array.isArray(characters)) throw new TypeError('project identity crosswalk records are invalid');
  if (value.summary?.personCount !== persons.length || value.summary?.characterCount !== characters.length) {
    throw new TypeError('project identity crosswalk summary count mismatch');
  }

  const actorCanonicalBySourceKey = new Map();
  const seenPersonSources = new Set();
  for (const [index, row] of persons.entries()) {
    if (!PERSON_ID.test(row?.egsEntityId ?? '') || !PERSON_ID.test(row?.vndbEntityId ?? '') || !STAFF_ID.test(row?.vndbStaffId ?? '')) {
      throw new TypeError(`project identity crosswalk person ${index} is invalid`);
    }
    const refs = Array.isArray(row.egsSourceRefs) ? row.egsSourceRefs : [];
    const egsRef = refs.find(ref => ref?.source === 'egs' && ref?.kind === 'creator' && /^[1-9][0-9]*$/u.test(String(ref.id ?? '')));
    if (!egsRef) throw new TypeError(`project identity crosswalk person ${index} has no EGS creator ref`);
    for (const key of [sourceKey('egs', egsRef.id), sourceKey('vndb', row.vndbStaffId)]) {
      const existing = actorCanonicalBySourceKey.get(key);
      if (existing !== undefined && existing !== row.vndbEntityId) throw new TypeError(`project identity crosswalk person source collision: ${key}`);
      actorCanonicalBySourceKey.set(key, row.vndbEntityId);
      seenPersonSources.add(key);
    }
  }

  const characterGroupBySourceKey = new Map();
  const characterCanonicalByEntityId = new Map();
  const groupIds = new Set();
  for (const [index, row] of characters.entries()) {
    const workId = String(row?.workId ?? '');
    const members = row?.members;
    if (!/^[1-9][0-9]*$/u.test(workId)
      || !CHARACTER_ID.test(row?.canonicalCharacterEntityId ?? '')
      || typeof row?.canonicalName !== 'string'
      || !ROLE_VALUES.has(row?.canonicalRole ?? null)
      || !Array.isArray(members)
      || members.length < 2) {
      throw new TypeError(`project identity crosswalk character group ${index} is invalid`);
    }
    const groupId = `${workId}:${row.canonicalCharacterEntityId}`;
    if (groupIds.has(groupId)) throw new TypeError(`project identity crosswalk duplicate character group: ${groupId}`);
    groupIds.add(groupId);
    const entityIds = new Set();
    for (const [memberIndex, member] of members.entries()) {
      const source = member?.source;
      const id = String(member?.sourceCharacterId ?? '');
      if ((source !== 'egs' && source !== 'vndb') || !CHARACTER_SOURCE_ID.test(id) || !CHARACTER_ID.test(member?.characterEntityId ?? '')) {
        throw new TypeError(`project identity crosswalk character group ${index} member ${memberIndex} is invalid`);
      }
      if (source === 'egs' && !/^[1-9][0-9]*$/u.test(id)) throw new TypeError('EGS character source id is invalid');
      if (source === 'vndb' && !/^c[1-9][0-9]*$/u.test(id)) throw new TypeError('VNDB character source id is invalid');
      const key = `${workId}:${sourceKey(source, id)}`;
      if (characterGroupBySourceKey.has(key)) throw new TypeError(`project identity crosswalk character source collision: ${key}`);
      characterGroupBySourceKey.set(key, row);
      entityIds.add(member.characterEntityId);
      characterCanonicalByEntityId.set(`${workId}:${member.characterEntityId}`, row);
    }
    if (!entityIds.has(row.canonicalCharacterEntityId)) throw new TypeError(`project identity crosswalk character group ${index} lacks its canonical member`);
  }
  return Object.freeze({
    personCount: persons.length,
    characterGroupCount: characters.length,
    actorCanonicalBySourceKey,
    characterGroupBySourceKey,
    characterCanonicalByEntityId,
  });
}

function mergeActors(entries, identityCrosswalk) {
  const byKey = new Map();
  let serial = 0;
  for (const entry of entries) {
    for (const actor of Array.isArray(entry?.actors) ? entry.actors : []) {
      const sourceIdentity = actorSourceIdentity(actor);
      const canonical = sourceIdentity === null ? null : identityCrosswalk?.actorCanonicalBySourceKey?.get(sourceIdentity);
      const key = canonical ?? sourceIdentity ?? `unresolved:${serial++}`;
      const previous = byKey.get(key);
      if (previous === undefined || (actor?.vndbStaffId && !previous?.vndbStaffId)) byKey.set(key, actor);
    }
  }
  return [...byKey.values()];
}

export function applyProjectIdentityToCast(cast, { workId, identityCrosswalk = null, resolveImage = null } = {}) {
  const rows = Array.isArray(cast) ? cast : [];
  const normalizedWorkId = String(workId ?? '');
  const groups = new Map();
  const order = [];
  for (const entry of rows) {
    const identity = castSourceIdentity(entry);
    const group = identity === null ? null : identityCrosswalk?.characterGroupBySourceKey?.get(`${normalizedWorkId}:${identity}`) ?? null;
    if (group === null) {
      order.push({ type: 'row', entry });
      continue;
    }
    const groupId = `${normalizedWorkId}:${group.canonicalCharacterEntityId}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, { group, entries: [] });
      order.push({ type: 'group', groupId });
    }
    groups.get(groupId).entries.push(entry);
  }
  return Object.freeze(order.flatMap(item => {
    if (item.type === 'row') {
      const image = typeof resolveImage === 'function' ? resolveImage(item.entry) : item.entry?.image ?? null;
      return [Object.freeze({ ...item.entry, image })];
    }
    const bucket = groups.get(item.groupId);
    if (!bucket || bucket.entries.length < 2) {
      return (bucket?.entries ?? []).map(entry => Object.freeze({ ...entry, image: typeof resolveImage === 'function' ? resolveImage(entry) : entry?.image ?? null }));
    }
    const canonicalMember = bucket.group.members.find(member => member.characterEntityId === bucket.group.canonicalCharacterEntityId);
    const canonicalEntry = bucket.entries.find(entry => castSourceIdentity(entry) === sourceKey(canonicalMember.source, canonicalMember.sourceCharacterId)) ?? bucket.entries[0];
    const image = typeof resolveImage === 'function' ? resolveImage(canonicalEntry) : canonicalEntry?.image ?? null;
    return [Object.freeze({
      ...canonicalEntry,
      source: canonicalMember.source,
      characterId: canonicalMember.sourceCharacterId,
      vndbCharacterId: canonicalMember.source === 'vndb' ? canonicalMember.sourceCharacterId : null,
      characterName: bucket.group.canonicalName,
      role: bucket.group.canonicalRole,
      actors: Object.freeze(mergeActors(bucket.entries, identityCrosswalk)),
      image,
      identity: Object.freeze({
        canonicalCharacterEntityId: bucket.group.canonicalCharacterEntityId,
        members: Object.freeze(bucket.group.members.map(member => Object.freeze({
          source: member.source,
          sourceCharacterId: member.sourceCharacterId,
          characterEntityId: member.characterEntityId,
          characterName: member.characterName,
          role: member.role,
          sourceRefs: Object.freeze((member.sourceRefs ?? []).map(ref => Object.freeze({ ...ref }))),
        }))),
      }),
    })];
  }));
}
