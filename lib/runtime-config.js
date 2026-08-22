import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = 'dd1c28186711fe195b937441513bcc5501142f9c53d245b64e3dc7cacaa14b21';
export const COMPANY_PROFILE_SIDECAR_SHA256 = '3b30bce86d64b7180b46e400ad998bb5c716918a13b20f181755c8ab92bc4ada';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '367bffa3885c6b0c1f0895af3b95588c82c6aa6c08d307fcca2ffc54c2fdd80b';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '7d89963f1ab8b9d266a11f43dd2e030ebd38fb94ee2b86f6d5943e2853400173';
export const RUNTIME_FEATURES = Object.freeze({
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: '439c56ff5838590bc2cdfa7b17d59b86034e8c0c42a1f9e0075e7f333fe1715f' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: 'e20ac604080af4760783610eb0a075d4e23436c63440fdff654f27a93d5d8dcd' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true })
});
export const DATA_REVISION = '809f6a2a67bfad36c25eb2315d98e40bd4a7a7223d4fbee37af13a3155c8a9f2';
export const RUNTIME_DATA_CACHE_MODE = 'force-cache';

function versionedDataUrl(filename) {
  const url = new URL(`../data/${filename}`, import.meta.url);
  url.searchParams.set('v', DATA_REVISION);
  return url;
}

export const DATA_URLS = Object.freeze({
  catalog: versionedDataUrl('catalog.json'),
  enrichment: versionedDataUrl('egs-tier-full-enrichment-v1.json'),
  companyProfile: versionedDataUrl('egs-tier-full-company-profile-v1.json'),
  presentationFamilies: versionedDataUrl('egs-tier-full-presentation-families-v1.json'),
  vndbRatings: versionedDataUrl('egs-tier-vndb-ratings-v1.json'),
  authorityFanout: versionedDataUrl('egs-tier-authority-fanout-v1.json'),
  vndbAdmissions: versionedDataUrl('egs-tier-vndb-admissions-v1.json'),
  indexes: versionedDataUrl('indexes.json'),
  assetsManifest: versionedDataUrl('assets-manifest.json'),
  filterAuthority: versionedDataUrl('filter-authority.json'),
  workGroups: versionedDataUrl('work-groups.json'),
  workGroupReviewQueue: versionedDataUrl('work-group-review-queue.json'),
  workDetailCreditsIndex: versionedDataUrl('work-details/v1/index.json'),
  mediaClearanceBridge: versionedDataUrl('egs-tier-g1-media-clearance-v1.json')
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
