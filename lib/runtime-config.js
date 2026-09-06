import { DEFAULT_ASSET_BASE, validateAssetBase } from './asset-url.js';

export const PREVIEW_MANIFEST_PATH = 'egs-tier/v1/preview-manifest.json';
export const ENRICHMENT_SIDECAR_SHA256 = '4e314a155a2058a5816b55212b9cb949dbbab0e5bc0f5df4f39dde2467771a45';
export const COMPANY_PROFILE_SIDECAR_SHA256 = 'cfe4a36a09dbfacc1c95d85c44597947564a773cc4dc262fffe8111a4d24154e';
export const PRESENTATION_FAMILIES_SIDECAR_SHA256 = '395eefa12807238ff07a43a05ab2c42f665797f189d59c609bdd796649f17497';
export const MEDIA_CLEARANCE_BRIDGE_SHA256 = '4c9fbb87d58e6262f8c70b6638b0cf745b873a3c458ea9a87a835ef06d47847b';
export const BANGUMI_PUBLIC_BINDINGS_PATH = 'egs-tier-bangumi-public-bindings-v1.json';
export const BANGUMI_PUBLIC_BINDINGS_SHA256 = '213537a704e6caf858684b9b55e0e530edd2fa9d4281385b6fe2373a59f7a350';
export const BANGUMI_RATINGS_PATH = 'egs-tier-bangumi-ratings-v1.20260904-m2-identity-character-image-v1.json';
export const BANGUMI_CANONICAL_ALIAS_FALLBACK_PATH = 'egs-tier-bangumi-canonical-alias-fallback-v1.20260904-m2-identity-character-image-v1.json';
export const AUTHORITY_FANOUT_PATH = 'egs-tier-authority-fanout-v1.20260904-m2-identity-character-image-v1.json';
export const CHARACTER_IMAGE_MAP_SHA256 = '4f3a0c4e7f015e7aa8a52b136a201290d6388a498d1db6c49dbfe06cf6044d15';
export const CHARACTER_IMAGE_ALIAS_MAP_SHA256 = '8e667829cdf2c836a87692423d83d1fa15814ff98337dfb5282c7c41ef93147d';
export const CHARACTER_IMAGE_MAP_SNAPSHOT_ID = 'terminal-wiki-character-public-v3-2026-09-01';
export const CHARACTER_IMAGE_ASSET_BASE = 'https://assets.bishojo.date/terminal-wiki/v1/';
export const CHARACTER_IMAGE_ASSET_FALLBACK_BASE = 'https://raw.githubusercontent.com/Shinki0325/bishoujo-game-cover-assets/main/terminal-wiki/v1/';
export const M2_PERSON_MANIFEST_SHA256 = '2f9434d3644a9fa46473170d06b8d863a95b7a80d206174ea57cfc65b42e88e0';
export const M2_PERSON_ENTITIES_SHA256 = '9122351c524e4c88d5098228e205c1ea294b300c479ed9a3ab984f8a092f5d19';
export const M2_PERSON_RELATIONS_SHA256 = '8764ea09a475b8b9818e5a7ee8828b181d674af1d733c338eb438d7a7c61f766';
export const M2_PERSON_NAME_VARIANTS_SHA256 = 'e6b69034f8ad7bc3a7e8f7103a808382503a46518a942a4fe43f13ad5e1f86d2';
export const M2_PERSON_CHARACTER_ROLES_SHA256 = '723719ca9335c760b49e6fd331ae2ebd3b16fc9b0d1214416e4b4f56fc5124bf';
export const M2_PERSON_NAME_PREFERENCES_SHA256 = '62f507055fb85271d58a1004ff986adc05ae7c7edef3dda59a49eaddf118572e';
export const M2_PERSON_CROSS_SOURCE_CROSSWALK_SHA256 = 'bebac2e0f20310750064cffbdc60ee3861e3fade6f1e8ddf594898617788dfd9';
export const M1_PERSON_ONLY_ENTITIES_SHA256 = '8fe633891058fd25f81b7551aefa23712019bfc86c3fca9a12c4be6e8d347998';
export const M1_PERSON_VOICE_RELATIONS_SHA256 = 'e935b39f2292ace7cf1bb7b50413e78855cf3399e79c83c8ac6d080dc8474a5f';
export const PERSON_PERFORMANCE_MANIFEST_SHA256 = '53e1e3867ea4323751ee2aa187b45fd5aac23ba0fdc170556938eb5d30883083';
export const PERSON_WORK_INDEX_SHA256 = '1525b261ad74f8b174f7807e98e43b053cfd7eba5b2de709a8dd2489526d5562';
export const RUNTIME_FEATURES = Object.freeze({
  keeperGuide: Object.freeze({ enabled: true, p1: true, portraits: true }),
  bangumiPublicBindingsV1: Object.freeze({ enabled: true, sha256: BANGUMI_PUBLIC_BINDINGS_SHA256 }),
  vndbRatingsV1: Object.freeze({ enabled: true, sha256: 'c25d8a94d5a3fcc17a5716a929a46f3c8b13ebdb8637b39794a39334e58fc899' }),
  bangumiRatingsV1: Object.freeze({ enabled: true, sha256: '18ac39e86e7534fb20832a3a533117744f17b96d706f65c2ae9ea1a3efa09162' }),
  bangumiCanonicalAliasFallbackV1: Object.freeze({ enabled: true, sha256: 'd57eb5048c4224936fb5743017e28fa4269745b3485756b923982c706221c064' }),
  authorityFanoutV1: Object.freeze({ enabled: true, sha256: '78d59228afdbb8bdc5b3f48273c3e6c922f5cbacf697d963e9833a375eeaac9a' }),
  projectEntitiesV1: Object.freeze({ enabled: true, mediaClearance: true, characterImages: true }),
  personDirectoryV1: Object.freeze({ enabled: true, performanceCandidate: true }),
  personFilterV1: Object.freeze({ enabled: true })
});
export const DATA_REVISION = 'a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';
export const M2_PERSON_DATA_REVISION = '20260906-galpedia-v1.0.1-beta-voice-integration-v1';
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
  characterImageAliasMap: versionedDataUrl('terminal-wiki-character-image-alias-map-v1.json'),
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
  ,personWorkIndex: new URL('../person-work-index.20260906-v1.json', import.meta.url)
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
