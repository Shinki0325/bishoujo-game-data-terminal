const SCHEMA_VERSION = 'terminal-wiki-character-image-map-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_CHARACTER_PATTERN = /^c[1-9][0-9]*$/u;
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

/** Validate the owner-authorized public character image map and build a deterministic lookup. */
export function prepareCharacterImageMap(value, { snapshotId } = {}) {
  const map = assertObject(value, 'character image map');
  if (map.schemaVersion !== SCHEMA_VERSION || map.collection !== 'terminal-wiki-character-images') throw new TypeError('character image map schema is unsupported');
  assertText(map.snapshotId, 'character image map snapshotId');
  if (snapshotId !== undefined && map.snapshotId !== snapshotId) throw new TypeError('character image map snapshot does not match the runtime pin');
  if (map.publication?.publicationEligible !== true || map.publication?.status !== 'owner-authorized') throw new TypeError('character image map is not owner-authorized');
  if (!Array.isArray(map.mappings)) throw new TypeError('character image map mappings must be an array');
  const bySourceCharacterId = new Map();
  for (const [index, candidate] of map.mappings.entries()) {
    const row = assertObject(candidate, `character image map mappings[${index}]`);
    const characterId = assertText(row.characterId, `character image map mappings[${index}].characterId`);
    const sourceCharacterId = assertText(row.sourceCharacterId, `character image map mappings[${index}].sourceCharacterId`);
    if (!CHARACTER_ENTITY_PATTERN.test(characterId) || !SOURCE_CHARACTER_PATTERN.test(sourceCharacterId)) throw new TypeError(`character image map mappings[${index}] identifier is invalid`);
    if (row.source !== 'vndb') throw new TypeError(`character image map mappings[${index}].source is unsupported`);
    assertRelativeAssetPath(row.assetPath, `character image map mappings[${index}].assetPath`);
    assertSha256(row.assetSha256, `character image map mappings[${index}].assetSha256`);
    const existing = bySourceCharacterId.get(sourceCharacterId);
    // Multiple work-scoped entities may point at one VNDB character. Pick the
    // lexicographically stable path so projection does not depend on order.
    if (existing === undefined || row.assetPath < existing.assetPath) {
      bySourceCharacterId.set(sourceCharacterId, Object.freeze({
        characterId,
        sourceCharacterId,
        assetPath: row.assetPath,
        assetSha256: row.assetSha256,
        source: 'vndb'
      }));
    }
  }
  return Object.freeze({
    schemaVersion: map.schemaVersion,
    snapshotId: map.snapshotId,
    sourceSnapshotId: map.sourceSnapshotId,
    mappingCount: map.mappings.length,
    bySourceCharacterId
  });
}

export function applyCharacterImageMapToCharacters(characters, imageMap, { assetBase } = {}) {
  if (!Array.isArray(characters)) throw new TypeError('characters must be an array');
  if (!imageMap || !(imageMap.bySourceCharacterId instanceof Map)) return Object.freeze(characters.slice());
  const base = typeof assetBase === 'string' && assetBase.length > 0
    ? (assetBase.endsWith('/') ? assetBase : `${assetBase}/`)
    : null;
  return Object.freeze(characters.map(character => {
    const sourceId = character?.vndbCharacterId;
    const mapping = imageMap.bySourceCharacterId.get(sourceId);
    if (!mapping) return character;
    const image = Object.freeze({
      source: mapping.source,
      assetPath: mapping.assetPath,
      assetSha256: mapping.assetSha256,
      url: base === null ? null : new URL(mapping.assetPath, base).href
    });
    return Object.freeze({ ...character, image });
  }));
}

export { ASSET_PATH_PATTERN };
