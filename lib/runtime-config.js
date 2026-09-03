import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = '4e314a155a2058a5816b55212b9cb949dbbab0e5bc0f5df4f39dde2467771a45';
export const COMPANY_PROFILE_SIDECAR_SHA256 = 'cfe4a36a09dbfacc1c95d85c44597947564a773cc4dc262fffe8111a4d24154e';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '395eefa12807238ff07a43a05ab2c42f665797f189d59c609bdd796649f17497';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '4c9fbb87d58e6262f8c70b6638b0cf745b873a3c458ea9a87a835ef06d47847b';
export const BANGUMI_PUBLIC_BINDINGS_PATH = 'egs-tier-bangumi-public-bindings-v1.json';
export const BANGUMI_PUBLIC_BINDINGS_SHA256 = '213537a704e6caf858684b9b55e0e530edd2fa9d4281385b6fe2373a59f7a350';
export const BANGUMI_RATINGS_PATH = 'egs-tier-bangumi-ratings-v1.20260901-character-images-v11.json';
export const BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH = 'egs-tier-bangumi-canonical-alias-fallback-v1.20260901-character-images-v11.json';
export const AUTHORITY_FANOUT_PATH = 'egs-tier-authority-fanout-v1.20260901-character-images-v11.json';
export const CHARACTER_IMAGE_MAP_SHA256 = '4f3a0c4e7f015e7aa8a52b136a201290d6388a498d1db6c49dbfe06cf6044d15';
export const CHARACTER_IMAGE_MAP_SNAPSHOT_ID = 'terminal-wiki-character-public-v3-2026-09-01';
export const CHARACTER_IMAGE_ASSET_BASE = 'https://raw.githubusercontent.com/Shinki0325/bishoujo-game-cover-assets/main/terminal-wiki/v1/';
export const M2_PERSON_MANIFEST_SHA256 = '8ac8a3e9c8d45eb15e697158eae4c89f85de805a90d31f75757973a36792e751';
export const M2_PERSON_ENTITIES_SHA256 = '791f52cfc84821ba0103cc60ca6c68df2f411851abb5afaf2930de9fa9b3341f';
export const M2_PERSON_RELATIONS_SHA256 = '891b37246d0fafc8780f60f212168c58d809a8854c5b76042f5f40d00248bf64';
export const M2_PERSON_NAME_VARIANTS_SHA256 = 'e6b69034f8ad7bc3a7e8f7103a808382503a46518a942a4fe43f13ad5e1f86d2';
export const M2_PERSON_CHARACTER_ROLES_SHA256 = '04cf634cd6eb70f9c971edc4d57a134cfae13374466cf024abc470d1dfaaeed9';
export const M2_PERSON_NAME_PREFERENCES_SHA256 = '62f507055fb85271d58a1004ff986adc05ae7c7edef3dda59a49eaddf118572e';
export const M2_PERSON_CROSS_SOURCE_CROSSWALK_SHA256 = 'd1bfe485580d03e6be0107023075ae123d1e4c2c99f8a533c3ef7dd3ce831545';
export const M1_PERSON_ONLY_ENTITIES_SHA256 = '8fe633891058fd25f81b7551aefa23712019bfc86c3fca9a12c4be6e8d347998';
export const M1_PERSON_VOICE_RELATIONS_SHA256 = 'e935b39f2292ace7cf1bb7b50413e78855cf3399e79c83c8ac6d080dc8474a5f';
export const PERSON_PERFORMANCE_MANIFEST_SHA256 = '34c7e42cd2cd7f69798787a5712a03f398db56da2f0f6acd11e9076f1b0e9739';
export const RUNTIME_FEATURES = Object.freeze({
  bangumiPublicBindingsV1: Object.freeze({ enabled: true, sha256: BANGUMI_PUBLIC_BINDINGS_SHA256 }),
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: 'c25d8a94d5a3fcc17a5716a929a46f3c8b13ebdb8637b39794a39334e58fc899' }),
  bangumiRatingsV1: Object.freeze({ enabled: true, sha256: 'c56159943e39ecfdc0b33ce143de10b231ba9f1daaa41b1c643779bd3f323c44' }),
  bangumiCanonicalAliasFallbackV1: Object.freeze({ enabled: true, sha256: '8fe36d1a70a2d751eb4bcb6b82aee960d8f5382fa92bc6eef935209dc558381f' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: '78d59228afdbb8bdc5b3f48273c3e6c922f5cbacf697d963e9833a375eeaac9a' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true, characterImages: true }),
  personDirectoryV1: Object.freeze({ enabled: true, performanceCandidate: true })
});
export const DATA_REVISION = '8aef1ab0bda145067a63eeeb9f46cc76de9a3d96678691b593527bb64803bd22';
export const M2_PERSON_DATA_REVISION = '20260903-person-performance-shards-v2';
export const RUNTIME_DATA_CACHE_MODE = 'force-cache';
export const TELEMETRY_ENDPOINT = 'https://favorite.bishojo.date/api/telemetry';
export const TELEMETRY_PUBLIC_STATS_ENDPOINT = 'https://favorite.bishojo.date/api/telemetry/public-stats';
export const TELEMETRY_RELEASE_ID = '20260831-telemetry-v3';

function versionedDataUrl(filename) {
  const url = new URL(`../data/${filename}`, import.meta.url);
  url.searchParams.set('v', DATA_REVISION);
  return url;
}

function versionedPersonDataUrl(filename) {
  const url = new URL(`../data/${filename}`, import.meta.url);
  url.searchParams.set('v', M2_PERSON_DATA_REVISION);
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
  mediaClearanceBridge: versionedDataUrl('egs-tier-g1-media-clearance-v1.json'),
  characterImageMap: versionedDataUrl('terminal-wiki-character-image-map-v1.json'),
  m2PersonManifest: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/canonical-manifest.json'),
  m2PersonEntities: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/entities.json'),
  m2PersonRelations: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/relations.json'),
  m2PersonNameVariants: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/name-variants.json'),
  m2PersonCharacterRoles: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/character-roles.json'),
  m2PersonNamePreferences: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/name-preferences.json'),
  m2PersonCrossSourceCrosswalk: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/cross-source-crosswalk.json'),
  m1PersonEntities: versionedPersonDataUrl('terminal-wiki-m1-person-source-only-v1/entities.json'),
  m1PersonVoiceRelations: versionedPersonDataUrl('terminal-wiki-m1-person-source-only-v1/voice-relations.json')
  ,m2PersonPerformanceManifest: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/performance-candidate/performance-manifest.json')
  ,m2PersonPerformanceIndex: versionedPersonDataUrl('terminal-wiki-m2-person-source-only-v1/performance-candidate/directory-index.json')
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
