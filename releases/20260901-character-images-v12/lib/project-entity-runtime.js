import {
  adaptMediaVM,
  adaptPersonPageVM,
  adaptCharacterPageVM,
  adaptWorkDetailVM,
  buildMediaProjection,
  buildPersonCharacterProjections,
  PROJECT_ENTITY_CONTRACT_SHA256,
  verifyProjectionEnvelopeIntegrity,
} from './project-entity-consumer.js';
import { applyCharacterImageMapToCharacters } from './character-image-map.js';

export const G1_CANONICAL_MANIFEST_SHA256 = 'c69b54045e69f718627a64e67f1bdd09e7528b28934298d729c4dc695a24c023';
export const G1_MEDIA_ARTIFACT_SHA256 = '878f1c2a79bb526099166bb78b83f8bbd2a311d14ca01a3f7488cd0f079641aa';
export const G1_MEDIA_PAYLOAD_SHA256 = '8f48ff34ee5791345afc5d215a5b314c0408ae655714496fa5235b6a61876b7c';
export const G1_PROJECTION_DATA_REVISION = '0d403ea363e0324094f6e09cd4a63a9d279267c0a87881d1100e3405dfc1f793';

function assertCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.works) || !catalog.snapshot) throw new TypeError('catalog binding is unavailable');
  return catalog;
}

function workDetailProjection(catalog) {
  return Object.freeze({
    records: Object.freeze(catalog.works.map(work => Object.freeze({
      workId: work.workId,
      canonicalEntityId: `egs:work:${work.workId}`,
      title: work.title,
      source: 'projected',
      status: 'confirmed',
      visibility: 'public',
      media: Object.freeze({ thumbnail: work.thumbnail?.url ?? null, preview: work.preview?.url ?? null }),
    }))),
  });
}

function mediaPathMap(envelope, projection) {
  const pathByMediaId = new Map(envelope.records.map(record => [record.mediaEntityId, record.publicPath]));
  const selected = new Map();
  for (const record of projection.records) {
    const thumbnailId = record.compatibility.thumbnail.mediaId;
    const previewId = record.compatibility.preview.mediaId;
    selected.set(record.targetEntityId, Object.freeze({
      thumbnailPath: pathByMediaId.get(thumbnailId) ?? null,
      previewPath: pathByMediaId.get(previewId) ?? null,
      primaryMediaId: record.primaryMediaId,
      fallbackMediaIds: record.fallbackMediaIds,
      availability: record.availability,
    }));
  }
  return selected;
}

/** Validate the exact G1 bridge, then construct all three real consumer VMs. */
export async function createProjectEntityRuntime({ bridge, catalog, dataRevision, characterImageMap = null, characterAssetBase = null, cryptoRef = globalThis.crypto } = {}) {
  const source = assertCatalog(catalog);
  const catalogBytesSha256 = typeof source.catalogSha256 === 'string' ? source.catalogSha256 : null;
  if (catalogBytesSha256 === null) throw new TypeError('catalog SHA-256 is required for project entity runtime');
  const binding = Object.freeze({
    catalogSnapshotId: source.snapshot.snapshotId,
    catalogSha256: catalogBytesSha256,
    // G1 projection identity is frozen by the source-only authority. It is
    // intentionally distinct from Terminal's cache revision for this release.
    dataRevision: G1_PROJECTION_DATA_REVISION,
    contractSha256: PROJECT_ENTITY_CONTRACT_SHA256,
    manifestSha256: G1_CANONICAL_MANIFEST_SHA256,
    mediaArtifactSha256: G1_MEDIA_ARTIFACT_SHA256,
    projectionShas: Object.freeze({ media: G1_MEDIA_PAYLOAD_SHA256 }),
  });
  const envelope = await verifyProjectionEnvelopeIntegrity(bridge, binding, { projection: 'media', cryptoRef });
  if (!envelope.sourceSnapshots.some(item => item.source === 'egs-g1-manifest' && item.sha256 === G1_CANONICAL_MANIFEST_SHA256)
    || !envelope.sourceSnapshots.some(item => item.source === 'egs-g1-media' && item.sha256 === G1_MEDIA_ARTIFACT_SHA256)) {
    throw new TypeError('G1 media bridge authority binding is incomplete');
  }
  const projection = buildMediaProjection(envelope.records);
  const detailProjection = workDetailProjection(source);
  const selectedMediaByWorkId = mediaPathMap(envelope, projection);
  const audit = Object.freeze({
    canonicalWorkCount: source.works.length,
    relationCount: envelope.records.length,
    availableCount: projection.records.filter(item => item.availability === 'available').length,
    unavailableCount: projection.records.filter(item => item.availability !== 'available').length,
    defaultCount: projection.records.filter(item => item.primaryMediaId !== null).length,
    clearanceStatus: 'cleared',
    fullPayloadRead: false,
  });
  return Object.freeze({
    binding,
    runtimeDataRevision: dataRevision,
    envelope,
    projection,
    detailProjection,
    personCharacterProjection: Object.freeze({ ...buildPersonCharacterProjections([]), characterImagesEnabled: characterImageMap !== null }),
    selectedMediaByWorkId,
    audit,
    adaptWorkDetail(workId, legacy = {}) {
      return adaptWorkDetailVM({ workId, legacy, projection: detailProjection, featureFlags: { entityRelationsV1: true, workDetailV1: true } });
    },
    adaptPerson(personEntityId, legacy = {}) {
      return adaptPersonPageVM({ personEntityId, legacy, projection: { records: [] }, featureFlags: { personPageV1: true } });
    },
    adaptCharacter(characterEntityId, legacy = {}) {
      return adaptCharacterPageVM({ characterEntityId, legacy, projection: { records: [] }, featureFlags: { characterPageV1: true } });
    },
    projectCredits(credits, {
      characterImageMap: activeCharacterImageMap = characterImageMap,
      characterAssetBase: activeCharacterAssetBase = characterAssetBase,
    } = {}) {
      const projections = buildPersonCharacterProjections(credits === null ? [] : [credits]);
      const characters = applyCharacterImageMapToCharacters(projections.characters, activeCharacterImageMap, {
        assetBase: activeCharacterAssetBase,
      });
      const imageByCharacterId = new Map(characters.map(character => [character.vndbCharacterId, character.image]));
      const imageByEgsCharacterId = new Map(characters.map(character => [character.egsCharacterId, character.image]));
      const cast = credits === null ? [] : (Array.isArray(credits.cast) ? credits.cast.map(entry => Object.freeze({
        ...entry,
        image: imageByEgsCharacterId.get(entry?.characterId) ?? imageByCharacterId.get(entry?.vndbCharacterId) ?? null,
        scopeLabel: entry?.scope === 'admission' || entry?.sourceScope === 'admission' ? '入池作品' : null
      })) : []);
      return Object.freeze({
        projections: Object.freeze({ ...projections, characters }),
        credits: Object.freeze({ ...(credits ?? {}), cast: Object.freeze(cast) }),
        statistics: projections.statistics,
        adaptPerson: (personEntityId, legacy = {}) => adaptPersonPageVM({ personEntityId, legacy, projection: { records: projections.persons }, featureFlags: { personPageV1: true } }),
        adaptCharacter: (characterEntityId, legacy = {}) => adaptCharacterPageVM({ characterEntityId, legacy, projection: { records: characters }, featureFlags: { characterPageV1: true } }),
      });
    },
    adaptMedia(targetEntityId, legacy = {}) {
      return adaptMediaVM({ targetEntityId, legacy, projection, featureFlags: { mediaProjectionV1: true } });
    },
  });
}

export function applyProjectedMediaToWork(work, selectedMediaByWorkId) {
  const selected = selectedMediaByWorkId?.get?.(work?.workId);
  if (!selected || selected.availability !== 'available') return work;
  return Object.freeze({
    ...work,
    // Keep the legacy URL and filename fields intact; these paths are the
    // public-safe selected derivatives and remain the compatibility fallback.
    projectedThumbnailPath: selected.thumbnailPath,
    projectedPreviewPath: selected.previewPath,
    mediaProjection: Object.freeze({
      primaryMediaId: selected.primaryMediaId,
      fallbackMediaIds: Object.freeze([...selected.fallbackMediaIds]),
      clearanceStatus: 'cleared',
    }),
  });
}
