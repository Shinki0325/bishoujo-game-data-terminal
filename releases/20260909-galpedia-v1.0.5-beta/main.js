import { createPersonDirectoryServices } from './lib/person-directory-services.js';
import { prepareWorkbenchDirectories } from './lib/workbench-directory-model.js';
import { createProjectResources } from './lib/project-resources.js';
import { loadLegacyWorkbenchData } from './lib/legacy-workbench-data.js';
import { toWorkerLookup } from './lib/workbench-data-projection.js';
export { assertSample, prepareRuntimeSample } from './lib/runtime-sample.js';
export { fetchStagedRuntimeCoreSources } from './lib/runtime-core-sources.js';
import { loadWorkbenchData, workbenchQueryWork } from './lib/workbench-demand-data.js';
import {getOwnedWorkbenchClient,ownedWorkbenchEnabled,workbenchSourceDescriptor} from './lib/workbench-worker-session.js';
import {
  installExternalCoverImageRecovery,
  resolveAssetUrl
} from './lib/asset-url.js';
import { createHistory } from './lib/history.js';
import { loadImageUrl } from './lib/browser-cover-loader.js';
import { createPersonWorkspaceController } from './lib/person-workspace-controller.js';
import { createCompanyWorkspaceController } from './lib/company-workspace-controller.js';
import { createBangumiImportController } from './lib/bangumi-import-controller.js';
import { createWorkCreditsController, createWorkStatsController } from './lib/work-detail-resources-controller.js';
import { createWorkDetailController } from './lib/work-detail-controller.js';
import { createWorkCompareController } from './lib/work-compare-controller.js';
import { createWorkspaceHostController } from './lib/workspace-host-controller.js';
import { projectWorkbenchControls } from './lib/workbench-control-model.js';
import { createWorkspaceHostView, createWorkbenchControlsView, WORKBENCH_CONTROL_ELEMENTS } from './views/workbench-shell-view.js';
import { createWorkCompareView } from './views/work-compare-view.js';
import { createWorkDetailView } from './views/work-detail-view.js';
import { createWorkVersionView } from './views/work-version-view.js';
import { createLazyResource } from './lib/lazy-resource.js';
import { createWorkbenchQueryController } from './lib/workbench-query-controller.js';
import { projectWorkbenchResults } from './lib/workbench-results-model.js';
import { createWorkbenchResultsView } from './views/workbench-results-view.js';
import { createRankingWorkspaceView } from './views/ranking-workspace-view.js';
import { createGalpediaSearch } from './lib/galpedia-search.js';
import { createAppController } from './lib/app-controller.js?v=20260824-selection-source-sorting-v1';
import { createCustomWork } from './lib/custom-work.js';
import { encodeSquareCrop } from './lib/image-crop.js';
import { createLocalMediaStore, openLocalMediaDatabase } from './lib/local-media-store.js';
import { createMediaEditController } from './lib/media-edit-controller.js';
import { createMediaEditEnvironment } from './views/media-edit-environment.js';
import {
  createImportCoordinator,
  downloadBlob,
  downloadText,
  setWorkspaceBusy
} from './lib/browser-io.js';
import { createFilterDrawerController } from './lib/filter-drawer.js';
import { createFilterWorkerClient } from './lib/filter-worker-client.js';
import { createMediaPreviewLoader } from './lib/media-preview-loader.js';
import { createMediaPreviewInteractionView } from './views/media-preview-interaction-view.js';
import { createActionIcon } from './lib/action-icons.js';
import { createWorkbenchChrome, connectWorkbenchNavigation } from './views/workbench-chrome.js';
import { createRankingControlsView } from './views/ranking-controls-view.js';
import { createRankingExportView } from './views/ranking-export-view.js';
import { createMediaPreviewActions } from './lib/media-preview-actions.js';
import { createWorkbenchMediaSources } from './lib/workbench-media-sources.js';
import { createRankingMediaSession } from './lib/ranking-media-session.js';
import { createImmersiveController, createRankingPresentation } from './lib/ranking-presentation.js';
import { createSelectionCardPresentation } from './lib/selection-card-presentation.js?v=20260824-selection-source-sorting-v1';
import { createPreviewMediaResolver } from './lib/preview-media.js';
import { createWorkDetailCreditsLoader } from './lib/work-detail-credits.js';
import { canUseHighDensityPreview } from './lib/adaptive-image-source.js';
import {
  configuredAssetBase,
  DATA_URLS,
  RUNTIME_FEATURES,
  PREVIEW_MANIFEST_PATH,
  RUNTIME_DATA_CACHE_MODE,
  CHARACTER_IMAGE_MAP_SHA256,
  CHARACTER_IMAGE_ALIAS_MAP_SHA256,
  CHARACTER_IMAGE_MAP_SNAPSHOT_ID,
  CHARACTER_IMAGE_ASSET_BASE,
  CHARACTER_IMAGE_ASSET_FALLBACK_BASE,
  M2_PERSON_MANIFEST_SHA256,
  M2_PERSON_ENTITIES_SHA256,
  M2_PERSON_RELATIONS_SHA256,
  M2_PERSON_NAME_VARIANTS_SHA256,
  M2_PERSON_CHARACTER_ROLES_SHA256,
  M2_PERSON_NAME_PREFERENCES_SHA256,
  BANGUMI_PUBLIC_BINDINGS_SHA256,
  DATA_REVISION,
  TELEMETRY_ENDPOINT,
  TELEMETRY_PUBLIC_STATS_ENDPOINT,
  TELEMETRY_RELEASE_ID
} from './lib/runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';
import { selectionStateForResults } from './lib/selection.js';
import { StateValidationError, USER_WORK_LIMIT } from './lib/state.js?v=20260824-selection-source-sorting-v1';
import { createStartupMetrics } from './lib/startup-metrics.js';
import { createInteractionMetrics } from './lib/interaction-metrics.js';
import { runtimeDiagnostics as localDiagnostics } from './lib/runtime-diagnostics.js';
import { createTelemetryClient } from './lib/telemetry-client.js';
import { createRankingWorkspaceController, projectCompanyRankingItems } from './lib/ranking-workspace-controller.js';
import { createRankingCommandHistory } from './lib/ranking-command-history.js';
import { createRankingExportController } from './lib/ranking-export-controller.js';
import { createCompanyRankingCard } from './views/company-ranking-card.js';
import {
  ATTRIBUTE_GROUP_IDS as ATTRIBUTE_GROUP_ORDER,
  FILTER_GROUP_ORDER
} from './lib/attribute-filters.js';
import { createFilterView } from './views/filter-view.js';
import { createSelectionView, selectionInitialWorks } from './views/selection-view.js?v=20260824-mobile-single-score-card-v2';
import { createMobileSelectionView } from './views/mobile-selection-view.js';
import { createCompanyDirectoryView, companyImageUrl } from './views/company-directory-view.js';
import { createPersonDirectoryView } from './views/person-directory-view.js?v=20260903-person-role-model-v5';
import { createCompanyRanking } from './lib/company-ranking.js';
import { createMediaDialogView } from './views/media-dialog-view.js';
import { createWorkDetailCreditsView } from './views/work-detail-credits-view.js';
import {
  parseSelectionShare
} from './lib/share-selection.js';
import { createSharedSelectionController } from './lib/shared-selection-controller.js';
import { createSelectionSharingController } from './lib/selection-sharing-controller.js';
import { createBrowserClipboard } from './lib/browser-clipboard.js';
import { createShareImportView } from './views/share-import-view.js';
import { createPopoverController } from './lib/ui-popover.js';
import { createWorkbenchNavigationController, projectUiLocation } from './lib/workbench-navigation-controller.js';
import { createKeeperGuidanceController } from './lib/keeper-guidance-controller.js';
import { createKeeperGuidanceView } from './views/keeper-guidance-view.js';
import { createWorkspaceScrollSession } from './lib/workspace-scroll-session.js';
import { createDetailBrowserSession } from './lib/detail-browser-session.js';

let PngExportError;
const loadPngExport = createLazyResource(async attempt => {
  const module = await (attempt === 0 ? import('./lib/png-export.js') : import(`./lib/png-export.js?retry=${attempt}`));
  PngExportError = module.PngExportError;
  return module;
});
async function exportTierPng(options) { return (await loadPngExport()).exportTierPng(options); }
let bangumiImport;
const loadBangumiImport = createLazyResource(async attempt => {
  bangumiImport = await (attempt === 0
    ? import('./lib/bangumi-public-import.js?v=20260825-bangumi-family-default-mobile-details-scroll-v1')
    : import(`./lib/bangumi-public-import.js?retry=${attempt}`));
  return bangumiImport;
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
  mobileTitleSearch: requiredElement('mobile-title-search'),
  mobileTitleSearchClear: requiredElement('mobile-title-search-clear'),
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
  keeperBangumiInput: requiredElement('keeper-bangumi-input-guide'),
  keeperBangumiResult: requiredElement('keeper-bangumi-result-guide'),
  bangumiInputNote: requiredElement('bangumi-input-note'),
  bangumiResultNote: requiredElement('bangumi-result-note'),
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
  modePerson: requiredElement('mode-person'),
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
  personView: requiredElement('person-view'),
  personDirectoryCount: requiredElement('person-directory-count'),
  personSearch: requiredElement('person-directory-search'),
  personList: requiredElement('person-directory-list'),
  personEmpty: requiredElement('person-directory-empty'),
  personPagePrevious: requiredElement('person-page-previous'),
  personPageNext: requiredElement('person-page-next'),
  personPageNumber: requiredElement('person-page-number'),
  personPageTotal: requiredElement('person-page-total'),
  personDetailDialog: requiredElement('person-detail-dialog'),
  personDetailTitle: requiredElement('person-detail-title'),
  personDetailMeta: requiredElement('person-detail-meta'),
  personDetailBody: requiredElement('person-detail-body'),
  selectedCount: requiredElement('selected-count'),
  rankedCount: requiredElement('ranked-count'),
  unrankedCount: requiredElement('global-unranked-count'),
  catalogResultCount: requiredElement('catalog-result-count'),
  titleSearch: requiredElement('title-search'),
  titleSearchClear: requiredElement('title-search-clear'),
  browseModeToggle: requiredElement('browse-mode-toggle'),
  selectionModeToggle: requiredElement('selection-mode-toggle'),
  compareModeToggle: requiredElement('compare-mode-toggle'),
  quickRankingEntry: requiredElement('quick-ranking-entry'),
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
  mobileRankingExportQuick: requiredElement('mobile-ranking-export-quick'),
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
  rankingCoachmark: requiredElement('ranking-coachmark'),
  rankingCoachmarkHelp: requiredElement('ranking-coachmark-help'),
  rankingCoachmarkDismiss: requiredElement('ranking-coachmark-dismiss'),
  cleanupMenuButton: requiredElement('cleanup-menu-button'),
  cleanupMenu: requiredElement('cleanup-menu'),
  displayMenuButton: requiredElement('display-menu-button'),
  displayMenu: requiredElement('display-menu'),
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
  detailsCompareButton: requiredElement('details-compare-button'),
  detailsVersionShelf: requiredElement('details-version-shelf'),
  detailsVersionCurrent: requiredElement('details-version-current'),
  detailsVersionList: requiredElement('details-version-list'),
  detailsCover: requiredElement('details-cover'),
  detailsCoverImage: requiredElement('details-cover-image'),
  detailsBrand: requiredElement('details-brand'),
  detailsRelease: requiredElement('details-release'),
  detailsViewsRow: requiredElement('details-views-row'),
  detailsViews: requiredElement('details-views'),
  detailsScore: requiredElement('details-score'),
  detailsAliases: requiredElement('details-aliases'),
  detailsTags: requiredElement('details-tags'),
  detailsCredits: requiredElement('details-credits'),
  detailsCreditsStatus: requiredElement('details-credits-status'),
  detailsCreditsTabs: requiredElement('details-credits-tabs'),
  detailsCreditsContent: requiredElement('details-credits-content'),
  workCompareBar: requiredElement('work-compare-bar'),
  workCompareCount: requiredElement('work-compare-count'),
  workCompareHint: requiredElement('work-compare-hint'),
  workCompareItems: requiredElement('work-compare-items'),
  workCompareOpen: requiredElement('work-compare-open'),
  workCompareClear: requiredElement('work-compare-clear'),
  keeperCompareGuide: requiredElement('keeper-compare-guide'),
  workCompareDialog: requiredElement('work-compare-dialog'),
  workCompareDialogSubtitle: requiredElement('work-compare-dialog-subtitle'),
  workCompareContent: requiredElement('work-compare-content'),
  status: requiredElement('status-message')
});

let statusTimer = null;

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

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'default' });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  return response.json();
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


async function initialize() {
  const chrome = createWorkbenchChrome({
    elements: {
      themeToggle: elements.themeToggle, modeSelection: elements.modeSelection,
      modeCompany: elements.modeCompany, modeRanking: elements.modeRanking, modePerson: elements.modePerson
    },
    documentRef: document, windowRef: window
  });
  const startupMetrics = createStartupMetrics();
  let filterWorkerClient = ownedWorkbenchEnabled() ? getOwnedWorkbenchClient() : createFilterWorkerClient({
    workerFactory: () => new Worker(
      new URL('./workers/filter-worker.js?v=20260824-selection-source-sorting-v1', import.meta.url),
      { type: 'module' }
    ),
    timeoutMs: 10000
  });
  if (/^#works(?:[/?]|$)/u.test(window.location.hash)) filterWorkerClient.preload();
  const interactionMetrics = createInteractionMetrics();
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
  const preparedWorkbench = await loadWorkbenchData({
    legacyLoader: () => loadLegacyWorkbenchData({
      startupMetrics,
      publishDiagnostics(runtimeDiagnostics) {
        document.documentElement.dataset.runtimePopulation = 'full';
        globalThis.__EGS_TIER_STARTUP_DIAGNOSTICS__ = runtimeDiagnostics;
      }
    })
  });
  if(preparedWorkbench.workerOwned)filterWorkerClient=getOwnedWorkbenchClient();
  // Workbench export boundary: all legacy inputs have passed their original validators.
  const { catalogSource, sampleSource, sample, runtimeDiagnostics, populationContract, enrichment, workAliasesById, workPinyinById, workDisplayTitlesById, ratedDisplayWorks, presentationFamiliesSource, bangumiPublicBindings, confirmedBangumiImportBindings, brands, companyProfile, workData = null } = preparedWorkbench;
  localDiagnostics.identify({ runtimeRelease: TELEMETRY_RELEASE_ID, dataSnapshot: sampleSource.snapshot?.snapshotId });
  document.documentElement.dataset.runtimePopulation = 'full';
  globalThis.__EGS_TIER_STARTUP_DIAGNOSTICS__ = runtimeDiagnostics;
  const sortableSample = { ...sample, works: ratedDisplayWorks };
  const worksById = new Map(ratedDisplayWorks.map(work => [work.workId, work]));
  const catalogWorkIds = new Set(preparedWorkbench.uiSummary?.workIds ?? ratedDisplayWorks.map(work=>work.workId));
  const workReference = id => worksById.get(String(id)) ?? (catalogWorkIds.has(String(id)) ? {workId:String(id)} : null);
  const workbenchQuery = createWorkbenchQueryController({
    workData, workerOwned: preparedWorkbench.workerOwned,
    ensureFilterWorker: () => ensureFilterWorker(),
    ensureRankingView: () => ensureRankingView(),
    query: request => filterWorkerClient.query(request),
    resultIds: revision => filterWorkerClient.resultIds(revision),
    metrics: interactionMetrics
  });
  if (workData) {
    const baseGet = worksById.get.bind(worksById);
    worksById.get = id => workbenchQuery.lookup(id) ?? baseGet(id);
  }
  const workerWorkAliasesById = toWorkerLookup(workAliasesById);
  const workerWorkPinyinById = toWorkerLookup(workPinyinById);
  const workerCompanyAliasesById = toWorkerLookup(enrichment?.companyAliasesById ?? null);
  const workerCompanyPinyinById = toWorkerLookup(enrichment?.companyPinyinById ?? null);
  const filterWorkerPayload = preparedWorkbench.workerOwned ? workbenchSourceDescriptor() : {
    searchText: preparedWorkbench.searchText ?? null,
    prepareSearch: Boolean(workData),
    works: workData ? sortableSample.works.map(workbenchQueryWork) : sortableSample.works,
    knownFilterIds: sample.filters.map(filter => filter.filterId),
    brands,
    backendIndexes: sample.backendIndexes,
    workAliasesById: workerWorkAliasesById,
    workPinyinById: workerWorkPinyinById,
    companyAliasesById: workerCompanyAliasesById,
    companyPinyinById: workerCompanyPinyinById
  };
  const ensureFilterWorker = createLazyResource(() => startupMetrics.measureAsync('filter-worker-init', () => filterWorkerClient.init(filterWorkerPayload)));
  if (/^#works(?:[/?]|$)/u.test(window.location.hash)) {
    void ensureFilterWorker().catch(() => {});
    // Let the initialization message leave before preparing directory/UI models.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const projectResources = createProjectResources({
    catalogSource, requiresCatalogFetch: Boolean(workData)
  });
  // The validated final fanout already covers every core work's display media.
  // Keep the original eager proof path when that authority is not enabled.
  const personServices = createPersonDirectoryServices({
    workerOwned: preparedWorkbench.workerOwned, catalogWorks: sampleSource.works,
    loadCatalogWorks: () => filterWorkerClient.personCatalog(),
    locationSearch: window.location.search, ensureWorker: ensureFilterWorker,
    updateWorker: index => filterWorkerClient.update({ ...filterWorkerPayload, personWorkIndex: index })
  });
  const personRuntime = personServices.core;
  let personPerformanceRuntime = personServices.performance;
  const ensurePersonFilterIndex = personServices.ensureFilterIndex;
  const { presentationFamilies, representativeFamilyByWorkId, companyDirectory } = prepareWorkbenchDirectories({
    presentationFamiliesSource, catalogSnapshotId: sampleSource.snapshot?.snapshotId,
    catalogSha256: catalogSource.sha256, presentationWorkIds: populationContract.presentation.workIds,
    bangumiPublicBindings,
    companySummary: preparedWorkbench.uiSummary ? preparedWorkbench.uiSummary.companies : null,
    brands, works: ratedDisplayWorks,
    companyAliasesById: enrichment?.companyAliasesById,
    companyPinyinById: enrichment?.companyPinyinById,
    avatarByCompanyId: companyProfile?.avatarByCompanyId
  });
  const filterById = new Map(sample.filters.map(filter => [filter.filterId, filter]));
  let mediaStore = null;
  const {
    authorityThumbnailPathForWork, hasLocalReplacementForCurrentAuthority, invalidateMedia,
    coverUrlForWork, coverSourcesForWork, resolveCoverUrls, previewUrlForWork
  } = createWorkbenchMediaSources({
    getMediaStore: () => mediaStore, assetBase, highDensityPreviewsEnabled, previewMedia,
    hydrateWorks: workData ? works => workData.hydrate(works) : null
  });
  let customWorks = [];
  const keeperGuidanceView = createKeeperGuidanceView({
    elements: {
      workCompareBar: elements.workCompareBar,
      keeperCompareGuide: elements.keeperCompareGuide,
      compareModeToggle: elements.compareModeToggle,
      rankingCoachmark: elements.rankingCoachmark,
      rankingHelpButton: elements.rankingHelpButton,
      modeRanking: elements.modeRanking,
      modeSelection: elements.modeSelection,
      titleSearch: elements.titleSearch,
      bangumiPublicImportResults: elements.bangumiPublicImportResults,
      bangumiPublicImportDialog: elements.bangumiPublicImportDialog,
      keeperBangumiInput: elements.keeperBangumiInput,
      keeperBangumiResult: elements.keeperBangumiResult,
      bangumiInputNote: elements.bangumiInputNote,
      bangumiResultNote: elements.bangumiResultNote,
      bangumiPublicImportAppend: elements.bangumiPublicImportAppend,
      bangumiPublicUserInput: elements.bangumiPublicUserInput
    },
    documentRef: document, windowRef: window,
    onDismiss: (id, version) => keeperGuidance.dismiss(id, version),
    onSelectWorks: returnToWorkSelection,
    onCompareSelection: focusCompareSelection,
    onImport: () => openBangumiPublicImportDialog({ fromEmpty: true })
  });
  const keeperGuidance = createKeeperGuidanceController({
    view: keeperGuidanceView, features: RUNTIME_FEATURES.keeperGuide,
    readWorkbench: () => ({
      busy: importBusy || rankingExport.busy, importBusy,
      importAvailable: confirmedBangumiImportBindings !== null,
      compareMode, compareIds: comparison.ids, compareMinimum: comparison.minimum,
      model: lastRenderedModel, rankingSubject
    })
  });
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
    sample: preparedWorkbench.workerOwned ? {
      sampleId: sample.sampleId, filters: sample.filters,
      genreFilters: sample.genreFilters, platformFilters: sample.platformFilters
    } : sortableSample,
    ...(preparedWorkbench.workerOwned ? {
      catalogAuthority: preparedWorkbench.uiSummary ?? {
        workIds: ratedDisplayWorks.map(work => work.workId),
        workGroupByEditionWorkId: Object.fromEntries(ratedDisplayWorks.map(work => [work.workId, work.workGroupId || work.workId]))
      },
      resolveWork: id => worksById.get(id)
    } : {}),
    localWorks: customWorks,
    storage: browserStorage(),
    confirm: message => window.confirm(message),
    announce,
    now: () => new Date(),
    downloadJson
  });
  window.addEventListener('pagehide', () => filterWorkerClient.terminate(), { once: true });

  let filterView;
  let importBusy = false;
  const rankingExport = createRankingExportController({
    isImportBusy: () => importBusy, getSubject: () => rankingSubject,
    getCompanyState: () => companyRanking.inspect(), exportWorksJson: () => controller.exportJson(), downloadJson,
    closeMenus: () => closeToolbarMenus(),
    pngSnapshot() {
      const company = rankingSubject === 'company';
      const model = company ? null : (lastRenderedModel ?? controller.inspect([]));
      const companyState = company ? companyRanking.inspect() : null;
      const state = company ? companyState : model.state;
      return { company, state, rankedCount: company ? companyState.rankedCount : model.rankedCount,
        exportQuality: document.querySelector('[data-ranking-export-quality]')?.value ?? 'standard',
        exportCanvas: document.querySelector('[data-ranking-export-canvas]')?.value ?? 'base',
        tierOrder: company ? companyState.tierOrder : state.tierOrder,
        worksById: company ? companyRankingItems() : worksById,
        presentation: (company ? companyPresentation : presentation).inspect() };
    },
    exportPng: exportTierPng,
    planPng: async options => (await loadPngExport()).planTierPng(options),
    isPngError: error => Boolean(PngExportError && error instanceof PngExportError),
    onBusyChange() { renderControlStates(lastRenderedModel ?? controller.inspect([])); renderKeeperGuidance(); },
    announce, logError: error => console.error(error),
    environment: {
      createCanvas({ width, height }) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
      },
      fontsReady: () => document.fonts?.ready ?? Promise.resolve(),
      loadCover: async (path, record, company) => {
        if (company) return loadImageUrl(path, { crossOrigin: 'anonymous' });
        const work = record.work, url = await coverUrlForWork(work);
        return loadImageUrl(url, { crossOrigin: work.localMediaKind === 'custom' ? null : 'anonymous' });
      },
      download: result => downloadBlob({ blob: result.blob, filename: result.filename, documentRef: document,
        schedule: task => window.setTimeout(task, 0), onDeferredError: error => console.error(error) })
    }
  });
  let candidateTitleQuery = '';
  createRankingExportView({ documentRef: document,
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
    preview: rankingExport.preview, png: rankingExport.png, json: rankingExport.json, isBusy: () => rankingExport.busy || importBusy });
  const workspaceScroll = createWorkspaceScrollSession({
    selection: {
      capture: () => selectionView.captureScroll(),
      restore: position => selectionView.restoreScroll(position)
    },
    ranking: {
      capture: () => rankingView?.captureScroll(),
      restore: position => rankingView?.restoreScroll(position)
    }
  });
  // Mobile uses the same workspace as desktop. The companion view remains inert
  // until it can offer feature parity rather than hiding the ranking workspace.
  const mobileCompanion = false;
  let lastRenderedModel = null;
  let replacementWork = null;
  let companyDirectoryOpen = false;
  let personDirectoryOpen = false;
  let personDetailReturnId = null;
  let personDirectoryView;
  let personRole = 'all';
  let personQuery = '';
  let selectedPersonId = null;
  let rankingSubject = 'work';
  let companyQuery = '';
  let companySort = 'totalVoteCount-desc';
  let companyHasImage = true;
  let companyDetailSortKey = 'releaseDate';
  let companyDetailSortDirection = 'asc';
  let companyCandidateQuery = '';
  let selectedCompanyId = null;
  let rankingCompanyReturn = null;
  let restoreCompanyRankingPending = false;
  let selectionMode = false;
  let compareMode = false;
  let companySelectionMode = false;
  let currentWorkDetailId = null;
  const detailBrowser = createDetailBrowserSession({
    dialog: elements.detailsDialog, documentRef: document, windowRef: window
  });
  const telemetry = createTelemetryClient({ endpoint: TELEMETRY_ENDPOINT, releaseId: TELEMETRY_RELEASE_ID });
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
    workIds: new Set(preparedWorkbench.uiSummary?.workIds ?? sample.works.map(work => work.workId)),
    fetchImpl: fetch,
    cryptoRef: crypto,
    cacheMode: RUNTIME_DATA_CACHE_MODE,
    characterImageMapSnapshotId: CHARACTER_IMAGE_MAP_SNAPSHOT_ID,
    characterImageMapSha256: CHARACTER_IMAGE_MAP_SHA256,
    characterImageAliasMapSha256: CHARACTER_IMAGE_ALIAS_MAP_SHA256
  });

  const workDetailResources = createWorkCreditsController({
    loader: workDetailCreditsLoader, view: workDetailCreditsView,
    dialog: elements.detailsDialog, contentRoot: elements.detailsCredits,
    ensureProjectRuntime: projectResources.ensureRuntime,
    getProjectRuntime: () => projectResources.current,
    loadIdentityCrosswalk: projectResources.loadIdentityCrosswalk,
    characterAssetBase: CHARACTER_IMAGE_ASSET_BASE,
    characterAssetFallbackBase: CHARACTER_IMAGE_ASSET_FALLBACK_BASE
  });
  const workDetailStats = createWorkStatsController({
    row: elements.detailsViewsRow, output: elements.detailsViews,
    endpointUrl: TELEMETRY_PUBLIC_STATS_ENDPOINT, pageOrigin: window.location.origin,
    isOpen: () => elements.detailsDialog.open, fetchImpl: fetch
  });

  const comparisonView = createWorkCompareView({
    elements: {
      catalogResults: elements.catalogResults,
      workCompareBar: elements.workCompareBar,
      workCompareCount: elements.workCompareCount,
      workCompareHint: elements.workCompareHint,
      workCompareOpen: elements.workCompareOpen,
      workCompareItems: elements.workCompareItems,
      workCompareDialogSubtitle: elements.workCompareDialogSubtitle,
      workCompareContent: elements.workCompareContent,
      workCompareDialog: elements.workCompareDialog
    },
    documentRef: document,
    fallbackCoverUrl: work => resolveAssetUrl(authorityThumbnailPathForWork(work) ?? 'assets/cover-unavailable.webp', assetBase),
    coverSourcesForWork,
    visibleFilters: work => partitionWorkDetailFilters(work, filterById).visible,
    openWorkDetails,
    onRemove: work => comparison.toggle(work, false),
    onSort: key => { void comparison.sort(key); }
  });
  const comparison = createWorkCompareController({
    workForId: id => worksById.get(id),
    loadCredits: id => workDetailCreditsLoader.load(id),
    renderDialog: snapshot => comparisonView.renderDialog(snapshot),
    isOpen: () => elements.workCompareDialog.open,
    onSelectionChanged: renderCompareBar,
    onActivated() { keeperGuidance.complete('compareActive'); renderKeeperGuidance(); },
    onLimit: maximum => announce(`最多可同时比较 ${maximum} 部作品。`, 'error')
  });
  function renderCompareBar() {
    comparisonView.renderBar(comparison.works(), comparison.ids, compareMode);
    renderKeeperGuidance();
  }
  function toggleCompareWork(work, include) { return comparison.toggle(work, include); }
  function renderWorkCompare() { void comparison.open(); }

  function focusCompareSelection() {
    const target = elements.catalogResults.querySelector('.selection-card-compare');
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
    elements.titleSearch.focus({ preventScroll: true });
  }

  function returnToWorkSelection() {
    if (importBusy || rankingExport.busy) return;
    closeMobileRankingCandidates();
    closeToolbarMenus();
    companyDirectoryOpen = false;
    personDirectoryOpen = false;
    selectedPersonId = null;
    rankingSubject = 'work';
    compareMode = false;
    setWorkSelectionMode(true);
    void runStateChange(() => controller.setWorkspaceMode('selection'));
    replaceUiLocation();
  }

  function renderKeeperGuidance() { keeperGuidance.render(); }

  const companyRanking = createCompanyRanking({
    companies: companyDirectory.companies,
    tiers: controller.inspectState().tiers,
    storage: browserStorage(), announce
  });
  const rankingHistory = createRankingCommandHistory({
    subjects: {
      work: { read: () => controller.inspectState(), undo: () => controller.undo(), redo: () => controller.redo() },
      company: { read: () => companyRanking.inspect(), undo: () => companyRanking.undo(), redo: () => companyRanking.redo() }
    }, announce
  });
  elements.companyRankingToggle.textContent = '进入排榜';
  elements.companyRankingClose.textContent = '返回会社';

  function openCompanyDirectory(companyId = null, { push = true, interaction = null } = {}) {
    if (!companyDirectoryOpen && !personDirectoryOpen && controller.inspectState().workspaceMode === 'ranking') {
      rankingCompanyReturn = { subject: rankingSubject,
        live: document.body.classList.contains('is-ranking-immersive'),
        anchor: rankingView?.captureAnchor(), scroll: rankingView?.captureScroll() };
      // The directory is a separate workspace, never a child of the live board.
      void immersive.exit();
    }
    if (push) beginUiNavigation('company-navigation');
    const activeInteraction = interaction ?? (push ? interactionMetrics.begin('company-directory') : null);
    interactionMetrics.stage(activeInteraction, 'debounce-complete');
    interactionMetrics.stage(activeInteraction, 'worker-return');
    interactionMetrics.stage(activeInteraction, 'controller-ready');
    interactionMetrics.stage(activeInteraction, 'presentation-ready');
    interactionMetrics.stage(activeInteraction, 'model-ready');
    interactionMetrics.stage(activeInteraction, 'media-ready');
    // Disable stale work-card handlers before the asynchronous workspace refresh.
    setWorkSelectionMode(false);
    companyDirectoryOpen = true;
    personDirectoryOpen = false;
    selectedPersonId = null;
    selectedCompanyId = companyId;
    if (companyId !== null && companyId !== undefined) telemetry.recordCompanyOpen(companyId);
    currentWorkDetailId = null;
    if (elements.detailsDialog.open) elements.detailsDialog.close();
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    renderCompanyDirectory();
    interactionMetrics.stage(activeInteraction, 'dom-updated');
    interactionMetrics.completeAfterFrame(activeInteraction);
    if (push) pushUiLocation();
  }

  const rankingMedia = createRankingMediaSession({
    visibleWorkIds: () => rankingView.visibleWorkIds(),
    isActive: () => lastRenderedModel?.state.workspaceMode === 'ranking',
    previewUrlForWork
  });
  const cancelRankingPreload = rankingMedia.cancel;
  const refreshRankingPreload = rankingMedia.refresh;

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
      void mediaEditing.editWork(work).catch(error => {
        announce(error instanceof Error ? error.message : '图片贴纸编辑失败。', 'error');
        console.error(error);
      });
    },
    onReplace: work => {
      replacementWork = work;
      elements.mediaFiles.click();
    },
    onRestore: work => {
      void mediaEditing.restore(work).catch(error => {
        announce('恢复原图失败。', 'error');
        console.error(error);
      });
    }
  });
  const previewInteraction = createMediaPreviewInteractionView({ dialog: elements.mediaPreview, image: elements.mediaPreviewImage });
  const previewLoader = createMediaPreviewLoader({
    image: elements.mediaPreviewImage,
    resolveUrl: previewUrlForWork,
    async reveal(work, isCurrent) {
      const isImmersive = document.body.classList.contains('is-ranking-immersive') || work.mediaPreviewImmersive === true;
      const hasReplacement = !isImmersive && await hasLocalReplacementForCurrentAuthority(work);
      if (!isCurrent()) return;
      elements.mediaPreview.classList.toggle('is-immersive-preview', isImmersive);
      previewInteraction.reset();
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

  const mediaEnvironment = createMediaEditEnvironment({ documentRef: document, windowRef: window, announce });
  const mediaEditing = createMediaEditController({
    store: mediaStore, environment: mediaEnvironment,
    previewUrlForWork, authorityThumbnailPathForWork,
    registerCustomWork(work) {
      rankingHistory.board(() => controller.registerLocalWorks([work]), '添加本地图片');
      worksById.set(work.workId, work);
      customWorks = [...customWorks, work];
    },
    async onMediaChanged(id, { closePreview = false } = {}) {
      invalidateMedia(id);
      if (closePreview) {
        previewLoader.cancel();
        if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
        else elements.mediaPreview.open = false;
      }
      await render();
    },
    closePreview() {
      previewActions.closeMenu();
      if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
      else elements.mediaPreview.open = false;
    }
  });

  function commitTitleQuery(titleQuery, interaction = null) {
    const previous = String(controller.inspectState().filterState.titleQuery ?? '');
    const next = String(titleQuery ?? '');
    interactionMetrics.stage(interaction, 'debounce-complete');
    const result = runStateChange(() => controller.setFilterState({ titleQuery: next }), [], interaction);
    if (previous.trim() !== next.trim()) {
      if (previous.trim().length === 0 && next.trim().length > 0) pushUiLocation();
      else replaceUiLocation();
    }
    return result;
  }

  function clearTitleQuery() {
    const interaction = interactionMetrics.begin('clear-search');
    selectionView?.cancelPendingTitleQuery?.();
    elements.titleSearchClear.hidden = true;
    elements.mobileTitleSearchClear.hidden = true;
    elements.titleSearch.value = '';
    elements.mobileTitleSearch.value = '';
    return commitTitleQuery('', interaction);
  }

  const selectionView = createSelectionView({
    prepareWorks: workData ? async works => {
      const hydrated = await workData.hydrate(works);
      return presentationFamilies?.decorateWorks(hydrated) ?? hydrated;
    } : null,
    // Contract marker: createSelectionView({ root, onToggleWork, onToggleCurrentPage, onToggleCurrentResults, onToggleSelectedOnly, onOpenDetails, onFilterChange, assetBase })
    root: elements.catalogResults,
    onToggleWork(work, selected) {
      if (compareMode) {
        toggleCompareWork(work, selected);
        return;
      }
      if (!selectionMode) return;
      return runStateChange(() => selected
        ? controller.selectWorks([work.workId])
        : controller.deselectWorks([work.workId]));
    },
    onToggleCurrentPage(workIds) {
      return runStateChange(() => controller.toggleCurrentResults(workIds));
    },
    async onToggleCurrentResults(workIds) {
      if (workIds === null) {
        try {
          workIds = await workbenchQuery.currentResultIds();
          if (workIds === null) return;
        } catch (error) {
          announce('结果已更新，请重新选择。', 'warning');
          return;
        }
      }
      return runStateChange(() => controller.toggleCurrentResults(workIds));
    },
    onToggleSelectedOnly(selectedOnly) {
      return runStateChange(() => controller.setFilterState({ selectedOnly }));
    },
    onOpenDetails(work) {
      openWorkDetails(work);
    },
    onCompareWork(work, include) {
      toggleCompareWork(work, include);
    },
    isComparedWork(work) {
      return comparison.ids.includes(String(work?.workId ?? ''));
    },
    onFilterChange(patch, interaction = null) {
      const activeInteraction = interaction ?? interactionMetrics.begin(
        Object.hasOwn(patch, 'titleQuery') ? 'title-search' : 'filter'
      );
      if (Object.hasOwn(patch, 'titleQuery')) return commitTitleQuery(patch.titleQuery, activeInteraction);
      interactionMetrics.stage(activeInteraction, 'debounce-complete');
      const result = runStateChange(() => controller.setFilterState(patch), [], activeInteraction);
      replaceUiLocation();
      return result;
    },
    onInteractionStart(kind) {
      return interactionMetrics.begin(kind);
    },
    onPageChange() {
      replaceUiLocation();
    },
    onPageRequest() { return render(); },
    assetBase,
    cardSurfaceSelection: true
  });
  const filterIconHost = elements.filterToggle.querySelector('.toolbar-button-icon');
  filterIconHost?.replaceChildren(createActionIcon(document, 'filter'));
  elements.titleSearchClear.addEventListener('click', clearTitleQuery);
  elements.mobileTitleSearchClear.addEventListener('click', clearTitleQuery);
  let companyDirectoryView;
  const personWorkspace = createPersonWorkspaceController({
    coreRuntime: personRuntime, performanceRuntime: personPerformanceRuntime,
    workIds: catalogWorkIds, worksById,
    readWorkMetadata: preparedWorkbench.workerOwned
      ? ids => filterWorkerClient.workMetadata(ids, 'person') : null,
    model: { companies: companyDirectory.companies, workDisplayTitlesById,
      characterAssetBase: CHARACTER_IMAGE_ASSET_BASE, assetBase,
      representativeFamilyByWorkId, presentationFamilies },
    loadCharacterImages: projectResources.loadCharacterImages,
    onHydrated() {
      if (!personDirectoryOpen) return;
      renderPersonDirectory();
      renderWorkspace(lastRenderedModel ?? controller.inspect([]));
      if (selectedPersonId !== null) personDirectoryView?.setSelected?.(selectedPersonId);
    },
    publishDiagnostic: new URLSearchParams(window.location.search).has('dumpPersonIndex')
      ? ({ records, activityAxis, hydrated }) => {
        globalThis.__EGS_PERSON_ACTIVITY_AXIS__ = activityAxis;
        globalThis.__EGS_PERSON_INDEX_EXPORT__ = records;
        if (hydrated) globalThis.__EGS_PERSON_INDEX_HYDRATED__ = true;
      } : null
  });
  const ensurePersonRuntime = () => personWorkspace.loadDirectory();

  async function ensurePersonFilterOptions() {
    if (!filterView) return;
    filterView.setPersonOptionsLoading?.(true);
    try {
      const [, records] = await Promise.all([
        ensurePersonFilterIndex(),
        ensurePersonRuntime()
      ]);
      const indexedPersonIds = new Set(Object.keys(personServices.filterIndex?.persons ?? {}));
      const options = (records ?? [])
        .map(person => ({
          ...person,
          personId: String(person.entityId ?? person.personId ?? '')
        }))
        .filter(person => indexedPersonIds.has(person.personId));
      filterView.setPersonOptions(options);
    } catch (error) {
      filterView.setPersonOptions([]);
      announce('人物筛选资料加载失败，请稍后重试。', 'error');
      console.error(error);
    }
  }

  function renderPersonDirectory() {
    personWorkspace.render({
      elements: { root: elements.personView, search: elements.personSearch,
        count: elements.personDirectoryCount, list: elements.personList, empty: elements.personEmpty },
      view: personDirectoryView, query: personQuery, selectedPersonId,
      syncSearchClears: chrome.syncSearchClears
    });
  }

  const companyWorkspace = createCompanyWorkspaceController({
    directory: companyDirectory,
    elements: { search: elements.companySearch, count: elements.companyDirectoryCount,
      total: document.querySelector('#company-directory-total') },
    renderView: model => companyDirectoryView.render(model),
    isActive: () => companyDirectoryOpen,
    loadWorkIds: preparedWorkbench.workerOwned
      ? (id, sort) => filterWorkerClient.companyWorkIds(id, sort) : null,
    loadWorks: ids => workData.get(ids),
    onSelectionResolved: id => { selectedCompanyId = id; },
    onError: announce,
    syncSearchClears: chrome.syncSearchClears,
    imageUrlForCompany: company => companyImageUrl(company, assetBase),
    imageUrlForWork: work => Object.freeze({
      thumbnailUrl: resolveAssetUrl(work.projectedThumbnailPath ?? work.coverPath, assetBase),
      previewUrl: highDensityPreviewsEnabled && typeof work.projectedPreviewPath === 'string'
        ? resolveAssetUrl(work.projectedPreviewPath, assetBase) : null
    })
  });
  function renderCompanyDirectory() {
    return companyWorkspace.render({
      query: companyQuery, sort: companySort, hasImage: companyHasImage,
      selectedCompanyId, detailSortKey: companyDetailSortKey,
      detailSortDirection: companyDetailSortDirection,
      selectedCompanyIds: companyRanking.inspect().selectedSet,
      selectionMode: companySelectionMode
    });
  }

  const companyRankingItems = () => projectCompanyRankingItems(companyDirectory.companies, company => companyImageUrl(company, assetBase));
  const buildCompanyRankingModel = () => rankingActions.buildCompanyModel(buildRankingModel, companyRankingItems());
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
      if (rankingCompanyReturn) { void returnFromCompanyToRanking(); return; }
      selectedCompanyId = null;
      renderCompanyDirectory();
      pushUiLocation();
    },
    onToggleCompany(companyId, selected) {
      rankingHistory.board(() => companyRanking.toggle(companyId, selected));
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
  personDirectoryView = createPersonDirectoryView({
    root: elements.personView,
    imageUrlForWork: credit => {
      if (credit.workThumbnailPath) return resolveAssetUrl(credit.workThumbnailPath, assetBase);
      const work = worksById.get(String(credit?.workId ?? ''));
      const path = work?.projectedThumbnailPath ?? work?.coverPath;
      return path ? resolveAssetUrl(path, assetBase) : null;
    },
    onSearch(query) {
      personQuery = String(query ?? '');
      renderPersonDirectory();
      replaceUiLocation();
    },
    onRoleChange(role) {
      personRole = role;
      replaceUiLocation();
    },
    onLoadPerson: (personId, summary) => personWorkspace.loadPerson(personId, summary),
    onSelect(personId) {
      selectedPersonId = personId;
      if (personId === null) {
        // A co-actor detail is opened from another person detail. Treat the
        // close action like returning from a nested detail route instead of
        // dropping the user at the directory root.
        if (personDetailReturnId !== null && personDetailReturnId !== undefined) {
          const returnPersonId = personDetailReturnId;
          personDetailReturnId = null;
          selectedPersonId = returnPersonId;
          renderPersonDirectory();
          replaceUiLocation();
          // The close control is a dialog form submit, so the browser closes
          // the native dialog after the click handler returns. Re-open the
          // restored parent detail on the next task to avoid ending up with a
          // rendered-but-hidden detail.
          window.setTimeout(() => {
            if (selectedPersonId === returnPersonId) personDirectoryView?.setSelected?.(returnPersonId);
          }, 0);
          return;
        }
        if (elements.personDetailDialog.open) elements.personDetailDialog.close();
        pushUiLocation();
      } else pushUiLocation();
    },
    onOpenWork(workId) {
      const work = workReference(workId);
      if (!work) return;
      personDetailReturnId = selectedPersonId;
      selectedPersonId = null;
      personDirectoryOpen = false;
      if (elements.personDetailDialog.open) elements.personDetailDialog.close();
      openWorkDetails(work);
    },
    onOpenPerson(personId) {
      personDetailReturnId = selectedPersonId !== null && selectedPersonId !== personId
        ? selectedPersonId
        : null;
      selectedPersonId = personId;
      personDirectoryOpen = true;
      renderPersonDirectory();
      pushUiLocation();
    },
    onOpenCompany(companyId) {
      selectedPersonId = null;
      if (elements.personDetailDialog.open) elements.personDetailDialog.close();
      openCompanyDirectory(companyId);
    }
  });
  elements.companyHasImage.addEventListener('change', () => {
    companyHasImage = elements.companyHasImage.checked;
    renderCompanyDirectory();
    replaceUiLocation();
  });
  const selectionSharing = createSelectionSharingController({
    locationRef: window.location, datasetVersion: sample.sampleId,
    nativeShare: typeof navigator.share === 'function' ? data => navigator.share(data) : null,
    copy: createBrowserClipboard({ navigatorRef: navigator, documentRef: document }).copy,
    announce, logError: error => console.error(error)
  });
  const shareSelectedWorkIds = ids => selectionSharing.share(ids);

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
      return commitTitleQuery(titleQuery);
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

  function setCompareMode(active) {
    compareMode = Boolean(active);
    if (compareMode) setWorkSelectionMode(false);
    void render();
  }

  let rankingView = null, buildRankingModel, createRankingCard;
  const fullRankingModel = () => rankingSubject === 'company'
    ? buildCompanyRankingModel() : buildRankingModel(controller.inspectState(), worksById, '');
  async function locateRankingItem(workId) {
    if (importBusy || companyDirectoryOpen || personDirectoryOpen || controller.inspectState().workspaceMode !== 'ranking') return;
    const model = fullRankingModel();
    const candidate = model.candidateWorks.some(item => item.workId === workId);
    if (!candidate && !model.tiers.some(tier => tier.works.some(item => item.workId === workId))) {
      announce('该条目已不在当前榜单中。'); return;
    }
    if (candidate) {
      if (candidateTitleQuery && rankingSubject === 'work') {
        candidateTitleQuery = '';
        await render();
      }
      if (document.body.dataset.rankingTray === 'collapsed') rankingControls.setCandidatesOpen(true);
    }
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    const card = [...elements.rankingView.querySelectorAll('.ranking-card')].find(node => node.dataset.workId === workId);
    if (!card) return;
    card.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    card.focus({ preventScroll: true }); card.classList.add('ranking-locator-target');
    window.setTimeout(() => card.classList.remove('ranking-locator-target'), 1600);
  }
  let rankingLocatorView = null;
  const rankingLocator = createLazyResource(async () => {
    const { createRankingLocatorView } = await import('./views/ranking-locator-view.js');
    rankingLocatorView = createRankingLocatorView({ documentRef: document, getModel: fullRankingModel,
      onLocate: id => { void locateRankingItem(id).catch(error => { announce('定位失败，请重试。', 'error'); console.error(error); }); }
    });
    return rankingLocatorView;
  });
  async function openRankingLocator() {
    if (importBusy || companyDirectoryOpen || personDirectoryOpen || controller.inspectState().workspaceMode !== 'ranking') return;
    const subject = rankingSubject;
    closeToolbarMenus();
    document.getElementById('mobile-ranking-menu')?.close();
    const view = await rankingLocator();
    if (importBusy || companyDirectoryOpen || personDirectoryOpen || rankingSubject !== subject || controller.inspectState().workspaceMode !== 'ranking') return;
    const isLive = document.body.classList.contains('is-ranking-immersive');
    const opener = document.getElementById(isLive ? 'ranking-live-toggle' : window.matchMedia('(max-width: 899px)').matches ? 'mobile-ranking-more' : 'cleanup-menu-button');
    opener?.focus({ preventScroll: true });
    view.open({ subject, isLive });
  }
  for (const id of ['ranking-locate-open', 'mobile-ranking-locate', 'ranking-live-locate']) {
    document.getElementById(id).addEventListener('click', () => {
      void openRankingLocator().catch(error => { announce('全榜查找暂时无法打开，请重试。', 'error'); console.error(error); });
    });
  }
  const rankingActions = createRankingWorkspaceController({
    works: controller, companies: companyRanking, getSubject: () => rankingSubject,
    commit: change => runStateChange(change),
    confirm: message => window.confirm(message), createId: () => crypto.randomUUID(),
    focusTier: id => rankingView.focusTier(id),
    completeFirstDrag: () => keeperGuidance.complete('tier.firstDrag')
  });
  const rankingOptions = {
    root: elements.rankingView,
    createCard: (documentRef, item, callbacks) => rankingSubject === 'company'
      ? createCompanyRankingCard(documentRef, item, callbacks)
      : createRankingCard(documentRef, item, callbacks),
    onMoveToTier: rankingActions.moveToTier,
    onMoveToUnranked: rankingActions.moveToUnranked,
    onTierConfigChange: rankingActions.setTiers,
    canEditImage: () => rankingSubject === 'work' && mediaStore !== null && !importBusy,
    onEditImage(work) {
      void mediaEditing.editWork(work).catch(error => {
        announce(error instanceof Error ? error.message : '图片编辑失败。', 'error');
        console.error(error);
      });
    },
    onDiscoverActions: () => keeperGuidance.complete('tier.firstDrag'),
    onTierDelete: rankingActions.deleteTier,
    onAddTier: rankingActions.addTier,
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
      workspaceScroll.captureRanking();
      void render();
    },
    onAnnotationChange(workId, value) {
      const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
      rankingHistory.annotations(rankingSubject, activePresentation, () => activePresentation.setAnnotation(workId, value));
      rankingView.setAnnotations(activePresentation.inspect().annotations);
      renderControlStates(lastRenderedModel ?? controller.inspect([]));
    },
    onRemoveCandidate: rankingActions.removeCandidate,
    onRemoveCandidates: rankingActions.removeCandidates,
    onMoveCandidatesToTier: rankingActions.moveCandidatesToTier,
    showImportTile: () => rankingSubject === 'work',
    isCardActivationEnabled: () => true,
    assetBase
  };
  const ensureRankingView = createLazyResource(async attempt => {
    const module = await (attempt === 0 ? import('./views/ranking-view.js') : import(`./views/ranking-view.js?retry=${attempt}`));
    ({ buildRankingModel, createRankingCard } = module);
    rankingView = module.createRankingView(rankingOptions);
    return rankingView;
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
  const rankingControls = createRankingControlsView({
    elements: {
      rankingCoachmarkDismiss: elements.rankingCoachmarkDismiss,
      rankingCoachmark: elements.rankingCoachmark,
      rankingScaleOverall: elements.rankingScaleOverall,
      rankingScaleOverallOutput: elements.rankingScaleOverallOutput,
      rankingScaleCard: elements.rankingScaleCard,
      rankingScaleCardOutput: elements.rankingScaleCardOutput,
      rankingScaleRail: elements.rankingScaleRail,
      rankingScaleRailOutput: elements.rankingScaleRailOutput,
      rankingScaleAnnotation: elements.rankingScaleAnnotation,
      rankingScaleAnnotationOutput: elements.rankingScaleAnnotationOutput,
      rankingScaleTierName: elements.rankingScaleTierName,
      rankingScaleTierNameOutput: elements.rankingScaleTierNameOutput,
      rankingScaleReset: elements.rankingScaleReset,
      mobileRankingCandidates: elements.mobileRankingCandidates,
      mobileRankingCandidatesLabel: elements.mobileRankingCandidatesLabel,
      mobileRankingMenu: elements.mobileRankingMenu,
      mobileRankingUndo: elements.mobileRankingUndo,
      undoEdit: elements.undoEdit,
      mobileRankingRedo: elements.mobileRankingRedo,
      redoEdit: elements.redoEdit,
      mobileRankingMore: elements.mobileRankingMore,
      mobileRankingShowCounts: elements.mobileRankingShowCounts,
      rankingShowCounts: elements.rankingShowCounts,
      mobileRankingShowTitles: elements.mobileRankingShowTitles,
      rankingShowTitles: elements.rankingShowTitles,
      mobileRankingImport: elements.mobileRankingImport,
      importState: elements.importState,
      mobileRankingExport: elements.mobileRankingExport,
      exportState: elements.exportState,
      mobileRankingExportPng: elements.mobileRankingExportPng,
      exportPng: elements.exportPng,
      mobileRankingClearBoard: elements.mobileRankingClearBoard,
      clearBoard: elements.clearBoard,
      mobileRankingClearCandidates: elements.mobileRankingClearCandidates,
      clearCandidates: elements.clearCandidates,
      mobileRankingClearAnnotations: elements.mobileRankingClearAnnotations,
      clearAnnotations: elements.clearAnnotations,
      rankingImmersive: elements.rankingImmersive
    },
    scalePresentation: presentation,
    activePresentation: () => rankingSubject === 'company' ? companyPresentation : presentation,
    subject: () => rankingSubject, getRankingView: () => rankingView,
    enterImmersive: () => immersive.enter(), documentRef: document, windowRef: window
  });
  const setMobileRankingCandidatesOpen = rankingControls.setCandidatesOpen;
  const closeMobileRankingCandidates = rankingControls.closeCandidates;

  const toolbarPopover = createPopoverController({
    documentRef: document, windowRef: window,
    items: [
      { button: elements.cardViewToggle, menu: elements.selectionCardDisplayMenu, kind: 'form' },
      { button: elements.cleanupMenuButton, menu: elements.cleanupMenu, kind: 'actions' }
    ]
  });
  const closeToolbarMenus = () => toolbarPopover.closeAll();

  const immersive = createImmersiveController({
    root: document.body,
    documentRef: document,
    onBeforeChange: value => rankingControls.prepareMode(value),
    onChange(value) {
      closeToolbarMenus();
      previewLoader.cancel();
      previewActions.clear();
      if (value) {
        mediaEditing.cancel();
        if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
        else elements.mediaPreview.open = false;
      }
      rankingView?.setImmersive(value);
      rankingControls.setImmersive(value);
    }
  });
  const mediaDialog = createMediaDialogView({
    documentRef: document,
    decodeFile: mediaEnvironment.decodeFile,
    encodeCrop: ({ image, crop }) => encodeSquareCrop({
      image, crop, createCanvas: size => mediaEnvironment.createCanvas(size, size)
    }),
    renderActive: mediaEnvironment.renderCrop,
    onEditStickers: mediaEditing.editCrop,
    onCreateCustom: mediaEditing.createCustom,
    onReplace: mediaEditing.replace,
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

  const workspaceHostView = createWorkspaceHostView({
    tabs: { selection: elements.modeSelection, ranking: elements.modeRanking, companies: elements.modeCompany, persons: elements.modePerson },
    panels: { selection: elements.selectionView, ranking: elements.rankingView, companies: elements.companyView, persons: elements.personView },
    mobileSelectionView: elements.mobileSelectionView
  });
  const workspaceHost = createWorkspaceHostController({
    renderView: key => workspaceHostView.render(key),
    isMobile: () => window.matchMedia('(max-width: 899px)').matches,
    setCandidatesOpen: setMobileRankingCandidatesOpen,
    suspendCompany: () => companyWorkspace.suspend(),
    suspendDetails: () => detailOpening.suspend(),
    cancelRankingPreload,
    suspendSelection: () => selectionView.suspend(),
    suspendPerson: () => personDirectoryView?.suspend?.()
  });
  const workbenchControls = createWorkbenchControlsView({
    // This exported whitelist contains only the controls owned by this view.
    elements: Object.fromEntries(WORKBENCH_CONTROL_ELEMENTS.map(key => [key, elements[key]])),
    cardDisplayInputs: selectionCardDisplayInputs.map(([, input]) => input),
    scaleInputs: rankingControls.scaleInputs,
    selectedWorksToggle: document.getElementById('selected-works-toggle')
  });
  function renderWorkspace(model) {
    if (companyDirectoryOpen || personDirectoryOpen || model.state.workspaceMode !== 'ranking') void immersive.exit();
    workspaceHost.render({ workspaceMode: model.state.workspaceMode, personDirectoryOpen, companyDirectoryOpen });
    elements.companyBack.hidden = !companyDirectoryOpen || rankingCompanyReturn === null;
    elements.companyBack.textContent = rankingCompanyReturn?.subject === 'company' ? '← 返回会社排榜' : '← 返回作品排榜';
    if (!companyDirectoryOpen && !restoreCompanyRankingPending) rankingCompanyReturn = null;
  }
  async function restoreCompanyRankingContext() {
    const context = rankingCompanyReturn;
    if (!restoreCompanyRankingPending || !context || companyDirectoryOpen || personDirectoryOpen || rankingSubject !== context.subject) return;
    restoreCompanyRankingPending = false;
    rankingCompanyReturn = null;
    if (context.live) await immersive.enter();
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    if (companyDirectoryOpen || personDirectoryOpen || controller.inspectState().workspaceMode !== 'ranking' || rankingSubject !== context.subject) return;
    rankingView?.restoreScroll(context.scroll);
    rankingView?.restoreAnchor(context.anchor);
  }
  async function returnFromCompanyToRanking() {
    if (importBusy || !rankingCompanyReturn) return;
    beginUiNavigation('company-ranking-return');
    rankingSubject = rankingCompanyReturn.subject;
    restoreCompanyRankingPending = true;
    companyDirectoryOpen = false; personDirectoryOpen = false;
    controller.setWorkspaceMode('ranking');
    pushUiLocation();
    await render();
  }
  function renderControlStates(model) {
    const company = companyRanking.inspect();
    const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
    workbenchControls.render(projectWorkbenchControls({
      model: { ...model, ...rankingHistory.inspect('work') },
      company: { ...company, ...rankingHistory.inspect('company') }, rankingSubject, importBusy,
      personAvailable: personRuntime !== null,
      selectionMode, compareMode, companyDirectoryOpen, companySelectionMode,
      bangumiAvailable: confirmedBangumiImportBindings !== null,
      annotationCount: Object.keys(activePresentation.inspect().annotations).length,
      pngExportInProgress: rankingExport.busy,
      showCounts: elements.rankingShowCounts.checked,
      showTitles: elements.rankingShowTitles.checked
    }));
    const commandState = rankingHistory.inspect(rankingSubject);
    elements.undoEdit.title = commandState.undoLabel ? `撤销：${commandState.undoLabel}` : '撤销';
    elements.redoEdit.title = commandState.redoLabel ? `重做：${commandState.redoLabel}` : '重做';
    bangumiWorkspace.syncControls();
  }
  function setImportBusy(nextBusy) {
    importBusy = nextBusy;
    workbenchControls.setBusy(nextBusy);
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
    renderKeeperGuidance();
  }

  function runStateChange(change, visibleBrands = [], interaction = null) {
    if (importBusy) return false;
    const result = rankingHistory.board(change);
    void render(visibleBrands, interaction);
    return result;
  }

  const workbenchResults = createWorkbenchResultsView({
    getFilterView: () => filterView,
    elements: {
      selectedCount: elements.selectedCount, rankedCount: elements.rankedCount,
      unrankedCount: elements.unrankedCount, filterResultCount: elements.filterResultCount,
      catalogResultCount: elements.catalogResultCount,
      rankingHeadingCount: document.querySelector('#ranking-heading-count'),
      catalogTotalCount: document.querySelector('#catalog-total-count')
    }
  });
  const rankingWorkspace = createRankingWorkspaceView({
    getView: () => rankingView,
    syncCandidateTray: () => rankingControls.refreshTray(),
    elements: {
      root: elements.rankingView, showCounts: elements.rankingShowCounts, showTitles: elements.rankingShowTitles,
      subjectWork: elements.rankingSubjectWork, subjectCompany: elements.rankingSubjectCompany,
      candidatesTitle: elements.rankingCandidatesTitle, candidateSearch: elements.rankingCandidateSearch
    }
  });

  async function render(visibleBrands = [], interaction = null) {
    workspaceScroll.capture();
    const state = controller.inspectState();
    const includeFilterCounts = elements.filterDrawer.classList.contains('is-open');
    const queryResult = await workbenchQuery.run({
      state, directoryOpen: personDirectoryOpen || companyDirectoryOpen,
      comparisonIds: comparison.ids, pageNumber: selectionView.getPageNumber(),
      includeFilterCounts, visibleBrands
    }, interaction);
    if (queryResult.status === 'error' && queryResult.generation.isCurrent()) {
      announce(state.workspaceMode === 'ranking' ? '排榜暂时未能加载，请重新进入排榜重试。' : '筛选计算失败，可继续调整条件重试。', 'error');
      console.error(queryResult.error);
    }
    if (queryResult.status !== 'ready') return false;
    const { outcome, generation } = queryResult;
    if (!generation.isCurrent()) return false;
    const model = controller.inspect(outcome.workIds);
    interactionMetrics.stage(interaction, 'controller-ready');
    const ranking = model.state.workspaceMode === 'ranking' && !personDirectoryOpen && !companyDirectoryOpen;
    const companyState = ranking && rankingSubject === 'company' ? companyRanking.inspect() : null;
    const activePresentation = companyState === null ? presentation : companyPresentation;
    const result = projectWorkbenchResults({
      model, outcome, families: presentationFamilies, worksById,
      catalogSize: preparedWorkbench.uiSummary?.workIds.length ?? sample.works.length,
      decorate: workData === null, selectionLimit: USER_WORK_LIMIT,
      selectionMode, compareMode, comparedWorkIds: comparison.ids
    });
    interactionMetrics.stage(interaction, 'presentation-ready');
    const rankingModel = !ranking ? null : rankingSubject === 'company'
      ? buildCompanyRankingModel() : buildRankingModel(model.state, worksById, candidateTitleQuery);
    interactionMetrics.stage(interaction, 'model-ready');
    let renderCoverUrls = null;
    if (!companyDirectoryOpen && ranking && rankingSubject === 'work') {
      renderCoverUrls = await resolveCoverUrls([
        ...rankingModel.candidateWorks, ...rankingModel.tiers.flatMap(tier => tier.works)
      ]);
    } else if (!companyDirectoryOpen && !ranking) {
      renderCoverUrls = await resolveCoverUrls(selectionInitialWorks(result.works));
    }
    if (!generation.isCurrent()) {
      interactionMetrics.cancel(interaction, 'superseded-media');
      return false;
    }
    interactionMetrics.stage(interaction, 'media-ready');
    workbenchResults.renderCounts({ model, companyState, ...result });
    renderWorkspace(model);
    if (personDirectoryOpen) renderPersonDirectory();
    else if (companyDirectoryOpen) renderCompanyDirectory();
    else if (ranking) rankingWorkspace.render({
      model: rankingModel, subject: rankingSubject, presentation: activePresentation.inspect(), coverUrls: renderCoverUrls
    });
    else {
      await selectionView.render(result.selection, renderCoverUrls);
      if (!generation.isCurrent()) return false;
    }
    interactionMetrics.stage(interaction, 'dom-updated');
    workbenchResults.renderFilters({
      model, visibleBrands, includeFilterCounts, counts: outcome.counts,
      resultTotal: result.resultTotal, selectionActive: !ranking && !personDirectoryOpen && !companyDirectoryOpen
    });
    renderControlStates(model);
    workspaceScroll.restore(model.state.workspaceMode, { skip: companyDirectoryOpen });
    lastRenderedModel = model;
    renderKeeperGuidance();
    if (rankingModel !== null && rankingSubject === 'work') {
      void refreshRankingPreload(rankingModel).catch(error => console.warn('ranking media preload unavailable', error));
    } else cancelRankingPreload();
    generation.complete({ empty: !ranking && !personDirectoryOpen && !companyDirectoryOpen && result.resultTotal === 0 });
    interactionMetrics.completeAfterFrame(interaction);
    await restoreCompanyRankingContext();
    return true;
  }

  filterView = createFilterView({
    root: document,
    filters: sample.filters,
    brands,
    releaseYearCounts: preparedWorkbench.uiSummary?.releaseYearCounts ?? sample.works.reduce((counts, work) => {
      const year = Number(work.releaseDate.slice(0, 4));
      counts[year] = (counts[year] ?? 0) + 1;
      return counts;
    }, Object.create(null)),
    onFilterChange(nextFilterState) {
      const interaction = interactionMetrics.begin('filter');
      interactionMetrics.stage(interaction, 'debounce-complete');
      if (nextFilterState.personIds?.length > 0 && personServices.filterIndex === null) {
        const result = controller.setFilterState(nextFilterState);
        void ensurePersonFilterIndex()
          .then(() => render([], interaction))
          .catch(error => {
            interactionMetrics.cancel(interaction, 'person-index-error');
            announce('人物筛选索引加载失败，请稍后重试。', 'error');
            console.error(error);
          });
        return result;
      }
      return runStateChange(() => controller.setFilterState(nextFilterState), [], interaction);
    },
    onAttributeSelectionChange(groupId, selectedIds) {
      const interaction = interactionMetrics.begin('filter');
      interactionMetrics.stage(interaction, 'debounce-complete');
      return runStateChange(() => {
        const current = controller.inspectState().filterState.attributeSelections;
        return controller.setFilterState({
          attributeSelections: {
            ...current,
            [groupId]: [...selectedIds]
          }
        });
      }, [], interaction);
    },
    personOptions: [],
    onPersonFilterFocus() {
      void ensurePersonFilterOptions();
    },
    onRequestCounts(_filterState, visibleBrands) {
      const interaction = interactionMetrics.begin('filter-counts');
      interactionMetrics.stage(interaction, 'debounce-complete');
      void render(visibleBrands, interaction);
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
    documentRef: document,
    onOpen() {
      elements.filterDrawer.setAttribute('aria-busy', 'true');
      void render().finally(() => elements.filterDrawer.setAttribute('aria-busy', 'false'));
    }
  });
  const importCoordinator = createImportCoordinator({
    readText: file => file.text(),
    commit: jsonText => {
      const preview = controller.previewImportJson(jsonText);
      if (!window.confirm(`将恢复 ${preview.selectedCount} 部作品（已排 ${preview.rankedCount} 部，候选 ${preview.unrankedCount} 部）和 ${preview.tierCount} 个等级，替换当前榜单。\n作品选择、等级与顺序可撤销恢复；筛选与卡片设置将按文件应用。\n本机图片和标注不从此 JSON 恢复，已有内容保留。是否继续？`)) return false;
      return rankingHistory.board(() => controller.importJson(jsonText), '导入作品榜');
    },
    setBusy: setImportBusy
  });


  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }

  const bangumiWorkspace = createBangumiImportController({
    elements: {
      bangumiPublicImportDialog: elements.bangumiPublicImportDialog,
      bangumiPublicImportStatus: elements.bangumiPublicImportStatus,
      bangumiPublicImportList: elements.bangumiPublicImportList,
      bangumiPublicImportCapacity: elements.bangumiPublicImportCapacity,
      bangumiPublicImportAppend: elements.bangumiPublicImportAppend,
      bangumiPublicImportSelectionStatus: elements.bangumiPublicImportSelectionStatus,
      bangumiPublicImportResults: elements.bangumiPublicImportResults,
      bangumiPublicUnmatchedList: elements.bangumiPublicUnmatchedList,
      bangumiPublicImportUnmatched: elements.bangumiPublicImportUnmatched,
      bangumiPublicTotal: elements.bangumiPublicTotal,
      bangumiPublicMatchedSubjects: elements.bangumiPublicMatchedSubjects,
      bangumiPublicMappedWorks: elements.bangumiPublicMappedWorks,
      bangumiPublicUnmatched: elements.bangumiPublicUnmatched,
      bangumiPublicUnmatchedCount: elements.bangumiPublicUnmatchedCount,
      bangumiPublicFetch: elements.bangumiPublicFetch,
      bangumiPublicUserInput: elements.bangumiPublicUserInput,
      bangumiImportOpen: elements.bangumiImportOpen,
      mobileBangumiImportOpen: elements.mobileBangumiImportOpen,
      bangumiPublicImportForm: elements.bangumiPublicImportForm,
      bangumiPublicImportCancel: elements.bangumiPublicImportCancel
    },
    loadImportModule: loadBangumiImport, confirmedBindings: confirmedBangumiImportBindings,
    getSelectedWorkIds: () => controller.inspectState().selectedWorkIds,
    workLimit: USER_WORK_LIMIT, titleForWork: id => worksById.get(id)?.title,
    readTitles: preparedWorkbench.workerOwned ? ids => filterWorkerClient.workMetadata(ids, 'titles') : null,
    familyForWork: id => presentationFamilies?.familyForWork(id) ?? null,
    isBusy: () => importBusy,
    onPhase: phase => keeperGuidance.setImportPhase(phase),
    renderGuidance: keeperGuidance.renderImport,
    completeGuide: id => keeperGuidance.complete(id),
    appendWorks: ids => runStateChange(() => controller.selectWorks(ids)),
    onSuccess: announce,
    onOpen({ fromEmpty }) {
      keeperGuidance.openImport(fromEmpty);
      closeToolbarMenus();
      if (elements.mobileRankingMenu.open) closeDialog(elements.mobileRankingMenu);
    },
    onClose: keeperGuidance.closeImport,
    closeDialog, showDialog
  });
  function openBangumiPublicImportDialog(options) { return bangumiWorkspace.open(options); }

  function clearShareHash() { navigation.clearShareHash(); }
  function replaceUiLocation() { navigation.update('replaceState'); }
  function pushUiLocation() { navigation.update('pushState'); }

  const detailPresentation = createWorkDetailView({
    elements: {
      detailsDialog: elements.detailsDialog,
      detailsTitle: elements.detailsTitle,
      detailsBrand: elements.detailsBrand,
      detailsAliases: elements.detailsAliases,
      detailsCover: elements.detailsCover,
      detailsCoverImage: elements.detailsCoverImage,
      detailsRelease: elements.detailsRelease,
      detailsScore: elements.detailsScore,
      detailsTags: elements.detailsTags
    },
    documentRef: document,
    partitionFilters: work => partitionWorkDetailFilters(work, filterById),
    attributeGroupIds: ATTRIBUTE_GROUP_IDS
  });
  const detailVersions = createWorkVersionView({
    elements: {
      detailsVersionToggle: elements.detailsVersionToggle,
      detailsVersionShelf: elements.detailsVersionShelf,
      detailsVersionList: elements.detailsVersionList,
      detailsVersionCurrent: elements.detailsVersionCurrent
    },
    documentRef: document,
    familyForWork: id => presentationFamilies?.familyForWork(id) ?? null,
    onSelectWork(id) {
      const target = workReference(id);
      if (target) void openWorkDetails(target, { keepVersionShelf: true });
    }
  });
  const detailOpening = createWorkDetailController({
    hydrateWork: workData ? async work => (await workData.hydrate([work]))[0] : null,
    readAliases: preparedWorkbench.workerOwned
      ? ids => filterWorkerClient.workMetadata(ids, 'aliases') : null,
    readLocation: () => ({
      workspace: controller.inspectState().workspaceMode,
      personDirectoryOpen, companyDirectoryOpen,
      home: document.documentElement.dataset.home
    }),
    showReady: showWorkDetailsReady,
    onError(error) {
      announce('作品详情资料加载失败，请再次打开重试。', 'error');
      console.error(error);
    }
  });
  function openWorkDetails(work, options = {}) { return detailOpening.open(work, options); }

  function showWorkDetailsReady(work, { push = true, keepVersionShelf = false, aliases = workAliasesById } = {}) {
    detailBrowser.captureFocus({ preserve: keepVersionShelf });
    currentWorkDetailId = work.workId;
    telemetry.recordWorkOpen(work.workId);
    void workDetailResources.start(work);
    detailPresentation.render(work, { workAliasesById: aliases, onOpenCompany: openCompanyDirectory, projectEntityRuntime: projectResources.current, detailMedia: {
      coverSources: coverSourcesForWork,
      fallbackUrl: resolveAssetUrl('assets/cover-unavailable.webp', assetBase),
      open: detailWork => openMediaPreview(detailWork, { immersive: true }).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      })
    }, egsSnapshotAt: catalogSource.value.snapshot?.generatedAt });
    void workDetailStats.load(work);
    const workId = String(work.workId);
    const alreadyCompared = comparison.ids.includes(workId);
    elements.detailsCompareButton.textContent = alreadyCompared ? '移出比较' : '加入比较';
    elements.detailsCompareButton.setAttribute('aria-pressed', String(alreadyCompared));
    elements.detailsCompareButton.onclick = () => {
      toggleCompareWork(work, !comparison.ids.includes(workId));
      const active = comparison.ids.includes(workId);
      elements.detailsCompareButton.textContent = active ? '移出比较' : '加入比较';
      elements.detailsCompareButton.setAttribute('aria-pressed', String(active));
      if (active && elements.detailsDialog.open) elements.detailsDialog.close();
    };
    detailBrowser.lock();
    detailVersions.render(work, { keepExpanded: keepVersionShelf });
    if (push) pushUiLocation();
  }

  const sharedSelection = createSharedSelectionController({
    locationRef: window.location, datasetVersion: sample.sampleId,
    authorityWorkIds: preparedWorkbench.uiSummary?.workIds ?? sample.works.map(work => work.workId),
    selectedIds: () => controller.inspectState().selectedWorkIds,
    importWorks: (ids, options) => runStateChange(() => controller.importSharedWorks(ids, options)),
    clearHash: clearShareHash, announce,
    view: createShareImportView({
      elements: { dialog: elements.shareImportDialog, message: elements.shareImportMessage,
        count: elements.shareImportCount, missing: elements.shareImportMissing,
        append: elements.shareImportAppend, replace: elements.shareImportReplace },
      openDialog: showDialog, closeDialog
    })
  });
  function openShareImportDialog() { return sharedSelection.open(); }

  function openMobileShareWarning() {
    if (parseSelectionShare(window.location) === null) return false;
    showDialog(elements.mobileShareWarning);
    return true;
  }

  const navigation = createWorkbenchNavigationController({
    locationRef: window.location, historyRef: window.history,
    snapshot: () => projectUiLocation({
      state: controller.inspectState(), workId: currentWorkDetailId, subject: rankingSubject,
      workPage: selectionView?.getPageNumber?.() ?? 1,
      person: { open: personDirectoryOpen, id: selectedPersonId, query: personQuery, role: personRole, page: personDirectoryView?.getPageNumber?.() ?? 1 },
      company: { open: companyDirectoryOpen, id: selectedCompanyId, query: companyQuery, sort: companySort, hasImage: companyHasImage, page: companyDirectoryView?.getPageNumber?.() ?? 1 }
    }),
    isHome: () => document.documentElement.dataset.home === 'true',
    isHomeRoute: () => document.documentElement.classList.contains('galpedia') && (!window.location.hash || window.location.hash === '#home'),
    invalidate() {
      rankingLocatorView?.close();
      workbenchQuery.suspend(); companyWorkspace.suspend(); detailOpening.suspend();
      selectionView.suspend(); cancelRankingPreload();
    },
    home() {
      void immersive.exit();
      currentWorkDetailId = null;
      if (elements.detailsDialog.open) elements.detailsDialog.close();
      if (elements.personDetailDialog.open) elements.personDetailDialog.close();
    },
    ranking: { enter(route) {
      restoreCompanyRankingPending = companyDirectoryOpen && rankingCompanyReturn?.subject === route.subject;
      companyDirectoryOpen = false; personDirectoryOpen = false; setWorkSelectionMode(false);
      currentWorkDetailId = null; rankingSubject = route.subject; controller.setWorkspaceMode('ranking');
    } },
    companies: {
      enter(route) {
        setWorkSelectionMode(false);
        companyQuery = route.query; companySort = route.sort; companyHasImage = route.hasImage;
        elements.companyHasImage.checked = companyHasImage;
        openCompanyDirectory(route.companyId, { push: false });
      },
      setPage: page => companyDirectoryView.setPageNumber(page, { scroll: false, notify: false })
    },
    persons: {
      enter(route) {
        personDetailReturnId = null; companyDirectoryOpen = false; personDirectoryOpen = true;
        setWorkSelectionMode(false); selectedPersonId = route.personId;
        personQuery = route.query ?? ''; personRole = route.role ?? 'all'; elements.personSearch.value = personQuery;
      },
      show() { renderWorkspace(lastRenderedModel ?? controller.inspect([])); renderPersonDirectory(); },
      ensureReady: () => ensurePersonRuntime(),
      finish(route) {
        renderWorkspace(lastRenderedModel ?? controller.inspect([]));
        personDirectoryView.setRoleFilter?.(personRole); renderPersonDirectory();
        if (route.personId !== null) personDirectoryView.setSelected(route.personId);
      }
    },
    works: {
      enter(route) {
        companyDirectoryOpen = false; personDirectoryOpen = false; selectedPersonId = null;
        setWorkSelectionMode(false); rankingSubject = 'work';
        const [sortKey, sortDirection] = route.sort.split('-');
        controller.setWorkspaceMode('selection');
        // URL carries title/sort only: do not merge a previous tag/attribute draft.
        controller.clearFilters();
        controller.setFilterState({ titleQuery: route.query, sortKey, sortDirection });
        currentWorkDetailId = null;
      },
      setPage: page => selectionView.setPageNumber(page, { scroll: false, notify: false }),
      find: workReference,
      open: work => openWorkDetails(work, { push: false })
    },
    render: () => render()
  });
  function beginUiNavigation(key) { return navigation.begin(key); }
  function applyUiLocation() { return navigation.apply(); }

  connectWorkbenchNavigation({
    windowRef: window, tabs: [elements.modeSelection, elements.modeRanking],
    isBusy: () => importBusy, applyLocation: applyUiLocation
  });
  elements.detailsDialog.addEventListener('close', () => {
    if (elements.detailsDialog.open) return; // Ignore a queued close from the previous visit.
    workDetailStats.suspend();
    detailOpening.suspend();
    detailPresentation.suspend();
    detailBrowser.unlock();
    workDetailResources.suspend();
    workDetailCreditsView.clear();
    const restoreFocus = detailBrowser.takeFocusRestore();
    if (currentWorkDetailId === null || navigation.applying) return;
    const returnPersonId = personDetailReturnId;
    personDetailReturnId = null;
    currentWorkDetailId = null;
    if (returnPersonId !== null && returnPersonId !== undefined) {
      personDirectoryOpen = true;
      selectedPersonId = returnPersonId;
      const returnTicket = beginUiNavigation('person-return');
      void ensurePersonRuntime().then(() => {
        if (!returnTicket.isCurrent() || !personDirectoryOpen || selectedPersonId !== returnPersonId) return;
        renderWorkspace(lastRenderedModel ?? controller.inspect([]));
        personDirectoryView?.setSelected?.(returnPersonId);
        replaceUiLocation();
      });
    }
    pushUiLocation();
    restoreFocus();
  });
  elements.workCompareDialog.addEventListener('close', () => {
    if (!elements.workCompareDialog.open) comparison.suspend();
  });
  elements.workCompareDialog.addEventListener('toggle', () => {
    document.documentElement.classList.toggle('work-compare-open', elements.workCompareDialog.open);
  });
  elements.workCompareOpen.addEventListener('click', renderWorkCompare);
  elements.workCompareClear.addEventListener('click', () => {
    comparison.clear();
  });
  renderCompareBar();

  elements.shareImportAppend.addEventListener('click', () => sharedSelection.commit('append'));
  elements.shareImportReplace.addEventListener('click', () => sharedSelection.commit('replace'));
  elements.shareImportCancel.addEventListener('click', () => sharedSelection.cancel());
  elements.mobileShareWarningDismiss.addEventListener('click', () => {
    closeDialog(elements.mobileShareWarning);
    clearShareHash();
  });

  elements.modeSelection.addEventListener('click', () => {
    beginUiNavigation('modeSelection');
    closeMobileRankingCandidates();
    companyDirectoryOpen = false;
    personDirectoryOpen = false;
    selectedPersonId = null;
    personDetailReturnId = null;
    compareMode = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const result = runStateChange(() => {
      return controller.setWorkspaceMode('selection');
    });
    replaceUiLocation();
    return result;
  });
  elements.modeRanking.addEventListener('click', () => {
    beginUiNavigation('modeRanking');
    companyDirectoryOpen = false;
    personDirectoryOpen = false;
    selectedPersonId = null;
    personDetailReturnId = null;
    compareMode = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
  });
  elements.modeCompany.addEventListener('click', () => {
    const navigation = beginUiNavigation('modeCompany');
    const interaction = interactionMetrics.begin('company-directory');
    closeMobileRankingCandidates();
    closeToolbarMenus();
    compareMode = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    personDetailReturnId = null;
    const open = () => {
      if (!navigation.isCurrent()) return;
      if (lastRenderedModel === null) {
        const timer = window.setTimeout(open, 0);
        navigation.scope.add(() => window.clearTimeout(timer));
        return;
      }
      openCompanyDirectory(null, { interaction });
    };
    open();
  });
  elements.modePerson.addEventListener('click', () => {
    const navigation = beginUiNavigation('modePerson');
    const interaction = interactionMetrics.begin('person-directory');
    closeMobileRankingCandidates();
    closeToolbarMenus();
    companyDirectoryOpen = false;
    personDirectoryOpen = false;
    selectedPersonId = null;
    personDetailReturnId = null;
    personDirectoryOpen = true;
    personRole = 'all';
    compareMode = false;
    setWorkSelectionMode(false);
    companySelectionMode = false;
    selectedPersonId = null;
    const open = async () => {
      renderWorkspace(lastRenderedModel ?? controller.inspect([]));
      renderPersonDirectory();
      try {
        await ensurePersonRuntime();
        if (!navigation.isCurrent() || !personDirectoryOpen) return;
        personDirectoryView.setRoleFilter?.(personRole);
        renderPersonDirectory();
        renderWorkspace(lastRenderedModel ?? controller.inspect([]));
        replaceUiLocation();
        interactionMetrics.stage(interaction, 'person-ready');
      } catch (error) {
        if (!navigation.fail(error)) return;
        announce('人物目录加载失败，请稍后重试。', 'error');
        console.error(error);
      }
    };
    void open();
  });
  elements.companyBack.addEventListener('click', () => {
    if (rankingCompanyReturn) { void returnFromCompanyToRanking(); return; }
    beginUiNavigation('companyBack');
    companyDirectoryOpen = false;
    rankingSubject = 'work';
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    void render();
    pushUiLocation();
  });
  elements.companyRankingToggle.addEventListener('click', () => {
    beginUiNavigation('companyRankingToggle');
    companyDirectoryOpen = false;
    rankingSubject = 'company';
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
  });
  elements.browseModeToggle.addEventListener('click', () => {
    if (importBusy || companyDirectoryOpen || lastRenderedModel?.state.workspaceMode === 'ranking') return;
    compareMode = false;
    setWorkSelectionMode(false);
    void render();
  });
  elements.selectionModeToggle.addEventListener('click', () => {
    if (compareMode) return;
    setWorkSelectionMode(!selectionMode);
    void render();
  });
  elements.compareModeToggle.addEventListener('click', () => {
    if (companyDirectoryOpen || lastRenderedModel?.state.workspaceMode === 'ranking') return;
    setCompareMode(!compareMode);
  });
  elements.quickRankingEntry.addEventListener('click', () => {
    if (importBusy || companyDirectoryOpen) return;
    if (controller.inspectState().selectedWorkIds.length === 0) {
      setCompareMode(false);
      setWorkSelectionMode(true);
      void render();
      announce('先选择要排榜的作品，然后点击“进入排榜”。');
      return;
    }
    setCompareMode(false);
    setWorkSelectionMode(false);
    rankingSubject = 'work';
    void runStateChange(() => controller.setWorkspaceMode('ranking'));
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
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
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
    const result = runStateChange(() => controller.setWorkspaceMode('ranking'));
    pushUiLocation();
    return result;
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
      if (!navigation.isCurrent()) return;
      if (lastRenderedModel === null) {
        const timer = window.setTimeout(open, 0);
        navigation.scope.add(() => window.clearTimeout(timer));
        return;
      }
      openCompanyDirectory();
    };
    open();
  });
  for (const [key, input] of selectionCardDisplayInputs) {
    input.addEventListener('change', () => {
      selectionCardPresentation.setDisplay({ [key]: input.checked });
      syncSelectionCardDisplay();
    });
  }
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
    rankingHistory.annotations(rankingSubject, activePresentation, () => activePresentation.clearAnnotations(), '清空标注');
    rankingView.setAnnotations(activePresentation.inspect().annotations);
    closeToolbarMenus();
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
  });
  for (const [button, direction] of [[elements.undoEdit, 'undo'], [elements.redoEdit, 'redo']]) {
    button.addEventListener('click', () => {
      if (importBusy) return;
      rankingHistory[direction](rankingSubject);
      const activePresentation = rankingSubject === 'company' ? companyPresentation : presentation;
      rankingView?.setAnnotations(activePresentation.inspect().annotations);
      renderControlStates(lastRenderedModel ?? controller.inspect([]));
      void render();
    });
  }
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
        if (file.size > 2000000) throw new TypeError('company JSON too large');
        const data = JSON.parse(await file.text());
        if (!window.confirm(`将恢复会社榜（${data.selectedCompanyIds?.length ?? 0} 家）。${data.tiers ? '同时恢复等级名称、颜色与顺序。' : '旧文件不含等级定义，沿用当前等级。'} 可通过撤销恢复导入前的榜单。`)) return;
        rankingHistory.board(() => companyRanking.importState(data), '导入会社榜');
        companyCandidateQuery = '';
        workspaceScroll.resetRanking();
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
    if (outcome.status === 'success' && outcome.value === false) return;
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
    workspaceScroll.reset();
    workbenchResults.reset();
    lastRenderedModel = null;
    void render();
    announce('JSON 状态已导入。', 'success');
  });
  elements.exportState.addEventListener('click', () => rankingExport.json());
  elements.exportPng.addEventListener('click', () => { void rankingExport.png(); });

  let restoredLocation = false;
  await startupMetrics.measureAsync('first-render', async () => {
    restoredLocation = await applyUiLocation();
    if (!restoredLocation) await render();
  });
  keeperGuidance.restore();
  openShareImportDialog();
  let globalSearch = null;
  return { search: query => {
    globalSearch ??= createGalpediaSearch({
      works: preparedWorkbench.workerOwned ? [] : ratedDisplayWorks,
      searchWorks: preparedWorkbench.workerOwned ? query => filterWorkerClient.searchWorks(query) : null,
      companyDirectory,
      enrichment: { workAliasesById: workerWorkAliasesById, workPinyinById: workerWorkPinyinById, workDisplayTitlesById },
      loadPersons: async () => {
        if (personPerformanceRuntime) {
          try {
            return (await personPerformanceRuntime.loadDirectory()).records;
          } catch (error) {
            console.warn('person performance search index unavailable; using the core person directory', error);
            personPerformanceRuntime = null;
          }
        }
        return personWorkspace.records ?? [];
      }
    });
    return globalSearch(query);
  } };
}

if (typeof document !== 'undefined') installExternalCoverImageRecovery(document);
export const ready = typeof document !== 'undefined' ? initialize().catch(error => {
  showStartupFailure(error);
  throw error;
}) : Promise.resolve(null);
