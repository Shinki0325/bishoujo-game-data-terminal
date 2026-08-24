import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = 'be2ba418eadece4bf9b76f8da4146e8696605e1f380e768e4d4c33c83f073bf1';
export const COMPANY_PROFILE_SIDECAR_SHA256 = 'cfe4a36a09dbfacc1c95d85c44597947564a773cc4dc262fffe8111a4d24154e';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '395eefa12807238ff07a43a05ab2c42f665797f189d59c609bdd796649f17497';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '4c9fbb87d58e6262f8c70b6638b0cf745b873a3c458ea9a87a835ef06d47847b';
export const BANGUMI_RATINGS_PATH = 'egs-tier-bangumi-ratings-v1.20260824-confirmed-review-direct-vndb-family-v1.json';
export const BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH = 'egs-tier-bangumi-canonical-alias-fallback-v1.20260824-confirmed-review-direct-vndb-family-v1.json';
export const RUNTIME_FEATURES = Object.freeze({
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: '3b0f0c0d51a10e17454a0b857c5792289690dcbe03815aeeac75098861df2e5f' }),
  bangumiRatingsV1: Object.freeze({ enabled: true, sha256: 'ad6da03ec2f929519e6e34f37c5460d7f8356cad36a0fa3f47e93d8fadd9316e' }),
  bangumiCanonicalAliasFallbackV1: Object.freeze({ enabled: true, sha256: '76948b8fcd5a9889b31fa57cb38b0d191b02b2e76e62222a7db561448ed57609' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: 'e0f41054b7ff944cd063f0361faf1fb2aacb7ce6a6e5e34d89d7c8b98ba0217a' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true })
});
export const DATA_REVISION = 'c9e163dea10aa38dd070a8d2d3d9ae9c9306ff98842ffac2db54ade97872fb63';
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
  bangumiRatings: versionedDataUrl(BANGUMI_RATINGS_PATH),
  bangumiCanonicalAliasFallback: versionedDataUrl(BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH),
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
