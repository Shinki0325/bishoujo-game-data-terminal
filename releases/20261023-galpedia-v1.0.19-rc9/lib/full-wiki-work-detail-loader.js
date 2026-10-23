import { versionScopeClient } from './version-scope-client.js';
import { loadPersonDisplayNames } from './full-wiki-person-names.js';
import { createCharacterNamesLoader } from './full-wiki-character-names-v2.js';
import { adaptFullWikiWorkDetail } from './full-wiki-work-detail-adapter.js';

async function withStaticPersonLinks(model, loadPersonNames) {
  const groups = [
    ...Object.values(model.staff ?? {}),
    ...(model.cast ?? []).map(character => character.actors),
    ...(model.songs ?? []).flatMap(song => Object.values(song.credits ?? {}))
  ].filter(Array.isArray);
  const needsIdentity = person => !/^per_[A-Za-z0-9]+$/u.test(person.personId ?? '')
    && [person.canonicalEntityId, person.sourcePersonId, person.creatorId].some(Boolean);
  if (!groups.some(group => group.some(needsIdentity))) return model;
  // Static models retain source identities. Resolve those against the pinned
  // directory identity map; display names are never identity lookup keys.
  const names = await loadPersonNames();
  const link = person => {
    if (!needsIdentity(person)) return person;
    const preferred = [person.canonicalEntityId, person.sourcePersonId, person.creatorId]
      .filter(Boolean).map(id => names?.get(id)).find(row => /^per_[A-Za-z0-9]+$/u.test(row?.entityId ?? ''));
    return preferred ? { ...person, personId: preferred.entityId, personDisplayName: preferred.displayName } : person;
  };
  const linkedGroups = groups => Object.fromEntries(Object.entries(groups)
    .map(([key, entries]) => [key, Array.isArray(entries) ? entries.map(link) : entries]));
  return { ...model,
    ...(model.staff ? { staff: linkedGroups(model.staff) } : {}),
    ...(model.cast ? { cast: model.cast.map(character => ({ ...character,
      ...(character.actors ? { actors: character.actors.map(link) } : {}) })) } : {}),
    ...(model.songs ? { songs: model.songs.map(song => ({ ...song,
      ...(song.credits ? { credits: linkedGroups(song.credits) } : {}) })) } : {})
  };
}

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
  staticWorkIds = null,
  scopeClient = null
} = {}) {
  if (!fallbackLoader || typeof fallbackLoader.load !== 'function') throw new TypeError('full wiki fallback loader is required');
  if (enabled && (!runtime || typeof runtime.loadEdition !== 'function' || typeof runtime.hydratePresentationRelations !== 'function')) {
    throw new TypeError('full wiki runtime is required when enabled');
  }

  const fallback = async id => { const model = await fallbackLoader.load(id); return scopeClient && model ? scopeClient.work(model, id) : model; };
  return Object.freeze({
    async load(workId) {
      const scoped = await versionScopeClient.work(workId);
      if (scoped) return withStaticPersonLinks(scopeClient ? await scopeClient.work(scoped, workId) : scoped, loadPersonNames);
      if (staticDataClient && (!staticWorkIds || staticWorkIds.has(String(workId)))) {
        try {
          const payload = await staticDataClient.getWorkDetail(workId);
          if (payload?.model) return withStaticPersonLinks(scopeClient ? await scopeClient.work(payload.model, workId) : payload.model, loadPersonNames);
          const hydrated = staticPayloadToHydrated(payload);
          const personNames = await loadPersonNames();
          const model = adaptFullWikiWorkDetail(hydrated, { editionWorkId: String(workId), personNames, resolveCharacterImage: entity => {
            const media = payload.entities?.characters?.find(row => row.id === entity?.characterId)?.media;
            const thumb = media?.thumbnail?.asset;
            const preview = media?.preview?.asset;
            if (!thumb && !preview) return null;
            const base = 'https://wiki-assets.bishojo.date/';
            return { url: base + (thumb?.objectKey || preview?.objectKey), fallbackUrl: preview ? base + preview.objectKey : undefined,
              width: thumb?.width || preview?.width, height: thumb?.height || preview?.height, source: 'static-detail' };
          }});
          return scopeClient ? scopeClient.work(model, workId) : model;
        } catch (error) {
          // A selected static snapshot is authoritative. A network or integrity
          // failure must stay local and retryable, never switch to old credits.
          throw error;
        }
      }
      if (!enabled) return fallback(workId);
      try {
        const edition = await runtime.loadEdition(String(workId));
        if (!edition) return fallback(workId);
        const hydrated = await runtime.hydratePresentationRelations(edition.route.presentationWorkId);
        if (!hydrated) return fallback(workId);
        const [characterNames, personNames] = await Promise.all([
          loadCharacterNames().catch(error => { onNameError(error); return {}; }),
          loadPersonNames().catch(error => { console.warn('人物显示名暂不可用，保留来源署名', error); return null; })
        ]);
        let images = null;
        if (loadCharacterMedia) {
          try { images = await loadCharacterMedia(hydrated.characters); }
          catch (error) { onMediaError(error, String(workId)); }
        }
        const model = adaptFullWikiWorkDetail(hydrated, {
          resolveCharacterImage: images ? entity => images.get(entity?.characterId) : resolveCharacterImage,
          characterNames, personNames,
          editionWorkId: String(workId)
        });
        return scopeClient ? scopeClient.work(model, workId) : model;
      } catch (error) {
        onFallback(error, String(workId));
        return fallback(workId);
      }
    },
    loadCharacterImages(workId) {
      if (staticDataClient && (!staticWorkIds || staticWorkIds.has(String(workId)))) return Promise.resolve(null);
      if (enabled) return Promise.resolve(null);
      return fallbackLoader.loadCharacterImages?.(workId) ?? Promise.resolve(null);
    }
  });
}
