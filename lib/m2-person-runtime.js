const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PERSON_ENTITY_ID = /^per_[A-Za-z0-9]+$/u;
const WORK_ENTITY_ID = /^wk_[A-Za-z0-9]+$/u;

export const M2_PERSON_MANIFEST_SHA256 = '8ac8a3e9c8d45eb15e697158eae4c89f85de805a90d31f75757973a36792e751';
export const M2_PERSON_ENTITIES_SHA256 = '791f52cfc84821ba0103cc60ca6c68df2f411851abb5afaf2930de9fa9b3341f';
export const M2_PERSON_RELATIONS_SHA256 = '891b37246d0fafc8780f60f212168c58d809a8854c5b76042f5f40d00248bf64';
export const M1_PERSON_ENTITIES_SHA256 = '1b27a648a0d028ea0adddc536a3ff35a701b761b397d654897638add212e3454';
export const M2_PERSON_NAME_VARIANTS_SHA256 = 'e6b69034f8ad7bc3a7e8f7103a808382503a46518a942a4fe43f13ad5e1f86d2';

function sha256Hex(bytes, cryptoRef) {
  return cryptoRef.subtle.digest('SHA-256', bytes).then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''));
}

function assertEnvelope(value, projection, { base = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`M2 ${projection} payload must be an object`);
  const schemaOk = projection === 'person-name-variants'
    ? value.schemaVersion === 'terminal-wiki-m2-person-name-variants-v1'
    : (base ? value.projection === 'entities' : value.schemaVersion === 'terminal-wiki-m2-person-delta-v1');
  if (!schemaOk || value.projection !== projection || value.publicationStatus !== 'source-only') throw new TypeError(`M2 ${projection} payload contract mismatch`);
  if (!Array.isArray(value.records)) throw new TypeError(`M2 ${projection} records must be an array`);
  return value.records;
}

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
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

function freezePerson(person) {
  return Object.freeze({
    ...person,
    aliases: Object.freeze([...person.aliases]),
    nameVariants: Object.freeze((person.nameVariants ?? []).map(item => Object.freeze({ ...item }))),
    sourceRefs: Object.freeze(person.sourceRefs.map(item => Object.freeze({ ...item }))),
    credits: Object.freeze(person.credits.map(item => Object.freeze({ ...item })))
  });
}

function buildState(entityRecords, relationRecords, catalogWorks = [], variantRecords = []) {
  const catalogById = new Map(catalogWorks.map(work => [String(work.workId), work]));
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
      credits: []
    });
  }
  for (const relation of relationRecords) {
    if (relation?.relationType !== 'work-credits-person' || !PERSON_ENTITY_ID.test(String(relation.object ?? ''))) continue;
    const person = persons.get(relation.object);
    if (!person) continue;
    const workId = workIdFromRelation(relation);
    const work = workId === null ? null : catalogById.get(workId) ?? null;
    person.credits.push({
      relationId: relation.relationId,
      workId,
      workEntityId: WORK_ENTITY_ID.test(String(relation.subject ?? '')) ? relation.subject : null,
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
    person.aliases = [...new Set([...person.aliases, ...variants.map(item => item.name), ...variants.map(item => item.latin).filter(Boolean)])].filter(name => name !== person.canonicalName);
    person.nameVariants = variants;
  }
  const records = [...persons.values()].map(person => freezePerson({ ...person, credits: person.credits.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans') || String(a.workId).localeCompare(String(b.workId))) })).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans') || a.entityId.localeCompare(b.entityId));
  const byId = new Map(records.map(person => [person.entityId, person]));
  const search = (query = '') => {
    const needle = normalizeName(query);
    if (!needle) return records;
    return records.filter(person => [person.canonicalName, ...person.aliases].some(value => normalizeName(value).includes(needle)));
  };
  return Object.freeze({ records: Object.freeze(records), byId, search, statistics: Object.freeze({ personCount: records.length, relationCount: relationRecords.length, creditedPersonCount: records.filter(person => person.credits.length > 0).length }) });
}

export function createM2PersonRuntime({ entitiesUrl, relationsUrl, baseEntitiesUrl = null, variantsUrl = null, manifestUrl = null, catalogWorks = [], fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, cacheMode = 'force-cache' } = {}) {
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
      const [entities, relations, baseEntities, variants] = await Promise.all([
        fetchJson(entitiesUrl, M2_PERSON_ENTITIES_SHA256, 'entities'),
        fetchJson(relationsUrl, M2_PERSON_RELATIONS_SHA256, 'relations'),
        baseEntitiesUrl === null ? null : fetchJson(baseEntitiesUrl, M1_PERSON_ENTITIES_SHA256, 'base entities'),
        variantsUrl === null ? null : fetchJson(variantsUrl, M2_PERSON_NAME_VARIANTS_SHA256, 'name variants')
      ]);
      const baseRecords = baseEntities === null ? [] : assertEnvelope(baseEntities.value, 'entities', { base: true }).filter(record => record?.entityType === 'person');
      const deltaRecords = assertEnvelope(entities.value, 'entities');
      const variantRecords = variants === null ? [] : assertEnvelope(variants.value, 'person-name-variants');
      const state = buildState([...baseRecords, ...deltaRecords], assertEnvelope(relations.value, 'relations'), catalogWorks, variantRecords);
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
