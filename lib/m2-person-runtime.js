const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PERSON_ENTITY_ID = /^per_[A-Za-z0-9]+$/u;
const WORK_ENTITY_ID = /^wk_[A-Za-z0-9]+$/u;

export const M2_PERSON_MANIFEST_SHA256 = '8ac8a3e9c8d45eb15e697158eae4c89f85de805a90d31f75757973a36792e751';
export const M2_PERSON_ENTITIES_SHA256 = '791f52cfc84821ba0103cc60ca6c68df2f411851abb5afaf2930de9fa9b3341f';
export const M2_PERSON_RELATIONS_SHA256 = '891b37246d0fafc8780f60f212168c58d809a8854c5b76042f5f40d00248bf64';
export const M1_PERSON_ENTITIES_SHA256 = '1b27a648a0d028ea0adddc536a3ff35a701b761b397d654897638add212e3454';
export const M1_PERSON_ONLY_ENTITIES_SHA256 = '8fe633891058fd25f81b7551aefa23712019bfc86c3fca9a12c4be6e8d347998';
export const M1_PERSON_VOICE_RELATIONS_SHA256 = 'e935b39f2292ace7cf1bb7b50413e78855cf3399e79c83c8ac6d080dc8474a5f';
export const M2_PERSON_NAME_VARIANTS_SHA256 = 'e6b69034f8ad7bc3a7e8f7103a808382503a46518a942a4fe43f13ad5e1f86d2';
export const M2_PERSON_CHARACTER_ROLES_SHA256 = '04cf634cd6eb70f9c971edc4d57a134cfae13374466cf024abc470d1dfaaeed9';

function sha256Hex(bytes, cryptoRef) {
  return cryptoRef.subtle.digest('SHA-256', bytes).then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''));
}

function assertEnvelope(value, projection, { base = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`M2 ${projection} payload must be an object`);
  const schemaOk = projection === 'person-name-variants'
    ? value.schemaVersion === 'terminal-wiki-m2-person-name-variants-v1'
    : projection === 'character-roles'
      ? value.schemaVersion === 'terminal-wiki-m2-person-character-roles-v1'
    : (base
      ? (projection === 'entities' ? value.projection === 'entities' : value.schemaVersion === 'terminal-wiki-m1-person-voice-relations-v1')
      : value.schemaVersion === 'terminal-wiki-m2-person-delta-v1');
  if (!schemaOk || value.projection !== projection || value.publicationStatus !== 'source-only') throw new TypeError(`M2 ${projection} payload contract mismatch`);
  if (!Array.isArray(value.records)) throw new TypeError(`M2 ${projection} records must be an array`);
  return value.records;
}

function normalizeName(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\p{P}\p{S}\s]+/gu, '')
    : '';
}

function workIdFromRelation(relation) {
  const evidence = Array.isArray(relation?.evidence) ? relation.evidence : [];
  for (const item of evidence) {
    const id = item?.sourceRef?.id;
    const match = typeof id === 'string' ? id.match(/^([1-9][0-9]*):/u) : null;
    if (match) return match[1];
  }
  return null;
}

// Canonical work entities encode the numeric EGS work id as a hexadecimal
// suffix (for example wk_000000003f99 -> 16281).  Voice relations use this
// stable scope entity instead of putting an EGS id in their evidence, so
// resolve it before joining against the catalog.
function workIdFromEntityId(workEntityId) {
  if (typeof workEntityId !== 'string') return null;
  const match = workEntityId.match(/^wk_([0-9a-f]+)$/iu);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function freezePerson(person) {
  return Object.freeze({
    ...person,
    aliases: Object.freeze([...person.aliases]),
    roleHints: Object.freeze([...(person.roleHints ?? [])]),
    nameVariants: Object.freeze((person.nameVariants ?? []).map(item => Object.freeze({ ...item }))),
    sourceRefs: Object.freeze(person.sourceRefs.map(item => Object.freeze({ ...item }))),
    credits: Object.freeze(person.credits.map(item => Object.freeze({ ...item })))
  });
}

// EGS creator and VNDB staff records use different entity ids, but a small
// cross-source subset is an exact name match (spacing/punctuation differences
// only). Merge only the unambiguous 1×VNDB + 1..N×EGS groups; same-source
// collisions and multiple VNDB candidates remain separate rather than being
// guessed together. The VNDB entity is retained so its name-variant bindings
// and stable staff id remain the canonical anchor.
function mergeExactCrossSourcePersons(persons) {
  const groups = new Map();
  for (const person of persons.values()) {
    const key = normalizeName(person.canonicalName);
    if (!key) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(person);
    groups.set(key, bucket);
  }
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const vndb = bucket.filter(person => person.sourceRefs.some(ref => ref?.source === 'vndb' && ref?.kind === 'staff'));
    const egs = bucket.filter(person => person.sourceRefs.some(ref => ref?.source === 'egs' && ref?.kind === 'creator'));
    if (vndb.length !== 1 || egs.length === 0) continue;
    const canonical = vndb[0];
    for (const duplicate of egs) {
      canonical.aliases.push(...duplicate.aliases);
      canonical.sourceRefs.push(...duplicate.sourceRefs);
      canonical.roleHints.push(...duplicate.roleHints);
      canonical.credits.push(...duplicate.credits);
      persons.delete(duplicate.entityId);
    }
    canonical.aliases = [...new Set(canonical.aliases.filter(name => name !== canonical.canonicalName))];
    const refs = new Map(canonical.sourceRefs.map(ref => [`${ref.source}:${ref.kind}:${ref.id}`, ref]));
    canonical.sourceRefs = [...refs.values()];
  }
}

function characterRoleMap(records) {
  const map = new Map();
  for (const record of records) {
    if (!record?.workId || !record?.vndbStaffId || !record?.characterId) continue;
    map.set(`${record.workId}:${record.vndbStaffId}:${record.characterId}`, record);
    if (record.characterName) map.set(`${record.workId}:${record.vndbStaffId}:name:${normalizeName(record.characterName)}`, record);
  }
  return map;
}

function buildState(entityRecords, relationRecords, catalogWorks = [], variantRecords = [], characterRoleRecords = []) {
  const catalogById = new Map(catalogWorks.map(work => [String(work.workId), work]));
  const rolesByCredit = characterRoleMap(characterRoleRecords);
  const persons = new Map();
  for (const record of entityRecords) {
    if (record?.entityType !== 'person' || typeof record.entityId !== 'string' || !PERSON_ENTITY_ID.test(record.entityId)) continue;
    persons.set(record.entityId, {
      entityId: record.entityId,
      canonicalName: typeof record.canonicalName === 'string' ? record.canonicalName : '',
      aliases: Array.isArray(record.aliases) ? record.aliases.filter(item => typeof item === 'string') : [],
      sourceRefs: Array.isArray(record.sourceRefs) ? record.sourceRefs : [],
      confidence: record.confidence ?? 'unknown',
      status: record.status ?? 'unknown',
      visibility: record.visibility ?? 'review',
      // Voice classification is derived exclusively from explicit voice
      // relations below. Generic EGS creator records are not evidence.
      roleHints: [],
      credits: []
    });
  }
  for (const relation of relationRecords) {
    const isWorkCredit = relation?.relationType === 'work-credits-person';
    const isVoiceCredit = relation?.relationType === 'character-voiced-by' && relation?.roleCode === 'voice-actor';
    if (!isWorkCredit && !isVoiceCredit) continue;
    if (!PERSON_ENTITY_ID.test(String(relation.object ?? ''))) continue;
    const person = persons.get(relation.object);
    if (!person) continue;
    // Work credits carry an EGS numeric source id in evidence. Voice
    // relations carry the same identity in their canonical scope entity.
    const workId = isWorkCredit
      ? workIdFromRelation(relation)
      : workIdFromEntityId(relation.scope?.workEntityId);
    const work = workId === null ? null : catalogById.get(workId) ?? null;
    const voiceSourceRef = isVoiceCredit
      ? (relation.evidence ?? []).map(item => item?.sourceRef).find(ref => ref?.source === 'vndb' && typeof ref.id === 'string')
      : null;
    const sourceCharacterId = voiceSourceRef?.id?.match(/:c([0-9]+):/u)?.[1]
      ? `c${voiceSourceRef.id.match(/:c([0-9]+):/u)[1]}`
      : null;
    const vndbStaffId = person.sourceRefs.find(ref => ref?.source === 'vndb' && ref?.kind === 'staff')?.id ?? null;
    const roleRecord = isVoiceCredit && vndbStaffId && workId !== null
      ? rolesByCredit.get(`${workId}:${vndbStaffId}:${sourceCharacterId}`)
        ?? rolesByCredit.get(`${workId}:${vndbStaffId}:name:${normalizeName(relation.characterName)}`)
      : null;
    person.credits.push({
      relationId: relation.relationId,
      workId,
      workEntityId: WORK_ENTITY_ID.test(String(isVoiceCredit ? relation.scope?.workEntityId : relation.subject ?? ''))
        ? (isVoiceCredit ? relation.scope.workEntityId : relation.subject)
        : null,
      characterId: isVoiceCredit ? String(relation.subject ?? '') : null,
      sourceCharacterId,
      characterRole: roleRecord?.role ?? null,
      characterName: isVoiceCredit ? (relation.characterName ?? null) : null,
      creditType: isVoiceCredit ? 'character-voiced-by' : 'work-credits-person',
      title: work?.title ?? (workId === null ? '未解析作品' : `作品 #${workId}`),
      releaseDate: work?.releaseDate ?? null,
      roleCode: relation.roleCode ?? 'unknown',
      status: relation.status ?? 'unknown',
      confidence: relation.confidence ?? 'unknown',
      visibility: relation.visibility ?? 'review',
      evidence: Array.isArray(relation.evidence) ? relation.evidence.map(item => ({ sourceRef: item.sourceRef, evidenceClass: item.evidenceClass, snapshotId: item.snapshotId })) : []
    });
  }
  const variantsByEntity = new Map(variantRecords.map(item => [item.personEntityId, item.variants]));
  for (const person of persons.values()) {
    const variants = variantsByEntity.get(person.entityId) ?? [];
    const mainVariant = variants.find(item => item.isMain === true);
    if (mainVariant?.name) person.canonicalName = mainVariant.name;
    person.aliases = [...new Set([...person.aliases, ...variants.map(item => item.name), ...variants.map(item => item.latin).filter(Boolean)])].filter(name => name !== person.canonicalName);
    person.nameVariants = variants;
  }
  mergeExactCrossSourcePersons(persons);
  const records = [...persons.values()].map(person => freezePerson({ ...person, credits: person.credits.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans') || String(a.workId).localeCompare(String(b.workId))) })).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans') || a.entityId.localeCompare(b.entityId));
  const byId = new Map(records.map(person => [person.entityId, person]));
  const search = (query = '') => {
    const needle = normalizeName(query);
    if (!needle) return records;
    return records.filter(person => [person.canonicalName, ...person.aliases].some(value => normalizeName(value).includes(needle)));
  };
  return Object.freeze({ records: Object.freeze(records), byId, search, statistics: Object.freeze({ personCount: records.length, relationCount: relationRecords.length, creditedPersonCount: records.filter(person => person.credits.length > 0).length }) });
}

export function createM2PersonRuntime({ entitiesUrl, relationsUrl, baseEntitiesUrl = null, baseEntitiesSha256 = M1_PERSON_ENTITIES_SHA256, baseRelationsUrl = null, baseRelationsSha256 = M1_PERSON_VOICE_RELATIONS_SHA256, variantsUrl = null, characterRolesUrl = null, manifestUrl = null, catalogWorks = [], fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, cacheMode = 'force-cache' } = {}) {
  if (!(entitiesUrl instanceof URL) || !(relationsUrl instanceof URL)) throw new TypeError('M2 person runtime URLs are required');
  if (typeof fetchImpl !== 'function' || !cryptoRef?.subtle?.digest) throw new TypeError('M2 person runtime requires fetch and Web Crypto');
  let statePromise = null;
  async function fetchJson(url, expectedSha, projection) {
    const response = await fetchImpl(url, { cache: cacheMode });
    if (!response.ok) throw new Error(`M2 ${projection} payload failed: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (!SHA256_PATTERN.test(expectedSha) || await sha256Hex(bytes, cryptoRef) !== expectedSha) throw new Error(`M2 ${projection} payload integrity failed`);
    return { value: JSON.parse(new TextDecoder().decode(bytes)), bytes };
  }
  async function load() {
    if (statePromise) return statePromise;
    statePromise = (async () => {
      if (manifestUrl !== null) {
        const response = await fetchImpl(manifestUrl, { cache: cacheMode });
        if (!response.ok) throw new Error(`M2 manifest failed: HTTP ${response.status}`);
        const manifestBytes = await response.arrayBuffer();
        if (await sha256Hex(manifestBytes, cryptoRef) !== M2_PERSON_MANIFEST_SHA256) throw new Error('M2 manifest integrity failed');
        const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
        if (manifest.schemaVersion !== 'terminal-wiki-m2-person-canonical-manifest-v1' || manifest.publicationStatus !== 'source-only') throw new Error('M2 manifest contract mismatch');
      }
      const [entities, relations, baseEntities, baseRelations, variants, characterRoles] = await Promise.all([
        fetchJson(entitiesUrl, M2_PERSON_ENTITIES_SHA256, 'entities'),
        fetchJson(relationsUrl, M2_PERSON_RELATIONS_SHA256, 'relations'),
        baseEntitiesUrl === null ? null : fetchJson(baseEntitiesUrl, baseEntitiesSha256, 'base entities'),
        baseRelationsUrl === null ? null : fetchJson(baseRelationsUrl, baseRelationsSha256, 'base voice relations'),
        variantsUrl === null ? null : fetchJson(variantsUrl, M2_PERSON_NAME_VARIANTS_SHA256, 'name variants')
        , characterRolesUrl === null ? null : fetchJson(characterRolesUrl, M2_PERSON_CHARACTER_ROLES_SHA256, 'character roles')
      ]);
      const baseRecords = baseEntities === null ? [] : assertEnvelope(baseEntities.value, 'entities', { base: true }).filter(record => record?.entityType === 'person');
      const baseVoiceRelations = baseRelations === null ? [] : assertEnvelope(baseRelations.value, 'relations', { base: true });
      const deltaRecords = assertEnvelope(entities.value, 'entities');
      const variantRecords = variants === null ? [] : assertEnvelope(variants.value, 'person-name-variants');
      const characterRoleRecords = characterRoles === null ? [] : assertEnvelope(characterRoles.value, 'character-roles');
      const state = buildState([...baseRecords, ...deltaRecords], [...baseVoiceRelations, ...assertEnvelope(relations.value, 'relations')], catalogWorks, variantRecords, characterRoleRecords);
      return Object.freeze({ ...state, loadedAt: new Date().toISOString() });
    })().catch(error => { statePromise = null; throw error; });
    return statePromise;
  }
  return Object.freeze({
    load,
    async inspect() { try { const state = await load(); return state.statistics; } catch { return null; } },
    clear() { statePromise = null; }
  });
}
