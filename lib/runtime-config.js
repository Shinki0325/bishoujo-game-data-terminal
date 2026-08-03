import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';

export const DATA_URLS = Object.freeze({
  catalog: new URL('../data/catalog.json', import.meta.url),
  indexes: new URL('../data/indexes.json', import.meta.url),
  assetsManifest: new URL('../data/assets-manifest.json', import.meta.url),
  filterAuthority: new URL('../data/filter-authority.json', import.meta.url),
  workGroups: new URL('../data/work-groups.json', import.meta.url),
  workGroupReviewQueue: new URL('../data/work-group-review-queue.json', import.meta.url)
});

export function configuredAssetBase({
  globalRef = globalThis,
  documentRef = globalThis.document
} = {}) {
  const globalAssetBase = globalRef?.EGS_TIER_ASSET_BASE;
  const configured = typeof globalAssetBase === 'string'
    ? globalAssetBase
    : documentRef?.querySelector('meta[name="egs-tier-asset-base"]')?.getAttribute('content');
  return validateAssetBase(configured ?? DEFAULT_ASSET_BASE);
}
