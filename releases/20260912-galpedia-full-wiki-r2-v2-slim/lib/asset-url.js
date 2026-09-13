// Historical media paths use the approved map. Lightweight callers consume
// projected URLs through asset-url-core without waiting for that whole map.
export * from './asset-url-core.js';
import * as core from './asset-url-core.js';
import {lookupFullWikiPublicMediaUrl} from './full-wiki-public-media-map.js';

export function resolveAssetUrl(path, base) {
  return core.resolveAssetUrl(path, base, lookupFullWikiPublicMediaUrl);
}
export function resolveWorkImageUrl(work, base) {
  return core.resolveWorkImageUrl(work, base, lookupFullWikiPublicMediaUrl);
}
export function applyImageAsset(image, work, base) {
  return core.applyImageAsset(image, work, base, lookupFullWikiPublicMediaUrl);
}
