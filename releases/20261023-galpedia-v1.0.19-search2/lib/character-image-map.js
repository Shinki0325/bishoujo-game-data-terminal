const SCHEMA_VERSION = 'terminal-wiki-character-image-map-v1';
const ALIAS_SCHEMA_VERSION = 'terminal-wiki-character-image-alias-map-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VNDB_SOURCE_CHARACTER_PATTERN = /^c[1-9][0-9]*$/u;
const EGS_SOURCE_CHARACTER_PATTERN = /^[1-9][0-9]*$/u;
const CHARACTER_ENTITY_PATTERN = /^(?:ch_[a-f0-9]{12}|ach_[a-f0-9]{24})$/u;
const ASSET_PATH_PATTERN = /^characters\/v1\/images\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/u;

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
  return value;
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function assertRelativeAssetPath(value, label) {
  if (typeof value !== 'string' || !ASSET_PATH_PATTERN.test(value)) throw new TypeError(`${label} is not a safe character asset path`);
  return value;
}

function normalizeSourceCharacterId(source, value, label) {
  if (source === 'vndb' && typeof value === 'string' && VNDB_SOURCE_CHARACTER_PATTERN.test(value)) return value;
  if (source === 'egs' && ((typeof value === 'string' && EGS_SOURCE_CHARACTER_PATTERN.test(value)) || (Number.isSafeInteger(value) && value > 0))) return String(value);
  throw new TypeError(`${label} identifier is invalid`);
}

function sourceCharacterKey(source, sourceCharacterId) {
  return `${source}:${sourceCharacterId}`;
}

/** Validate the owner-authorized public character image map and build a deterministic lookup. */
export function prepareCharacterImageMap(value, { snapshotId, aliases = null, sourceMapSha256 } = {}) {
  const map = assertObject(value, 'character image map');
  if (map.schemaVersion !== SCHEMA_VERSION || map.collection !== 'terminal-wiki-character-images') throw new TypeError('character image map schema is unsupported');
  assertText(map.snapshotId, 'character image map snapshotId');
  if (snapshotId !== undefined && map.snapshotId !== snapshotId) throw new TypeError('character image map snapshot does not match the runtime pin');
  if (map.publication?.publicationEligible !== true || map.publication?.status !== 'owner-authorized') throw new TypeError('character image map is not owner-authorized');
  if (!Array.isArray(map.mappings)) throw new TypeError('character image map mappings must be an array');
  const bySourceCharacterId = new Map();
  const byEntityAndSourceCharacterId = new Map();
  for (const [index, candidate] of map.mappings.entries()) {
    const row = assertObject(candidate, `character image map mappings[${index}]`);
    const characterId = assertText(row.characterId, `character image map mappings[${index}].characterId`);
    if (!CHARACTER_ENTITY_PATTERN.test(characterId)) throw new TypeError(`character image map mappings[${index}].characterId identifier is invalid`);
    if (row.source !== 'vndb' && row.source !== 'egs') throw new TypeError(`character image map mappings[${index}].source is unsupported`);
    const sourceCharacterId = normalizeSourceCharacterId(row.source, row.sourceCharacterId, `character image map mappings[${index}].sourceCharacterId`);
    assertRelativeAssetPath(row.assetPath, `character image map mappings[${index}].assetPath`);
    assertSha256(row.assetSha256, `character image map mappings[${index}].assetSha256`);
    const key = sourceCharacterKey(row.source, sourceCharacterId);
    const normalized = Object.freeze({
      characterId,
      sourceCharacterId,
      assetPath: row.assetPath,
      assetSha256: row.assetSha256,
      source: row.source
    });
    const existing = bySourceCharacterId.get(key);
    // Multiple work-scoped entities may point at the same source character,
    // but they may only share the lookup key when the selected asset is
    // byte-identical. Conflicting assets fail closed instead of depending on
    // input order.
    if (existing === undefined) {
      bySourceCharacterId.set(key, normalized);
    } else if (existing.assetPath !== normalized.assetPath || existing.assetSha256 !== normalized.assetSha256) {
      throw new TypeError(`character image map mappings[${index}] conflicts with a direct image key`);
    }
    const entityKey = `${characterId}|${key}`;
    const entityExisting = byEntityAndSourceCharacterId.get(entityKey);
    if (entityExisting === undefined) {
      byEntityAndSourceCharacterId.set(entityKey, normalized);
    } else if (entityExisting.assetPath !== normalized.assetPath || entityExisting.assetSha256 !== normalized.assetSha256) {
      throw new TypeError(`character image map mappings[${index}] conflicts with an entity image key`);
    }
  }
  let aliasCount = 0;
  if (aliases !== null) {
    const aliasMap = assertObject(aliases, 'character image alias map');
    if (aliasMap.schemaVersion !== ALIAS_SCHEMA_VERSION) throw new TypeError('character image alias map schema is unsupported');
    if (aliasMap.sourceMapSnapshotId !== map.snapshotId) throw new TypeError('character image alias map snapshot does not match the image map');
    assertSha256(aliasMap.sourceMapSha256, 'character image alias map sourceMapSha256');
    if (sourceMapSha256 !== undefined && aliasMap.sourceMapSha256 !== sourceMapSha256) throw new TypeError('character image alias map source hash does not match the runtime pin');
    if (aliasMap.publication?.publicationEligible !== true || aliasMap.publication?.status !== 'owner-authorized') throw new TypeError('character image alias map is not owner-authorized');
    if (!Array.isArray(aliasMap.records)) throw new TypeError('character image alias map records must be an array');
    const seenAliases = new Set();
    for (const [index, candidate] of aliasMap.records.entries()) {
      const row = assertObject(candidate, `character image alias map records[${index}]`);
      const characterId = assertText(row.characterId, `character image alias map records[${index}].characterId`);
      if (!CHARACTER_ENTITY_PATTERN.test(characterId)) throw new TypeError(`character image alias map records[${index}].characterId identifier is invalid`);
      if (row.source !== 'vndb' && row.source !== 'egs') throw new TypeError(`character image alias map records[${index}].source is unsupported`);
      if (row.targetSource !== 'vndb' && row.targetSource !== 'egs') throw new TypeError(`character image alias map records[${index}].targetSource is unsupported`);
      const aliasSourceCharacterId = normalizeSourceCharacterId(row.source, row.sourceCharacterId, `character image alias map records[${index}].sourceCharacterId`);
      const targetSourceCharacterId = normalizeSourceCharacterId(row.targetSource, row.targetSourceCharacterId, `character image alias map records[${index}].targetSourceCharacterId`);
      if (row.evidenceClass !== 'canonical-source-binding') throw new TypeError(`character image alias map records[${index}].evidenceClass is unsupported`);
      const aliasKey = sourceCharacterKey(row.source, aliasSourceCharacterId);
      const targetKey = sourceCharacterKey(row.targetSource, targetSourceCharacterId);
      if (seenAliases.has(aliasKey)) throw new TypeError(`character image alias map records[${index}] duplicates an alias key`);
      if (bySourceCharacterId.has(aliasKey)) throw new TypeError(`character image alias map records[${index}] collides with a direct image key`);
      const target = byEntityAndSourceCharacterId.get(`${characterId}|${targetKey}`);
      if (target === undefined) throw new TypeError(`character image alias map records[${index}] target does not match the canonical character`);
      seenAliases.add(aliasKey);
      bySourceCharacterId.set(aliasKey, Object.freeze({
        ...target,
        aliasSource: row.source,
        aliasSourceCharacterId
      }));
    }
    aliasCount = seenAliases.size;
    if (aliasMap.summary?.recordCount !== aliasCount) throw new TypeError('character image alias map summary recordCount is invalid');
  }
  return Object.freeze({
    schemaVersion: map.schemaVersion,
    snapshotId: map.snapshotId,
    sourceSnapshotId: map.sourceSnapshotId,
    mappingCount: map.mappings.length,
    aliasCount,
    lookupCount: bySourceCharacterId.size,
    bySourceCharacterId
  });
}

export function applyCharacterImageMapToCharacters(characters, imageMap, { assetBase, fallbackAssetBase } = {}) {
  if (!Array.isArray(characters)) throw new TypeError('characters must be an array');
  if (!imageMap || !(imageMap.bySourceCharacterId instanceof Map)) return Object.freeze(characters.slice());
  return Object.freeze(characters.map(character => {
    const image = resolveCharacterImage(character, imageMap, { assetBase, fallbackAssetBase });
    return image === null ? character : Object.freeze({ ...character, image });
  }));
}

export function resolveCharacterImage(character, imageMap, { assetBase, fallbackAssetBase } = {}) {
  if (!imageMap || !(imageMap.bySourceCharacterId instanceof Map)) return null;
  const base = typeof assetBase === 'string' && assetBase.length > 0
    ? (assetBase.endsWith('/') ? assetBase : `${assetBase}/`)
    : null;
  const fallbackBase = typeof fallbackAssetBase === 'string' && fallbackAssetBase.length > 0
    ? (fallbackAssetBase.endsWith('/') ? fallbackAssetBase : `${fallbackAssetBase}/`)
    : null;
  const egsCharacterId = character?.egsCharacterId;
    const vndbCharacterId = character?.vndbCharacterId;
    const mapping = (egsCharacterId === undefined || egsCharacterId === null
      ? undefined
      : imageMap.bySourceCharacterId.get(sourceCharacterKey('egs', String(egsCharacterId))))
      ?? (typeof vndbCharacterId === 'string'
        ? imageMap.bySourceCharacterId.get(sourceCharacterKey('vndb', vndbCharacterId))
        : undefined);
  if (!mapping) return null;
  return Object.freeze({
      source: mapping.source,
      assetPath: mapping.assetPath,
      assetSha256: mapping.assetSha256,
      url: base === null ? null : new URL(mapping.assetPath, base).href,
      fallbackUrl: fallbackBase === null ? null : new URL(mapping.assetPath, fallbackBase).href
    });
}

export { ASSET_PATH_PATTERN };
