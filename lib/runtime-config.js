import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = '38266e17abb6af30f0300a5e6a52620f2017833bf43cf1da6c6dd673430e877f';
export const COMPANY_PROFILE_SIDECAR_SHA256 = '4aa1f908303698996131ab69fc63bbbc2767b826e7caf3001ce4672d8c5fa3ff';

export const DATA_URLS = Object.freeze({
  catalog: new URL('../data/catalog.json', import.meta.url),
  enrichment: new URL('../data/egs-tier-full-enrichment-v1.json', import.meta.url),
  companyProfile: new URL('../data/egs-tier-full-company-profile-v1.json', import.meta.url),
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
