import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = '535ae8b5ca23fe8d11db2165ea79da5c86f210cbbb7e7e0b464b020e6dd9412b';
export const COMPANY_PROFILE_SIDECAR_SHA256 = 'b832b6a0ede144f5cdc29299b7475b6655ba11806daa660202f38ab0c69e59c4';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '5e75a19d7adc25a847d28ec6cd160a992636daf8a100824b4ef14ce0b8530d32';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '2b94cf9d080e8d65571329b5d5b374d579ef59874077356fe12209cb20a70d25';
export const RUNTIME_FEATURES = Object.freeze({
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: '075803c844c6d5c20c27163d08c2b8186e0fa14153a3f2ff581f2b7347e807ef' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: 'cbb10395244fa52313fa602bad2f8e313f4d818a5dbf5a70515ff41e86e73f92' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true })
});
export const DATA_REVISION = '703b8741f1ee70bf395955d54a1628d4ee01adbdc1fb2a4a8084c591dc77cbea';
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
