import { characterDisplayName } from './full-wiki-character-names-v2.js';
const STAFF_ROLE_GROUPS = Object.freeze({
  artwork: 'artwork',
  art: 'artwork',
  scenario: 'scenario',
  music: 'music',
  'character-design': 'other',
  chardesign: 'other',
  director: 'other',
  editor: 'other',
  other: 'other',
  qa: 'other',
  songs: 'other',
  staff: 'other',
  translator: 'other',
  vocalist: 'other'
});
const STAFF_ROLE_LABELS = Object.freeze({
  artwork: '原画',
  art: '原画',
  scenario: '剧本',
  music: '作品音乐',
  'character-design': '角色设计',
  chardesign: '角色设计',
  director: '导演',
  editor: '编辑',
  other: '其他',
  qa: '品质保证',
  songs: '歌曲',
  staff: '制作人员',
  translator: '翻译',
  vocalist: '歌手',
  'voice-actor': '声优'
});
const STAFF_ROLE_DEDUP_KEYS = Object.freeze({
  art: 'artwork',
  chardesign: 'character-design'
});

const EDITION_PROFILE_FIELD_LABELS = Object.freeze({
  height: '身高',
  weight: '体重',
  age: '年龄',
  bust: '胸围',
  waist: '腰围',
  hip: '臀围',
  cupSize: '罩杯',
  birthday: '生日',
  bloodType: '血型',
  sex: '性别',
  gender: '性别'
});
const EDITION_PROFILE_FIELD_UNITS = Object.freeze({
  height: 'cm',
  bust: 'cm',
  waist: 'cm',
  hip: 'cm',
  weight: 'kg',
  age: '岁'
});

function identityName(entity, fallback) {
  return entity?.name || entity?.latin || entity?.displayName || fallback || '未命名人物';
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').replace(/[\s・·._-]+/gu, '').toLocaleLowerCase('ja');
}

function nonEmptyText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function canonicalEditionFactValue(field, evidence) {
  const comparison = nonEmptyText(evidence?.comparisonValue);
  if (!comparison) return null;
  const unit = EDITION_PROFILE_FIELD_UNITS[field];
  if (unit && /^[-+]?\d+(?:\.\d+)?$/u.test(comparison)) return `${comparison} ${unit}`;
  return comparison;
}

/**
 * Work/edition evidence is deliberately additive.  It is never copied into
 * entity.metadata and it is never selected from another edition.  The raw
 * source value remains visible when the producer could not safely derive one
 * scalar comparisonValue.
 */
function editionProfileFacts(metadataEvidence, editionWorkId) {
  if (!editionWorkId || !metadataEvidence || typeof metadataEvidence !== 'object') return [];
  const expectedWorkId = String(editionWorkId);
  const facts = [];
  const seen = new Set();
  for (const [field, evidenceList] of Object.entries(metadataEvidence)) {
    const label = EDITION_PROFILE_FIELD_LABELS[field];
    if (!label || !Array.isArray(evidenceList)) continue;
    for (const evidence of evidenceList) {
      if (!evidence || typeof evidence !== 'object' || evidence.scope !== 'sourceWork' || evidence.source !== 'egs') continue;
      if (String(evidence.sourceWorkId ?? '') !== expectedWorkId) continue;
      const rawValue = nonEmptyText(evidence.value);
      const displayValue = canonicalEditionFactValue(field, evidence) ?? rawValue;
      if (!displayValue) continue;
      const source = nonEmptyText(evidence.source);
      const sourceCharacterId = nonEmptyText(evidence.sourceCharacterId);
      const sourceWorkId = nonEmptyText(evidence.sourceWorkId);
      const sourceField = nonEmptyText(evidence.sourceField);
      const key = [field, displayValue, source ?? '', sourceCharacterId ?? '', sourceWorkId ?? '', sourceField ?? ''].join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        label: `${label}（本版本）`,
        value: displayValue,
        valueContext: canonicalEditionFactValue(field, evidence) ? null : '原文',
        source,
        sourceCharacterId,
        sourceWorkId,
        sourceField,
        scoped: true
      });
    }
  }
  return facts;
}

function actorRecord(relation, personById, personNames) {
  const sourcePersonId = relation.sourcePersonId || relation.canonicalEntityId || (relation.bangumiPersonId ? `bangumi:person:${relation.bangumiPersonId}` : undefined);
  const entity = personById.get(sourcePersonId) || personById.get(relation.canonicalEntityId);
  const preferred = personNames?.get(relation.canonicalEntityId) ?? personNames?.get(sourcePersonId);
  return Object.freeze({
    personId: preferred?.entityId,
    personDisplayName: preferred?.displayName,
    creditedName: relation.creditedName || relation.name || entity?.name || undefined,
    creatorId: relation.canonicalEntityId || relation.sourcePersonId || relation.bangumiPersonId,
    sourcePersonId,
    canonicalEntityId: relation.canonicalEntityId,
    name: identityName(entity, relation.creditedName || relation.name),
    detail: relation.sourceRoleDetailName || undefined,
    roleCode: relation.roleCode || undefined,
    roleLabel: STAFF_ROLE_LABELS[relation.roleCode] || relation.roleCode || undefined,
    identityStatus: relation.identityStatus,
    relationId: relation.relationId,
    source: relation.source
  });
}

export function adaptFullWikiWorkDetail(hydrated, { resolveCharacterImage = null, editionWorkId = null, characterNames = {}, personNames = null } = {}) {
  if (!hydrated?.work || !Array.isArray(hydrated.persons) || !Array.isArray(hydrated.companies) || !Array.isArray(hydrated.characters)) {
    throw new TypeError('full wiki work detail hydration is required');
  }
  const { work } = hydrated;
  const personById = new Map(hydrated.persons.flatMap(item => [[item.sourcePersonId, item], [item.canonicalEntityId, item]].filter(([id]) => id)));
  const companyById = new Map(hydrated.companies.flatMap(item => [[item.sourceCompanyId, item], [item.canonicalEntityId, item]].filter(([id]) => id)));
  const characterById = new Map(hydrated.characters.map(item => [item.characterId, item]));
  // A source-selected roster is authoritative for this work. Build
  // namespace-qualified source-ID aliases only for voice-credit attachment;
  // names and bare numeric IDs are deliberately excluded.
  const characterKeyBySourceId = new Map();
  const ambiguousCharacterSourceIds = new Set();
  const sourceNamespace = value => ['vndb', 'egs', 'bangumi', 'canonical'].includes(String(value)) ? String(value) : null;
  const sourceKey = (namespace, sourceId) => {
    const normalizedNamespace = sourceNamespace(namespace);
    if (!normalizedNamespace || sourceId === null || sourceId === undefined || sourceId === '') return null;
    return `${normalizedNamespace}:${String(sourceId)}`;
  };
  const bindCharacterSourceId = (namespace, sourceId, characterId) => {
    const key = sourceKey(namespace, sourceId);
    if (!key || ambiguousCharacterSourceIds.has(key)) return;
    const existing = characterKeyBySourceId.get(key);
    if (existing && existing !== characterId) {
      characterKeyBySourceId.delete(key);
      ambiguousCharacterSourceIds.add(key);
      return;
    }
    characterKeyBySourceId.set(key, characterId);
  };
  const resolveCharacterSourceId = (namespace, sourceId) => {
    const key = sourceKey(namespace, sourceId);
    return key && !ambiguousCharacterSourceIds.has(key) ? characterKeyBySourceId.get(key) : undefined;
  };
  const staff = { artwork: [], scenario: [], music: [], other: [] };
  const staffSeen = new Map(Object.keys(staff).map(role => [role, new Set()]));
  for (const relation of work.personRelations) {
    // Voice credits belong exclusively to the cast/声优 surface.  Every other
    // source role remains visible in one of the production groups.
    if (relation.roleCode === 'voice-actor') continue;
    const roleGroup = STAFF_ROLE_GROUPS[relation.roleCode] || 'other';
    // A mapped VNDB family can contain one EGS credit per edition plus a
    // source-native VNDB credit.  They identify the same person when the
    // canonical ID and role agree, so only keep the first display record.
    const identity = relation.canonicalEntityId
      || relation.sourcePersonId
      || (relation.bangumiPersonId ? `bangumi:person:${relation.bangumiPersonId}` : null)
      || relation.relationId;
    const roleKey = STAFF_ROLE_DEDUP_KEYS[relation.roleCode] || relation.roleCode || 'other';
    const key = `${roleGroup}\u0000${roleKey}\u0000${String(identity || '').trim()}`;
    const seen = staffSeen.get(roleGroup);
    if (seen.has(key)) continue;
    seen.add(key);
    staff[roleGroup].push(actorRecord(relation, personById, personNames));
  }

  const cast = new Map();
  const normalizedEditionWorkId = nonEmptyText(editionWorkId);
  const characterKeyByBangumiId = new Map();
  const characterKeyByName = new Map();
  for (const relation of work.characterRelations) {
    const entity = characterById.get(relation.characterId);
    const key = relation.characterId;
    const display = characterDisplayName(entity, characterNames, relation.name || key);
    const item = {
      characterId: key,
      characterName: display.name,
      sourceIds: entity?.sourceIds,
      originalCharacterName: display.originalName,
      characterNameSource: display.source,
      bangumiNameCharacterId: display.sourceCharacterId,
      role: relation.characterRole || relation.role || undefined,
      status: relation.status,
      identityStatus: entity?.identityStatus,
      metadata: entity?.metadata || {},
      descriptions: Array.isArray(entity?.descriptions) ? entity.descriptions : [],
      profileFacts: [
        ...(Array.isArray(entity?.profileFacts) ? entity.profileFacts : []),
        ...editionProfileFacts(entity?.metadataEvidence, normalizedEditionWorkId)
      ],
      metadataCandidateConflicts: entity?.metadataCandidateConflicts && typeof entity.metadataCandidateConflicts === 'object' ? entity.metadataCandidateConflicts : {},
      image: typeof resolveCharacterImage === 'function' ? resolveCharacterImage(entity, relation) || undefined : undefined,
      actors: []
    };
    cast.set(key, item);
    bindCharacterSourceId('canonical', key, key);
    bindCharacterSourceId('vndb', entity?.sourceIds?.vndbCharacterId, key);
    for (const sourceId of entity?.sourceIds?.egsCharacterIds ?? []) bindCharacterSourceId('egs', sourceId, key);
    for (const source of entity?.sourceIds?.bangumi ?? []) {
      bindCharacterSourceId('bangumi', source.characterId, key);
      characterKeyByBangumiId.set(String(source.characterId), key);
    }
    for (const name of [relation.name, entity?.displayName, entity?.originalNameCandidate, ...(entity?.aliases ?? [])]) {
      const normalized = normalizeName(name);
      if (normalized && !characterKeyByName.has(normalized)) characterKeyByName.set(normalized, key);
    }
  }

  function ensureCast(relation, preferredKey) {
    const normalized = normalizeName(relation.characterName || relation.sourceRoleDetailName);
    const key = preferredKey || characterKeyByName.get(normalized) || `source:${relation.source}:${relation.bangumiCharacterId || relation.vndbCharacterId || normalized || relation.relationId}`;
    if (!cast.has(key)) cast.set(key, {
      characterId: key,
      characterName: relation.characterName || relation.sourceRoleDetailName || '未命名角色',
      role: relation.characterRole || relation.role || undefined,
      status: relation.identityStatus,
      identityStatus: relation.identityStatus,
      metadata: {},
      descriptions: [],
      profileFacts: [],
      metadataCandidateConflicts: {},
      actors: []
    });
    return cast.get(key);
  }

  const voiceRelations = [
    ...work.bangumiRelations.filter(item => item.relationType === 'character-voiced-by'),
    ...work.personRelations.filter(item => item.roleCode === 'voice-actor')
  ];
  const sourceRoster = work.presentation?.rosterSource;
  const hasSourceRoster = typeof sourceRoster === 'string' ? sourceRoster.trim().length > 0 : Boolean(sourceRoster);
  for (const relation of voiceRelations) {
    let preferredKey;
    if (hasSourceRoster) {
      const explicitCharacterIds = [];
      const addCanonical = value => {
        if (value !== null && value !== undefined && value !== '' && cast.has(String(value))) explicitCharacterIds.push(['canonical', value]);
      };
      const addSource = (namespace, value) => {
        if (sourceNamespace(namespace) && value !== null && value !== undefined && value !== '') explicitCharacterIds.push([namespace, value]);
      };
      addCanonical(relation.characterId);
      addCanonical(relation.canonicalCharacterId);
      addSource('egs', relation.egsCharacterId);
      addSource('bangumi', relation.bangumiCharacterId);
      addSource('vndb', relation.vndbCharacterId);
      addSource(relation.source, relation.sourceCharacterId);
      for (const value of Array.isArray(relation.characterIds) ? relation.characterIds : []) {
        if (value && typeof value === 'object') addSource(value.source, value.sourceCharacterId ?? value.characterId ?? value.id);
        else addCanonical(value);
      }
      preferredKey = explicitCharacterIds.map(([namespace, value]) => resolveCharacterSourceId(namespace, value)).find(Boolean) || null;
      // With a source roster, an unmatched voice credit is not a character
      // admission. Do not fall back to names or create source: entries.
      if (!preferredKey) continue;
    } else {
      // Keep the pre-existing legacy behavior when no rosterSource is declared.
      preferredKey = relation.bangumiCharacterId
        ? characterKeyByBangumiId.get(String(relation.bangumiCharacterId))
        : relation.vndbCharacterId
          ? `char_${relation.vndbCharacterId}`
          : null;
    }
    const item = ensureCast(relation, preferredKey);
    const actor = actorRecord(relation, personById, personNames);
    if (!item.actors.some(existing => existing.creatorId === actor.creatorId && existing.name === actor.name)) item.actors.push(actor);
  }

  const companies = work.companyRelations.map(relation => {
    const sourceCompanyId = relation.sourceCompanyId || relation.canonicalEntityId;
    const entity = companyById.get(sourceCompanyId) || companyById.get(relation.canonicalEntityId);
    return Object.freeze({
      companyId: relation.canonicalEntityId || relation.sourceCompanyId,
      sourceCompanyId,
      canonicalEntityId: relation.canonicalEntityId,
      name: identityName(entity, relation.name),
      roleCodes: Object.freeze([...(relation.roleCodes ?? [])]),
      identityStatus: relation.identityStatus,
      relationId: relation.relationId,
      source: relation.source
    });
  });

  return Object.freeze({
    presentationWorkId: work.presentation.presentationWorkId,
    staff: Object.freeze(Object.fromEntries(Object.entries(staff).map(([role, entries]) => [role, Object.freeze(entries)]))),
    cast: Object.freeze([...cast.values()].map(item => Object.freeze({ ...item, actors: Object.freeze(item.actors) }))),
    songs: Object.freeze([]),
    companies: Object.freeze(companies),
    missingStates: Object.freeze([...(work.missingStates ?? [])]),
    source: 'terminal-wiki-full-runtime-v7'
  });
}
