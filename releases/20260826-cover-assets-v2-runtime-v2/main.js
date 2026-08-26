import {
  resolveAssetUrl,
  validateRelativeAssetPath
} from './lib/asset-url.js';
import {
  isBackendBetaFixture,
  prepareBackendBetaFixture
} from './lib/backend-beta-fixture.js';
import { createHistory } from './lib/history.js';
import { createAppController } from './lib/app-controller.js?v=20260824-selection-source-sorting-v1';
import { createCustomWork } from './lib/custom-work.js';
import { prepareEnrichmentSidecar } from './lib/enrichment-sidecar.js';
import { prepareBangumiPublicBindingsCarrier } from './lib/bangumi-public-bindings.js';
import { prepareBangumiCanonicalAliasFallback } from './lib/bangumi-canonical-alias-fallback.js';
import { prepareCompanyProfileSidecar } from './lib/company-profile-sidecar.js';
import { preparePresentationFamiliesSidecar } from './lib/presentation-families.js';
import { prepareVndbRatingsSidecar } from './lib/vndb-ratings.js';
import { prepareBangumiRatingsSidecar } from './lib/bangumi-ratings.js';
import { prepareVndbAdmissionsSidecar } from './lib/vndb-admissions.js';
import { createRuntimePopulationContract } from './lib/population-contract.js';
import { projectWorkWithVndbRating } from './lib/vndb-rating-view.js?v=20260824-selection-source-sorting-v1';
import { projectWorkWithBangumiRating } from './lib/bangumi-rating-view.js?v=20260824-selection-source-sorting-v1';
import { buildCompanyDirectory, searchCompanyDirectory, worksForCompany } from './lib/company-directory.js';
import { encodeSquareCrop } from './lib/image-crop.js';
import { createLocalMediaStore, openLocalMediaDatabase } from './lib/local-media-store.js';
import { createStickerDocument, STICKER_TYPES } from './lib/sticker-document.js';
import { composeStickerImage, encodeStickerComposite } from './lib/sticker-compositor.js';
import {
  createImportCoordinator,
  downloadBlob,
  downloadText,
  setWorkspaceBusy
} from './lib/browser-io.js';
import { createFilterDrawerController } from './lib/filter-drawer.js';
import { createFilterWorkerClient } from './lib/filter-worker-client.js';
import { exportTierPng, PngExportError } from './lib/png-export.js';
import { createMediaPreviewLoader } from './lib/media-preview-loader.js';
import { createActionIcon } from './lib/action-icons.js';
import { applyTheme, readTheme, saveTheme } from './lib/theme-preference.js';
import { createMediaPreviewActions } from './lib/media-preview-actions.js';
import { createRankingHelp } from './lib/ranking-help.js';
import { createGuideController } from './lib/guide-controller.js';
import { createRankingPreloader, preloadImage } from './lib/ranking-preloader.js';
import { createImmersiveController, createRankingPresentation } from './lib/ranking-presentation.js';
import { createSelectionCardPresentation } from './lib/selection-card-presentation.js?v=20260824-selection-source-sorting-v1';
import { createWeightedRatingSort } from './lib/rating-sort.js?v=20260824-source-weighted-rating-sort-v1';
import { createPreviewMediaResolver } from './lib/preview-media.js';
import { createWorkDetailCreditsLoader } from './lib/work-detail-credits.js';
import { createProjectEntityRuntime, applyProjectedMediaToWork } from './lib/project-entity-runtime.js';
import {
  applyAuthorityFanoutMediaToWork,
  prepareAuthorityFanoutMediaProjection,
  prepareAuthorityFanoutPageBindings
} from './lib/authority-fanout.js';
import { canUseHighDensityPreview, applyAdaptiveImageSource } from './lib/adaptive-image-source.js';
import {
  configuredAssetBase,
  DATA_URLS,
  PRESENTATION_FAMILIES_SIDECAR_SHA256,
  RUNTIME_FEATURES,
  PREVIEW_MANIFEST_PATH,
  RUNTIME_DATA_CACHE_MODE,
  MEDIA_CLEARANCE_BRIDGE_SHA256,
  BANGUMI_PUBLIC_BINDINGS_SHA256,
  DATA_REVISION
} from './lib/runtime-config.js?v=e68d702f18cb654d4b4258b9345b76dccd4053c3b7f778070e4e55683b3a4463';
import { selectionStateForResults } from './lib/selection.js';
import { StateValidationError, USER_WORK_LIMIT } from './lib/state.js?v=20260824-selection-source-sorting-v1';
import { createStartupMetrics } from './lib/startup-metrics.js';
import { appendTier } from './lib/tier-config.js';
import {
  ATTRIBUTE_GROUP_IDS as ATTRIBUTE_GROUP_ORDER,
  FILTER_GROUP_ORDER
} from './lib/attribute-filters.js';
import { createFilterView } from './views/filter-view.js';
import { buildRankingModel, createRankingCard, createRankingView } from './views/ranking-view.js';
import { createSelectionView, selectionInitialWorks } from './views/selection-view.js?v=20260824-mobile-single-score-card-v2';
import { createMobileSelectionView } from './views/mobile-selection-view.js';
import { createCompanyDirectoryView, companyImageUrl } from './views/company-directory-view.js';
import { createCompanyRanking } from './lib/company-ranking.js';
import { createMediaDialogView } from './views/media-dialog-view.js';
import { createStickerEditorView } from './views/sticker-editor-view.js';
import { createWorkDetailCreditsView } from './views/work-detail-credits-view.js';
import {
  buildSelectionShareUrl,
  decodeSelectionShare,
  parseSelectionShare
} from './lib/share-selection.js';
import { planSharedSelectionImport } from './lib/share-import.js';
import {
  BangumiPublicImportError,
  collectionTypeLabel,
  fetchBangumiPublicGameCollections,
  planBangumiPublicImport
} from './lib/bangumi-public-import.js?v=20260825-bangumi-family-default-mobile-details-scroll-v1';
import { formatUiLocationHash, parseUiLocationHash } from './lib/ui-location-state.js?v=20260824-selection-source-sorting-v1';

const SAMPLE_SCHEMA_VERSION = 'egs-tier-sample-document-v3';
const EXPECTED_CONTENT_FILTER_COUNT = 45;
const EXPECTED_GENRE_FILTER_COUNT = 4;
const EXPECTED_PLATFORM_FILTER_COUNT = 13;
const STICKER_IMAGE_ASSETS = Object.freeze({
  'please-wait-character': './assets/stickers/please-wait-character.webp',
  'paper-bag-character': './assets/stickers/paper-bag-character.png'
});

export { FILTER_GROUP_ORDER };
const FILTER_GROUP_POSITION = new Map(
  FILTER_GROUP_ORDER.map((groupId, index) => [groupId, index])
);
const ATTRIBUTE_GROUP_IDS = new Set(ATTRIBUTE_GROUP_ORDER);
const COLLAPSED_DETAIL_GROUP_IDS = new Set(['character', 'adult']);

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element;
}

const elements = typeof document === 'undefined' ? null : Object.freeze({
  workspace: requiredElement('workspace'),
  mobileSelectionView: requiredElement('mobile-selection-view'),
  mobileSelectionGrid: requiredElement('mobile-selection-grid'),
  mobileSelectMode: requiredElement('mobile-select-mode'),
  mobileSelectionStatus: requiredElement('mobile-selection-status'),
  mobileSelectedCount: requiredElement('mobile-selected-count'),
  mobileOpenSelectionDrawer: requiredElement('mobile-open-selection-drawer'),
  mobileSelectionDrawer: requiredElement('mobile-selection-drawer'),
  mobileSelectedPreview: requiredElement('mobile-selected-preview'),
  mobileShareSelection: requiredElement('mobile-share-selection'),
  mobileClearSelection: requiredElement('mobile-clear-selection'),
  mobileBangumiImportOpen: requiredElement('mobile-bangumi-import-open'),
  mobileHelpButton: requiredElement('mobile-help-button'),
  mobileHelpDialog: requiredElement('mobile-help-dialog'),
  mobileHelpDismiss: requiredElement('mobile-help-dismiss'),
  mobileTitleSearch: requiredElement('mobile-title-search'),
  mobileFilterToggle: requiredElement('mobile-filter-toggle'),
  mobileCompanyMode: requiredElement('mobile-company-mode'),
  mobileShareWarning: requiredElement('mobile-share-warning'),
  mobileShareWarningDismiss: requiredElement('mobile-share-warning-dismiss'),
  shareImportDialog: requiredElement('share-import-dialog'),
  shareImportMessage: requiredElement('share-import-message'),
  shareImportCount: requiredElement('share-import-count'),
  shareImportMissing: requiredElement('share-import-missing'),
  shareImportAppend: requiredElement('share-import-append'),
  shareImportReplace: requiredElement('share-import-replace'),
  shareImportCancel: requiredElement('share-import-cancel'),
  bangumiImportOpen: requiredElement('bangumi-import-open'),
  bangumiPublicImportDialog: requiredElement('bangumi-public-import-dialog'),
  bangumiPublicImportForm: requiredElement('bangumi-public-import-form'),
  bangumiPublicUserInput: requiredElement('bangumi-public-user-input'),
  bangumiPublicFetch: requiredElement('bangumi-public-fetch'),
  bangumiPublicImportStatus: requiredElement('bangumi-public-import-status'),
  bangumiPublicImportResults: requiredElement('bangumi-public-import-results'),
  bangumiPublicImportCapacity: requiredElement('bangumi-public-import-capacity'),
  bangumiPublicTotal: requiredElement('bangumi-public-total'),
  bangumiPublicMatchedSubjects: requiredElement('bangumi-public-matched-subjects'),
  bangumiPublicMappedWorks: requiredElement('bangumi-public-mapped-works'),
  bangumiPublicUnmatched: requiredElement('bangumi-public-unmatched'),
  bangumiPublicImportList: requiredElement('bangumi-public-import-list'),
  bangumiPublicImportUnmatched: requiredElement('bangumi-public-import-unmatched'),
  bangumiPublicUnmatchedCount: requiredElement('bangumi-public-unmatched-count'),
  bangumiPublicUnmatchedList: requiredElement('bangumi-public-unmatched-list'),
  bangumiPublicImportSelectionStatus: requiredElement('bangumi-public-import-selection-status'),
  bangumiPublicImportCancel: requiredElement('bangumi-public-import-cancel'),
  bangumiPublicImportAppend: requiredElement('bangumi-public-import-append'),
  modeSelection: requiredElement('mode-selection'),
  modeRanking: requiredElement('mode-ranking'),
  modeCompany: requiredElement('mode-company'),
  themeToggle: requiredElement('theme-toggle'),
  selectionView: requiredElement('selection-view'),
  rankingView: requiredElement('ranking-view'),
  rankingSubjectWork: requiredElement('ranking-subject-work'),
  rankingSubjectCompany: requiredElement('ranking-subject-company'),
  companyView: requiredElement('company-view'),
  companyDirectoryCount: requiredElement('company-directory-count'),
  companySearch: requiredElement('company-directory-search'),
  companySort: requiredElement('company-sort'),
  companyHasImage: requiredElement('company-has-image'),
  companyHelpButton: requiredElement('company-help-button'),
  companyHelp: requiredElement('company-directory-help'),
  companyHelpDismiss: requiredElement('company-directory-help-dismiss'),
  companyRankingToggle: requiredElement('company-ranking-toggle'),
  companyRankingClose: requiredElement('company-ranking-close'),
  companyRanking: requiredElement('company-ranking'),
  companyBack: requiredElement('company-back'),
  companySelectionModeToggle: requiredElement('company-selection-mode-toggle'),
  companySelectionContextBar: requiredElement('company-selection-context-bar'),
  companySelectionContextCount: requiredElement('company-selection-context-count'),
  clearSelectedCompanies: requiredElement('clear-selected-companies'),
  startCompanyRanking: requiredElement('start-company-ranking'),
  companyDetailClose: requiredElement('company-detail-close'),
  companyList: requiredElement('company-list'),
  companyDetail: requiredElement('company-detail'),
  companyDetailTitle: requiredElement('company-detail-title'),
  companyDetailAvatar: requiredElement('company-detail-avatar'),
  companyDetailMeta: requiredElement('company-detail-meta'),
  companyDetailWorks: requiredElement('company-detail-works'),
  companyEmpty: requiredElement('company-empty'),
  selectedCount: requiredElement('selected-count'),
  rankedCount: requiredElement('ranked-count'),
  unrankedCount: requiredElement('global-unranked-count'),
  catalogResultCount: requiredElement('catalog-result-count'),
  selectionModeToggle: requiredElement('selection-mode-toggle'),
  selectionContextBar: requiredElement('selection-context-bar'),
  selectionContextCount: requiredElement('selection-context-count'),
  clearSelectedWorks: requiredElement('clear-selected-works'),
  startWorkRanking: requiredElement('start-work-ranking'),
  cardViewToggle: requiredElement('card-view-toggle'),
  selectionCardDisplayMenu: requiredElement('selection-card-display-menu'),
  selectionCardShowTitle: requiredElement('selection-card-show-title'),
  selectionCardShowCompany: requiredElement('selection-card-show-company'),
  selectionCardShowEgs: requiredElement('selection-card-show-egs'),
  selectionCardShowVndb: requiredElement('selection-card-show-vndb'),
  selectionCardShowBangumi: requiredElement('selection-card-show-bangumi'),
  selectionCardShowYear: requiredElement('selection-card-show-year'),
  filterToggle: requiredElement('filter-toggle'),
  filterBackdrop: requiredElement('filter-backdrop'),
  filterDrawer: requiredElement('filter-drawer'),
  filterClose: requiredElement('filter-close'),
  filterApply: requiredElement('filter-apply'),
  filterResultCount: requiredElement('filter-result-count'),
  catalogResults: requiredElement('catalog-results'),
  tierBoard: requiredElement('tier-board'),
  rankingCandidateSearch: requiredElement('ranking-candidate-search'),
  rankingCandidatesTitle: requiredElement('ranking-candidates-title'),
  rankingCandidateGrid: requiredElement('ranking-candidate-grid'),
  rankingCandidates: requiredElement('ranking-candidates'),
  mobileRankingDock: requiredElement('mobile-ranking-dock'),
  mobileRankingUndo: requiredElement('mobile-ranking-undo'),
  mobileRankingRedo: requiredElement('mobile-ranking-redo'),
  mobileRankingCandidates: requiredElement('mobile-ranking-candidates'),
  mobileRankingCandidatesLabel: requiredElement('mobile-ranking-candidates-label'),
  mobileRankingCandidateCount: requiredElement('mobile-ranking-candidate-count'),
  mobileRankingMore: requiredElement('mobile-ranking-more'),
  mobileRankingMenu: requiredElement('mobile-ranking-menu'),
  mobileRankingShowCounts: requiredElement('mobile-ranking-show-counts'),
  mobileRankingShowTitles: requiredElement('mobile-ranking-show-titles'),
  mobileRankingImport: requiredElement('mobile-ranking-import'),
  mobileRankingExport: requiredElement('mobile-ranking-export'),
  mobileRankingExportPng: requiredElement('mobile-ranking-export-png'),
  mobileRankingClearBoard: requiredElement('mobile-ranking-clear-board'),
  mobileRankingClearCandidates: requiredElement('mobile-ranking-clear-candidates'),
  mobileRankingClearAnnotations: requiredElement('mobile-ranking-clear-annotations'),
  undoEdit: requiredElement('undo-edit'),
  redoEdit: requiredElement('redo-edit'),
  clearBoard: requiredElement('clear-board'),
  clearCandidates: requiredElement('clear-candidates'),
  clearAnnotations: requiredElement('clear-annotations'),
  importState: requiredElement('import-state'),
  exportState: requiredElement('export-state'),
  exportPng: requiredElement('export-png'),
  rankingShowCounts: requiredElement('ranking-show-counts'),
  rankingShowTitles: requiredElement('ranking-show-titles'),
  rankingScaleOverall: requiredElement('ranking-scale-overall'),
  rankingScaleOverallOutput: requiredElement('ranking-scale-overall-output'),
  rankingScaleCard: requiredElement('ranking-scale-card'),
  rankingScaleCardOutput: requiredElement('ranking-scale-card-output'),
  rankingScaleRail: requiredElement('ranking-scale-rail'),
  rankingScaleRailOutput: requiredElement('ranking-scale-rail-output'),
  rankingScaleAnnotation: requiredElement('ranking-scale-annotation'),
  rankingScaleAnnotationOutput: requiredElement('ranking-scale-annotation-output'),
  rankingScaleTierName: requiredElement('ranking-scale-tier-name'),
  rankingScaleTierNameOutput: requiredElement('ranking-scale-tier-name-output'),
  rankingScaleReset: requiredElement('ranking-scale-reset'),
  rankingHelpButton: requiredElement('ranking-help-button'),
  rankingImmersive: requiredElement('ranking-immersive'),
  rankingImmersiveHelp: requiredElement('ranking-immersive-help'),
  rankingHelp: requiredElement('ranking-help'),
  rankingHelpTitle: requiredElement('ranking-help-title'),
  rankingHelpFull: requiredElement('ranking-help-full'),
  rankingHelpImmersive: requiredElement('ranking-help-immersive'),
  rankingHelpDismiss: requiredElement('ranking-help-dismiss'),
  cleanupMenuButton: requiredElement('cleanup-menu-button'),
  cleanupMenu: requiredElement('cleanup-menu'),
  displayMenuButton: requiredElement('display-menu-button'),
  displayMenu: requiredElement('display-menu'),
  fileMenuButton: requiredElement('file-menu-button'),
  fileMenu: requiredElement('file-menu'),
  stateFile: requiredElement('state-file'),
  mediaFiles: requiredElement('media-files'),
  mediaPreview: requiredElement('media-preview'),
  mediaPreviewClose: requiredElement('media-preview-close'),
  mediaPreviewImage: requiredElement('media-preview-image'),
  mediaPreviewTitle: requiredElement('media-preview-title'),
  mediaPreviewActions: requiredElement('media-preview-actions'),
  mediaCropCanvas: requiredElement('media-crop-canvas'),
  detailsDialog: requiredElement('work-details'),
  detailsTitle: requiredElement('details-title'),
  detailsVersionToggle: requiredElement('details-version-toggle'),
  detailsVersionShelf: requiredElement('details-version-shelf'),
  detailsVersionCurrent: requiredElement('details-version-current'),
  detailsVersionList: requiredElement('details-version-list'),
  detailsCover: requiredElement('details-cover'),
  detailsCoverImage: requiredElement('details-cover-image'),
  detailsBrand: requiredElement('details-brand'),
  detailsRelease: requiredElement('details-release'),
  detailsScore: requiredElement('details-score'),
  detailsAliases: requiredElement('details-aliases'),
  detailsTags: requiredElement('details-tags'),
  detailsCredits: requiredElement('details-credits'),
  detailsCreditsStatus: requiredElement('details-credits-status'),
  detailsCreditsTabs: requiredElement('details-credits-tabs'),
  detailsCreditsContent: requiredElement('details-credits-content'),
  status: requiredElement('status-message')
});

let statusTimer = null;
let pngExportInProgress = false;

function announce(message, kind = 'info') {
  window.clearTimeout(statusTimer);
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
  elements.status.classList.add('is-visible');
  statusTimer = window.setTimeout(() => {
    elements.status.classList.remove('is-visible');
  }, 4200);
}

function showStartupFailure(error) {
  const message = error instanceof Error ? error.message : '未知数据错误';
  document.documentElement.dataset.runtimePopulation = 'failed';
  globalThis.__EGS_TIER_STARTUP_DIAGNOSTICS__ = Object.freeze({
    mode: 'failed',
    reason: message
  });
  document.getElementById('workspace')?.setAttribute('hidden', '');
  const panel = document.createElement('section');
  panel.id = 'startup-failure';
  panel.className = 'startup-failure';
  panel.setAttribute('role', 'alert');
  panel.tabIndex = -1;
  const title = document.createElement('h2');
  title.textContent = '数据版本不完整';
  const detail = document.createElement('p');
  detail.textContent = '终端已停止载入，未展示可能过期或缺失的数据。请刷新重试。';
  const code = document.createElement('code');
  code.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '刷新重试';
  retry.addEventListener('click', () => location.reload());
  panel.append(title, detail, code, retry);
  document.querySelector('.tool-header')?.insertAdjacentElement('afterend', panel);
  panel.focus();
}

function assertRuntimeContracts() {
  for (const api of [
    createFilterWorkerClient,
    selectionStateForResults,
    createHistory,
    exportTierPng,
    createImportCoordinator,
    downloadBlob,
    downloadText,
    setWorkspaceBusy
  ]) {
    if (typeof api !== 'function') throw new TypeError('Task 7 runtime module contract is unavailable');
  }
}

function loadLocalCover(coverPath, assetBase) {
  try {
    validateRelativeAssetPath(coverPath, 'coverPath');
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (
          !Number.isFinite(width)
          || !Number.isFinite(height)
          || width <= 0
          || height <= 0
        ) {
          throw new TypeError('PNG cover decoded with invalid dimensions');
        }
        resolve(image);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => {
      reject(new Error(`PNG cover failed to load: ${coverPath}`));
    }, { once: true });
    image.src = resolveAssetUrl(coverPath, assetBase);
  });
}

function loadImageUrl(url, { crossOrigin = 'anonymous' } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof url !== 'string' || url.length === 0) {
      reject(new TypeError('PNG cover URL is unavailable'));
      return;
    }
    const image = new Image();
    if (crossOrigin !== null) image.crossOrigin = crossOrigin;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          throw new TypeError('PNG cover decoded with invalid dimensions');
        }
        resolve(image);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => reject(new Error(`PNG cover failed to load: ${url}`)), { once: true });
    image.src = url;
  });
}

function pngExportMessage(error) {
  if (error instanceof PngExportError) {
    if (error.code === 'COVER_LOAD_FAILED') {
      return '封面加载失败，请检查已排榜作品的本地封面文件。';
    }
    if (error.code === 'CANVAS_BUDGET_EXCEEDED' || error.code === 'UNSAFE_DIMENSIONS') {
      return '榜单尺寸超出浏览器可安全导出的画布限制，请减少已排榜作品。';
    }
    return `PNG 导出失败（${error.code}），请稍后重试。`;
  }
  return 'PNG 导出失败，请稍后重试。';
}

function jsonImportMessage(error) {
  if (!(error instanceof StateValidationError)) {
    return 'JSON 状态导入失败，请稍后重试。';
  }
  if (error.code === 'INVALID_JSON') return 'JSON 文件格式无效。';
  if (error.code === 'SCHEMA_MISMATCH') return '状态文件版本不受支持。';
  if (error.code === 'SAMPLE_MISMATCH') return '状态文件与当前样本不匹配。';
  if (error.code === 'UNKNOWN_FILTER') return '状态文件包含未知筛选项。';
  if (error.code === 'UNKNOWN_WORK') return '状态文件包含未知作品。';
  if (error.code === 'STATE_TOO_LARGE') return 'JSON 状态文件超出大小限制。';
  return 'JSON 状态文件内容无效。';
}

function assertStringArray(
  value,
  path,
  knownFilterIds,
  allowedFilterIds = knownFilterIds,
  requireSorted = false
) {
  if (!Array.isArray(value)) throw new TypeError(`${path} 必须是数组`);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const filterId = value[index];
    if (
      typeof filterId !== 'string'
      || !knownFilterIds.has(filterId)
      || !allowedFilterIds.has(filterId)
      || seen.has(filterId)
      || (requireSorted && index > 0 && value[index - 1] > filterId)
    ) {
      throw new TypeError(`${path}[${index}] 包含无效、重复或未知筛选 ID`);
    }
    seen.add(filterId);
  }
}

export function publicFilterIds(work) {
  return [...new Set([
    ...work.filterIds,
    ...work.genreFilterIds,
    work.platformFilterId
  ])];
}

export function workDetailFilters(work, filterById) {
  return publicFilterIds(work)
    .map(filterId => filterById.get(filterId))
    .filter(Boolean)
    .sort((left, right) => (
      (FILTER_GROUP_POSITION.get(left.groupId) ?? FILTER_GROUP_ORDER.length)
        - (FILTER_GROUP_POSITION.get(right.groupId) ?? FILTER_GROUP_ORDER.length)
      || left.displayOrder - right.displayOrder
      || left.displayTitle.localeCompare(right.displayTitle, 'zh-CN')
      || left.filterId.localeCompare(right.filterId)
    ));
}

export function workDetailFilterTitles(work, filterById) {
  return workDetailFilters(work, filterById).map(filter => filter.displayTitle);
}

export function partitionWorkDetailFilters(work, filterById) {
  const visible = [];
  const collapsed = [];
  for (const filter of workDetailFilters(work, filterById)) {
    (COLLAPSED_DETAIL_GROUP_IDS.has(filter.groupId) ? collapsed : visible).push(filter);
  }
  return { visible, collapsed };
}

export function assertSample(candidate, options = {}) {
  const enforceAuthorityCounts = options.enforceAuthorityCounts ?? true;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('样本顶层必须是对象');
  }
  if (candidate.schemaVersion !== SAMPLE_SCHEMA_VERSION) {
    throw new TypeError(`样本 schemaVersion 必须是 ${SAMPLE_SCHEMA_VERSION}`);
  }
  if (typeof candidate.sampleId !== 'string' || candidate.sampleId.length === 0) {
    throw new TypeError('样本缺少 sampleId');
  }
  for (const field of ['works', 'filters', 'genreFilters', 'platformFilters', 'brands']) {
    if (!Array.isArray(candidate[field])) throw new TypeError(`样本缺少 ${field} 数组`);
  }
  if (enforceAuthorityCounts && candidate.filters.length !== EXPECTED_CONTENT_FILTER_COUNT) {
    throw new TypeError(`样本 filters 必须包含 ${EXPECTED_CONTENT_FILTER_COUNT} 项`);
  }
  if (enforceAuthorityCounts && candidate.genreFilters.length !== EXPECTED_GENRE_FILTER_COUNT) {
    throw new TypeError(`样本 genreFilters 必须包含 ${EXPECTED_GENRE_FILTER_COUNT} 项`);
  }
  if (enforceAuthorityCounts && candidate.platformFilters.length !== EXPECTED_PLATFORM_FILTER_COUNT) {
    throw new TypeError(`样本 platformFilters 必须包含 ${EXPECTED_PLATFORM_FILTER_COUNT} 项`);
  }
  const knownFilterIds = new Set();
  const contentFilterIds = new Set();
  const genreFilterIds = new Set();
  const platformFilterIds = new Set();
  for (const [field, definitions, target, expectedGroup] of [
    ['filters', candidate.filters, contentFilterIds, 'content'],
    ['genreFilters', candidate.genreFilters, genreFilterIds, 'game-type'],
    ['platformFilters', candidate.platformFilters, platformFilterIds, 'platform']
  ]) {
    for (const [index, filter] of definitions.entries()) {
      if (
        filter === null
        || typeof filter !== 'object'
        || typeof filter.filterId !== 'string'
        || filter.filterId.length === 0
        || knownFilterIds.has(filter.filterId)
        || typeof filter.displayTitle !== 'string'
        || filter.displayTitle.length === 0
        || typeof filter.groupId !== 'string'
        || filter.groupId.length === 0
        || (expectedGroup === 'content'
          ? filter.groupId === 'game-type' || filter.groupId === 'platform'
          : filter.groupId !== expectedGroup)
        || typeof filter.groupTitleZh !== 'string'
        || filter.groupTitleZh.length === 0
        || !Number.isInteger(filter.displayOrder)
      ) {
        throw new TypeError(`样本 ${field}[${index}] 无效`);
      }
      knownFilterIds.add(filter.filterId);
      target.add(filter.filterId);
    }
  }
  const workIds = new Set();
  for (const [index, work] of candidate.works.entries()) {
    if (typeof work?.workId !== 'string' || workIds.has(work.workId)) {
      throw new TypeError('样本包含无效或重复的 workId');
    }
    try {
      validateRelativeAssetPath(work?.coverPath, `works[${index}].coverPath`);
    } catch {
      throw new TypeError(`作品 ${work.workId} 包含无效 coverPath`);
    }
    if (
      !Number.isSafeInteger(work.coverWidth)
      || work.coverWidth <= 0
      || !Number.isSafeInteger(work.coverHeight)
      || work.coverHeight <= 0
    ) {
      throw new TypeError(`works[${index}] 缺少有效缩略图尺寸`);
    }
    if (typeof work.rawGenre !== 'string') {
      throw new TypeError(`works[${index}].rawGenre 必须是字符串`);
    }
    assertStringArray(work.rawFilterIds, `works[${index}].rawFilterIds`, knownFilterIds, contentFilterIds);
    assertStringArray(work.filterIds, `works[${index}].filterIds`, knownFilterIds, contentFilterIds);
    assertStringArray(
      work.genreFilterIds,
      `works[${index}].genreFilterIds`,
      knownFilterIds,
      genreFilterIds,
      true
    );
    if (
      typeof work.platformFilterId !== 'string'
      || !platformFilterIds.has(work.platformFilterId)
    ) {
      throw new TypeError(`works[${index}].platformFilterId 包含无效或未知筛选 ID`);
    }
    workIds.add(work.workId);
  }
  return candidate;
}

export function prepareRuntimeSample(candidate, authorities = {}) {
  if (isBackendBetaFixture(candidate)) {
    const source = assertSample(
      prepareBackendBetaFixture(candidate, authorities),
      { enforceAuthorityCounts: authorities.filterAuthority !== undefined && authorities.filterAuthority !== null }
    );
    return {
      ...source,
      filters: [...source.filters, ...source.genreFilters, ...source.platformFilters]
    };
  }
  const source = assertSample(candidate);
  return {
    ...source,
    filters: [...source.filters, ...source.genreFilters, ...source.platformFilters]
  };
}

function mergeVndbAdmissionsIntoFixture(source, admissions) {
  if (admissions === null || admissions.works.length === 0) return { source, admissionCount: 0 };
  const merged = JSON.parse(JSON.stringify(source));
  // The backend indexes are position-bound to the 6,799-work core export.
  // Admissions are merged in memory, so discard those stale indexes and let
  // the runtime build its own query state for the expanded presentation pool.
  merged.indexes = null;
  const existingWorkIds = new Set(merged.works.map(work => work.workId));
  const companies = new Map(merged.companies.map(company => [company.companyId, company]));
  for (const item of admissions.works) {
    if (existingWorkIds.has(item.workId)) throw new TypeError(`VNDB admission overlaps catalog work ${item.workId}`);
    existingWorkIds.add(item.workId);
    const companyId = item.companyId || `vndb-${item.vndbId}`;
    if (!companies.has(companyId)) {
      const company = { companyId, name: `未收录会社 (${companyId})`, aliases: [] };
      merged.companies.push(company);
      companies.set(companyId, company);
    }
    merged.works.push({
      workId: item.workId,
      title: item.title,
      furigana: item.furigana,
      releaseDate: item.releaseDate || '1900-01-01',
      companyId,
      median: item.median,
      voteCount: item.voteCount,
      isCrossSourceAdmission: true,
      filterIds: [],
      genreIds: [],
      platformId: 'platform-pc',
      workGroupId: null,
      isNukige: false,
      thumbnail: item.thumbnail,
      preview: item.preview
    });
  }
  return { source: merged, admissionCount: admissions.works.length };
}

function restrictAssetsManifestToCatalog(assetsManifest, catalogWorkIds) {
  if (assetsManifest === null || assetsManifest === undefined) return assetsManifest;
  const allowed = new Set(catalogWorkIds);
  if (!Array.isArray(assetsManifest.assets)) return assetsManifest;
  const assets = assetsManifest.assets.filter(asset => allowed.has(asset.workId));
  return assets.length === assetsManifest.assets.length
    ? assetsManifest
    : Object.freeze({ ...assetsManifest, assets: Object.freeze(assets) });
}

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'default' });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  return response.json();
}

async function fetchJsonWithSha256(url, label) {
  const response = await fetch(url, { cache: RUNTIME_DATA_CACHE_MODE });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  return {
    value: JSON.parse(new TextDecoder().decode(bytes)),
    sha256
  };
}

async function fetchOptionalJsonWithSha256(url, label) {
  try {
    return await fetchJsonWithSha256(url, label);
  } catch (error) {
    console.warn(`${label} unavailable; continuing without aliases`, error);
    return null;
  }
}

export async function fetchStagedRuntimeCoreSources({
  catalogUrl,
  admissionsUrl,
  fetchRequired = fetchJsonWithSha256,
  prepareAdmissions = prepareVndbAdmissionsSidecar
}) {
  const [catalogSource, admissionsSource] = await Promise.all([
    fetchRequired(catalogUrl, 'catalog'),
    fetchRequired(admissionsUrl, 'VNDB admissions sidecar')
  ]);
  const admissions = prepareAdmissions(admissionsSource.value, {
    catalogSnapshotId: catalogSource.value.snapshot?.snapshotId,
    catalogSha256: catalogSource.sha256,
    workIds: catalogSource.value.works.map(work => work.workId)
  });
  return Object.freeze({
    catalogSource,
    admissions,
    admissionsStatus: 'full',
    backendIndexesSource: null,
    assetsManifestSource: null,
    useCoreFallback: false
  });
}

function projectBrandsWithAliases(brands, companyAliasesById, companyPinyinById = null) {
  return brands.map(brand => {
    const aliases = companyAliasesById?.get?.(brand.brandId);
    const pinyin = companyPinyinById?.get?.(brand.brandId);
    if (
      (!Array.isArray(aliases) || aliases.length === 0)
      && (!Array.isArray(pinyin) || pinyin.length === 0)
    ) return brand;
    const existing = Array.isArray(brand.searchAliases) ? brand.searchAliases : [];
    const seen = new Set();
    const merged = [...existing, ...aliases].filter(alias => {
      const normalized = String(alias).normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
      if (normalized.length === 0 || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const existingPinyin = Array.isArray(brand.searchPinyin) ? brand.searchPinyin : [];
    const mergedPinyin = [...existingPinyin, ...(Array.isArray(pinyin) ? pinyin : [])]
      .map(value => String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US'))
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
    return {
      ...brand,
      searchAliases: merged,
      ...(mergedPinyin.length > 0 ? { searchPinyin: mergedPinyin } : {})
    };
  });
}

function projectWorkWithDisplayTitle(work, workDisplayTitlesById = null) {
  const displayTitle = workDisplayTitlesById?.get?.(work.workId);
  if (typeof displayTitle !== 'string' || displayTitle.length === 0) return work;
  return { ...work, displayTitle };
}

function applyBangumiCanonicalAliasFallback({
  workAliasesById = null,
  workDisplayTitlesById = null,
  fallbackByWorkId
}) {
  const mergedAliases = new Map(workAliasesById ?? []);
  const mergedDisplayTitles = new Map(workDisplayTitlesById ?? []);
  for (const [workId, fallback] of fallbackByWorkId) {
    if (mergedDisplayTitles.has(workId)) continue;
    mergedDisplayTitles.set(workId, fallback.displayTitle);
    const aliases = mergedAliases.get(workId) ?? [];
    mergedAliases.set(workId, Object.freeze([
      fallback.displayTitle,
      ...aliases.filter(alias => alias !== fallback.displayTitle)
    ]));
  }
  return Object.freeze({
    workAliasesById: mergedAliases,
    workDisplayTitlesById: mergedDisplayTitles
  });
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return {
      getItem() { throw error; },
      setItem() { throw error; },
      removeItem() { throw error; }
    };
  }
}

function downloadJson({ filename, text, mimeType }) {
  return downloadText({
    text,
    filename,
    mimeType,
    createBlob() {
      return new Blob([text], { type: mimeType });
    },
    documentRef: document,
    schedule: task => window.setTimeout(task, 0),
    onDeferredError: error => console.error(error)
  });
}

function filterRenderKey(model, visibleBrands) {
  return JSON.stringify([
    model.state.filterState,
    model.state.filterState.selectedOnly ? model.state.selectedWorkIds : null,
    visibleBrands.map(brand => brand.brandId)
  ]);
}

function formatSnapshotDate(value) {
  if (typeof value !== 'string') return '未返回';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? '未返回';
}

function showDetails(work, filterById, workAliasesById = null, onOpenCompany = null, projectEntityRuntime = null, detailMedia = null, egsSnapshotAt = null) {
  const detailVm = projectEntityRuntime?.adaptWorkDetail?.(work.workId, work) ?? work;
  elements.detailsDialog.dataset.projectEntitySource = detailVm.source ?? 'legacy';
  elements.detailsDialog.dataset.mediaClearanceStatus = work.mediaProjection?.clearanceStatus ?? 'legacy-fallback';
  elements.detailsTitle.textContent = work.title;
  elements.detailsBrand.replaceChildren();
  const brandButton = document.createElement('button');
  brandButton.type = 'button';
  brandButton.className = 'details-company-link';
  brandButton.textContent = work.brandName;
  brandButton.addEventListener('click', () => onOpenCompany?.(work.brandId));
  elements.detailsBrand.append(brandButton);
  const aliases = workAliasesById?.get?.(work.workId) ?? [];
  elements.detailsAliases.hidden = aliases.length === 0;
  elements.detailsAliases.textContent = aliases.join(' / ');
  const coverToken = `${work.workId}:${Date.now()}`;
  elements.detailsCover.dataset.coverToken = coverToken;
  elements.detailsCover.disabled = true;
  elements.detailsCoverImage.hidden = true;
  elements.detailsCoverImage.alt = '';
  elements.detailsCoverImage.removeAttribute('src');
  elements.detailsCover.onclick = () => {
    void detailMedia?.open?.(work);
  };
  const coverUrlRequest = detailMedia?.coverSources?.(work);
  if (coverUrlRequest !== undefined) {
    void coverUrlRequest.then(({ thumbnailUrl, previewUrl }) => {
      if (elements.detailsCover.dataset.coverToken !== coverToken) return;
      applyAdaptiveImageSource(elements.detailsCoverImage, { thumbnailUrl, previewUrl });
      elements.detailsCoverImage.alt = `${work.title} 作品图片`;
      elements.detailsCoverImage.hidden = false;
      elements.detailsCover.disabled = false;
    }).catch(() => {
      if (elements.detailsCover.dataset.coverToken !== coverToken) return;
      applyAdaptiveImageSource(elements.detailsCoverImage, { thumbnailUrl: detailMedia.fallbackUrl });
      elements.detailsCoverImage.alt = `${work.title} 图片不可用`;
      elements.detailsCoverImage.hidden = false;
    });
  }
  elements.detailsRelease.textContent = work.releaseDate || '未记录';
  const egsRating = document.createElement('span');
  egsRating.className = 'details-rating-line';
  egsRating.textContent = Number.isFinite(work.median) && Number.isInteger(work.voteCount)
    ? `EGS ${work.median} / ${work.voteCount} 票`
    : 'EGS 暂无评分';
  const ratingLines = [egsRating];
  const egsSnapshot = document.createElement('small');
  egsSnapshot.className = 'details-rating-snapshot';
  egsSnapshot.textContent = `EGS 数据快照时间：${formatSnapshotDate(egsSnapshotAt)}`;
  ratingLines.push(egsSnapshot);
  if (work.vndbRating !== undefined) {
    const vndbRating = document.createElement('span');
    vndbRating.className = 'details-rating-line';
    vndbRating.textContent = work.vndbRating.detailVotes === null
      ? `VNDB ${work.vndbRating.detailScore} (${work.vndbRating.statusLabel})`
      : `VNDB ${work.vndbRating.detailScore} / ${work.vndbRating.detailVotes}`;
    const snapshot = document.createElement('small');
    snapshot.className = 'details-rating-snapshot';
    snapshot.textContent = `VNDB 数据快照时间：${formatSnapshotDate(work.vndbRating.retrievedAt)}`;
    ratingLines.push(vndbRating, snapshot);
  }
  if (work.bangumiRating !== undefined) {
    const bangumiRating = document.createElement('a');
    bangumiRating.className = 'details-rating-line details-rating-link';
    bangumiRating.href = work.bangumiRating.subjectUrl;
    bangumiRating.target = '_blank';
    bangumiRating.rel = 'noopener noreferrer';
    bangumiRating.textContent = work.bangumiRating.detailVotes === null
      ? `Bangumi ${work.bangumiRating.detailScore} ↗`
      : `Bangumi ${work.bangumiRating.detailScore} / ${work.bangumiRating.detailVotes} ↗`;
    ratingLines.push(bangumiRating);
    const snapshot = document.createElement('small');
    snapshot.className = 'details-rating-snapshot';
    snapshot.textContent = `Bangumi 数据快照时间：${formatSnapshotDate(work.bangumiRating.retrievedAt)}`;
    ratingLines.push(snapshot);
  }
  elements.detailsScore.replaceChildren(...ratingLines);
  const createTag = (filter, hidden = false) => {
    const item = document.createElement('li');
    item.className = filter.groupId === 'character'
      ? 'details-tag-character'
      : filter.groupId === 'adult'
        ? 'details-tag-adult'
        : ATTRIBUTE_GROUP_IDS.has(filter.groupId)
          ? 'details-tag-attribute'
          : 'details-tag-content';
    item.textContent = filter.displayTitle;
    item.hidden = hidden;
    return item;
  };
  const { visible, collapsed } = partitionWorkDetailFilters(work, filterById);
  const visibleTags = visible.map(filter => createTag(filter));
  if (collapsed.length === 0) {
    elements.detailsTags.replaceChildren(...visibleTags);
  } else {
    const collapsedTags = collapsed.map(filter => createTag(filter, true));
    const controlItem = document.createElement('li');
    controlItem.className = 'details-sensitive-control';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'details-sensitive-toggle';
    toggle.textContent = '+';
    toggle.title = '显示角色属性与成人内容标签';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '\u2212' : '+';
      toggle.title = expanded
        ? '收起角色属性与成人内容标签'
        : '显示角色属性与成人内容标签';
      toggle.setAttribute('aria-label', toggle.title);
      for (const item of collapsedTags) item.hidden = !expanded;
    });
    controlItem.append(toggle);
    elements.detailsTags.replaceChildren(
      ...visibleTags,
      controlItem,
      ...collapsedTags
    );
  }
  if (typeof elements.detailsDialog.showModal === 'function') elements.detailsDialog.showModal();
}

async function initialize() {
  let themeStorage = null;
  try {
    themeStorage = window.localStorage;
  } catch {
    // Private browsing or a blocked storage policy should not block startup.
  }
  let activeTheme = applyTheme(document, readTheme(themeStorage));
  const renderThemeToggle = () => {
    const isLight = activeTheme === 'light';
    const nextThemeLabel = isLight ? '暗色' : '亮色';
    elements.themeToggle.replaceChildren(createActionIcon(document, isLight ? 'moon' : 'sun'));
    elements.themeToggle.setAttribute('aria-label', `切换到${nextThemeLabel}界面`);
    elements.themeToggle.setAttribute('aria-pressed', String(isLight));
    elements.themeToggle.title = `切换到${nextThemeLabel}界面`;
  };
  renderThemeToggle();
  for (const [button, iconName, label] of [
    [elements.modeSelection, 'library', '作品'],
    [elements.modeCompany, 'building', '会社'],
    [elements.modeRanking, 'ranking', '排榜']
  ]) {
    const icon = createActionIcon(document, iconName);
    icon.classList.add('workspace-tab-icon');
    const copy = document.createElement('span');
    copy.textContent = label;
    button.replaceChildren(icon, copy);
  }
  elements.themeToggle.addEventListener('click', () => {
    activeTheme = saveTheme(themeStorage, activeTheme === 'dark' ? 'light' : 'dark');
    applyTheme(document, activeTheme);
    renderThemeToggle();
  });
  const startupMetrics = createStartupMetrics();
  const assetBase = configuredAssetBase();
  const highDensityPreviewsEnabled = canUseHighDensityPreview({
    devicePixelRatio: window.devicePixelRatio,
    connection: navigator.connection
  });
  const previewMedia = createPreviewMediaResolver({
    assetBase,
    fetchJson: () => fetchJson(
      resolveAssetUrl(PREVIEW_MANIFEST_PATH, assetBase),
      '高清预览 manifest'
    )
  });
  assertRuntimeContracts();
  const [
    coreSources,
    [
    filterAuthoritySource,
    workGroupAuthoritySource,
    reviewQueueSource,
    enrichmentSource,
    companyProfileSource,
    presentationFamiliesSource,
    bangumiPublicBindingsSource,
    vndbRatingsSource,
    bangumiRatingsSource,
    bangumiCanonicalAliasFallbackSource,
    mediaClearanceBridgeSource,
    authorityFanoutSource
    ]
  ] = await startupMetrics.measureAsync('runtime-fetch-and-parse', () => Promise.all([
    fetchStagedRuntimeCoreSources({
      catalogUrl: DATA_URLS.catalog,
      admissionsUrl: DATA_URLS.vndbAdmissions,
      indexesUrl: DATA_URLS.indexes,
      assetsManifestUrl: DATA_URLS.assetsManifest
    }),
    Promise.all([
      fetchJsonWithSha256(DATA_URLS.filterAuthority, '筛选权威'),
      fetchJsonWithSha256(DATA_URLS.workGroups, '作品组权威'),
      fetchJsonWithSha256(DATA_URLS.workGroupReviewQueue, '作品组 review queue'),
      fetchJsonWithSha256(DATA_URLS.enrichment, 'alias enrichment sidecar'),
      fetchJsonWithSha256(DATA_URLS.companyProfile, 'company profile sidecar'),
      fetchJsonWithSha256(DATA_URLS.presentationFamilies, 'presentation families sidecar'),
      RUNTIME_FEATURES.bangumiPublicBindingsV1.enabled
        ? fetchJsonWithSha256(DATA_URLS.bangumiPublicBindings, 'Bangumi public bindings carrier')
        : Promise.resolve(null),
      RUNTIME_FEATURES.vndbRatingsV1.enabled
        ? fetchJsonWithSha256(DATA_URLS.vndbRatings, 'VNDB ratings sidecar')
        : Promise.resolve(null),
      RUNTIME_FEATURES.bangumiRatingsV1.enabled
        ? fetchJsonWithSha256(DATA_URLS.bangumiRatings, 'Bangumi ratings sidecar')
        : Promise.resolve(null),
      RUNTIME_FEATURES.bangumiCanonicalAliasFallbackV1.enabled
        ? fetchJsonWithSha256(DATA_URLS.bangumiCanonicalAliasFallback, 'Bangumi canonical alias fallback')
        : Promise.resolve(null),
      RUNTIME_FEATURES.projectEntitiesV1.enabled && RUNTIME_FEATURES.projectEntitiesV1.mediaClearance
        ? fetchJsonWithSha256(DATA_URLS.mediaClearanceBridge, 'G1 media clearance bridge')
        : Promise.resolve(null),
      RUNTIME_FEATURES.authorityFanoutV1.enabled
        ? fetchJsonWithSha256(DATA_URLS.authorityFanout, 'authority fanout projection')
        : Promise.resolve(null)
    ])
  ]));
  const {
    catalogSource,
    admissions,
    backendIndexesSource,
    assetsManifestSource
  } = coreSources;
  const mergedAdmissions = mergeVndbAdmissionsIntoFixture(catalogSource.value, admissions);
  const sampleSource = mergedAdmissions.source;
  const populationContract = createRuntimePopulationContract({
    coreWorkIds: catalogSource.value.works.map(work => work.workId),
    admittedWorkIds: admissions?.works.map(work => work.workId) ?? []
  });
  const runtimePopulation = 'full';
  const runtimeDiagnostics = Object.freeze({
    mode: runtimePopulation,
    admissionsStatus: coreSources.admissionsStatus,
    coreWorkCount: populationContract.core.workIds.length,
    admissionsWorkCount: populationContract.admissions.workIds.length,
    runtimeWorkCount: populationContract.runtime.workIds.length
  });
  document.documentElement.dataset.runtimePopulation = runtimePopulation;
  globalThis.__EGS_TIER_STARTUP_DIAGNOSTICS__ = runtimeDiagnostics;
  const backendIndexes = admissions === null ? backendIndexesSource.value : null;
  const assetsManifest = admissions === null
    ? restrictAssetsManifestToCatalog(
      assetsManifestSource.value,
      catalogSource.value.works.map(work => work.workId)
    )
    : null;
  const filterAuthority = filterAuthoritySource.value;
  const workGroupAuthority = workGroupAuthoritySource.value;
  const reviewQueue = sampleSource.schemaVersion === 'egs-tier-full-v1'
    ? null
    : reviewQueueSource.value;
  const sample = startupMetrics.measure('sample-preparation', () => prepareRuntimeSample(sampleSource, {
    backendIndexes,
    assetsManifest,
    filterAuthority,
    workGroupAuthority,
    reviewQueue,
    sourceHashes: admissions === null ? {
      indexes: backendIndexesSource.sha256,
      assetsManifest: assetsManifestSource.sha256,
      filterAuthority: filterAuthoritySource.sha256,
      workGroupAuthority: workGroupAuthoritySource.sha256,
      ...(sampleSource.schemaVersion === 'egs-tier-full-v1'
        ? {}
        : { reviewQueue: reviewQueueSource.sha256 })
      } : null
  }));
  let enrichment = null;
  if (enrichmentSource !== null) {
    try {
      enrichment = prepareEnrichmentSidecar(enrichmentSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: new Set(populationContract.core.workIds),
        companyIds: new Set(catalogSource.value.companies.map(brand => brand.companyId))
      });
    } catch (error) {
      throw new TypeError('alias enrichment sidecar rejected', { cause: error });
    }
  }
  let workAliasesById = enrichment?.workAliasesById ?? null;
  const workPinyinById = enrichment?.workPinyinById ?? null;
  let workDisplayTitlesById = enrichment?.workDisplayTitlesById ?? null;
  let projectEntityRuntime = null;
  if (mediaClearanceBridgeSource !== null) {
    try {
      if (mediaClearanceBridgeSource.sha256 !== MEDIA_CLEARANCE_BRIDGE_SHA256) {
        throw new TypeError('G1 media clearance bridge hash does not match the runtime pin');
      }
      projectEntityRuntime = await createProjectEntityRuntime({
        bridge: mediaClearanceBridgeSource.value,
        catalog: { ...catalogSource.value, catalogSha256: catalogSource.sha256 },
        dataRevision: DATA_REVISION,
        cryptoRef: crypto
      });
      console.info('G1 media clearance bridge applied', projectEntityRuntime.audit);
    } catch (error) {
      throw new TypeError('G1 media clearance bridge rejected', { cause: error });
    }
  }
  let vndbRatings = null;
  if (vndbRatingsSource !== null) {
    try {
      const config = RUNTIME_FEATURES.vndbRatingsV1;
      if (typeof config.sha256 !== 'string' || vndbRatingsSource.sha256 !== config.sha256) {
        throw new TypeError('VNDB ratings sidecar hash does not match the runtime pin');
      }
      vndbRatings = prepareVndbRatingsSidecar(vndbRatingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.runtime.workIds,
        allowSuperset: admissions === null
      });
    } catch (error) {
      throw new TypeError('VNDB ratings sidecar rejected', { cause: error });
    }
  }
  let bangumiPublicBindings = null;
  if (bangumiPublicBindingsSource !== null) {
    try {
      if (bangumiPublicBindingsSource.sha256 !== BANGUMI_PUBLIC_BINDINGS_SHA256) {
        throw new TypeError('Bangumi public bindings carrier hash does not match the runtime pin');
      }
      bangumiPublicBindings = prepareBangumiPublicBindingsCarrier(bangumiPublicBindingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.core.workIds
      });
    } catch (error) {
      throw new TypeError('Bangumi public bindings carrier rejected', { cause: error });
    }
  }
  let bangumiRatings = null;
  if (bangumiRatingsSource !== null && bangumiPublicBindingsSource !== null && bangumiPublicBindings !== null) {
    try {
      const config = RUNTIME_FEATURES.bangumiRatingsV1;
      if (typeof config.sha256 !== 'string' || bangumiRatingsSource.sha256 !== config.sha256) {
        throw new TypeError('Bangumi ratings sidecar hash does not match the runtime pin');
      }
      bangumiRatings = prepareBangumiRatingsSidecar(bangumiRatingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        bangumiPublicBindingsSha256: bangumiPublicBindingsSource.sha256,
        // The Bangumi sidecar is bound to the 6,799-work core catalog. VNDB-only
        // admissions are merged separately and must not invalidate core ratings.
        workIds: populationContract.core.workIds
      });
    } catch (error) {
      throw new TypeError('Bangumi ratings sidecar rejected', { cause: error });
    }
  }
  // The import flow intentionally consumes only the already-validated, confirmed
  // relation rows. It never derives a match from a title or a loose VNDB relation.
  const confirmedBangumiImportBindings = bangumiPublicBindings === null
    ? null
    : bangumiPublicBindings.bindings;
  if (bangumiCanonicalAliasFallbackSource !== null && bangumiPublicBindings !== null) {
    try {
      const config = RUNTIME_FEATURES.bangumiCanonicalAliasFallbackV1;
      if (typeof config.sha256 !== 'string' || bangumiCanonicalAliasFallbackSource.sha256 !== config.sha256) {
        throw new TypeError('Bangumi canonical alias fallback hash does not match the runtime pin');
      }
      const fallback = prepareBangumiCanonicalAliasFallback(bangumiCanonicalAliasFallbackSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        enrichmentSha256: enrichmentSource?.sha256,
        bangumiPublicBindingsSha256: bangumiPublicBindingsSource.sha256,
        workIds: populationContract.core.workIds
      });
      ({ workAliasesById, workDisplayTitlesById } = applyBangumiCanonicalAliasFallback({
        workAliasesById,
        workDisplayTitlesById,
        fallbackByWorkId: fallback.workFallbackById
      }));
    } catch (error) {
      throw new TypeError('Bangumi canonical alias fallback rejected', { cause: error });
    }
  }
  const displayWorks = sample.works.map(work => projectWorkWithDisplayTitle(work, workDisplayTitlesById));
  let authorityFanout = null;
  if (authorityFanoutSource !== null) {
    try {
      const config = RUNTIME_FEATURES.authorityFanoutV1;
      if (typeof config.sha256 !== 'string' || authorityFanoutSource.sha256 !== config.sha256) {
        throw new TypeError('authority fanout projection hash does not match the runtime pin');
      }
      const mediaProjection = prepareAuthorityFanoutMediaProjection(authorityFanoutSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.core.workIds
      });
      const pageBindingProjection = prepareAuthorityFanoutPageBindings(authorityFanoutSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.core.workIds,
        ratingsSha256: RUNTIME_FEATURES.vndbRatingsV1.sha256
      });
      authorityFanout = {
        selectedMediaByWorkId: mediaProjection.selectedMediaByWorkId,
        pageBindingIssues: pageBindingProjection.pageBindingIssues
      };
      if (authorityFanout.pageBindingIssues.length > 0) {
        throw new TypeError(`authority fanout page bindings rejected: ${authorityFanout.pageBindingIssues.length} issue(s)`);
      }
      console.info('authority fanout projection applied', { selectedWorkCount: authorityFanout.selectedMediaByWorkId.size });
    } catch (error) {
      throw new TypeError('authority fanout projection rejected', { cause: error });
    }
  }
  const vndbWeightedSort = vndbRatings === null
    ? null
    : createWeightedRatingSort({ ratings: vndbRatings.ratingByWorkId, scoreField: 'ratingRaw' });
  const bangumiWeightedSort = bangumiRatings === null
    ? null
    : createWeightedRatingSort({ ratings: bangumiRatings.ratingByWorkId, scoreField: 'score' });
  const egsWeightedSort = createWeightedRatingSort({
    ratings: new Map(sample.works.map(work => [work.workId, {
      ratingStatus: Number.isFinite(work.median) && Number.isInteger(work.voteCount)
        ? 'mapped-rated'
        : 'snapshot-unavailable',
      score: work.median,
      voteCount: work.voteCount
    }])),
    scoreField: 'score'
  });
  const ratedDisplayWorks = displayWorks.map(work => {
    const vndbRated = projectWorkWithVndbRating(work, vndbRatings?.ratingByWorkId);
    const rated = projectWorkWithBangumiRating(vndbRated, bangumiRatings?.ratingByWorkId);
    const clearanceProjected = projectEntityRuntime === null ? rated : applyProjectedMediaToWork(rated, projectEntityRuntime.selectedMediaByWorkId);
    const authorityProjected = authorityFanout === null
      ? clearanceProjected
      : applyAuthorityFanoutMediaToWork(clearanceProjected, authorityFanout.selectedMediaByWorkId);
    return {
      ...authorityProjected,
      externalAdmissionVisible: authorityProjected.isCrossSourceAdmission === true
        && (authorityProjected.vndbRating?.ratingStatus === 'mapped-rated'
          || authorityProjected.bangumiRating?.ratingStatus === 'mapped-rated'),
      egsScore: egsWeightedSort?.score(
        authorityProjected.median,
        authorityProjected.voteCount
      ) ?? null,
      vndbScore: vndbWeightedSort?.score(
        authorityProjected.vndbRating?.sortScore,
        authorityProjected.vndbRating?.sortVoteCount
      ) ?? null,
      vndbVoteCount: authorityProjected.vndbRating?.sortVoteCount ?? null,
      bangumiScore: bangumiWeightedSort?.score(
        authorityProjected.bangumiRating?.sortScore,
        authorityProjected.bangumiRating?.sortVoteCount
      ) ?? null,
      bangumiVoteCount: authorityProjected.bangumiRating?.sortVoteCount ?? null
    };
  });
  const sortableSample = { ...sample, works: ratedDisplayWorks };
  const worksById = new Map(ratedDisplayWorks.map(work => [work.workId, work]));
  let presentationFamilies = null;
  if (presentationFamiliesSource !== null) {
    try {
      if (presentationFamiliesSource.sha256 !== PRESENTATION_FAMILIES_SIDECAR_SHA256) {
        throw new TypeError('presentation families sidecar hash does not match the runtime pin');
      }
      presentationFamilies = preparePresentationFamiliesSidecar(presentationFamiliesSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.presentation.workIds
      });
    } catch (error) {
      throw new TypeError('presentation families sidecar rejected', { cause: error });
    }
  }
  const workerWorkAliasesById = workAliasesById === null
    ? null
    : new Map(workAliasesById);
  const workerWorkPinyinById = workPinyinById === null
    ? null
    : new Map(workPinyinById);
  const workerCompanyAliasesById = enrichment?.companyAliasesById === null || enrichment?.companyAliasesById === undefined
    ? null
    : new Map(enrichment.companyAliasesById);
  const workerCompanyPinyinById = enrichment?.companyPinyinById === null || enrichment?.companyPinyinById === undefined
    ? null
    : new Map(enrichment.companyPinyinById);
  const brands = projectBrandsWithAliases(
    sample.brands,
    enrichment?.companyAliasesById,
    enrichment?.companyPinyinById
  );
  let companyProfile = null;
  if (companyProfileSource !== null) {
    try {
      companyProfile = prepareCompanyProfileSidecar(companyProfileSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        companyIds: new Set(catalogSource.value.companies.map(brand => brand.companyId))
      });
    } catch (error) {
      throw new TypeError('company profile sidecar rejected', { cause: error });
    }
  }
  const companyDirectory = buildCompanyDirectory({
    brands,
    works: ratedDisplayWorks,
    companyAliasesById: enrichment?.companyAliasesById,
    companyPinyinById: enrichment?.companyPinyinById,
    avatarByCompanyId: companyProfile?.avatarByCompanyId
  });
  const filterById = new Map(sample.filters.map(filter => [filter.filterId, filter]));
  let mediaStore = null;
  let customWorks = [];
  await startupMetrics.measureAsync('local-media-hydration', async () => {
    try {
      const mediaDatabase = await openLocalMediaDatabase(window.indexedDB);
      mediaStore = createLocalMediaStore({ database: mediaDatabase, urlApi: URL });
      customWorks = (await mediaStore.listCustom()).map(createCustomWork);
      for (const work of customWorks) worksById.set(work.workId, work);
    } catch (error) {
      console.error(error);
    }
  });
  const controller = createAppController({
    sample: sortableSample,
    localWorks: customWorks,
    storage: browserStorage(),
    confirm: message => window.confirm(message),
    announce,
    now: () => new Date(),
    downloadJson
  });
  const filterWorkerClient = createFilterWorkerClient({
    workerFactory: () => new Worker(
      new URL('./workers/filter-worker.js?v=20260824-selection-source-sorting-v1', import.meta.url),
      { type: 'module' }
    ),
    timeoutMs: 10000
  });
  await startupMetrics.measureAsync('filter-worker-init', () => filterWorkerClient.init({
    works: sortableSample.works,
    knownFilterIds: sample.filters.map(filter => filter.filterId),
    brands,
    backendIndexes: sample.backendIndexes,
    workAliasesById: workerWorkAliasesById,
    workPinyinById: workerWorkPinyinById,
    companyAliasesById: workerCompanyAliasesById,
    companyPinyinById: workerCompanyPinyinById
  }));
  window.addEventListener('pagehide', () => filterWorkerClient.terminate(), { once: true });

  let filterView;
  let importBusy = false;
  let candidateTitleQuery = '';
  let selectionScrollPosition = { top: 0, left: 0 };
  // Mobile uses the same workspace as desktop. The companion view remains inert
  // until it can offer feature parity rather than hiding the ranking workspace.
  const mobileCompanion = false;
  let rankingScrollPosition = {
    top: 0,
    left: 0,
    tiers: {},
    poolLeft: 0
  };
  let renderedWorkspaceMode = null;
  let rankingWorkspaceVisible = false;
  let renderedFilterKey = null;
  let lastRenderedModel = null;
  let replacementWork = null;
  let companyDirectoryOpen = false;
  let rankingSubject = 'work';
  let companyQuery = '';
  let companySort = 'totalVoteCount-desc';
  let companyHasImage = true;
  let companyDetailSortKey = 'releaseDate';
  let companyDetailSortDirection = 'asc';
  let companyCandidateQuery = '';
  let selectedCompanyId = null;
  let selectionMode = false;
  let companySelectionMode = false;
  let currentWorkDetailId = null;
  let detailsVersionShelfExpanded = false;
  let workDetailCreditsRequest = 0;
  let applyingUiLocation = false;
  let locationScrollTimer = null;
  const workDetailCreditsView = createWorkDetailCreditsView({
    root: elements.detailsCredits,
    status: elements.detailsCreditsStatus,
    tabs: elements.detailsCreditsTabs,
    content: elements.detailsCreditsContent
  });
  const workDetailCreditsLoader = createWorkDetailCreditsLoader({
    indexUrl: DATA_URLS.workDetailCreditsIndex,
    catalogSnapshotId: sampleSource.snapshot?.snapshotId,
    catalogSha256: catalogSource.sha256,
    workIds: new Set(sample.works.map(work => work.workId)),
    fetchImpl: fetch,
    cryptoRef: crypto,
    cacheMode: RUNTIME_DATA_CACHE_MODE
  });
  const companyGuide = createGuideController({
    key: 'egs-tier-terminal:company-directory-guide-v2',
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    open: openCompanyDirectoryHelp
  });
  const companyRanking = createCompanyRanking({
    companies: companyDirectory.companies,
    tiers: controller.inspectState().tiers,
    storage: window.localStorage
  });
  elements.companyRankingToggle.textContent = '进入排榜';
  elements.companyRankingClose.textContent = '返回会社';

  function openCompanyDirectoryHelp() {
    if (elements.companyHelp.open) return;
    if (typeof elements.companyHelp.showModal === 'function') elements.companyHelp.showModal();
    else elements.companyHelp.open = true;
  }

  function showCompanyDirectoryHelpOnce() {
    companyGuide.enter({ automatic: !document.body.classList.contains('is-ranking-immersive') });
  }

  function openCompanyDirectory(companyId = null, { push = true } = {}) {
    // Disable stale work-card handlers before the asynchronous workspace refresh.
    setWorkSelectionMode(false);
    companyDirectoryOpen = true;
    selectedCompanyId = companyId;
    currentWorkDetailId = null;
    if (elements.detailsDialog.open) elements.detailsDialog.close();
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    renderCompanyDirectory();
    showCompanyDirectoryHelpOnce();
    if (push) pushUiLocation();
  }

  function authorityThumbnailPathForWork(work) {
    const path = work.projectedThumbnailPath ?? work.coverPath;
    return typeof path === 'string' && path.length > 0 ? path : null;
  }

  async function localReplacementUrlForCurrentAuthority(work) {
    if (mediaStore === null || work.localMediaKind === 'custom') return null;
    const replacement = await mediaStore.replacementFor(work.workId);
    if (replacement?.authorityThumbnailPath !== authorityThumbnailPathForWork(work)) return null;
    return mediaStore.urlForReplacement(work.workId);
  }

  async function hasLocalReplacementForCurrentAuthority(work) {
    if (mediaStore === null || work.localMediaKind === 'custom') return false;
    const replacement = await mediaStore.replacementFor(work.workId);
    return replacement?.authorityThumbnailPath === authorityThumbnailPathForWork(work);
  }

  async function coverUrlForWork(work) {
    if (mediaStore !== null && work.localMediaKind === 'custom') {
      return mediaStore.urlForCustom(work.workId);
    }
    const replacement = await localReplacementUrlForCurrentAuthority(work);
    if (replacement !== null) return replacement;
    return resolveAssetUrl(authorityThumbnailPathForWork(work), assetBase);
  }

  async function coverSourcesForWork(work) {
    const thumbnailUrl = await coverUrlForWork(work);
    if (!highDensityPreviewsEnabled || thumbnailUrl.startsWith('blob:')) {
      return Object.freeze({ thumbnailUrl, previewUrl: null });
    }
    const previewUrl = await previewUrlForWork(work);
    return Object.freeze({ thumbnailUrl, previewUrl: previewUrl === thumbnailUrl ? null : previewUrl });
  }

  async function resolveCoverUrls(works) {
    const entries = await Promise.all(works.map(async work => [work.workId, await coverSourcesForWork(work)]));
    return new Map(entries);
  }

  async function previewUrlForWork(work) {
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

  const rankingPreloader = createRankingPreloader({ load: preloadImage, concurrency: 4 });
  let rankingPreloadGeneration = 0;

  function cancelRankingPreload() {
    rankingPreloadGeneration += 1;
    rankingPreloader.cancel();
  }

  async function refreshRankingPreload(rankingModel) {
    const generation = ++rankingPreloadGeneration;
    const visibleWorkIds = new Set(rankingView.visibleWorkIds());
    const selectedWorks = [
      ...rankingModel.tiers.flatMap(tier => tier.works),
      ...rankingModel.candidateWorks
    ];
    const entries = await Promise.all(selectedWorks.map(async work => ({
      url: await previewUrlForWork(work),
      visible: visibleWorkIds.has(work.workId)
    })));
    if (
      generation !== rankingPreloadGeneration
      || lastRenderedModel?.state.workspaceMode !== 'ranking'
    ) return false;
    rankingPreloader.replace(entries);
    return true;
  }

  elements.mediaPreviewClose.replaceChildren(createActionIcon(document, 'x'));
  const previewActions = createMediaPreviewActions({
    documentRef: document,
    actions: elements.mediaPreviewActions,
    viewport: {
      get width() { return window.innerWidth; },
      get height() { return window.innerHeight; }
    },
    confirm: message => window.confirm(message),
    onEdit: work => {
      void editStickersForWork(work).catch(error => {
        announce(error instanceof Error ? error.message : '图片贴纸编辑失败。', 'error');
        console.error(error);
      });
    },
    onReplace: work => {
      replacementWork = work;
      elements.mediaFiles.click();
    },
    onRestore: work => {
      void mediaStore.deleteReplacement(work.workId).then(render).then(() => {
        previewActions.closeMenu();
        if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
        else elements.mediaPreview.open = false;
      }).catch(error => {
        announce('恢复原图失败。', 'error');
        console.error(error);
      });
    }
  });
  const previewLoader = createMediaPreviewLoader({
    image: elements.mediaPreviewImage,
    resolveUrl: previewUrlForWork,
    async reveal(work, isCurrent) {
      const isImmersive = document.body.classList.contains('is-ranking-immersive') || work.mediaPreviewImmersive === true;
      const hasReplacement = !isImmersive && await hasLocalReplacementForCurrentAuthority(work);
      if (!isCurrent()) return;
      elements.mediaPreview.classList.toggle('is-immersive-preview', isImmersive);
      elements.mediaPreviewTitle.textContent = work.title;
      previewActions.render({
        work,
        immersive: isImmersive,
        editable: !isImmersive && mediaStore !== null,
        replaceable: !isImmersive && work.localMediaKind !== 'custom' && mediaStore !== null,
        restorable: hasReplacement
      });
      if (typeof elements.mediaPreview.showModal === 'function') elements.mediaPreview.showModal();
      else elements.mediaPreview.open = true;
    }
  });

  function openMediaPreview(work, { immersive = document.body.classList.contains('is-ranking-immersive') } = {}) {
    const previewWork = immersive && !document.body.classList.contains('is-ranking-immersive')
      ? { ...work, mediaPreviewImmersive: true }
      : work;
    return previewLoader.open(previewWork);
  }

  elements.mediaPreview.addEventListener('close', () => {
    previewLoader.cancel();
    previewActions.closeMenu();
  });
  elements.mediaPreview.addEventListener('click', event => {
    if (!elements.mediaPreview.classList.contains('is-immersive-preview')) return;
    const rect = elements.mediaPreviewImage.getBoundingClientRect();
    const outsideImage = event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom;
    if (!outsideImage) return;
    if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
    else {
      elements.mediaPreview.open = false;
      previewLoader.cancel();
    }
  });

  function renderCropActive(active) {
    const canvas = elements.mediaCropCanvas;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = active.crop.viewport;
    canvas.height = active.crop.viewport;
    const { x, y, size } = active.crop;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(active.decoded.image, x, y, size, size, 0, 0, canvas.width, canvas.height);
  }

  async function decodeMediaFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release() { URL.revokeObjectURL(url); }
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function blobForUrl(url) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`图片底图加载失败（HTTP ${response.status}）。`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new TypeError('图片底图响应类型无效。');
    return blob;
  }

  async function decodeBlob(blob) {
    return decodeMediaFile(new File([blob], 'sticker-base', { type: blob.type || 'image/webp' }));
  }

  function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  let stickerImageReleases = [];

  function releaseStickerImages() {
    for (const release of stickerImageReleases.splice(0)) release();
  }

  async function loadStickerImages() {
    releaseStickerImages();
    const images = new Map();
    try {
      for (const [kind, relativeUrl] of Object.entries(STICKER_IMAGE_ASSETS)) {
        const blob = await blobForUrl(new URL(relativeUrl, import.meta.url).href);
        const decoded = await decodeBlob(blob);
        images.set(kind, decoded.image);
        if (typeof decoded.release === 'function') stickerImageReleases.push(decoded.release);
      }
      return images;
    } catch (error) {
      releaseStickerImages();
      throw error;
    }
  }

  function renderStickerPreview(state) {
    const canvas = requiredElement('sticker-editor-canvas');
    const context = canvas.getContext('2d');
    if (!context || !state.document) return;
    canvas.width = 512;
    canvas.height = 512;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111821';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      const preview = composeStickerImage({
        baseImage: state.baseImage,
        document: state.document,
        createCanvas,
        stickerImages: state.stickerImages,
        maximumSize: 512
      });
      const ratio = Math.min(canvas.width / preview.width, canvas.height / preview.height);
      const width = preview.width * ratio;
      const height = preview.height * ratio;
      const left = (canvas.width - width) / 2;
      const top = (canvas.height - height) / 2;
      context.drawImage(preview.canvas, left, top, width, height);
      const selected = state.document.layers.find(layer => layer.id === state.selectedId);
      if (!selected) return;
      const layerWidth = selected.scale * Math.min(width, height);
      const layerHeight = layerWidth / STICKER_TYPES[selected.kind].aspectRatio;
      context.save();
      context.translate(left + (selected.centerX * width), top + (selected.centerY * height));
      context.rotate(selected.rotation * Math.PI / 180);
      context.strokeStyle = '#7ce8ff';
      context.lineWidth = 2;
      context.strokeRect(-layerWidth / 2, -layerHeight / 2, layerWidth, layerHeight);
      context.fillStyle = '#111821';
      context.strokeStyle = '#ffffff';
      for (const [x, y] of [
        [-layerWidth / 2, -layerHeight / 2],
        [layerWidth / 2, -layerHeight / 2],
        [layerWidth / 2, layerHeight / 2],
        [-layerWidth / 2, layerHeight / 2]
      ]) {
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
      context.beginPath();
      context.moveTo(0, -layerHeight / 2);
      context.lineTo(0, (-layerHeight / 2) - 28);
      context.stroke();
      context.beginPath();
      context.arc(0, (-layerHeight / 2) - 28, 7, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    } catch (error) {
      announce(error instanceof Error ? error.message : '图片贴纸预览失败。', 'error');
      console.error(error);
    }
  }

  const stickerEditor = createStickerEditorView({
    documentRef: document,
    requestFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: frame => window.cancelAnimationFrame(frame),
    renderPreview: renderStickerPreview,
    compose: async state => ({
      compositeBlob: await encodeStickerComposite({
        baseImage: state.baseImage,
        document: state.document,
        createCanvas,
        stickerImages: state.stickerImages
      }),
      document: state.document
    }),
    confirm: message => window.confirm(message),
    onError(error) {
      announce(error instanceof Error ? error.message : '图片贴纸编辑失败。', 'error');
      console.error(error);
    }
  });

  async function editStickersForCrop({ baseBlob, width, height }) {
    const decoded = await decodeBlob(baseBlob);
    try {
      const edited = await stickerEditor.open({
        baseImage: decoded.image,
        baseBlob,
        document: createStickerDocument({ baseWidth: width, baseHeight: height }),
        stickerImages: await loadStickerImages()
      });
      return edited === null ? null : {
        baseBlob: edited.baseBlob,
        compositeBlob: edited.compositeBlob,
        stickerDocument: edited.document
      };
    } finally {
      decoded.release?.();
      releaseStickerImages();
    }
  }

  async function editStickersForWork(work) {
    if (mediaStore === null) throw new Error('本地图片存储不可用');
    const custom = work.localMediaKind === 'custom';
    const identity = custom
      ? { kind: 'custom', id: work.workId, width: work.coverWidth, height: work.coverHeight }
      : { kind: 'replacement', workId: work.workId, width: work.coverWidth, height: work.coverHeight };
    const editable = await mediaStore.editableFor(identity);
    const publicOriginal = !custom && (
      editable === null || editable.metadata?.stickerSource === 'public'
    );
    const baseBlob = editable?.baseBlob ?? await blobForUrl(await previewUrlForWork(work));
    const decoded = await decodeBlob(baseBlob);
    const width = editable?.stickerDocument.baseWidth ?? decoded.width;
    const height = editable?.stickerDocument.baseHeight ?? decoded.height;
    const document = editable?.stickerDocument ?? createStickerDocument({ baseWidth: width, baseHeight: height });
    try {
      const edited = await stickerEditor.open({
        baseImage: decoded.image,
        baseBlob,
        document,
        stickerImages: await loadStickerImages()
      });
      if (edited === null) return false;
      if (edited.document.layers.length === 0) {
        if (publicOriginal) {
          await mediaStore.clearStickerEdit({ kind: 'replacement', workId: work.workId, restorePublic: true });
        } else if (editable?.metadata?.stickerDocument) {
          await mediaStore.clearStickerEdit({ ...identity, restorePublic: false });
        }
      } else {
        await mediaStore.putStickerEdit({
          ...identity,
          title: editable?.metadata?.title ?? work.title,
          width,
          height,
          baseBlob,
          compositeBlob: edited.compositeBlob,
          stickerDocument: edited.document,
          ...(!custom ? { authorityThumbnailPath: authorityThumbnailPathForWork(work) } : {}),
          ...(publicOriginal ? { stickerSource: 'public' } : {})
        });
      }
      previewLoader.cancel();
      if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
      else elements.mediaPreview.open = false;
      await render();
      return true;
    } finally {
      decoded.release?.();
      releaseStickerImages();
    }
  }

  async function createCustomCandidate({ title, blob, width, height, baseBlob, stickerDocument }) {
    if (mediaStore === null) throw new Error('本地图片存储不可用');
    const id = `custom-local-${crypto.randomUUID()}`;
    if (stickerDocument) {
      await mediaStore.putStickerEdit({
        kind: 'custom', id, title, width, height,
        baseBlob, compositeBlob: blob, stickerDocument
      });
    } else {
      await mediaStore.putCustom({ id, title, blob, width, height });
    }
    try {
      const work = createCustomWork({ id, title, width, height });
      controller.registerLocalWorks([work]);
      worksById.set(id, work);
      customWorks = [...customWorks, work];
    } catch (error) {
      await mediaStore.deleteCustom(id).catch(cleanupError => console.error(cleanupError));
      throw error;
    }
    await render();
  }
  const selectionView = createSelectionView({
    // Contract marker: createSelectionView({ root, onToggleWork, onToggleCurrentPage, onToggleCurrentResults, onToggleSelectedOnly, onOpenDetails, onFilterChange, assetBase })
    root: elements.catalogResults,
    onToggleWork(work, selected) {
      if (!selectionMode) return;
      return runStateChange(() => selected
        ? controller.selectWorks([work.workId])
        : controller.deselectWorks([work.workId]));
    },
    onToggleCurrentPage(workIds) {
      return runStateChange(() => controller.toggleCurrentResults(workIds));
    },
    onToggleCurrentResults(workIds) {
      return runStateChange(() => controller.toggleCurrentResults(workIds));
    },
    onToggleSelectedOnly(selectedOnly) {
      return runStateChange(() => controller.setFilterState({ selectedOnly }));
    },
    onOpenDetails(work) {
      openWorkDetails(work);
    },
    onFilterChange(patch) {
      const result = runStateChange(() => controller.setFilterState(patch));
      replaceUiLocation();
      return result;
    },
    onPageChange() {
      replaceUiLocation();
    },
    assetBase,
    cardSurfaceSelection: true
  });
  const filterIconHost = elements.filterToggle.querySelector('.toolbar-button-icon');
  filterIconHost?.replaceChildren(createActionIcon(document, 'filter'));
  let companyDirectoryView;
  function renderCompanyDirectory() {
    const [sortKey, direction] = companySort.split('-');
    const companies = searchCompanyDirectory(companyDirectory, companyQuery, {
      sortKey,
      direction,
      hasAvatar: companyHasImage ? true : null
    });
    elements.companyDirectoryCount.textContent = String(companies.length);
    const selected = companies.find(company => company.companyId === selectedCompanyId)
      ?? companyDirectory.companies.find(company => company.companyId === selectedCompanyId)
      ?? null;
    selectedCompanyId = selected?.companyId ?? null;
    companyDirectoryView.render({
      companies,
      selectedCompanyId,
      selectedWorks: selected ? worksForCompany(companyDirectory, selected.companyId, {
        sortKey: companyDetailSortKey,
        direction: companyDetailSortDirection
      }) : [],
      detailWorkSortKey: companyDetailSortKey,
      detailWorkSortDirection: companyDetailSortDirection,
      selectedCompanyIds: companyRanking.inspect().selectedSet,
      selectionMode: companySelectionMode,
      imageUrlForCompany: company => companyImageUrl(company, assetBase),
      // Match the backend-selected media used by the work library and ranking.
      imageUrlForWork: work => Object.freeze({
        thumbnailUrl: resolveAssetUrl(work.projectedThumbnailPath ?? work.coverPath, assetBase),
        previewUrl: highDensityPreviewsEnabled && typeof work.projectedPreviewPath === 'string'
          ? resolveAssetUrl(work.projectedPreviewPath, assetBase)
          : null
      })
    });
  }

  function companyRankingItems() {
    return new Map(companyDirectory.companies.map(company => [
      company.companyId,
      {
        workId: company.companyId,
        title: company.brandName,
        company,
        companyImageUrl: companyImageUrl(company, assetBase),
        coverPath: companyImageUrl(company, assetBase) ?? `company:${company.companyId}`,
        coverWidth: 512,
        coverHeight: 512
      }
    ]));
  }

  function createCompanyRankingCard(documentRef, companyItem, callbacks) {
    const card = documentRef.createElement('article');
    card.className = 'ranking-card is-company-card';
    card.dataset.workId = companyItem.workId;
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute('aria-label', companyItem.title);
    const cover = documentRef.createElement('button');
    cover.type = 'button';
    cover.className = 'ranking-card-cover';
    cover.setAttribute('aria-label', `打开会社 ${companyItem.title}`);
    cover.title = `打开会社 ${companyItem.title}`;
    const image = documentRef.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.src = companyItem.companyImageUrl ?? '';
    image.addEventListener('error', () => {
      image.hidden = true;
      card.classList.add('is-image-missing');
    }, { once: true });
    cover.append(image);
    const title = documentRef.createElement('span');
    title.className = 'ranking-card-title';
    title.dataset.field = 'title';
    title.textContent = companyItem.title;
    const handle = documentRef.createElement('button');
    handle.type = 'button';
    handle.className = 'ranking-drag-handle';
    handle.setAttribute('aria-label', `整理 ${companyItem.title}`);
    handle.setAttribute('title', `整理 ${companyItem.title}`);
    handle.textContent = '::';
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    card.append(cover, title, handle);
    cover.addEventListener('click', event => {
      if (!callbacks.isCardActivationEnabled?.(companyItem)
        || callbacks.shouldSuppressMediaClick?.(companyItem)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      callbacks.onOpenDetails(companyItem);
    });
    const desktopDetails = documentRef.defaultView?.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? true;
    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (!desktopDetails || event.pointerType === 'touch') return;
      callbacks.onContextMenu(companyItem, card, event);
    });
    card.addEventListener('dragstart', event => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData?.('text/plain', companyItem.workId);
      }
      callbacks.onDragStart(companyItem, card, event);
    });
    card.addEventListener('dragend', event => callbacks.onDragEnd(companyItem, card, event));
    return card;
  }

  function buildCompanyRankingModel() {
    const ranking = companyRanking.inspect();
    const state = controller.inspectState();
    return buildRankingModel({
      selectedWorkIds: ranking.selectedCompanyIds,
      tiers: state.tiers,
      tierOrder: ranking.tierOrder
    }, companyRankingItems(), '');
  }
  companyDirectoryView = createCompanyDirectoryView({
    root: elements.companyView,
    onSearch(query) {
      companyQuery = query;
      renderCompanyDirectory();
      replaceUiLocation();
    },
    onSort(value) {
      companySort = value;
      renderCompanyDirectory();
      replaceUiLocation();
    },
    onSelectCompany(companyId, { revealDetail = false } = {}) {
      selectedCompanyId = companyId;
      renderCompanyDirectory();
      pushUiLocation();
      const windowRef = elements.companyView.ownerDocument?.defaultView;
      if (revealDetail && windowRef?.matchMedia?.('(max-width: 899px)').matches) {
        windowRef.requestAnimationFrame(() => {
          elements.companyDetail.scrollIntoView({ block: 'start', behavior: 'auto' });
        });
      }
    },
    onCloseDetail() {
      selectedCompanyId = null;
      renderCompanyDirectory();
      pushUiLocation();
    },
    onToggleCompany(companyId, selected) {
      companyRanking.toggle(companyId, selected);
      renderCompanyDirectory();
      if (lastRenderedModel !== null) renderControlStates(lastRenderedModel);
    },
    onOpenWork(work) {
      openWorkDetails(work);
    },
    onDetailWorkSort({ sortKey, direction }) {
      if (typeof sortKey === 'string' && ['releaseDate', 'median', 'voteCount'].includes(sortKey)) {
        companyDetailSortKey = sortKey;
      }
      if (direction === 'asc' || direction === 'desc') companyDetailSortDirection = direction;
      renderCompanyDirectory();
    },
    onPageChange() {
      replaceUiLocation();
    }
  });
  elements.companyHasImage.addEventListener('change', () => {
    companyHasImage = elements.companyHasImage.checked;
    renderCompanyDirectory();
    replaceUiLocation();
  });
  const mobileGuide = createGuideController({
    key: 'egs-tier-terminal:mobile-guide-v2',
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    open: () => {
      if (typeof elements.mobileHelpDialog.showModal === 'function') elements.mobileHelpDialog.showModal();
      else elements.mobileHelpDialog.open = true;
    }
  });

  function showMobileHelpOnce() {
    if (!mobileCompanion) return;
    mobileGuide.enter({ automatic: !document.body.classList.contains('is-ranking-immersive') });
  }

  async function copySelectionUrl(url) {
    try {
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the legacy copy path.
    }
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand?.('copy') === true;
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function shareSelectedWorkIds(workIds) {
    if (!Array.isArray(workIds) || workIds.length === 0) return false;
    const url = buildSelectionShareUrl({
      baseUrl: window.location.href,
      datasetVersion: sample.sampleId,
      workIds
    });
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: '排榜选片', url });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error(error);
    }
    const copied = await copySelectionUrl(url);
    if (copied) announce('链接已复制，可在电脑网页端打开', 'success');
    else announce('分享链接已生成，请在电脑网页端打开', 'warning');
    return copied;
  }

  const mobileSelectionView = createMobileSelectionView({
    root: elements.mobileSelectionView,
    onToggleWork(work, selected) {
      if (!selectionMode) return;
      return runStateChange(() => selected
        ? controller.selectWorks([work.workId])
        : controller.deselectWorks([work.workId]));
    },
    onOpenDetails(work) {
      openWorkDetails(work);
    },
    onOpenMedia(work) {
      void openMediaPreview(work).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      });
    },
    onTitleQuery(titleQuery) {
      return runStateChange(() => controller.setFilterState({ titleQuery }));
    },
    onFilterOpen() {
      elements.filterToggle.click();
    },
    onShareSelection(workIds) {
      void shareSelectedWorkIds(workIds);
    },
    onClearSelection(workIds) {
      return runStateChange(() => controller.deselectWorks(workIds));
    },
    onHelpOpen() {},
    assetBase
  });

  function setWorkSelectionMode(active) {
    selectionMode = Boolean(active);
    selectionView.setSelectionMode(selectionMode);
    mobileSelectionView.setSelectionInteractionEnabled(selectionMode);
  }

  const rankingView = createRankingView({
    root: elements.rankingView,
    createCard: (documentRef, item, callbacks) => rankingSubject === 'company'
      ? createCompanyRankingCard(documentRef, item, callbacks)
      : createRankingCard(documentRef, item, callbacks),
    onMoveToTier(workId, tierId, insertionIndex) {
      if (rankingSubject === 'company') {
        return runStateChange(() => companyRanking.moveToTier(workId, tierId, insertionIndex));
      }
      return runStateChange(() => controller.moveToTier(workId, tierId, insertionIndex));
    },
    onMoveToUnranked(workId) {
      if (rankingSubject === 'company') {
        return runStateChange(() => companyRanking.moveToCandidates(workId));
      }
      return runStateChange(() => controller.moveToUnranked(workId));
    },
    onTierConfigChange(nextTiers) {
      companyRanking.setTiers(nextTiers);
      return runStateChange(() => controller.saveTierConfig(nextTiers));
    },
    onTierDelete(tierId) {
      const state = controller.inspectState();
      const tier = state.tiers.find(item => item.id === tierId);
      if (!tier || state.tiers.length <= 3) return false;
      const count = rankingSubject === 'company'
        ? companyRanking.inspect().tierOrder[tierId]?.length ?? 0
        : state.tierOrder[tierId]?.length ?? 0;
      if (count > 0 && !window.confirm(`等级“${tier.name}”中有 ${count} 部作品，删除后这些作品将移回候选区。是否继续？`)) {
        return false;
      }
      const nextTiers = state.tiers.filter(item => item.id !== tierId);
      companyRanking.setTiers(nextTiers);
      return runStateChange(() => controller.saveTierConfig(nextTiers));
    },
    onAddTier() {
      const appended = appendTier(controller.inspectState().tiers, () => crypto.randomUUID());
      companyRanking.setTiers(appended);
      rankingView.focusTier(appended.at(-1).id);
      return runStateChange(() => controller.saveTierConfig(appended));
    },
    onRequestMediaImport(files) {
      if (files === null) elements.mediaFiles.click();
      else openMediaUpload(files);
    },
    onOpenDetails(work) {
      if (rankingSubject === 'company') {
        openCompanyDirectory(work.workId);
        return;
      }
      openWorkDetails(work);
    },
    onOpenMedia(work) {
      void openMediaPreview(work).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      });
    },
    onCandidateSearch(query) {
      if (importBusy) return;
      if (rankingSubject === 'company') return;
      candidateTitleQuery = query;
      if (lastRenderedModel?.state.workspaceMode !== 'ranking') return;
      rankingScrollPosition = rankingView.captureScroll();
      void render();
    },
    onAnnotationChange(workId, value) {
      const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
      activePresentation.setAnnotation(workId, value);
      rankingView.setAnnotations(activePresentation.inspect().annotations);
      renderControlStates(lastRenderedModel ?? controller.inspect([]));
    },
    onRemoveCandidate(workId) {
      if (rankingSubject === 'company') {
        return runStateChange(() => companyRanking.toggle(workId, false));
      }
      return runStateChange(() => controller.deselectWorks([workId]));
    },
    onRemoveCandidates(workIds) {
      if (rankingSubject === 'company') {
        return runStateChange(() => workIds.every(workId => companyRanking.toggle(workId, false)));
      }
      return runStateChange(() => controller.deselectWorks(workIds));
    },
    onMoveCandidatesToTier(workIds, tierId, insertionIndex) {
      if (rankingSubject === 'company') {
        return runStateChange(() => workIds.every((workId, offset) => (
          companyRanking.moveToTier(workId, tierId, insertionIndex + offset)
        )));
      }
      return runStateChange(() => controller.moveCandidatesToTier(workIds, tierId, insertionIndex));
    },
    showImportTile: () => rankingSubject === 'work',
    isCardActivationEnabled: () => true,
    assetBase
  });
  const presentation = createRankingPresentation({
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value)
  });
  const selectionCardPresentation = createSelectionCardPresentation({
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value)
  });
  // Company ranking shares the work ranking presentation state; only ranking data is separate.
  const companyPresentation = presentation;
  const help = createRankingHelp({
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    open(context) {
      const immersiveContext = context === 'immersive';
      elements.rankingHelpTitle.textContent = immersiveContext ? '直播模式' : '排榜使用说明';
      elements.rankingHelpFull.hidden = immersiveContext;
      elements.rankingHelpImmersive.hidden = !immersiveContext;
      elements.rankingHelpDismiss.textContent = immersiveContext ? '返回排榜' : '知道了';
      if (!elements.rankingHelp.open) elements.rankingHelp.showModal();
    }
  });

  const scaleControls = [
    ['overall', elements.rankingScaleOverall, elements.rankingScaleOverallOutput],
    ['card', elements.rankingScaleCard, elements.rankingScaleCardOutput],
    ['rail', elements.rankingScaleRail, elements.rankingScaleRailOutput],
    ['annotation', elements.rankingScaleAnnotation, elements.rankingScaleAnnotationOutput],
    ['tierName', elements.rankingScaleTierName, elements.rankingScaleTierNameOutput]
  ];

  function applyUiScale(uiScale) {
    for (const [key, input, output] of scaleControls) {
      const value = Number(uiScale[key]) || 100;
      const cssKey = key === 'tierName' ? 'tier-name' : key;
      input.value = String(value);
      output.value = `${value}%`;
      output.textContent = `${value}%`;
      document.documentElement.style.setProperty(`--ranking-ui-scale-${cssKey}`, String(value / 100));
    }
    rankingView.refreshLayout();
  }

  applyUiScale(presentation.inspect().uiScale);
  for (const [key, input] of scaleControls) {
    input.addEventListener('input', () => {
      applyUiScale({ ...presentation.inspect().uiScale, [key]: presentation.setUiScale(key, input.value) });
    });
  }
  elements.rankingScaleReset.addEventListener('click', () => {
    presentation.resetUiScale();
    applyUiScale(presentation.inspect().uiScale);
  });
  let rankingLayoutFrame = null;
  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(rankingLayoutFrame);
    rankingLayoutFrame = window.requestAnimationFrame(() => {
      rankingLayoutFrame = null;
      rankingView.refreshLayout();
    });
  });

  const toolbarMenus = [
    { button: elements.cardViewToggle, menu: elements.selectionCardDisplayMenu },
    { button: elements.cleanupMenuButton, menu: elements.cleanupMenu },
    { button: elements.displayMenuButton, menu: elements.displayMenu },
    { button: elements.fileMenuButton, menu: elements.fileMenu }
  ];

  function closeToolbarMenus(except = null) {
    for (const item of toolbarMenus) {
      if (item === except) continue;
      item.menu.hidden = true;
      item.button.setAttribute('aria-expanded', 'false');
    }
  }

  function setMobileRankingCandidatesOpen(open) {
    document.body.classList.toggle('is-mobile-ranking-candidates-open', open);
    elements.mobileRankingCandidates.setAttribute('aria-expanded', String(open));
    elements.mobileRankingCandidatesLabel.textContent = open ? '收起候选' : '展开候选';
    const candidateLabel = rankingSubject === 'company' ? '候选会社' : '候选作品';
    elements.mobileRankingCandidates.setAttribute('aria-label', `${open ? '收起' : '展开'}${candidateLabel}`);
  }

  function closeMobileRankingCandidates() {
    setMobileRankingCandidatesOpen(false);
  }

  function toggleMobileRankingCandidates() {
    const opening = !document.body.classList.contains('is-mobile-ranking-candidates-open');
    setMobileRankingCandidatesOpen(opening);
  }

  function openMobileRankingMenu() {
    if (typeof elements.mobileRankingMenu.showModal === 'function') elements.mobileRankingMenu.showModal();
    else elements.mobileRankingMenu.open = true;
  }

  function toggleToolbarMenu(item) {
    const opening = item.menu.hidden;
    closeToolbarMenus(item);
    item.menu.hidden = !opening;
    item.button.setAttribute('aria-expanded', String(opening));
    if (!opening) return;
    const anchor = item.button.getBoundingClientRect();
    const width = item.menu.getBoundingClientRect().width || 132;
    const left = Math.min(
      Math.max(8, anchor.left),
      Math.max(8, window.innerWidth - width - 8)
    );
    item.menu.style.left = `${left}px`;
    item.menu.style.top = `${Math.min(anchor.bottom + 4, window.innerHeight - item.menu.offsetHeight - 8)}px`;
  }

  for (const item of toolbarMenus) {
    item.button.addEventListener('click', event => {
      event.stopPropagation();
      toggleToolbarMenu(item);
    });
  }
  document.addEventListener('click', event => {
    if (toolbarMenus.some(item => item.menu.contains(event.target) || item.button.contains(event.target))) return;
    closeToolbarMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeToolbarMenus();
      closeMobileRankingCandidates();
    }
  });
  const immersive = createImmersiveController({
    root: document.body,
    documentRef: document,
    onChange(value) {
      closeToolbarMenus();
      closeMobileRankingCandidates();
      previewLoader.cancel();
      previewActions.clear();
      if (value) {
        stickerEditor.cancel();
        if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
        else elements.mediaPreview.open = false;
      }
      rankingView.setImmersive(value);
    }
  });
  const mediaDialog = createMediaDialogView({
    documentRef: document,
    decodeFile: decodeMediaFile,
    encodeCrop: ({ image, crop }) => encodeSquareCrop({
      image,
      crop,
      createCanvas(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        return canvas;
      }
    }),
    renderActive: renderCropActive,
    onEditStickers: editStickersForCrop,
    onCreateCustom: createCustomCandidate,
    async onReplace(work, record) {
      if (mediaStore === null) throw new Error('本地图片存储不可用');
      if (record.stickerDocument) {
        await mediaStore.putStickerEdit({
          kind: 'replacement',
          workId: work.workId,
          title: record.title,
          width: record.width,
          height: record.height,
          baseBlob: record.baseBlob,
          compositeBlob: record.blob,
          stickerDocument: record.stickerDocument,
          authorityThumbnailPath: authorityThumbnailPathForWork(work)
        });
      } else {
        await mediaStore.putReplacement({
          workId: work.workId,
          ...record,
          authorityThumbnailPath: authorityThumbnailPathForWork(work)
        });
      }
      await render();
    },
    onError(error) {
      announce(error instanceof Error ? error.message : '图片处理失败。', 'error');
      console.error(error);
    }
  });
  function openMediaUpload(files) {
    const availableSlots = Math.max(0, USER_WORK_LIMIT - controller.inspectState().selectedWorkIds.length);
    void mediaDialog.openUpload(files, { availableSlots }).catch(error => {
      announce(error instanceof Error ? error.message : '图片导入失败，请稍后重试。', 'error');
      console.error(error);
    });
  }
  elements.rankingShowCounts.checked = presentation.inspect().showCounts;
  elements.rankingShowTitles.checked = presentation.inspect().showTitles;
  rankingView.setShowCounts(presentation.inspect().showCounts);
  rankingView.setShowTitles(presentation.inspect().showTitles);
  rankingView.setAnnotations(presentation.inspect().annotations);
  const selectionCardDisplayInputs = [
    ['showTitle', elements.selectionCardShowTitle],
    ['showCompany', elements.selectionCardShowCompany],
    ['showEgs', elements.selectionCardShowEgs],
    ['showVndb', elements.selectionCardShowVndb],
    ['showBangumi', elements.selectionCardShowBangumi],
    ['showYear', elements.selectionCardShowYear]
  ];
  function syncSelectionCardDisplay() {
    const display = selectionCardPresentation.inspect();
    for (const [key, input] of selectionCardDisplayInputs) input.checked = display[key];
    selectionView.setCardDisplay(display);
  }
  syncSelectionCardDisplay();

  function captureWorkspaceScroll() {
    if (renderedWorkspaceMode === 'selection') {
      selectionScrollPosition = selectionView.captureScroll();
    } else if (renderedWorkspaceMode === 'ranking') {
      rankingScrollPosition = rankingView.captureScroll();
    }
  }

  function renderWorkspace(model) {
    if (companyDirectoryOpen) {
      rankingWorkspaceVisible = false;
      closeMobileRankingCandidates();
      elements.modeSelection.setAttribute('aria-selected', 'false');
      elements.modeRanking.setAttribute('aria-selected', 'false');
      elements.modeCompany.setAttribute('aria-selected', 'true');
      elements.modeSelection.tabIndex = -1;
      elements.modeRanking.tabIndex = -1;
      elements.modeCompany.tabIndex = 0;
      elements.selectionView.hidden = true;
      elements.rankingView.hidden = true;
      elements.mobileSelectionView.hidden = true;
      elements.companyView.hidden = false;
      return;
    }
    const ranking = model.state.workspaceMode === 'ranking';
    if (!ranking) {
      rankingWorkspaceVisible = false;
      closeMobileRankingCandidates();
    } else if (!rankingWorkspaceVisible && window.matchMedia('(max-width: 899px)').matches) {
      setMobileRankingCandidatesOpen(true);
    }
    rankingWorkspaceVisible = ranking;
    elements.modeSelection.setAttribute('aria-selected', String(!ranking));
    elements.modeRanking.setAttribute('aria-selected', String(ranking));
    elements.modeCompany.setAttribute('aria-selected', 'false');
    elements.modeSelection.tabIndex = ranking ? -1 : 0;
    elements.modeRanking.tabIndex = ranking ? 0 : -1;
    elements.modeCompany.tabIndex = -1;
    elements.selectionView.hidden = ranking;
    elements.rankingView.hidden = !ranking;
    elements.companyView.hidden = true;
    elements.mobileSelectionView.hidden = true;
  }

  function renderControlStates(model) {
    const companyState = rankingSubject === 'company' ? companyRanking.inspect() : null;
    const activePresentation = companyState === null ? presentation : companyPresentation;
    const activeRankingState = companyState === null
      ? model
      : {
        ...model,
        selectedCount: companyState.selectedCompanyIds.length,
        rankedCount: companyState.rankedCount,
        unrankedCount: companyState.candidateCompanyIds.length,
        canUndo: companyState.canUndo,
        canRedo: companyState.canRedo
      };
    elements.modeSelection.disabled = importBusy;
    elements.modeRanking.disabled = importBusy;
    elements.selectionModeToggle.disabled = importBusy;
    elements.cardViewToggle.disabled = importBusy;
    elements.bangumiImportOpen.disabled = importBusy || confirmedBangumiImportBindings === null;
    elements.mobileBangumiImportOpen.disabled = importBusy || confirmedBangumiImportBindings === null;
    elements.bangumiPublicFetch.disabled = importBusy || bangumiPublicImportAbort !== null;
    elements.bangumiPublicUserInput.disabled = importBusy || bangumiPublicImportAbort !== null;
    if (pendingBangumiPublicImport === null) {
      elements.bangumiPublicImportAppend.disabled = true;
    } else {
      syncBangumiPublicImportSelection();
    }
    for (const [, input] of selectionCardDisplayInputs) input.disabled = importBusy;
    elements.companySelectionModeToggle.disabled = importBusy;
    elements.selectionModeToggle.setAttribute('aria-pressed', String(selectionMode));
    elements.selectionModeToggle.textContent = selectionMode ? '退出选择' : '选择';
    elements.companySelectionModeToggle.setAttribute('aria-pressed', String(companySelectionMode));
    elements.companySelectionModeToggle.textContent = companySelectionMode ? '退出选择' : '选择';
    elements.selectionContextBar.hidden = companyDirectoryOpen || model.state.workspaceMode === 'ranking' || !selectionMode;
    elements.selectionContextCount.textContent = String(model.selectedCount);
    elements.startWorkRanking.disabled = importBusy || model.selectedCount === 0;
    elements.clearSelectedWorks.disabled = importBusy || model.selectedCount === 0;
    const companySelectedCount = companyRanking.inspect().selectedCompanyIds.length;
    elements.companySelectionContextBar.hidden = !companyDirectoryOpen || !companySelectionMode;
    elements.companySelectionContextCount.textContent = String(companySelectedCount);
    elements.startCompanyRanking.disabled = importBusy || companySelectedCount === 0;
    elements.clearSelectedCompanies.disabled = importBusy || companySelectedCount === 0;
    elements.undoEdit.disabled = importBusy || !activeRankingState.canUndo;
    elements.redoEdit.disabled = importBusy || !activeRankingState.canRedo;
    elements.clearBoard.disabled = importBusy || activeRankingState.rankedCount === 0;
    elements.clearCandidates.disabled = importBusy || activeRankingState.selectedCount === 0;
    elements.clearAnnotations.disabled = importBusy
      || Object.keys(activePresentation.inspect().annotations).length === 0;
    elements.rankingCandidateSearch.disabled = importBusy || activeRankingState.unrankedCount === 0;
    elements.rankingShowCounts.disabled = importBusy;
    elements.rankingShowTitles.disabled = importBusy;
    for (const [, input] of scaleControls) input.disabled = importBusy;
    elements.rankingScaleReset.disabled = importBusy;
    elements.rankingHelpButton.disabled = importBusy;
    elements.rankingImmersive.disabled = importBusy;
    elements.cleanupMenuButton.disabled = importBusy;
    elements.displayMenuButton.disabled = importBusy;
    elements.fileMenuButton.disabled = importBusy;
    elements.exportState.disabled = importBusy;
    elements.exportPng.disabled = importBusy || activeRankingState.rankedCount === 0 || pngExportInProgress;
    elements.mobileRankingUndo.disabled = elements.undoEdit.disabled;
    elements.mobileRankingRedo.disabled = elements.redoEdit.disabled;
    elements.mobileRankingCandidateCount.textContent = String(activeRankingState.unrankedCount);
    elements.mobileRankingCandidates.disabled = importBusy;
    elements.mobileRankingMore.disabled = importBusy;
    elements.mobileRankingShowCounts.disabled = importBusy;
    elements.mobileRankingShowTitles.disabled = importBusy;
    elements.mobileRankingShowCounts.checked = elements.rankingShowCounts.checked;
    elements.mobileRankingShowTitles.checked = elements.rankingShowTitles.checked;
    elements.mobileRankingImport.disabled = importBusy;
    elements.mobileRankingExport.disabled = importBusy;
    elements.mobileRankingExportPng.disabled = elements.exportPng.disabled;
    elements.mobileRankingClearBoard.disabled = elements.clearBoard.disabled;
    elements.mobileRankingClearCandidates.disabled = elements.clearCandidates.disabled;
    elements.mobileRankingClearAnnotations.disabled = elements.clearAnnotations.disabled;
  }

  function setImportBusy(nextBusy) {
    importBusy = nextBusy;
    setWorkspaceBusy({
      roots: [elements.selectionView, elements.rankingView, elements.mobileSelectionView],
      controls: [
        elements.modeSelection,
        elements.modeRanking,
        elements.selectionModeToggle,
        elements.cardViewToggle,
        elements.bangumiImportOpen,
        elements.mobileBangumiImportOpen,
        elements.bangumiPublicFetch,
        elements.bangumiPublicImportAppend,
        ...selectionCardDisplayInputs.map(([, input]) => input),
        elements.companySelectionModeToggle,
        elements.undoEdit,
        elements.redoEdit,
        elements.clearBoard,
        elements.clearCandidates,
        elements.clearAnnotations,
        elements.rankingCandidateSearch,
        elements.mobileRankingUndo,
        elements.mobileRankingRedo,
        elements.mobileRankingCandidates,
        elements.mobileRankingMore,
        elements.mobileRankingShowCounts,
        elements.mobileRankingShowTitles,
        elements.mobileRankingImport,
        elements.mobileRankingExport,
        elements.mobileRankingExportPng,
        elements.mobileRankingClearBoard,
        elements.mobileRankingClearCandidates,
        elements.mobileRankingClearAnnotations,
        elements.rankingShowCounts,
        elements.rankingShowTitles,
        elements.rankingHelpButton,
        elements.rankingImmersive,
        elements.cleanupMenuButton,
        elements.displayMenuButton,
        elements.fileMenuButton,
        elements.exportState,
        elements.exportPng
      ]
    }, nextBusy);
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
  }

  function runStateChange(change, visibleBrands = []) {
    if (importBusy) return false;
    const result = change();
    void render(visibleBrands);
    return result;
  }

  async function render(visibleBrands = []) {
    captureWorkspaceScroll();
    const state = controller.inspectState();
    let outcome;
    try {
      outcome = await filterWorkerClient.query({
        filterState: state.filterState,
        selectedWorkIds: state.selectedWorkIds,
        includeProjectedCounts: true,
        visibleBrands,
        companyLimit: 24
      });
    } catch (error) {
      announce('筛选计算失败，可继续调整条件重试。', 'error');
      console.error(error);
      return false;
    }
    if (outcome.status === 'stale') return false;
    const model = controller.inspect(outcome.workIds);
    const ranking = model.state.workspaceMode === 'ranking';
    const companyState = ranking && rankingSubject === 'company' ? companyRanking.inspect() : null;
    const activePresentation = companyState === null ? presentation : companyPresentation;
    let rankingModel = null;
    elements.selectedCount.textContent = String(companyState?.selectedCompanyIds.length ?? model.selectedCount);
    elements.rankedCount.textContent = String(companyState?.rankedCount ?? model.rankedCount);
    elements.unrankedCount.textContent = String(companyState?.candidateCompanyIds.length ?? model.unrankedCount);
    // Keep the filtered result distinct from the full catalog size. This is
    // especially important on mobile, where the compact header used to make
    // 3788 look like the total number of works.
    const visibleWorks = model.visibleWorks.map(work => worksById.get(work.workId) ?? work);
    const visiblePresentationWorks = presentationFamilies === null
      ? visibleWorks
      : presentationFamilies.projectVisibleWorks(model.visibleWorks, {
        sortKey: model.state.filterState.sortKey,
        sortDirection: model.state.filterState.sortDirection,
        workById: worksById
      });
    const catalogTotal = presentationFamilies === null
      ? sample.works.length
      : sample.works.length - presentationFamilies.memberCount + presentationFamilies.familyCount;
    elements.filterResultCount.textContent = `${visiblePresentationWorks.length} / ${catalogTotal} 项`;
    elements.catalogResultCount.textContent = `${visiblePresentationWorks.length} / ${catalogTotal} 项`;
    renderWorkspace(model);
    if (companyDirectoryOpen) {
      renderCompanyDirectory();
    } else if (ranking) {
      rankingModel = rankingSubject === 'company'
        ? buildCompanyRankingModel()
        : buildRankingModel(model.state, worksById, candidateTitleQuery);
      elements.rankingShowCounts.checked = activePresentation.inspect().showCounts;
      elements.rankingShowTitles.checked = activePresentation.inspect().showTitles;
      rankingView.setShowCounts(activePresentation.inspect().showCounts);
      rankingView.setShowTitles(activePresentation.inspect().showTitles);
      rankingView.setAnnotations(activePresentation.inspect().annotations);
      elements.rankingView.classList.toggle('is-company-ranking', rankingSubject === 'company');
      elements.rankingSubjectWork.setAttribute('aria-pressed', String(rankingSubject === 'work'));
      elements.rankingSubjectCompany.setAttribute('aria-pressed', String(rankingSubject === 'company'));
      const isCompanyRanking = rankingSubject === 'company';
      const candidateLabel = isCompanyRanking ? '候选会社' : '候选作品';
      elements.rankingCandidatesTitle.textContent = candidateLabel;
      setMobileRankingCandidatesOpen(document.body.classList.contains('is-mobile-ranking-candidates-open'));
      elements.rankingCandidateSearch.closest('.search-field').hidden = isCompanyRanking;
      elements.rankingCandidateSearch.placeholder = '搜索候选标题';
      rankingView.render(rankingModel, rankingSubject === 'work' ? await resolveCoverUrls([
        ...rankingModel.candidateWorks,
        ...rankingModel.tiers.flatMap(tier => tier.works)
      ]) : null);
      rankingView.setMobileDragEnabled(true);
    } else {
      selectionView.render({
        works: visiblePresentationWorks,
        view: 'full',
        selectedWorkIds: model.state.selectedWorkIds,
        selectAllState: presentationFamilies === null
          ? model.selectAllState
          : presentationFamilies.presentationSelectionState(visiblePresentationWorks, model.state.selectedWorkIds),
        selectionCapacity: Math.max(0, USER_WORK_LIMIT - model.selectedCount),
        filterState: model.state.filterState,
        selectionMode
      }, await resolveCoverUrls(selectionInitialWorks(visiblePresentationWorks)));
    }
    const nextFilterKey = filterRenderKey(model, visibleBrands);
    if (nextFilterKey !== renderedFilterKey) {
      filterView.render(model.state.filterState, {
        current: visiblePresentationWorks.length,
        filters: outcome.counts.filters,
        brands: outcome.counts.brands
      });
      renderedFilterKey = nextFilterKey;
    }
    renderControlStates(model);
    if (companyDirectoryOpen) {
      // The directory owns its own scroll surface and is intentionally not persisted.
    } else if (model.state.workspaceMode === 'ranking') {
      rankingView.restoreScroll(rankingScrollPosition);
    } else {
      selectionView.restoreScroll(selectionScrollPosition);
    }
    if (!companyDirectoryOpen && ranking && renderedWorkspaceMode !== 'ranking') help.enterRanking();
    renderedWorkspaceMode = model.state.workspaceMode;
    lastRenderedModel = model;
    if (rankingModel !== null && rankingSubject === 'work') {
      void refreshRankingPreload(rankingModel);
    }
    else cancelRankingPreload();
    showMobileHelpOnce();
    return true;
  }

  filterView = createFilterView({
    root: document,
    filters: sample.filters,
    brands,
    releaseYearCounts: sample.works.reduce((counts, work) => {
      const year = Number(work.releaseDate.slice(0, 4));
      counts[year] = (counts[year] ?? 0) + 1;
      return counts;
    }, Object.create(null)),
    onFilterChange(nextFilterState) {
      return runStateChange(() => controller.setFilterState(nextFilterState));
    },
    onAttributeSelectionChange(groupId, selectedIds) {
      return runStateChange(() => {
        const current = controller.inspectState().filterState.attributeSelections;
        return controller.setFilterState({
          attributeSelections: {
            ...current,
            [groupId]: [...selectedIds]
          }
        });
      });
    },
    onRequestCounts(_filterState, visibleBrands) {
      void render(visibleBrands);
    }
  });
  // Keep the shared filter drawer outside desktop mode roots so mobile can hide
  // ranking/selection panels without hiding the filter surface itself.
  elements.workspace.insertBefore(elements.filterDrawer, elements.workspace.firstChild);
  elements.workspace.insertBefore(elements.filterBackdrop, elements.workspace.firstChild);
  createFilterDrawerController({
    drawer: elements.filterDrawer,
    toggle: elements.filterToggle,
    closeButton: elements.filterClose,
    backdrop: elements.filterBackdrop,
    applyButton: elements.filterApply,
    mediaQuery: window.matchMedia('(max-width: 899px)'),
    documentRef: document
  });
  const importCoordinator = createImportCoordinator({
    readText: file => file.text(),
    commit: jsonText => controller.importJson(jsonText),
    setBusy: setImportBusy
  });

  let pendingShareImport = null;
  let pendingBangumiPublicImport = null;
  let bangumiPublicImportRequest = 0;
  let bangumiPublicImportAbort = null;

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }

  function setBangumiPublicImportStatus(message, { error = false } = {}) {
    elements.bangumiPublicImportStatus.hidden = message.length === 0;
    elements.bangumiPublicImportStatus.textContent = message;
    elements.bangumiPublicImportStatus.classList.toggle('is-error', error);
  }

  function selectedBangumiImportWorkIds() {
    return Array.from(elements.bangumiPublicImportList.querySelectorAll('input[data-work-id]:checked:not(:disabled)'))
      .map(input => input.dataset.workId)
      .filter(workId => typeof workId === 'string' && workId.length > 0);
  }

  function syncBangumiPublicImportSelection() {
    if (pendingBangumiPublicImport === null) return;
    const selectedWorkIds = selectedBangumiImportWorkIds();
    const currentCount = controller.inspectState().selectedWorkIds.length;
    const availableSlots = Math.max(0, USER_WORK_LIMIT - currentCount);
    const overCapacity = selectedWorkIds.length > availableSlots;
    elements.bangumiPublicImportCapacity.textContent = `候选池剩余 ${availableSlots}`;
    elements.bangumiPublicImportAppend.disabled = importBusy || selectedWorkIds.length === 0 || overCapacity;
    if (overCapacity) {
      elements.bangumiPublicImportSelectionStatus.textContent = `已勾选 ${selectedWorkIds.length} 部，但候选池只剩 ${availableSlots} 个位置。请取消部分作品后再追加。`;
      return;
    }
    elements.bangumiPublicImportSelectionStatus.textContent = selectedWorkIds.length === 0
      ? '请选择至少一部尚未在候选池中的作品。'
      : `将追加 ${selectedWorkIds.length} 部作品；已有候选和已排档位不会改变。`;
  }

  function resetBangumiPublicImportDialog({ keepInput = true } = {}) {
    pendingBangumiPublicImport = null;
    elements.bangumiPublicImportResults.hidden = true;
    elements.bangumiPublicImportList.replaceChildren();
    elements.bangumiPublicUnmatchedList.replaceChildren();
    elements.bangumiPublicImportUnmatched.hidden = true;
    elements.bangumiPublicTotal.textContent = '0';
    elements.bangumiPublicMatchedSubjects.textContent = '0';
    elements.bangumiPublicMappedWorks.textContent = '0';
    elements.bangumiPublicUnmatched.textContent = '0';
    elements.bangumiPublicUnmatchedCount.textContent = '0';
    elements.bangumiPublicImportCapacity.textContent = `候选池剩余 ${Math.max(0, USER_WORK_LIMIT - controller.inspectState().selectedWorkIds.length)}`;
    elements.bangumiPublicImportAppend.disabled = true;
    elements.bangumiPublicImportSelectionStatus.textContent = '读取后可选择要追加的作品。';
    elements.bangumiPublicFetch.disabled = false;
    elements.bangumiPublicUserInput.disabled = false;
    setBangumiPublicImportStatus('');
    if (!keepInput) elements.bangumiPublicUserInput.value = '';
  }

  function closeBangumiPublicImportDialog() {
    bangumiPublicImportRequest += 1;
    bangumiPublicImportAbort?.abort();
    bangumiPublicImportAbort = null;
    closeDialog(elements.bangumiPublicImportDialog);
    resetBangumiPublicImportDialog();
  }

  function createBangumiImportItem({ collection, workId, alreadySelected, checked, variant = 'primary' }) {
    const row = document.createElement('label');
    row.className = 'bangumi-import-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.workId = workId;
    checkbox.checked = checked || alreadySelected;
    checkbox.disabled = alreadySelected;
    const variantLabel = variant === 'primary' ? '主作品' : '可选版本';
    checkbox.setAttribute('aria-label', `${worksById.get(workId)?.title ?? workId} ${alreadySelected ? '已在候选池' : `选择${variantLabel}导入`}`);
    checkbox.addEventListener('change', syncBangumiPublicImportSelection);

    const copy = document.createElement('span');
    copy.className = 'bangumi-import-item-copy';
    const title = document.createElement('strong');
    title.className = 'bangumi-import-item-title';
    title.textContent = worksById.get(workId)?.title ?? `EGS #${workId}`;
    const meta = document.createElement('span');
    meta.className = 'bangumi-import-item-meta';
    const details = [`Bangumi #${collection.subjectId}`, collectionTypeLabel(collection.collectionType)];
    if (collection.personalRate !== null) details.push(`个人评分 ${collection.personalRate}`);
    details.push(variantLabel);
    meta.textContent = details.join(' · ');
    copy.append(title, meta);

    const status = document.createElement('span');
    status.className = 'bangumi-import-item-status';
    status.textContent = alreadySelected ? '已在候选池' : variant === 'primary' ? '默认导入' : '可选';
    if (alreadySelected) status.classList.add('is-existing');
    row.append(checkbox, copy, status);
    return row;
  }

  function renderBangumiPublicImportPlan(plan, reportedTotal) {
    const fragment = document.createDocumentFragment();
    const renderedWorkIds = new Set();
    let selectedCount = 0;
    for (const collection of plan.matched) {
      for (const workId of collection.primaryWorkIds) {
        if (renderedWorkIds.has(workId)) continue;
        renderedWorkIds.add(workId);
        const alreadySelected = collection.alreadySelectedPrimaryWorkIds.includes(workId);
        const checked = !alreadySelected && selectedCount < plan.availableSlots;
        if (checked) selectedCount += 1;
        fragment.append(createBangumiImportItem({ collection, workId, alreadySelected, checked, variant: 'primary' }));
      }
      const optionalRows = [];
      for (const workId of collection.optionalWorkIds) {
        if (renderedWorkIds.has(workId)) continue;
        renderedWorkIds.add(workId);
        const alreadySelected = collection.alreadySelectedOptionalWorkIds.includes(workId);
        optionalRows.push(createBangumiImportItem({ collection, workId, alreadySelected, checked: false, variant: 'optional' }));
      }
      if (optionalRows.length > 0) {
        const alternatives = document.createElement('details');
        alternatives.className = 'bangumi-import-optional-versions';
        const summary = document.createElement('summary');
        summary.textContent = `其他 ${optionalRows.length} 个版本（可选，不会默认导入）`;
        const list = document.createElement('div');
        list.className = 'bangumi-import-optional-list';
        list.append(...optionalRows);
        alternatives.append(summary, list);
        fragment.append(alternatives);
      }
    }
    elements.bangumiPublicImportList.replaceChildren(fragment);
    const unmatched = document.createDocumentFragment();
    for (const collection of plan.unmatched) {
      const item = document.createElement('li');
      item.textContent = `${collection.title}（Bangumi #${collection.subjectId}）`;
      unmatched.append(item);
    }
    elements.bangumiPublicUnmatchedList.replaceChildren(unmatched);
    elements.bangumiPublicImportUnmatched.hidden = plan.unmatched.length === 0;
    elements.bangumiPublicTotal.textContent = String(reportedTotal);
    elements.bangumiPublicMatchedSubjects.textContent = String(plan.matchedSubjectCount);
    elements.bangumiPublicMappedWorks.textContent = String(plan.mappedWorkCount);
    elements.bangumiPublicUnmatched.textContent = String(plan.unmatchedSubjectCount);
    elements.bangumiPublicUnmatchedCount.textContent = String(plan.unmatchedSubjectCount);
    elements.bangumiPublicImportResults.hidden = false;
    syncBangumiPublicImportSelection();
  }

  async function readBangumiPublicCollections() {
    if (confirmedBangumiImportBindings === null) {
      setBangumiPublicImportStatus('当前版本未加载已确认的 Bangumi 映射，无法安全导入。', { error: true });
      return;
    }
    const request = ++bangumiPublicImportRequest;
    bangumiPublicImportAbort?.abort();
    const abortController = new AbortController();
    bangumiPublicImportAbort = abortController;
    pendingBangumiPublicImport = null;
    elements.bangumiPublicImportResults.hidden = true;
    elements.bangumiPublicImportAppend.disabled = true;
    elements.bangumiPublicFetch.disabled = true;
    elements.bangumiPublicUserInput.disabled = true;
    setBangumiPublicImportStatus('正在读取 Bangumi 公开游戏收藏…');
    try {
      const result = await fetchBangumiPublicGameCollections({
        userIdentifier: elements.bangumiPublicUserInput.value,
        signal: abortController.signal
      });
      if (request !== bangumiPublicImportRequest) return;
      const plan = planBangumiPublicImport({
        collections: result.collections,
        confirmedBindings: confirmedBangumiImportBindings,
        currentSelectedWorkIds: controller.inspectState().selectedWorkIds,
        workLimit: USER_WORK_LIMIT,
        presentationFamilyForWork: workId => presentationFamilies?.familyForWork(workId) ?? null
      });
      pendingBangumiPublicImport = plan;
      renderBangumiPublicImportPlan(plan, result.reportedTotal);
      setBangumiPublicImportStatus(
        `已读取 ${result.reportedTotal} 条公开游戏收藏；其中 ${plan.matchedSubjectCount} 条可按现有 confirmed 映射导入。`
      );
    } catch (error) {
      if (request !== bangumiPublicImportRequest || error?.name === 'AbortError') return;
      const message = error instanceof BangumiPublicImportError
        ? error.message
        : '读取 Bangumi 公开收藏失败，请稍后重试。';
      setBangumiPublicImportStatus(message, { error: true });
    } finally {
      if (request === bangumiPublicImportRequest) {
        bangumiPublicImportAbort = null;
        elements.bangumiPublicFetch.disabled = false;
        elements.bangumiPublicUserInput.disabled = false;
      }
    }
  }

  function openBangumiPublicImportDialog() {
    if (importBusy) return false;
    closeToolbarMenus();
    if (elements.mobileRankingMenu.open) closeDialog(elements.mobileRankingMenu);
    resetBangumiPublicImportDialog();
    showDialog(elements.bangumiPublicImportDialog);
    window.setTimeout(() => elements.bangumiPublicUserInput.focus(), 0);
    return true;
  }

  function clearShareHash() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    window.history.replaceState({}, '', cleanUrl.href);
  }

  function currentUiLocation() {
    const state = controller.inspectState();
    if (companyDirectoryOpen) {
      if (selectedCompanyId !== null) return { page: 'companies', companyId: selectedCompanyId };
      return {
        page: 'companies',
        query: companyQuery,
        sort: companySort,
        hasImage: companyHasImage,
        pageNumber: companyDirectoryView?.getPageNumber?.() ?? 1
      };
    }
    if (state.workspaceMode === 'ranking') return { page: 'ranking', subject: rankingSubject };
    if (currentWorkDetailId !== null) return { page: 'works', workId: currentWorkDetailId };
    return {
      page: 'works',
      query: state.filterState.titleQuery,
      sort: `${state.filterState.sortKey}-${state.filterState.sortDirection}`,
      pageNumber: selectionView?.getPageNumber?.() ?? 1
    };
  }

  function updateUiLocation(method = 'replaceState') {
    if (applyingUiLocation) return;
    const url = new URL(window.location.href);
    url.hash = formatUiLocationHash(currentUiLocation()).slice(1);
    window.history[method]({}, '', url.href);
  }

  function replaceUiLocation() { updateUiLocation('replaceState'); }
  function pushUiLocation() { updateUiLocation('pushState'); }

  function renderDetailsVersions(work) {
    const family = presentationFamilies?.familyForWork(work.workId) ?? null;
    elements.detailsVersionToggle.hidden = family === null;
    elements.detailsVersionShelf.hidden = family === null || !detailsVersionShelfExpanded;
    elements.detailsVersionList.replaceChildren();
    if (family === null) return;
    elements.detailsVersionToggle.replaceChildren(
      createActionIcon(document, 'layers-2'),
      document.createTextNode(`${family.members.length} 个版本`),
      document.createTextNode(detailsVersionShelfExpanded ? '⌃' : '⌄')
    );
    elements.detailsVersionToggle.setAttribute('aria-expanded', String(detailsVersionShelfExpanded));
    elements.detailsVersionToggle.onclick = () => {
      detailsVersionShelfExpanded = !detailsVersionShelfExpanded;
      renderDetailsVersions(work);
    };
    elements.detailsVersionCurrent.replaceChildren(
      document.createTextNode('当前版本：'),
      Object.assign(document.createElement('strong'), { textContent: family.members.find(member => member.workId === work.workId)?.label ?? work.title })
    );
    const rows = family.members.map(member => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'details-version-row';
      row.setAttribute('aria-current', String(member.workId === work.workId));
      const radio = document.createElement('span');
      radio.className = 'details-version-radio';
      const copy = document.createElement('span');
      copy.className = 'details-version-copy';
      const label = document.createElement('strong');
      label.textContent = member.label;
      const title = document.createElement('small');
      title.textContent = member.title;
      copy.append(label, title);
      const note = document.createElement('span');
      note.className = 'details-version-default';
      note.textContent = member.default ? '默认' : '';
      row.append(radio, copy, note);
      row.addEventListener('click', () => {
        const target = worksById.get(member.workId);
        if (target !== undefined) openWorkDetails(target, { keepVersionShelf: true });
      });
      return row;
    });
    elements.detailsVersionList.replaceChildren(...rows);
  }

  function openWorkDetails(work, { push = true, keepVersionShelf = false } = {}) {
    if (!keepVersionShelf) detailsVersionShelfExpanded = false;
    currentWorkDetailId = work.workId;
    const request = ++workDetailCreditsRequest;
    workDetailCreditsView.renderLoading();
    showDetails(work, filterById, workAliasesById, openCompanyDirectory, projectEntityRuntime, {
      coverSources: coverSourcesForWork,
      fallbackUrl: resolveAssetUrl('assets/cover-unavailable.webp', assetBase),
      open: detailWork => openMediaPreview(detailWork, { immersive: true }).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      })
    }, catalogSource.value.snapshot?.generatedAt);
    document.documentElement.classList.add('work-details-open');
    renderDetailsVersions(work);
    const loadCredits = async () => {
      try {
        const credits = await workDetailCreditsLoader.load(work.workId);
        if (
          request !== workDetailCreditsRequest
          || currentWorkDetailId !== work.workId
          || !elements.detailsDialog.open
        ) return;
        if (credits === null) {
          workDetailCreditsView.clear();
          elements.detailsCredits.dataset.projectEntityPeople = '0';
          elements.detailsCredits.dataset.projectEntityCharacters = '0';
        } else {
          workDetailCreditsView.renderWork(credits);
          const personCharacter = projectEntityRuntime?.projectCredits?.(credits);
          if (personCharacter !== undefined) {
            elements.detailsCredits.dataset.projectEntityPeople = String(personCharacter.statistics.confirmedPersonCount);
            elements.detailsCredits.dataset.projectEntityCharacters = String(personCharacter.statistics.confirmedCharacterCount);
          }
        }
      } catch (error) {
        if (
          request !== workDetailCreditsRequest
          || currentWorkDetailId !== work.workId
          || !elements.detailsDialog.open
        ) return;
        console.warn('work-detail credits unavailable; keeping the base details usable', error);
        workDetailCreditsView.renderError(() => {
          if (currentWorkDetailId !== work.workId || request !== workDetailCreditsRequest) return;
          workDetailCreditsView.renderLoading();
          void loadCredits();
        });
      }
    };
    void loadCredits();
    if (push) pushUiLocation();
  }

  function resetShareImportDialog() {
    pendingShareImport = null;
    elements.shareImportMessage.hidden = true;
    elements.shareImportMessage.textContent = '';
    elements.shareImportCount.textContent = '0';
    elements.shareImportMissing.textContent = '0';
    elements.shareImportAppend.disabled = true;
    elements.shareImportReplace.disabled = true;
  }

  function openShareImportDialog() {
    const token = parseSelectionShare(window.location);
    if (token === null) return false;
    resetShareImportDialog();
    try {
      const decoded = decodeSelectionShare(token);
      if (decoded.datasetVersion !== sample.sampleId) {
        throw new Error('分享链接版本与当前目录不匹配。');
      }
      const plan = planSharedSelectionImport({
        sharedWorkIds: decoded.workIds,
        authorityWorkIds: sample.works.map(work => work.workId),
        currentSelectedWorkIds: controller.inspectState().selectedWorkIds,
        mode: 'append'
      });
      pendingShareImport = {
        validWorkIds: [...plan.validWorkIds]
      };
      elements.shareImportCount.textContent = String(plan.validWorkIds.length);
      elements.shareImportMissing.textContent = String(plan.missingWorkIds.length);
      elements.shareImportAppend.disabled = false;
      elements.shareImportReplace.disabled = false;
    } catch (error) {
      elements.shareImportMessage.hidden = false;
      elements.shareImportMessage.textContent = error?.message === '分享链接版本与当前目录不匹配。'
        ? error.message
        : '分享链接无效，未修改当前工作区。';
    }
    showDialog(elements.shareImportDialog);
    return true;
  }

  function openMobileShareWarning() {
    if (parseSelectionShare(window.location) === null) return false;
    showDialog(elements.mobileShareWarning);
    return true;
  }

  async function applyUiLocation() {
    if (parseSelectionShare(window.location) !== null) return false;
    const location = parseUiLocationHash(window.location.hash);
    if (location === null) {
      replaceUiLocation();
      return false;
    }
    applyingUiLocation = true;
    try {
      if (location.page === 'ranking') {
        companyDirectoryOpen = false;
        setWorkSelectionMode(false);
        currentWorkDetailId = null;
        rankingSubject = location.subject;
        controller.setWorkspaceMode('ranking');
        await render();
        return true;
      }
      if (location.page === 'companies') {
        setWorkSelectionMode(false);
        companyQuery = location.query;
        companySort = location.sort;
        companyHasImage = location.hasImage;
        elements.companyHasImage.checked = companyHasImage;
        openCompanyDirectory(location.companyId, { push: false });
        companyDirectoryView.setPageNumber(location.pageNumber, { scroll: false, notify: false });
        await render();
        if (location.companyId === null) companyDirectoryView.setPageNumber(location.pageNumber, { scroll: false, notify: false });
        return true;
      }
      companyDirectoryOpen = false;
      setWorkSelectionMode(false);
      rankingSubject = 'work';
      const [sortKey, sortDirection] = location.sort.split('-');
      controller.setWorkspaceMode('selection');
      controller.setFilterState({ titleQuery: location.query, sortKey, sortDirection });
      currentWorkDetailId = null;
      await render();
      selectionView.setPageNumber(location.pageNumber, { scroll: false, notify: false });
      if (location.workId !== null) {
        const work = worksById.get(location.workId);
        if (work) openWorkDetails(work, { push: false });
        else replaceUiLocation();
      }
      return true;
    } finally {
      applyingUiLocation = false;
    }
  }

  window.addEventListener('popstate', () => { void applyUiLocation(); });
  window.addEventListener('hashchange', () => { void applyUiLocation(); });
  elements.detailsDialog.addEventListener('close', () => {
    document.documentElement.classList.remove('work-details-open');
    workDetailCreditsRequest += 1;
    workDetailCreditsView.clear();
    if (currentWorkDetailId === null || applyingUiLocation) return;
    currentWorkDetailId = null;
    pushUiLocation();
  });
  elements.detailsDialog.addEventListener('toggle', () => {
    document.documentElement.classList.toggle('work-details-open', elements.detailsDialog.open);
  });

  function commitShareImport(mode) {
    if (pendingShareImport === null || pendingShareImport.validWorkIds.length === 0) return false;
    try {
      const imported = runStateChange(() => controller.importSharedWorks(
        pendingShareImport.validWorkIds,
        { mode }
      ));
      closeDialog(elements.shareImportDialog);
      clearShareHash();
      announce(
        mode === 'replace' ? '候选池已替换。' : '作品已追加到候选池。',
        'success'
      );
      pendingShareImport = null;
      return imported;
    } catch (error) {
      announce(error instanceof Error ? error.message : '分享作品导入失败。', 'error');
      return false;
    }
  }

  elements.shareImportAppend.addEventListener('click', () => commitShareImport('append'));
  elements.shareImportReplace.addEventListener('click', () => commitShareImport('replace'));
  elements.shareImportCancel.addEventListener('click', () => {
    closeDialog(elements.shareImportDialog);
    clearShareHash();
    resetShareImportDialog();
  });
  elements.bangumiImportOpen.addEventListener('click', () => openBangumiPublicImportDialog());
  elements.mobileBangumiImportOpen.addEventListener('click', () => openBangumiPublicImportDialog());
  elements.bangumiPublicImportForm.addEventListener('submit', event => {
    event.preventDefault();
    void readBangumiPublicCollections();
  });
  elements.bangumiPublicImportCancel.addEventListener('click', () => closeBangumiPublicImportDialog());
  elements.bangumiPublicImportDialog.addEventListener('close', () => {
    bangumiPublicImportRequest += 1;
    bangumiPublicImportAbort?.abort();
    bangumiPublicImportAbort = null;
    resetBangumiPublicImportDialog();
  });
  elements.bangumiPublicImportAppend.addEventListener('click', () => {
    if (pendingBangumiPublicImport === null) return;
    const workIds = selectedBangumiImportWorkIds();
    const availableSlots = Math.max(0, USER_WORK_LIMIT - controller.inspectState().selectedWorkIds.length);
    if (workIds.length === 0 || workIds.length > availableSlots) {
      syncBangumiPublicImportSelection();
      return;
    }
    try {
      const changed = runStateChange(() => controller.selectWorks(workIds));
      if (!changed) {
        setBangumiPublicImportStatus('这些作品已经在候选池中，未修改当前排榜。', { error: true });
        return;
      }
      closeBangumiPublicImportDialog();
      announce(`已将 ${workIds.length} 部作品追加到候选池。`, 'success');
    } catch (error) {
      setBangumiPublicImportStatus(
        error instanceof Error ? error.message : '追加候选池失败，当前排榜未修改。',
        { error: true }
      );
    }
  });
  elements.mobileHelpDismiss.addEventListener('click', () => {
    try {
      window.localStorage.setItem(mobileHelpStorageKey, '1');
    } catch {
      // Session-only help is acceptable when storage is unavailable.
    }
  });
  elements.mobileShareWarningDismiss.addEventListener('click', () => {
    closeDialog(elements.mobileShareWarning);
    clearShareHash();
  });

  elements.modeSelection.addEventListener('click', () => {
    closeMobileRankingCandidates();
    companyDirectoryOpen = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const result = runStateChange(() => {
      return controller.setWorkspaceMode('selection');
    });
    replaceUiLocation();
    return result;
  });
  elements.modeRanking.addEventListener('click', () => {
    companyDirectoryOpen = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
  });
  elements.modeCompany.addEventListener('click', () => {
    closeMobileRankingCandidates();
    closeToolbarMenus();
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const open = () => {
      if (lastRenderedModel === null) {
        window.setTimeout(open, 0);
        return;
      }
      openCompanyDirectory();
    };
    open();
  });
  elements.companyBack.addEventListener('click', () => {
    companyDirectoryOpen = false;
    rankingSubject = 'work';
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    void render();
    pushUiLocation();
  });
  elements.companyRankingToggle.addEventListener('click', () => {
    companyDirectoryOpen = false;
    rankingSubject = 'company';
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
  });
  elements.selectionModeToggle.addEventListener('click', () => {
    setWorkSelectionMode(!selectionMode);
    void render();
  });
  elements.companySelectionModeToggle.addEventListener('click', () => {
    companySelectionMode = !companySelectionMode;
    void render();
  });
  elements.clearSelectedWorks.addEventListener('click', () => {
    if (controller.inspectState().selectedWorkIds.length === 0) return;
    return runStateChange(() => controller.clearCandidates());
  });
  elements.startWorkRanking.addEventListener('click', () => {
    if (controller.inspectState().selectedWorkIds.length === 0) return;
    companyDirectoryOpen = false;
    setWorkSelectionMode(false);
    rankingSubject = 'work';
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.clearSelectedCompanies.addEventListener('click', () => {
    if (companyRanking.inspect().selectedCompanyIds.length === 0) return;
    return runStateChange(() => companyRanking.clearCandidates());
  });
  elements.startCompanyRanking.addEventListener('click', () => {
    if (companyRanking.inspect().selectedCompanyIds.length === 0) return;
    companyDirectoryOpen = false;
    companySelectionMode = false;
    rankingSubject = 'company';
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.companyRankingClose.addEventListener('click', () => {
    companyDirectoryOpen = true;
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    renderCompanyDirectory();
    pushUiLocation();
  });
  elements.rankingSubjectWork.addEventListener('click', () => {
    rankingSubject = 'work';
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    replaceUiLocation();
    return result;
  });
  elements.rankingSubjectCompany.addEventListener('click', () => {
    rankingSubject = 'company';
    companyCandidateQuery = '';
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    replaceUiLocation();
    return result;
  });
  elements.mobileCompanyMode.addEventListener('click', () => {
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const open = () => {
      if (lastRenderedModel === null) {
        window.setTimeout(open, 0);
        return;
      }
      openCompanyDirectory();
    };
    open();
  });
  elements.companyHelpButton.addEventListener('click', () => companyGuide.open());
  elements.mobileHelpButton.addEventListener('click', () => mobileGuide.open());
  elements.companyHelpDismiss.addEventListener('click', () => elements.companyHelp.close());
  elements.rankingHelpButton.addEventListener('click', () => help.openFull());
  elements.rankingImmersiveHelp.addEventListener('click', () => help.openImmersive());
  elements.rankingHelpDismiss.addEventListener('click', () => elements.rankingHelp.close());
  elements.rankingShowCounts.addEventListener('change', () => {
    const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
    rankingView.setShowCounts(activePresentation.setShowCounts(elements.rankingShowCounts.checked));
  });
  elements.rankingShowTitles.addEventListener('change', () => {
    const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
    rankingView.setShowTitles(activePresentation.setShowTitles(elements.rankingShowTitles.checked));
  });
  for (const [key, input] of selectionCardDisplayInputs) {
    input.addEventListener('change', () => {
      selectionCardPresentation.setDisplay({ [key]: input.checked });
      syncSelectionCardDisplay();
    });
  }
  elements.mobileRankingUndo.addEventListener('click', () => elements.undoEdit.click());
  elements.mobileRankingRedo.addEventListener('click', () => elements.redoEdit.click());
  elements.mobileRankingCandidates.addEventListener('click', () => toggleMobileRankingCandidates());
  elements.mobileRankingMore.addEventListener('click', () => openMobileRankingMenu());
  elements.mobileRankingShowCounts.addEventListener('change', () => {
    elements.rankingShowCounts.checked = elements.mobileRankingShowCounts.checked;
    elements.rankingShowCounts.dispatchEvent(new Event('change'));
  });
  elements.mobileRankingShowTitles.addEventListener('change', () => {
    elements.rankingShowTitles.checked = elements.mobileRankingShowTitles.checked;
    elements.rankingShowTitles.dispatchEvent(new Event('change'));
  });
  elements.mobileRankingImport.addEventListener('click', () => elements.importState.click());
  elements.mobileRankingExport.addEventListener('click', () => elements.exportState.click());
  elements.mobileRankingExportPng.addEventListener('click', () => elements.exportPng.click());
  elements.mobileRankingClearBoard.addEventListener('click', () => elements.clearBoard.click());
  elements.mobileRankingClearCandidates.addEventListener('click', () => elements.clearCandidates.click());
  elements.mobileRankingClearAnnotations.addEventListener('click', () => elements.clearAnnotations.click());
  elements.rankingImmersive.addEventListener('click', () => void immersive.enter());
  elements.mediaFiles.addEventListener('change', () => {
    const files = Array.from(elements.mediaFiles.files ?? []);
    elements.mediaFiles.value = '';
    const target = replacementWork;
    replacementWork = null;
    if (target !== null) {
      void mediaDialog.openReplacement(target, files[0]).catch(error => {
        announce(error instanceof Error ? error.message : '替换图片失败。', 'error');
        console.error(error);
      });
      return;
    }
    const availableSlots = Math.max(0, USER_WORK_LIMIT - controller.inspectState().selectedWorkIds.length);
    void mediaDialog.openUpload(files, { availableSlots }).catch(error => {
      announce(error instanceof Error ? error.message : '图片导入失败。', 'error');
      console.error(error);
    });
  });
  for (const tab of [elements.modeSelection, elements.modeRanking]) {
    tab.addEventListener('keydown', event => {
      if (importBusy) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const target = tab === elements.modeSelection ? elements.modeRanking : elements.modeSelection;
      target.click();
      target.focus();
    });
  }
  elements.clearCandidates.addEventListener('click', () => {
    closeToolbarMenus();
    if (rankingSubject === 'company') {
      return runStateChange(() => companyRanking.clearCandidates());
    }
    return runStateChange(() => controller.clearCandidates());
  });
  elements.clearBoard.addEventListener('click', () => {
    closeToolbarMenus();
    if (rankingSubject === 'company') {
      return runStateChange(() => companyRanking.clearBoard());
    }
    return runStateChange(() => controller.clearBoard());
  });
  elements.clearAnnotations.addEventListener('click', () => {
    if (elements.clearAnnotations.disabled) return;
    if (!window.confirm('清空全部本地标记？')) return;
    const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
    activePresentation.clearAnnotations();
    rankingView.setAnnotations(activePresentation.inspect().annotations);
    closeToolbarMenus();
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
  });
  elements.undoEdit.addEventListener('click', () => {
    if (rankingSubject === 'company') {
      return runStateChange(() => companyRanking.undo());
    }
    return runStateChange(() => controller.undo());
  });
  elements.redoEdit.addEventListener('click', () => {
    if (rankingSubject === 'company') {
      return runStateChange(() => companyRanking.redo());
    }
    return runStateChange(() => controller.redo());
  });
  elements.importState.addEventListener('click', () => {
    closeToolbarMenus();
    elements.stateFile.click();
  });
  elements.stateFile.addEventListener('change', async () => {
    const file = elements.stateFile.files?.[0] ?? null;
    elements.stateFile.value = '';
    if (file === null) return;
    if (rankingSubject === 'company') {
      try {
        companyRanking.importState(JSON.parse(await file.text()));
        companyCandidateQuery = '';
        rankingScrollPosition = { top: 0, left: 0, tiers: {}, poolLeft: 0 };
        void render();
        announce('会社排榜 JSON 已导入。', 'success');
      } catch (error) {
        announce('会社排榜 JSON 无效，未修改当前排榜。', 'error');
        console.error(error);
      }
      return;
    }
    const outcome = await importCoordinator.importFile(file);
    if (outcome.status === 'stale') return;
    if (outcome.status === 'error') {
      const message = outcome.stage === 'read'
        ? 'JSON 文件读取失败，请重新选择文件。'
        : jsonImportMessage(outcome.error);
      announce(message, 'error');
      if (!(outcome.error instanceof StateValidationError)) console.error(outcome.error);
      return;
    }

    candidateTitleQuery = '';
    cancelRankingPreload();
    selectionScrollPosition = { top: 0, left: 0 };
    rankingScrollPosition = {
      top: 0,
      left: 0,
      tiers: {},
      poolLeft: 0
    };
    renderedWorkspaceMode = null;
    renderedFilterKey = null;
    lastRenderedModel = null;
    void render();
    announce('JSON 状态已导入。', 'success');
  });
  elements.exportState.addEventListener('click', () => {
    if (importBusy) return;
    closeToolbarMenus();
    try {
      if (rankingSubject === 'company') {
        const ranking = companyRanking.inspect();
        const result = downloadJson({
          filename: 'company-ranking-v1.json',
          text: JSON.stringify({
            schemaVersion: 1,
            selectedCompanyIds: ranking.selectedCompanyIds,
            tierOrder: ranking.tierOrder
          }, null, 2),
          mimeType: 'application/json;charset=utf-8'
        });
        announce(`会社排榜 JSON 已导出：${result.filename}`, 'success');
        return;
      }
      const result = controller.exportJson();
      announce(`JSON 已导出：${result.filename}`, 'success');
    } catch (error) {
      announce('JSON 状态导出失败，请稍后重试。', 'error');
      console.error(error);
    }
  });

  elements.exportPng.addEventListener('click', async () => {
    if (importBusy || pngExportInProgress) return;
    const isCompanyRanking = rankingSubject === 'company';
    const snapshot = isCompanyRanking ? null : (lastRenderedModel ?? controller.inspect([]));
    const companySnapshot = isCompanyRanking ? companyRanking.inspect() : null;
    const rankedCount = isCompanyRanking ? companySnapshot.rankedCount : snapshot.rankedCount;
    if (rankedCount === 0) return;

    pngExportInProgress = true;
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
    try {
      const exportState = isCompanyRanking
        ? controller.inspectState()
        : snapshot.state;
      const exportTierOrder = isCompanyRanking ? companySnapshot.tierOrder : exportState.tierOrder;
      const exportWorksById = isCompanyRanking ? companyRankingItems() : new Map();
      for (const { id: tierId } of exportState.tiers) {
        for (const workId of exportTierOrder[tierId]) {
          if (!isCompanyRanking) {
            const work = worksById.get(workId);
            if (work) exportWorksById.set(workId, work);
          }
        }
      }
      const result = await exportTierPng({
        tiers: exportState.tiers,
        tierOrder: exportTierOrder,
        worksById: exportWorksById,
        presentation: (isCompanyRanking ? companyPresentation : presentation).inspect(),
        createCanvas({ width, height }) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          return canvas;
        },
        fontsReady: document.fonts?.ready ?? Promise.resolve(),
        loadCover: async (coverPath, record) => {
          const work = record.work;
          if (isCompanyRanking) return loadImageUrl(coverPath, { crossOrigin: 'anonymous' });
          const url = await coverUrlForWork(work);
          return loadImageUrl(url, { crossOrigin: work.localMediaKind === 'custom' ? null : 'anonymous' });
        }
      });
      downloadBlob({
        blob: result.blob,
        filename: result.filename,
        documentRef: document,
        schedule: task => window.setTimeout(task, 0),
        onDeferredError: error => console.error(error)
      });
      announce(`PNG 已导出：${result.filename}`, 'success');
    } catch (error) {
      announce(pngExportMessage(error), 'error');
      if (!(error instanceof PngExportError)) console.error(error);
    } finally {
      pngExportInProgress = false;
      renderControlStates(lastRenderedModel ?? controller.inspect([]));
    }
  });

  await startupMetrics.measureAsync('first-render', async () => {
    const restored = await applyUiLocation();
    if (!restored) await render();
  });
  openShareImportDialog();
}

if (typeof document !== 'undefined') {
  initialize().catch(error => {
    showStartupFailure(error);
    console.error(error);
  });
}
