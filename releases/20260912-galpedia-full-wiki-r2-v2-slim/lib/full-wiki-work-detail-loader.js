import { loadPersonDisplayNames } from './full-wiki-person-names.js';
import { createCharacterNamesLoader } from './full-wiki-character-names-v2.js';
import { adaptFullWikiWorkDetail } from './full-wiki-work-detail-adapter.js';

function staticPayloadToHydrated(payload) {
  const relationGroups = {};
  for (const row of payload.relations ?? []) (relationGroups[row.kind] ??= []).push(row);
  const details = row => row?.details ?? {};
  const entities = kind => (payload.entities?.[kind] ?? []).map(row => details(row));
  const presentation = details(payload.presentation).presentation ?? details(payload.presentation);
  const edition = details(payload.edition);
  return {
    work: {
      presentation,
      editions: [edition],
      personRelations: (relationGroups.personRelations ?? []).map(details),
      characterRelations: (relationGroups.characterRelations ?? []).map(details),
      companyRelations: (relationGroups.companyRelations ?? []).map(details),
      bangumiRelations: (relationGroups.bangumiRelations ?? []).map(details),
      bangumiTextClaims: (relationGroups.bangumiTextClaims ?? []).map(details),
      missingStates: details(payload.presentation).missingStates ?? []
    },
    persons: entities('persons'),
    characters: entities('characters'),
    companies: entities('companies')
  };
}

export function createFullWikiWorkDetailLoader({
  enabled = false,
  runtime = null,
  fallbackLoader,
  resolveCharacterImage = null,
  loadCharacterMedia = null,
  loadCharacterNames = createCharacterNamesLoader(),
  loadPersonNames = loadPersonDisplayNames,
  onNameError = error => console.warn('角色中文名暂不可用，保留原名', error),
  onMediaError = () => {},
  onFallback = () => {},
  staticDataClient = null,
  staticWorkIds = null
} = {}) {
  if (!fallbackLoader || typeof fallbackLoader.load !== 'function') throw new TypeError('full wiki fallback loader is required');
  if (enabled && (!runtime || typeof runtime.loadEdition !== 'function' || typeof runtime.hydratePresentationRelations !== 'function')) {
    throw new TypeError('full wiki runtime is required when enabled');
  }

  return Object.freeze({
    async load(workId) {
      if (staticDataClient && (!staticWorkIds || staticWorkIds.has(String(workId)))) {
        try {
          const payload = await staticDataClient.getWorkDetail(workId);
          if (payload?.model) return payload.model;
          const hydrated = staticPayloadToHydrated(payload);
          return adaptFullWikiWorkDetail(hydrated, { editionWorkId: String(workId), resolveCharacterImage: entity => {
            const media = payload.entities?.characters?.find(row => row.id === entity?.characterId)?.media;
            const thumb = media?.thumbnail?.asset;
            const preview = media?.preview?.asset;
            if (!thumb && !preview) return null;
            const base = 'https://wiki-assets.bishojo.date/';
            return { url: base + (thumb?.objectKey || preview?.objectKey), fallbackUrl: preview ? base + preview.objectKey : undefined,
              width: thumb?.width || preview?.width, height: thumb?.height || preview?.height, source: 'static-detail' };
          }});
        } catch (error) {
          // A selected static snapshot is authoritative. A network or integrity
          // failure must stay local and retryable, never switch to old credits.
          throw error;
        }
      }
      if (!enabled) return fallbackLoader.load(workId);
      try {
        const edition = await runtime.loadEdition(String(workId));
        if (!edition) return fallbackLoader.load(workId);
        const hydrated = await runtime.hydratePresentationRelations(edition.route.presentationWorkId);
        if (!hydrated) return fallbackLoader.load(workId);
        const [characterNames, personNames] = await Promise.all([
          loadCharacterNames().catch(error => { onNameError(error); return {}; }),
          loadPersonNames().catch(error => { console.warn('人物显示名暂不可用，保留来源署名', error); return null; })
        ]);
        let images = null;
        if (loadCharacterMedia) {
          try { images = await loadCharacterMedia(hydrated.characters); }
          catch (error) { onMediaError(error, String(workId)); }
        }
        return adaptFullWikiWorkDetail(hydrated, {
          resolveCharacterImage: images ? entity => images.get(entity?.characterId) : resolveCharacterImage,
          characterNames, personNames,
          editionWorkId: String(workId)
        });
      } catch (error) {
        onFallback(error, String(workId));
        return fallbackLoader.load(workId);
      }
    },
    loadCharacterImages(workId) {
      if (staticDataClient && (!staticWorkIds || staticWorkIds.has(String(workId)))) return Promise.resolve(null);
      if (enabled) return Promise.resolve(null);
      return fallbackLoader.loadCharacterImages?.(workId) ?? Promise.resolve(null);
    }
  });
}
