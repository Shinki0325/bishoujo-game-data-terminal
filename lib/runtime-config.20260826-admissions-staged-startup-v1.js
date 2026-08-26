import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = 'be2ba418eadece4bf9b76f8da4146e8696605e1f380e768e4d4c33c83f073bf1';
export const COMPANY_PROFILE_SIDECAR_SHA256 = 'cfe4a36a09dbfacc1c95d85c44597947564a773cc4dc262fffe8111a4d24154e';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '395eefa12807238ff07a43a05ab2c42f665797f189d59c609bdd796649f17497';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '4c9fbb87d58e6262f8c70b6638b0cf745b873a3c458ea9a87a835ef06d47847b';
export const BANGUMI_PUBLIC_BINDINGS_PATH = 'egs-tier-bangumi-public-bindings-v1.json';
export const BANGUMI_PUBLIC_BINDINGS_SHA256 = '213537a704e6caf858684b9b55e0e530edd2fa9d4281385b6fe2373a59f7a350';
export const BANGUMI_RATINGS_PATH = 'egs-tier-bangumi-ratings-v1.20260826-admissions-staged-startup-v1.json';
export const BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH = 'egs-tier-bangumi-canonical-alias-fallback-v1.20260826-admissions-staged-startup-v1.json';
export const AUTHORITY_FANOUT_PATH = 'egs-tier-authority-fanout-v1.20260826-admissions-staged-startup-v1.json';
export const RUNTIME_FEATURES = Object.freeze({
  bangumiPublicBindingsV1: Object.freeze({ enabled: true, sha256: BANGUMI_PUBLIC_BINDINGS_SHA256 }),
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: 'c25d8a94d5a3fcc17a5716a929a46f3c8b13ebdb8637b39794a39334e58fc899' }),
  bangumiRatingsV1: Object.freeze({ enabled: true, sha256: 'c56159943e39ecfdc0b33ce143de10b231ba9f1daaa41b1c643779bd3f323c44' }),
  bangumiCanonicalAliasFallbackV1: Object.freeze({ enabled: true, sha256: 'dc5ccfa5a72d5966eac41c31c5a91ab485e3e085c97367c79145e2debe50d5c7' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: '78d59228afdbb8bdc5b3f48273c3e6c922f5cbacf697d963e9833a375eeaac9a' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true })
});
export const DATA_REVISION = '99cb3e1e1b99112016499251a9e9bbe89068ac605d12ff3606da31cd67ce7682';
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
  bangumiPublicBindings: versionedDataUrl(BANGUMI_PUBLIC_BINDINGS_PATH),
  vndbRatings: versionedDataUrl('egs-tier-vndb-ratings-v1.json'),
  bangumiRatings: versionedDataUrl(BANGUMI_RATINGS_PATH),
  bangumiCanonicalAliasFallback: versionedDataUrl(BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH),
  authorityFanout: versionedDataUrl(AUTHORITY_FANOUT_PATH),
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
