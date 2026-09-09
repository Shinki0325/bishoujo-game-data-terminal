import { resolveAssetUrl } from './asset-url.js';
import { createBudgetCache } from './budget-cache.js';

/** Shared cover/replacement resolution; local media storage remains owned by its existing store. */
export function createWorkbenchMediaSources({ getMediaStore, assetBase, highDensityPreviewsEnabled, previewMedia, hydrateWorks = null, cacheBudget = {} }) {
  const replacementMetadataCache = createBudgetCache({ maxEntries: 512, ...cacheBudget });
  const coverSourceCache = createBudgetCache({ maxEntries: 512, ...cacheBudget });
  function authorityThumbnailPathForWork(work) {
    const path = work.projectedThumbnailPath ?? work.coverPath;
    return typeof path === 'string' && path.length > 0 ? path : null;
  }

  async function localReplacementUrlForCurrentAuthority(work) {
    const mediaStore = getMediaStore();
    if (mediaStore === null || work.localMediaKind === 'custom') return null;
    const replacement = await replacementFor(work.workId);
    if (replacement?.authorityThumbnailPath !== authorityThumbnailPathForWork(work)) return null;
    return mediaStore.urlForReplacement(work.workId);
  }

  async function hasLocalReplacementForCurrentAuthority(work) {
    const mediaStore = getMediaStore();
    if (mediaStore === null || work.localMediaKind === 'custom') return false;
    const replacement = await replacementFor(work.workId);
    return replacement?.authorityThumbnailPath === authorityThumbnailPathForWork(work);
  }

  function replacementFor(workId) {
    const mediaStore = getMediaStore();
    if (mediaStore === null) return Promise.resolve(null);
    const cached = replacementMetadataCache.get(workId);
    if (cached) return cached;
    const request = mediaStore.replacementFor(workId).catch(error => {
      if (replacementMetadataCache.get(workId) === request) replacementMetadataCache.delete(workId);
      throw error;
    });
    replacementMetadataCache.set(workId, request);
    request.then(() => replacementMetadataCache.settle(workId, request), () => {});
    return request;
  }

  function invalidateMedia(workId) {
    replacementMetadataCache.delete(workId);
    coverSourceCache.delete(workId);
  }

  async function coverUrlForWork(work) {
    const mediaStore = getMediaStore();
    if (mediaStore !== null && work.localMediaKind === 'custom') {
      return mediaStore.urlForCustom(work.workId);
    }
    const replacement = await localReplacementUrlForCurrentAuthority(work);
    if (replacement !== null) return replacement;
    return resolveAssetUrl(authorityThumbnailPathForWork(work), assetBase);
  }

  async function prepareCoverSourcesForWork(work) {
    const thumbnailUrl = await coverUrlForWork(work);
    if (!highDensityPreviewsEnabled || thumbnailUrl.startsWith('blob:')) {
      return Object.freeze({ thumbnailUrl, previewUrl: null });
    }
    const previewUrl = await previewUrlForWork(work);
    return Object.freeze({ thumbnailUrl, previewUrl: previewUrl === thumbnailUrl ? null : previewUrl });
  }

  function coverSourceKey(work) {
    return JSON.stringify([
      authorityThumbnailPathForWork(work),
      work.projectedPreviewPath ?? null,
      work.previewPath ?? null,
      work.coverPath ?? null,
      work.localMediaKind ?? null,
      highDensityPreviewsEnabled
    ]);
  }

  function coverSourcesForWork(work) {
    const key = coverSourceKey(work);
    const cached = coverSourceCache.get(work.workId);
    if (cached?.key === key) return cached.request;
    const request = prepareCoverSourcesForWork(work).catch(error => {
      if (coverSourceCache.get(work.workId)?.request === request) coverSourceCache.delete(work.workId);
      throw error;
    });
    const entry = Object.freeze({ key, request });
    coverSourceCache.set(work.workId, entry);
    request.then(() => coverSourceCache.settle(work.workId, entry), () => {});
    return request;
  }

  async function resolveCoverUrls(works) {
    if (hydrateWorks) works = await hydrateWorks(works);
    const entries = await Promise.all(works.map(async work => [work.workId, await coverSourcesForWork(work)]));
    return new Map(entries);
  }

  async function previewUrlForWork(work) {
    const mediaStore = getMediaStore();
    if (mediaStore !== null && work.localMediaKind === 'custom') {
      return mediaStore.urlForCustom(work.workId);
    }
    const replacement = await localReplacementUrlForCurrentAuthority(work);
    if (replacement !== null) return replacement;
    if (typeof work.projectedPreviewPath === 'string' && work.projectedPreviewPath.length > 0) {
      return resolveAssetUrl(work.projectedPreviewPath, assetBase);
    }
    if (typeof work.previewPath === 'string' && work.previewPath.length > 0) {
      return resolveAssetUrl(work.previewPath, assetBase);
    }
    return previewMedia.urlFor(work.workId, work.coverPath);
  }

  return Object.freeze({ authorityThumbnailPathForWork, hasLocalReplacementForCurrentAuthority, invalidateMedia,
    coverUrlForWork, coverSourcesForWork, resolveCoverUrls, previewUrlForWork });
}
