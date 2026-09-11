import { loadPersonDisplayNames } from './full-wiki-person-names.js';
import { createCharacterNamesLoader } from './full-wiki-character-names-v2.js';
import { adaptFullWikiWorkDetail } from './full-wiki-work-detail-adapter.js';

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
  onFallback = () => {}
} = {}) {
  if (!fallbackLoader || typeof fallbackLoader.load !== 'function') throw new TypeError('full wiki fallback loader is required');
  if (enabled && (!runtime || typeof runtime.loadEdition !== 'function' || typeof runtime.hydratePresentationRelations !== 'function')) {
    throw new TypeError('full wiki runtime is required when enabled');
  }

  return Object.freeze({
    async load(workId) {
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
      if (enabled) return Promise.resolve(null);
      return fallbackLoader.loadCharacterImages?.(workId) ?? Promise.resolve(null);
    }
  });
}
