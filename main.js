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
import { encodeSquareCrop } from './lib/image-crop.js';
import { createLocalMediaStore, openLocalMediaDatabase } from './lib/local-media-store.js';
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
import { StateValidationError } from './lib/state.js';
import { appendTier } from './lib/tier-config.js';
import {
  ATTRIBUTE_GROUP_IDS as ATTRIBUTE_GROUP_ORDER,
  FILTER_GROUP_ORDER
} from './lib/attribute-filters.js';
import { createFilterView } from './views/filter-view.js';
import { buildRankingModel, createRankingView } from './views/ranking-view.js';
import { createSelectionView } from './views/selection-view.js';
import { createMediaDialogView } from './views/media-dialog-view.js';

const SAMPLE_SCHEMA_VERSION = 'egs-tier-sample-document-v3';
const EXPECTED_CONTENT_FILTER_COUNT = 45;
const EXPECTED_GENRE_FILTER_COUNT = 4;
const EXPECTED_PLATFORM_FILTER_COUNT = 13;

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
  modeSelection: requiredElement('mode-selection'),
  modeRanking: requiredElement('mode-ranking'),
  selectionView: requiredElement('selection-view'),
  rankingView: requiredElement('ranking-view'),
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
  addImagesSelection: requiredElement('add-images-selection'),
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
  mediaPreviewImage: requiredElement('media-preview-image'),
  mediaPreviewTitle: requiredElement('media-preview-title'),
  mediaPreviewActions: requiredElement('media-preview-actions'),
  mediaCropCanvas: requiredElement('media-crop-canvas'),
  detailsDialog: requiredElement('work-details'),
  detailsTitle: requiredElement('details-title'),
  detailsBrand: requiredElement('details-brand'),
  detailsRelease: requiredElement('details-release'),
  detailsScore: requiredElement('details-score'),
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

function showDetails(work, filterById) {
  elements.detailsTitle.textContent = work.title;
  elements.detailsBrand.textContent = work.brandName;
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
    sampleSource,
    backendIndexesSource,
    assetsManifestSource,
    filterAuthoritySource,
    workGroupAuthoritySource,
    reviewQueueSource
  ] = await Promise.all([
    fetchJson(DATA_URLS.catalog, '样本'),
    fetchJsonWithSha256(DATA_URLS.indexes, 'Backend indexes'),
    fetchJsonWithSha256(DATA_URLS.assetsManifest, 'assets manifest'),
    fetchJsonWithSha256(DATA_URLS.filterAuthority, '筛选权威'),
    fetchJsonWithSha256(DATA_URLS.workGroups, '作品组权威'),
    fetchJsonWithSha256(DATA_URLS.workGroupReviewQueue, '作品组 review queue')
  ]);
  const backendIndexes = backendIndexesSource.value;
  const assetsManifest = assetsManifestSource.value;
  const filterAuthority = filterAuthoritySource.value;
  const workGroupAuthority = workGroupAuthoritySource.value;
  const reviewQueue = reviewQueueSource.value;
  const sample = prepareRuntimeSample(sampleSource, {
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
      reviewQueue: reviewQueueSource.sha256
    }
  });
  const filterById = new Map(sample.filters.map(filter => [filter.filterId, filter]));
  const worksById = new Map(sample.works.map(work => [work.workId, work]));
  let mediaStore = null;
  let customWorks = [];
  try {
    const mediaDatabase = await openLocalMediaDatabase(window.indexedDB);
    mediaStore = createLocalMediaStore({ database: mediaDatabase, urlApi: URL });
    customWorks = (await mediaStore.listCustom()).map(createCustomWork);
    for (const work of customWorks) worksById.set(work.workId, work);
  } catch (error) {
    console.error(error);
  }
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
  await filterWorkerClient.init({
    works: sample.works,
    knownFilterIds: sample.filters.map(filter => filter.filterId),
    brands: sample.brands,
    backendIndexes: sample.backendIndexes
  });
  window.addEventListener('pagehide', () => filterWorkerClient.terminate(), { once: true });

  let filterView;
  let importBusy = false;
  let candidateTitleQuery = '';
  let selectionScrollPosition = { top: 0, left: 0 };
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
      elements.mediaPreviewActions.replaceChildren();
      if (!isImmersive && work.localMediaKind !== 'custom' && mediaStore !== null) {
        const replace = document.createElement('button');
        replace.type = 'button';
        replace.textContent = '替换图片';
        replace.addEventListener('click', () => {
          replacementWork = work;
          elements.mediaFiles.click();
        });
        elements.mediaPreviewActions.append(replace);
      }
      if (hasReplacement) {
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = '恢复原图';
        restore.addEventListener('click', () => {
          void mediaStore.deleteReplacement(work.workId).then(render).then(() => {
            if (typeof elements.mediaPreview.close === 'function') elements.mediaPreview.close();
            else elements.mediaPreview.open = false;
          }).catch(error => {
            announce('恢复原图失败。', 'error');
            console.error(error);
          });
        });
        elements.mediaPreviewActions.append(restore);
      }
      if (typeof elements.mediaPreview.showModal === 'function') elements.mediaPreview.showModal();
      else elements.mediaPreview.open = true;
    }
  });

  function openMediaPreview(work) {
    return previewLoader.open(work);
  }

  elements.mediaPreview.addEventListener('close', () => previewLoader.cancel());
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

  async function createCustomCandidate({ title, blob, width, height }) {
    if (mediaStore === null) throw new Error('本地图片存储不可用');
    const id = `custom-local-${crypto.randomUUID()}`;
    await mediaStore.putCustom({ id, title, blob, width, height });
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
    onToggleCurrentResults() {
      const visibleWorkIds = lastRenderedModel?.visibleWorks.map(work => work.workId) ?? [];
      return runStateChange(() => controller.toggleCurrentResults(visibleWorkIds));
    },
    onOpenDetails(work) {
      showDetails(work, filterById);
    },
    onOpenMedia(work) {
      void openMediaPreview(work).catch(error => {
        announce('图片预览加载失败。', 'error');
        console.error(error);
      });
    },
    onCardViewChange(cardView) {
      return runStateChange(() => controller.setSelectionCardView(cardView));
    },
    onFilterChange(patch) {
      return runStateChange(() => controller.setFilterState(patch));
    },
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
      showDetails(work, filterById);
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
      elements.rankingHelpTitle.textContent = immersiveContext ? '沉浸模式' : '排榜使用说明';
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
    onCreateCustom: createCustomCandidate,
    async onReplace(work, record) {
      if (mediaStore === null) throw new Error('本地图片存储不可用');
      await mediaStore.putReplacement({ workId: work.workId, ...record });
      await render();
    },
    onError(error) {
      announce(error instanceof Error ? error.message : '图片处理失败。', 'error');
      console.error(error);
    }
  });
  function openMediaUpload(files) {
    const availableSlots = Math.max(0, 100 - controller.inspectState().selectedWorkIds.length);
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
    if (renderedWorkspaceMode === 'selection') {
      selectionScrollPosition = selectionView.captureScroll();
    } else if (renderedWorkspaceMode === 'ranking') {
      rankingScrollPosition = rankingView.captureScroll();
    }
  }

  function renderWorkspace(model) {
    const ranking = model.state.workspaceMode === 'ranking';
    elements.modeSelection.setAttribute('aria-selected', String(!ranking));
    elements.modeRanking.setAttribute('aria-selected', String(ranking));
    elements.modeSelection.tabIndex = ranking ? -1 : 0;
    elements.modeRanking.tabIndex = ranking ? 0 : -1;
    elements.selectionView.hidden = ranking;
    elements.rankingView.hidden = !ranking;
  }

  function renderControlStates(model) {
    elements.modeSelection.disabled = importBusy;
    elements.modeRanking.disabled = importBusy || model.selectedCount === 0;
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
    elements.addImagesSelection.disabled = importBusy || mediaStore === null;
    elements.cleanupMenuButton.disabled = importBusy;
    elements.displayMenuButton.disabled = importBusy;
    elements.fileMenuButton.disabled = importBusy;
    elements.exportState.disabled = importBusy;
    elements.exportPng.disabled = importBusy || model.rankedCount === 0 || pngExportInProgress;
  }

  function setImportBusy(nextBusy) {
    importBusy = nextBusy;
    setWorkspaceBusy({
      roots: [elements.selectionView, elements.rankingView],
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
        elements.addImagesSelection,
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
    if (ranking) {
      rankingModel = buildRankingModel(model.state, worksById, candidateTitleQuery);
      rankingView.render(rankingModel, await resolveCoverUrls([
        ...rankingModel.candidateWorks,
        ...rankingModel.tiers.flatMap(tier => tier.works)
      ]));
    } else {
      selectionView.render({
        works: model.visibleWorks,
        view: model.state.selectionCardView,
        selectedWorkIds: model.state.selectedWorkIds,
        selectAllState: model.selectAllState,
        filterState: model.state.filterState
      }, await resolveCoverUrls(model.visibleWorks));
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
    if (model.state.workspaceMode === 'ranking') {
      rankingView.restoreScroll(rankingScrollPosition);
    } else {
      selectionView.restoreScroll(selectionScrollPosition);
    }
    if (ranking && renderedWorkspaceMode !== 'ranking') help.enterRanking();
    renderedWorkspaceMode = model.state.workspaceMode;
    lastRenderedModel = model;
    if (rankingModel !== null) void refreshRankingPreload(rankingModel);
    else cancelRankingPreload();
    return true;
  }

  filterView = createFilterView({
    root: document,
    filters: sample.filters,
    brands: sample.brands,
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

  elements.modeSelection.addEventListener('click', () => {
    return runStateChange(() => {
      return controller.setWorkspaceMode('selection');
    });
  });
  elements.modeRanking.addEventListener('click', () => {
    return runStateChange(() => controller.setWorkspaceMode('ranking'));
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
  elements.addImagesSelection.addEventListener('click', () => elements.mediaFiles.click());
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
    const availableSlots = Math.max(0, 100 - controller.inspectState().selectedWorkIds.length);
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

  await render();
}

if (typeof document !== 'undefined') {
  initialize().catch(error => {
    announce(error instanceof Error ? error.message : '初始化失败', 'error');
    console.error(error);
  });
}
