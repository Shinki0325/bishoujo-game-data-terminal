import {
  resolveAssetUrl,
  validateRelativeAssetPath
} from './lib/asset-url.js';
import {
  isBackendBetaFixture,
  prepareBackendBetaFixture
} from './lib/backend-beta-fixture.js';
import { createHistory } from './lib/history.js';
import { createAppController } from './lib/app-controller.js';
import { createCustomWork } from './lib/custom-work.js';
import { prepareEnrichmentSidecar } from './lib/enrichment-sidecar.js';
import { prepareCompanyProfileSidecar } from './lib/company-profile-sidecar.js';
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
import { createMediaPreviewActions } from './lib/media-preview-actions.js';
import { createRankingHelp } from './lib/ranking-help.js';
import { createRankingPreloader, preloadImage } from './lib/ranking-preloader.js';
import { createImmersiveController, createRankingPresentation } from './lib/ranking-presentation.js';
import { createPreviewMediaResolver } from './lib/preview-media.js';
import {
  configuredAssetBase,
  DATA_URLS,
  PREVIEW_MANIFEST_PATH
} from './lib/runtime-config.js';
import { selectionStateForResults } from './lib/selection.js';
import { StateValidationError, USER_WORK_LIMIT } from './lib/state.js';
import { createStartupMetrics } from './lib/startup-metrics.js';
import { appendTier } from './lib/tier-config.js';
import {
  ATTRIBUTE_GROUP_IDS as ATTRIBUTE_GROUP_ORDER,
  FILTER_GROUP_ORDER
} from './lib/attribute-filters.js';
import { createFilterView } from './views/filter-view.js';
import { buildRankingModel, createRankingView } from './views/ranking-view.js';
import { createSelectionView, selectionInitialWorks } from './views/selection-view.js';
import { createMobileSelectionView } from './views/mobile-selection-view.js';
import { createCompanyDirectoryView, companyImageUrl } from './views/company-directory-view.js';
import { createCompanyRankingView } from './views/company-ranking-view.js';
import { createCompanyRanking } from './lib/company-ranking.js';
import { createMediaDialogView } from './views/media-dialog-view.js';
import { createStickerEditorView } from './views/sticker-editor-view.js';
import {
  buildSelectionShareUrl,
  decodeSelectionShare,
  parseSelectionShare
} from './lib/share-selection.js';
import { planSharedSelectionImport } from './lib/share-import.js';

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
  modeSelection: requiredElement('mode-selection'),
  modeRanking: requiredElement('mode-ranking'),
  modeCompany: requiredElement('mode-company'),
  selectionView: requiredElement('selection-view'),
  rankingView: requiredElement('ranking-view'),
  rankingSubjectWork: requiredElement('ranking-subject-work'),
  rankingSubjectCompany: requiredElement('ranking-subject-company'),
  companyView: requiredElement('company-view'),
  companySearch: requiredElement('company-directory-search'),
  companySort: requiredElement('company-sort'),
  companyRankingToggle: requiredElement('company-ranking-toggle'),
  companyRankingClose: requiredElement('company-ranking-close'),
  companyRanking: requiredElement('company-ranking'),
  companyBack: requiredElement('company-back'),
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
  filterToggle: requiredElement('filter-toggle'),
  filterBackdrop: requiredElement('filter-backdrop'),
  filterDrawer: requiredElement('filter-drawer'),
  filterClose: requiredElement('filter-close'),
  filterApply: requiredElement('filter-apply'),
  filterResultCount: requiredElement('filter-result-count'),
  catalogResults: requiredElement('catalog-results'),
  tierBoard: requiredElement('tier-board'),
  rankingCandidateSearch: requiredElement('ranking-candidate-search'),
  rankingCandidateGrid: requiredElement('ranking-candidate-grid'),
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
  detailsBrand: requiredElement('details-brand'),
  detailsRelease: requiredElement('details-release'),
  detailsScore: requiredElement('details-score'),
  detailsAliasRow: requiredElement('details-alias-row'),
  detailsAliases: requiredElement('details-aliases'),
  detailsTags: requiredElement('details-tags'),
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

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  return response.json();
}

async function fetchJsonWithSha256(url, label) {
  const response = await fetch(url, { cache: 'no-store' });
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

function showDetails(work, filterById, workAliasesById = null, onOpenCompany = null) {
  elements.detailsTitle.textContent = work.title;
  elements.detailsBrand.replaceChildren();
  const brandButton = document.createElement('button');
  brandButton.type = 'button';
  brandButton.className = 'details-company-link';
  brandButton.textContent = work.brandName;
  brandButton.addEventListener('click', () => onOpenCompany?.(work.brandId));
  elements.detailsBrand.append(brandButton);
  const aliases = workAliasesById?.get?.(work.workId) ?? [];
  elements.detailsAliasRow.hidden = aliases.length === 0;
  elements.detailsAliases.textContent = aliases.join(' / ');
  elements.detailsRelease.textContent = work.releaseDate || '未记录';
  elements.detailsScore.textContent = `${work.median} / ${work.voteCount} 票`;
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
  const startupMetrics = createStartupMetrics();
  const assetBase = configuredAssetBase();
  const previewMedia = createPreviewMediaResolver({
    assetBase,
    fetchJson: () => fetchJson(
      resolveAssetUrl(PREVIEW_MANIFEST_PATH, assetBase),
      '高清预览 manifest'
    )
  });
  assertRuntimeContracts();
  const [
    catalogSource,
    backendIndexesSource,
    assetsManifestSource,
    filterAuthoritySource,
    workGroupAuthoritySource,
    reviewQueueSource,
    enrichmentSource,
    companyProfileSource
  ] = await startupMetrics.measureAsync('runtime-fetch-and-parse', () => Promise.all([
    fetchJsonWithSha256(DATA_URLS.catalog, 'catalog'),
    fetchJsonWithSha256(DATA_URLS.indexes, 'Backend indexes'),
    fetchJsonWithSha256(DATA_URLS.assetsManifest, 'assets manifest'),
    fetchJsonWithSha256(DATA_URLS.filterAuthority, '筛选权威'),
    fetchJsonWithSha256(DATA_URLS.workGroups, '作品组权威'),
    fetchJsonWithSha256(DATA_URLS.workGroupReviewQueue, '作品组 review queue'),
    fetchOptionalJsonWithSha256(DATA_URLS.enrichment, 'alias enrichment sidecar'),
    fetchOptionalJsonWithSha256(DATA_URLS.companyProfile, 'company profile sidecar')
  ]));
  const sampleSource = catalogSource.value;
  const backendIndexes = backendIndexesSource.value;
  const assetsManifest = assetsManifestSource.value;
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
    sourceHashes: {
      indexes: backendIndexesSource.sha256,
      assetsManifest: assetsManifestSource.sha256,
      filterAuthority: filterAuthoritySource.sha256,
      workGroupAuthority: workGroupAuthoritySource.sha256,
      ...(sampleSource.schemaVersion === 'egs-tier-full-v1'
        ? {}
        : { reviewQueue: reviewQueueSource.sha256 })
    }
  }));
  let enrichment = null;
  if (enrichmentSource !== null) {
    try {
      enrichment = prepareEnrichmentSidecar(enrichmentSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: new Set(sample.works.map(work => work.workId)),
        companyIds: new Set(sample.brands.map(brand => brand.brandId))
      });
    } catch (error) {
      console.warn('alias enrichment sidecar rejected; continuing without aliases', error);
    }
  }
  const workAliasesById = enrichment?.workAliasesById ?? null;
  const workPinyinById = enrichment?.workPinyinById ?? null;
  const workerWorkAliasesById = workAliasesById === null
    ? null
    : new Map(workAliasesById);
  const workerWorkPinyinById = workPinyinById === null
    ? null
    : new Map(workPinyinById);
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
        companyIds: new Set(sample.brands.map(brand => brand.brandId))
      });
    } catch (error) {
      console.warn('company profile sidecar rejected; continuing without avatars', error);
    }
  }
  const companyDirectory = buildCompanyDirectory({
    brands,
    works: sample.works,
    companyAliasesById: enrichment?.companyAliasesById,
    companyPinyinById: enrichment?.companyPinyinById,
    avatarByCompanyId: companyProfile?.avatarByCompanyId
  });
  const filterById = new Map(sample.filters.map(filter => [filter.filterId, filter]));
  const worksById = new Map(sample.works.map(work => [work.workId, work]));
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
    sample,
    localWorks: customWorks,
    storage: browserStorage(),
    confirm: message => window.confirm(message),
    announce,
    now: () => new Date(),
    downloadJson
  });
  const filterWorkerClient = createFilterWorkerClient({
    workerFactory: () => new Worker(
      new URL('./workers/filter-worker.js', import.meta.url),
      { type: 'module' }
    ),
    timeoutMs: 10000
  });
  await startupMetrics.measureAsync('filter-worker-init', () => filterWorkerClient.init({
    works: sample.works,
    knownFilterIds: sample.filters.map(filter => filter.filterId),
    brands,
    backendIndexes: sample.backendIndexes,
    workAliasesById: workerWorkAliasesById,
    workPinyinById: workerWorkPinyinById
  }));
  window.addEventListener('pagehide', () => filterWorkerClient.terminate(), { once: true });

  let filterView;
  let importBusy = false;
  let candidateTitleQuery = '';
  let selectionScrollPosition = { top: 0, left: 0 };
  let mobileSelectionScrollPosition = { top: 0, left: 0 };
  const mobileCompanionMedia = window.matchMedia('(max-width: 899px), (pointer: coarse)');
  let mobileCompanion = mobileCompanionMedia.matches;
  let rankingScrollPosition = {
    top: 0,
    left: 0,
    tiers: {},
    poolLeft: 0
  };
  let renderedWorkspaceMode = null;
  let renderedFilterKey = null;
  let lastRenderedModel = null;
  let replacementWork = null;
  let companyDirectoryOpen = false;
  let rankingSubject = 'work';
  let companyQuery = '';
  let companySort = 'workCount-desc';
  let selectedCompanyId = null;
  const companyRanking = createCompanyRanking({
    companies: companyDirectory.companies,
    tiers: controller.inspectState().tiers,
    storage: window.localStorage
  });
  let companyRankingView;
  elements.rankingView.append(elements.companyRanking);
  elements.companyRankingToggle.textContent = '进入排榜';
  elements.companyRankingClose.textContent = '返回会社';

  function openCompanyDirectory(companyId = null) {
    companyDirectoryOpen = true;
    selectedCompanyId = companyId;
    if (elements.detailsDialog.open) elements.detailsDialog.close();
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    renderCompanyDirectory();
  }

  async function coverUrlForWork(work) {
    if (mediaStore !== null && work.localMediaKind === 'custom') {
      return mediaStore.urlForCustom(work.workId);
    }
    if (mediaStore !== null) {
      const replacement = await mediaStore.urlForReplacement(work.workId);
      if (replacement !== null) return replacement;
    }
    return resolveAssetUrl(work.coverPath, assetBase);
  }

  async function resolveCoverUrls(works) {
    const entries = await Promise.all(works.map(async work => [work.workId, await coverUrlForWork(work)]));
    return new Map(entries);
  }

  async function previewUrlForWork(work) {
    if (mediaStore !== null && work.localMediaKind === 'custom') {
      return mediaStore.urlForCustom(work.workId);
    }
    if (mediaStore !== null) {
      const replacement = await mediaStore.urlForReplacement(work.workId);
      if (replacement !== null) return replacement;
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
      const isImmersive = document.body.classList.contains('is-ranking-immersive');
      const hasReplacement = !isImmersive
        && work.localMediaKind !== 'custom'
        && mediaStore !== null
        && await mediaStore.replacementFor(work.workId) !== null;
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

  function openMediaPreview(work) {
    return previewLoader.open(work);
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
    root: elements.catalogResults,
    onToggleWork(work, selected) {
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
      showDetails(work, filterById, workAliasesById, openCompanyDirectory);
    },
    onCardViewChange(cardView) {
      return runStateChange(() => controller.setSelectionCardView(cardView));
    },
    onFilterChange(patch) {
      return runStateChange(() => controller.setFilterState(patch));
    },
    assetBase
  });
  const filterIconHost = elements.filterToggle.querySelector('.toolbar-button-icon');
  filterIconHost?.replaceChildren(createActionIcon(document, 'filter'));
  let companyDirectoryView;
  function renderCompanyDirectory() {
    const [sortKey, direction] = companySort.split('-');
    const companies = searchCompanyDirectory(companyDirectory, companyQuery, { sortKey, direction });
    const selected = companies.find(company => company.companyId === selectedCompanyId)
      ?? companyDirectory.companies.find(company => company.companyId === selectedCompanyId)
      ?? companies[0]
      ?? null;
    selectedCompanyId = selected?.companyId ?? null;
    companyDirectoryView.render({
      companies,
      selectedCompanyId,
      selectedWorks: selected ? worksForCompany(companyDirectory, selected.companyId) : [],
      selectedCompanyIds: companyRanking.inspect().selectedSet,
      imageUrlForCompany: company => companyImageUrl(company, assetBase)
    });
  }

  function renderCompanyRanking() {
    elements.rankingView.classList.toggle('is-company-ranking', rankingSubject === 'company');
    elements.companyRanking.hidden = rankingSubject !== 'company';
    elements.rankingSubjectWork.setAttribute('aria-pressed', String(rankingSubject === 'work'));
    elements.rankingSubjectCompany.setAttribute('aria-pressed', String(rankingSubject === 'company'));
    companyRankingView?.render({
      companies: companyDirectory.companies,
      tiers: controller.inspectState().tiers,
      ranking: companyRanking.inspect(),
      imageUrlForCompany: company => companyImageUrl(company, assetBase)
    });
  }
  companyDirectoryView = createCompanyDirectoryView({
    root: elements.companyView,
    onSearch(query) {
      companyQuery = query;
      renderCompanyDirectory();
    },
    onSort(value) {
      companySort = value;
      renderCompanyDirectory();
    },
    onSelectCompany(companyId) {
      selectedCompanyId = companyId;
      renderCompanyDirectory();
    },
    onToggleCompany(companyId, selected) {
      companyRanking.toggle(companyId, selected);
      renderCompanyDirectory();
    },
    onOpenWork(work) {
      showDetails(work, filterById, workAliasesById, openCompanyDirectory);
    }
  });
  companyRankingView = createCompanyRankingView({
    root: elements.rankingView,
    onMoveToTier(companyId, tierId) {
      companyRanking.moveToTier(companyId, tierId);
      renderCompanyRanking();
    },
    onMoveToCandidates(companyId) {
      companyRanking.moveToCandidates(companyId);
      renderCompanyRanking();
    },
    onOpenCompany(companyId) {
      openCompanyDirectory(companyId);
    }
  });
  let mobileHelpShown = false;
  const mobileHelpStorageKey = 'egs-tier-mobile-help-seen-v1';

  function mobileHelpWasSeen() {
    try {
      return window.localStorage.getItem(mobileHelpStorageKey) === '1';
    } catch {
      return false;
    }
  }

  function showMobileHelpOnce() {
    if (!mobileCompanion || mobileHelpShown || mobileHelpWasSeen()) return;
    mobileHelpShown = true;
    if (typeof elements.mobileHelpDialog.showModal === 'function') elements.mobileHelpDialog.showModal();
    else elements.mobileHelpDialog.open = true;
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
      return runStateChange(() => selected
        ? controller.selectWorks([work.workId])
        : controller.deselectWorks([work.workId]));
    },
    onOpenDetails(work) {
      showDetails(work, filterById, workAliasesById, openCompanyDirectory);
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
  const rankingView = createRankingView({
    root: elements.rankingView,
    onMoveToTier(workId, tierId, insertionIndex) {
      return runStateChange(() => controller.moveToTier(workId, tierId, insertionIndex));
    },
    onMoveToUnranked(workId) {
      return runStateChange(() => controller.moveToUnranked(workId));
    },
    onTierConfigChange(nextTiers) {
      return runStateChange(() => controller.saveTierConfig(nextTiers));
    },
    onTierDelete(tierId) {
      const state = controller.inspectState();
      const tier = state.tiers.find(item => item.id === tierId);
      if (!tier || state.tiers.length <= 3) return false;
      const count = state.tierOrder[tierId]?.length ?? 0;
      if (count > 0 && !window.confirm(`等级“${tier.name}”中有 ${count} 部作品，删除后这些作品将移回候选区。是否继续？`)) {
        return false;
      }
      const nextTiers = state.tiers.filter(item => item.id !== tierId);
      return runStateChange(() => controller.saveTierConfig(nextTiers));
    },
    onAddTier() {
      const appended = appendTier(controller.inspectState().tiers, () => crypto.randomUUID());
      rankingView.focusTier(appended.at(-1).id);
      return runStateChange(() => controller.saveTierConfig(appended));
    },
    onRequestMediaImport(files) {
      if (files === null) elements.mediaFiles.click();
      else openMediaUpload(files);
    },
    onOpenDetails(work) {
      showDetails(work, filterById, workAliasesById, openCompanyDirectory);
    },
    onOpenMedia(work) {
      void openMediaPreview(work).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      });
    },
    onCandidateSearch(query) {
      if (importBusy) return;
      candidateTitleQuery = query;
      if (lastRenderedModel?.state.workspaceMode !== 'ranking') return;
      rankingScrollPosition = rankingView.captureScroll();
      void render();
    },
    onAnnotationChange(workId, value) {
      presentation.setAnnotation(workId, value);
      rankingView.setAnnotations(presentation.inspect().annotations);
      renderControlStates(lastRenderedModel ?? controller.inspect([]));
    },
    onRemoveCandidate(workId) {
      return runStateChange(() => controller.deselectWorks([workId]));
    },
    onRemoveCandidates(workIds) {
      return runStateChange(() => controller.deselectWorks(workIds));
    },
    onMoveCandidatesToTier(workIds, tierId, insertionIndex) {
      return runStateChange(() => controller.moveCandidatesToTier(workIds, tierId, insertionIndex));
    },
    assetBase
  });
  const presentation = createRankingPresentation({
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value)
  });
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
    if (event.key === 'Escape') closeToolbarMenus();
  });
  const immersive = createImmersiveController({
    root: document.body,
    documentRef: document,
    onChange(value) {
      closeToolbarMenus();
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
          stickerDocument: record.stickerDocument
        });
      } else {
        await mediaStore.putReplacement({ workId: work.workId, ...record });
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

  function captureWorkspaceScroll() {
    if (mobileCompanion) {
      mobileSelectionScrollPosition = mobileSelectionView.captureScroll();
    } else if (renderedWorkspaceMode === 'selection') {
      selectionScrollPosition = selectionView.captureScroll();
    } else if (renderedWorkspaceMode === 'ranking') {
      rankingScrollPosition = rankingView.captureScroll();
    }
  }

  function renderWorkspace(model) {
    document.body.classList.toggle('is-mobile-companion', mobileCompanion);
    if (companyDirectoryOpen) {
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
    if (mobileCompanion) {
      if (model.state.workspaceMode === 'ranking' && rankingSubject === 'company') {
        elements.modeSelection.setAttribute('aria-selected', 'false');
        elements.modeRanking.setAttribute('aria-selected', 'true');
        elements.modeCompany.setAttribute('aria-selected', 'false');
        elements.modeSelection.tabIndex = -1;
        elements.modeRanking.tabIndex = 0;
        elements.modeCompany.tabIndex = -1;
        elements.selectionView.hidden = true;
        elements.rankingView.hidden = false;
        elements.companyView.hidden = true;
        elements.mobileSelectionView.hidden = true;
        return;
      }
      elements.modeSelection.setAttribute('aria-selected', 'false');
      elements.modeRanking.setAttribute('aria-selected', 'false');
      elements.modeSelection.tabIndex = -1;
      elements.modeRanking.tabIndex = -1;
      elements.modeCompany.tabIndex = -1;
      elements.selectionView.hidden = true;
      elements.rankingView.hidden = true;
      elements.mobileSelectionView.hidden = false;
      return;
    }
    const ranking = model.state.workspaceMode === 'ranking';
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
    elements.modeSelection.disabled = importBusy;
    elements.modeRanking.disabled = importBusy;
    elements.undoEdit.disabled = importBusy || !model.canUndo;
    elements.redoEdit.disabled = importBusy || !model.canRedo;
    elements.clearBoard.disabled = importBusy || model.rankedCount === 0;
    elements.clearCandidates.disabled = importBusy || model.selectedCount === 0;
    elements.clearAnnotations.disabled = importBusy
      || Object.keys(presentation.inspect().annotations).length === 0;
    elements.rankingCandidateSearch.disabled = importBusy || model.unrankedCount === 0;
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
    elements.exportPng.disabled = importBusy || model.rankedCount === 0 || pngExportInProgress;
  }

  function setImportBusy(nextBusy) {
    importBusy = nextBusy;
    setWorkspaceBusy({
      roots: [elements.selectionView, elements.rankingView, elements.mobileSelectionView],
      controls: [
        elements.modeSelection,
        elements.modeRanking,
        elements.undoEdit,
        elements.redoEdit,
        elements.clearBoard,
        elements.clearCandidates,
        elements.clearAnnotations,
        elements.rankingCandidateSearch,
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
    let rankingModel = null;
    elements.selectedCount.textContent = String(model.selectedCount);
    elements.rankedCount.textContent = String(model.rankedCount);
    elements.unrankedCount.textContent = String(model.unrankedCount);
    elements.filterResultCount.textContent = `${model.visibleWorks.length} 项`;
    renderWorkspace(model);
    if (companyDirectoryOpen) {
      renderCompanyDirectory();
    } else if (ranking && rankingSubject === 'company') {
      renderCompanyRanking();
    } else if (mobileCompanion) {
      mobileSelectionView.render({
        works: model.visibleWorks,
        selectedWorkIds: model.state.selectedWorkIds
      });
    } else if (ranking) {
      renderCompanyRanking();
      if (rankingSubject === 'work') {
        rankingModel = buildRankingModel(model.state, worksById, candidateTitleQuery);
        rankingView.render(rankingModel, await resolveCoverUrls([
          ...rankingModel.candidateWorks,
          ...rankingModel.tiers.flatMap(tier => tier.works)
        ]));
      }
    } else {
      selectionView.render({
        works: model.visibleWorks,
        view: model.state.selectionCardView,
        selectedWorkIds: model.state.selectedWorkIds,
        selectAllState: model.selectAllState,
        selectionCapacity: Math.max(0, USER_WORK_LIMIT - model.selectedCount),
        filterState: model.state.filterState
      }, await resolveCoverUrls(selectionInitialWorks(model.visibleWorks)));
    }
    const nextFilterKey = filterRenderKey(model, visibleBrands);
    if (nextFilterKey !== renderedFilterKey) {
      filterView.render(model.state.filterState, {
        current: model.visibleWorks.length,
        filters: outcome.counts.filters,
        brands: outcome.counts.brands
      });
      renderedFilterKey = nextFilterKey;
    }
    renderControlStates(model);
    if (companyDirectoryOpen) {
      // The directory owns its own scroll surface and is intentionally not persisted.
    } else if (mobileCompanion) {
      mobileSelectionView.restoreScroll(mobileSelectionScrollPosition);
    } else if (model.state.workspaceMode === 'ranking') {
      rankingView.restoreScroll(rankingScrollPosition);
    } else {
      selectionView.restoreScroll(selectionScrollPosition);
    }
    if (!companyDirectoryOpen && !mobileCompanion && ranking && renderedWorkspaceMode !== 'ranking') help.enterRanking();
    renderedWorkspaceMode = model.state.workspaceMode;
    lastRenderedModel = model;
    if (rankingModel !== null && !mobileCompanion) void refreshRankingPreload(rankingModel);
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

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }

  function clearShareHash() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    window.history.replaceState({}, '', cleanUrl.href);
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
  mobileCompanionMedia.addEventListener?.('change', event => {
    mobileCompanion = Boolean(event.matches);
    void render();
  });

  elements.modeSelection.addEventListener('click', () => {
    companyDirectoryOpen = false;
    return runStateChange(() => {
      return controller.setWorkspaceMode('selection');
    });
  });
  elements.modeRanking.addEventListener('click', () => {
    companyDirectoryOpen = false;
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.modeCompany.addEventListener('click', () => {
    companyDirectoryOpen = true;
    closeToolbarMenus();
    const open = () => {
      if (lastRenderedModel === null) {
        window.setTimeout(open, 0);
        return;
      }
      renderWorkspace(lastRenderedModel);
      renderCompanyDirectory();
    };
    open();
  });
  elements.companyBack.addEventListener('click', () => {
    companyDirectoryOpen = false;
    rankingSubject = 'work';
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    void render();
  });
  elements.companyRankingToggle.addEventListener('click', () => {
    companyDirectoryOpen = false;
    rankingSubject = 'company';
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.companyRankingClose.addEventListener('click', () => {
    companyDirectoryOpen = true;
    if (lastRenderedModel !== null) renderWorkspace(lastRenderedModel);
    renderCompanyDirectory();
  });
  elements.rankingSubjectWork.addEventListener('click', () => {
    rankingSubject = 'work';
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.rankingSubjectCompany.addEventListener('click', () => {
    rankingSubject = 'company';
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
  });
  elements.mobileCompanyMode.addEventListener('click', () => {
    companyDirectoryOpen = true;
    const open = () => {
      if (lastRenderedModel === null) {
        window.setTimeout(open, 0);
        return;
      }
      renderWorkspace(lastRenderedModel);
      renderCompanyDirectory();
    };
    open();
  });
  elements.rankingHelpButton.addEventListener('click', () => help.openFull());
  elements.rankingImmersiveHelp.addEventListener('click', () => help.openImmersive());
  elements.rankingHelpDismiss.addEventListener('click', () => elements.rankingHelp.close());
  elements.rankingShowCounts.addEventListener('change', () => {
    rankingView.setShowCounts(presentation.setShowCounts(elements.rankingShowCounts.checked));
  });
  elements.rankingShowTitles.addEventListener('change', () => {
    rankingView.setShowTitles(presentation.setShowTitles(elements.rankingShowTitles.checked));
  });
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
    return runStateChange(() => controller.clearCandidates());
  });
  elements.clearBoard.addEventListener('click', () => {
    closeToolbarMenus();
    return runStateChange(() => controller.clearBoard());
  });
  elements.clearAnnotations.addEventListener('click', () => {
    if (elements.clearAnnotations.disabled) return;
    if (!window.confirm('清空全部本地标记？')) return;
    presentation.clearAnnotations();
    rankingView.setAnnotations(presentation.inspect().annotations);
    closeToolbarMenus();
    renderControlStates(lastRenderedModel ?? controller.inspect([]));
  });
  elements.undoEdit.addEventListener('click', () => {
    return runStateChange(() => controller.undo());
  });
  elements.redoEdit.addEventListener('click', () => {
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
      const result = controller.exportJson();
      announce(`JSON 已导出：${result.filename}`, 'success');
    } catch (error) {
      announce('JSON 状态导出失败，请稍后重试。', 'error');
      console.error(error);
    }
  });

  elements.exportPng.addEventListener('click', async () => {
    if (importBusy || pngExportInProgress) return;
    const snapshot = lastRenderedModel ?? controller.inspect([]);
    if (snapshot.rankedCount === 0) return;

    pngExportInProgress = true;
    renderControlStates(snapshot);
    try {
      const exportWorksById = new Map();
      for (const { id: tierId } of snapshot.state.tiers) {
        for (const workId of snapshot.state.tierOrder[tierId]) {
          const work = worksById.get(workId);
          if (work) exportWorksById.set(workId, work);
        }
      }
      const result = await exportTierPng({
        tiers: snapshot.state.tiers,
        tierOrder: snapshot.state.tierOrder,
        worksById: exportWorksById,
        presentation: presentation.inspect(),
        createCanvas({ width, height }) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          return canvas;
        },
        fontsReady: document.fonts?.ready ?? Promise.resolve(),
        loadCover: async (_coverPath, record) => {
          const work = record.work;
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

  await startupMetrics.measureAsync('first-render', () => render());
  if (mobileCompanion) openMobileShareWarning();
  else openShareImportDialog();
}

if (typeof document !== 'undefined') {
  initialize().catch(error => {
    announce(error instanceof Error ? error.message : '初始化失败', 'error');
    console.error(error);
  });
}
