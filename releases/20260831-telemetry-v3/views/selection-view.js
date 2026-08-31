import { applyImageAsset, AssetUrlError } from '../lib/asset-url.js';
import { applyAdaptiveImageSource } from '../lib/adaptive-image-source.js';
import { createActionIcon } from '../lib/action-icons.js';
import { reconcileKeyedChildren } from '../lib/keyed-dom.js';
import { setListState } from '../lib/list-state.js';
import { DEFAULT_SELECTION_CARD_DISPLAY, normalizeSelectionCardDisplay } from '../lib/selection-card-presentation.js?v=20260824-selection-source-sorting-v1';

const CARD_VIEWS = new Set(['full', 'compact']);
const SELECT_ALL_STATES = new Set(['none', 'some', 'all']);
const FILTER_SORT_KEYS = new Set([
  'voteCount', 'median',
  'egsScore',
  'vndbScore', 'vndbVoteCount',
  'bangumiScore', 'bangumiVoteCount',
  'title', 'brandName', 'releaseDate'
]);
const FILTER_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const DEBOUNCE_MS = 150;
const SELECTION_WINDOW_TARGET = 100;
const SELECTION_WINDOW_MIN = 60;
const VNDB_SORT_KEYS = new Set(['vndbScore', 'vndbVoteCount']);
const BANGUMI_SORT_KEYS = new Set(['bangumiScore', 'bangumiVoteCount']);

function egsRatingText(work) {
  if (!Number.isFinite(work.median) || !Number.isInteger(work.voteCount)) return 'EGS 暂无评分';
  return `EGS ${work.median}`;
}

function releaseYear(work) {
  const match = /^(\d{4})/u.exec(String(work.releaseDate ?? ''));
  return match === null ? null : match[1];
}

function bangumiRatingText(rating) {
  if (rating === null || typeof rating !== 'object') return null;
  return `BGM ${rating.detailScore ?? '暂无评分'}`;
}

export function mobileCardRating(work, sortKey = 'median') {
  if (VNDB_SORT_KEYS.has(sortKey)) {
    return Object.freeze({
      source: 'vndb',
      text: work.vndbRating?.cardText ?? 'VNDB 暂无评分'
    });
  }
  if (BANGUMI_SORT_KEYS.has(sortKey)) {
    return Object.freeze({
      source: 'bangumi',
      text: bangumiRatingText(work.bangumiRating) ?? 'BGM 暂无评分'
    });
  }
  return Object.freeze({ source: 'egs', text: egsRatingText(work) });
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function appendTextElement(documentRef, parent, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  element.className = className;
  element.textContent = String(text);
  parent.append(element);
  return element;
}

function requiredOwnedElement(root, id) {
  const element = root.querySelector?.(`#${id}`);
  if (!element) throw new Error(`Selection view root is missing #${id}`);
  return element;
}

function selectionPages(total) {
  if (total <= 0) return [{ start: 0, end: 0 }];
  let pageCount = Math.ceil(total / SELECTION_WINDOW_TARGET);
  while (pageCount > 1 && Math.floor(total / pageCount) < SELECTION_WINDOW_MIN) {
    pageCount -= 1;
  }
  const baseSize = Math.floor(total / pageCount);
  const extra = total % pageCount;
  const pages = [];
  let start = 0;
  for (let index = 0; index < pageCount; index += 1) {
    const size = baseSize + (index < extra ? 1 : 0);
    pages.push({ start, end: start + size });
    start += size;
  }
  return pages;
}

export function selectionInitialWorks(works) {
  if (!Array.isArray(works)) throw new TypeError('works must be an array');
  const [firstPage] = selectionPages(works.length);
  return works.slice(firstPage.start, firstPage.end);
}

function releaseGridImages(grid) {
  for (const image of Array.from(grid.querySelectorAll?.('img') ?? [])) {
    image.src = '';
    image.removeAttribute?.('src');
  }
}

function installMissingImageFallback(documentRef, card, image) {
  image.addEventListener('error', () => {
    if (card.classList.contains('is-image-missing')) return;
    image.src = '';
    image.removeAttribute?.('src');
    image.hidden = true;
    card.classList.add('is-image-missing');
    const fallback = documentRef.createElement('span');
    fallback.className = 'selection-card-missing-image';
    fallback.textContent = '封面缺失';
    fallback.setAttribute('aria-hidden', 'true');
    card.append(fallback);
  }, { once: true });
}

function createDebouncedCommit(callback) {
  let timer = null;
  let pendingArgs = null;
  function schedule(...args) {
    pendingArgs = args;
    if (timer !== null) globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      const argsToCommit = pendingArgs;
      timer = null;
      pendingArgs = null;
      callback(...argsToCommit);
    }, DEBOUNCE_MS);
  }
  schedule.flush = () => {
    if (timer === null) return false;
    globalThis.clearTimeout(timer);
    const argsToCommit = pendingArgs;
    timer = null;
    pendingArgs = null;
    callback(...argsToCommit);
    return true;
  };
  schedule.cancel = () => {
    if (timer === null) return false;
    globalThis.clearTimeout(timer);
    timer = null;
    pendingArgs = null;
    return true;
  };
  schedule.pending = () => timer !== null;
  return schedule;
}

export function createSelectionCard(documentRef, work, {
  view,
  selected,
  onToggle,
  onOpenDetails,
  assetBase,
  coverUrl = null,
  previewUrl = null,
  display = DEFAULT_SELECTION_CARD_DISPLAY,
  mobileSortKey = 'median',
  selectionEnabled = true,
  isSelectionEnabled = () => Boolean(selectionEnabled),
  isSelected = () => Boolean(selected),
  selectionHotspots = false,
  isCardActive = () => true,
  onCompare = null,
  compared = false,
  isCompared = () => Boolean(compared),
  compareMode = false
}) {
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('documentRef must provide createElement');
  }
  if (work === null || typeof work !== 'object' || Array.isArray(work)) {
    throw new TypeError('work must be an object');
  }
  if (!CARD_VIEWS.has(view)) throw new RangeError('view must be full or compact');
  assertFunction(onToggle, 'onToggle');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(isSelectionEnabled, 'isSelectionEnabled');
  assertFunction(isSelected, 'isSelected');
  assertFunction(isCardActive, 'isCardActive');
  assertFunction(isCompared, 'isCompared');
  const shouldToggleFromCardSurface = () => selectionHotspots && isSelectionEnabled();
  const cardDisplay = normalizeSelectionCardDisplay(display);

  const displayTitle = typeof work.displayTitle === 'string' && work.displayTitle.length > 0
    ? work.displayTitle
    : work.title;
  const card = documentRef.createElement('article');
  card.className = `selection-card selection-card-${view}`;
  card.classList.toggle('is-compare-mode', Boolean(compareMode));
  card.classList.toggle('is-selected', Boolean(selected));
  card.classList.toggle('is-selectable', Boolean(selectionEnabled));
  card.dataset.workId = work.workId;
  card.setAttribute('aria-label', `查看 ${displayTitle} 详情`);
  // Compare selections can change without rebuilding the current page. Read
  // the live collection supplied by the owner instead of a stale render flag
  // or button class so a second click always removes the current work.
  const currentCompared = () => isCompared();
  card.addEventListener('click', () => {
    if (!isCardActive()) return;
    if (compareMode && typeof onCompare === 'function') {
      onCompare(work, !currentCompared());
      return;
    }
    if (isSelectionEnabled()) onToggle(work, !isSelected());
    else onOpenDetails(work);
  });

  const image = documentRef.createElement('img');
  if (typeof coverUrl === 'string' && coverUrl.length > 0) {
    if (!coverUrl.startsWith('blob:')) image.crossOrigin = 'anonymous';
    applyAdaptiveImageSource(image, { thumbnailUrl: coverUrl, previewUrl });
  } else {
    try {
      applyImageAsset(image, work, assetBase);
    } catch (error) {
      if (error instanceof AssetUrlError) {
        throw new TypeError('work.coverPath must use the approved public asset path');
      }
      throw error;
    }
  }
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  installMissingImageFallback(documentRef, card, image);

  const cover = documentRef.createElement('button');
  cover.type = 'button';
  cover.className = 'selection-card-cover';
  cover.dataset.controlType = 'details';
  cover.setAttribute('aria-label', `查看 ${displayTitle} 详情`);
  cover.title = `查看 ${displayTitle} 详情`;
  cover.addEventListener('click', event => {
    event.stopPropagation();
    if (!isCardActive()) return;
    if (compareMode && typeof onCompare === 'function') {
      onCompare(work, !currentCompared());
      return;
    }
    if (shouldToggleFromCardSurface()) onToggle(work, !isSelected());
    else onOpenDetails(work);
  });
  cover.append(image);

  let checkbox = null;
  if (selectionEnabled) {
    checkbox = documentRef.createElement('input');
    checkbox.className = 'selection-card-checkbox';
    checkbox.type = 'checkbox';
    checkbox.dataset.controlType = 'checkbox';
    checkbox.checked = Boolean(selected);
    checkbox.setAttribute('aria-label', `${selected ? '取消选择' : '选择'} ${displayTitle}`);
    checkbox.addEventListener('click', event => event.stopPropagation());
  checkbox.addEventListener('change', event => {
      event.stopPropagation();
      if (!isCardActive()) {
        checkbox.checked = Boolean(isSelected());
        return;
      }
      if (isSelectionEnabled()) onToggle(work, checkbox.checked);
      else checkbox.checked = Boolean(isSelected());
    });
    checkbox.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
  }

  const overlay = documentRef.createElement('div');
  overlay.className = 'selection-card-overlay';
  if (cardDisplay.showTitle) {
    appendTextElement(documentRef, overlay, 'p', 'selection-card-title', displayTitle);
  }
  if (cardDisplay.showCompany && typeof work.brandName === 'string' && work.brandName.length > 0) {
    appendTextElement(documentRef, overlay, 'p', 'selection-card-company', work.brandName);
  }
  if (cardDisplay.showEgs || (cardDisplay.showVndb && work.vndbRating !== undefined) || (cardDisplay.showBangumi && work.bangumiRating !== undefined)) {
    const ratings = documentRef.createElement('div');
    ratings.className = 'selection-card-rating-lines';
    if (cardDisplay.showEgs) {
      appendTextElement(documentRef, ratings, 'span', 'selection-card-rating-line selection-card-egs-rating', egsRatingText(work));
    }
    if (cardDisplay.showVndb && work.vndbRating !== undefined) {
      appendTextElement(documentRef, ratings, 'span', 'selection-card-rating-line selection-card-vndb-rating', work.vndbRating.cardText);
    }
    if (cardDisplay.showBangumi && work.bangumiRating !== undefined) {
      const text = bangumiRatingText(work.bangumiRating);
      if (text !== null) appendTextElement(documentRef, ratings, 'span', 'selection-card-rating-line selection-card-bangumi-rating', text);
    }
    overlay.append(ratings);
  }
  const hasOverlayContent = overlay.children.length > 0;

  let versionBadge = null;
  if (Number.isInteger(work.presentationMemberCount) && work.presentationMemberCount > 1) {
    versionBadge = documentRef.createElement('span');
    versionBadge.className = 'selection-card-version-badge';
    versionBadge.setAttribute('aria-label', `${work.presentationMemberCount} 个公开版本`);
    versionBadge.append(createActionIcon(documentRef, 'layers-2'));
    appendTextElement(documentRef, versionBadge, 'span', 'selection-card-version-count', work.presentationMemberCount);
  }

  const year = cardDisplay.showYear ? releaseYear(work) : null;
  const yearBadge = year === null ? null : documentRef.createElement('span');
  if (yearBadge !== null) {
    yearBadge.className = 'selection-card-year';
    yearBadge.textContent = year;
  }
  const mobileRating = mobileCardRating(work, mobileSortKey);
  const mobileRatingBadge = documentRef.createElement('span');
  mobileRatingBadge.className = 'selection-card-mobile-rating';
  mobileRatingBadge.dataset.source = mobileRating.source;
  mobileRatingBadge.textContent = mobileRating.text;
  mobileRatingBadge.setAttribute('aria-label', `当前排序来源评分：${mobileRating.text}`);
  card.classList.toggle('has-selection-card-year', yearBadge !== null);
  card.append(
    cover,
    ...(versionBadge === null ? [] : [versionBadge]),
    ...(checkbox === null ? [] : [checkbox]),
    ...(hasOverlayContent ? [overlay] : []),
    mobileRatingBadge,
    ...(yearBadge === null ? [] : [yearBadge])
  );
  if (typeof onCompare === 'function') {
    const compareButton = documentRef.createElement('button');
    compareButton.type = 'button';
    compareButton.className = 'selection-card-compare';
    compareButton.dataset.controlType = 'compare';
    compareButton.classList.toggle('is-compared', Boolean(compared));
    compareButton.textContent = compared ? '已加入比较' : '加入比较';
    compareButton.setAttribute('aria-pressed', String(Boolean(compared)));
    compareButton.setAttribute('aria-label', `${compared ? '移出' : '加入'}比较：${displayTitle}`);
    compareButton.addEventListener('click', event => {
      event.stopPropagation();
      if (!isCardActive()) return;
      onCompare(work, !currentCompared());
    });
    card.append(compareButton);
  }
  if (selected && !selectionEnabled) {
    const marker = documentRef.createElement('span');
    marker.className = 'selection-card-selected-mark';
    marker.textContent = '已选';
    marker.setAttribute('aria-label', '已选');
    card.append(marker);
  }
  return card;
}

function cardStructureKey(work, {
  view,
  selectionEnabled,
  compareMode,
  display,
  coverUrl,
  previewUrl
}) {
  return JSON.stringify([
    view,
    Boolean(selectionEnabled),
    Boolean(compareMode),
    display,
    coverUrl,
    previewUrl,
    work.workId,
    work.displayTitle,
    work.title,
    work.brandName,
    work.releaseDate,
    work.median,
    work.voteCount,
    work.presentationMemberCount,
    work.vndbRating?.cardText,
    work.bangumiRating?.detailScore
  ]);
}

function syncSelectionCard(documentRef, card, work, {
  view,
  selected,
  selectionEnabled,
  compared,
  compareMode,
  mobileSortKey
}) {
  card.classList.toggle('selection-card-full', view === 'full');
  card.classList.toggle('selection-card-compact', view === 'compact');
  card.classList.toggle('is-compare-mode', Boolean(compareMode));
  card.classList.toggle('is-selected', Boolean(selected));
  card.classList.toggle('is-selectable', Boolean(selectionEnabled));

  const displayTitle = typeof work.displayTitle === 'string' && work.displayTitle.length > 0
    ? work.displayTitle
    : work.title;
  const checkbox = card.querySelector?.('.selection-card-checkbox') ?? null;
  if (checkbox !== null) {
    checkbox.checked = Boolean(selected);
    checkbox.setAttribute('aria-label', `${selected ? '取消选择' : '选择'} ${displayTitle}`);
  }
  const compareButton = card.querySelector?.('.selection-card-compare') ?? null;
  if (compareButton !== null) {
    compareButton.classList.toggle('is-compared', Boolean(compared));
    compareButton.textContent = compared ? '已加入比较' : '加入比较';
    compareButton.setAttribute('aria-pressed', String(Boolean(compared)));
    compareButton.setAttribute('aria-label', `${compared ? '移出' : '加入'}比较：${displayTitle}`);
  }
  const mobileRating = mobileCardRating(work, mobileSortKey);
  const mobileRatingBadge = card.querySelector?.('.selection-card-mobile-rating') ?? null;
  if (mobileRatingBadge !== null) {
    mobileRatingBadge.dataset.source = mobileRating.source;
    mobileRatingBadge.textContent = mobileRating.text;
    mobileRatingBadge.setAttribute('aria-label', `当前排序来源评分：${mobileRating.text}`);
  }
  const existingMarker = card.querySelector?.('.selection-card-selected-mark') ?? null;
  if (selected && !selectionEnabled && existingMarker === null) {
    const marker = documentRef.createElement('span');
    marker.className = 'selection-card-selected-mark';
    marker.textContent = '已选';
    marker.setAttribute('aria-label', '已选');
    card.append(marker);
  } else if ((!selected || selectionEnabled) && existingMarker !== null) {
    existingMarker.remove();
  }
}

export function syncSelectAllCheckbox(checkbox, selectAllState) {
  if (checkbox === null || typeof checkbox !== 'object') {
    throw new TypeError('checkbox must be an object');
  }
  if (!SELECT_ALL_STATES.has(selectAllState)) {
    throw new RangeError('selectAllState must be none, some, or all');
  }
  checkbox.checked = selectAllState === 'all';
  checkbox.indeterminate = selectAllState === 'some';
  checkbox.setAttribute?.('aria-checked', selectAllState === 'some' ? 'mixed' : String(checkbox.checked));
}

export function createSelectionView({
  root,
  onToggleWork,
  onToggleCurrentPage,
  onToggleCurrentResults,
  onToggleSelectedOnly,
  onOpenDetails,
  onCompareWork = () => {},
  isComparedWork = () => false,
  onFilterChange,
  onInteractionStart = () => null,
  onPageChange = () => {},
  assetBase,
  cardSurfaceSelection = false
}) {
  if (root === null || typeof root?.querySelector !== 'function') {
    throw new TypeError('root must provide querySelector');
  }
  const documentRef = root.ownerDocument;
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('root must provide ownerDocument.createElement');
  }
  const elements = {
    grid: requiredOwnedElement(root, 'catalog-grid'),
    selectCurrentPage: requiredOwnedElement(root, 'select-current-page'),
    selectAllResults: requiredOwnedElement(root, 'select-all-results'),
    capacityStatus: requiredOwnedElement(root, 'selection-capacity-status'),
    selectedWorksToggle: requiredOwnedElement(root, 'selected-works-toggle'),
    cardViewToggle: requiredOwnedElement(root, 'card-view-toggle'),
    sortDirectionToggle: requiredOwnedElement(root, 'sort-direction-toggle'),
    sortDirectionIcon: requiredOwnedElement(root, 'sort-direction-icon'),
    sortDirectionLabel: requiredOwnedElement(root, 'sort-direction-label'),
    pagination: requiredOwnedElement(root, 'selection-pagination'),
    pagePrevious: requiredOwnedElement(root, 'selection-page-previous'),
    pageInput: requiredOwnedElement(root, 'selection-page-input'),
    pageTotal: requiredOwnedElement(root, 'selection-page-total'),
    pageNext: requiredOwnedElement(root, 'selection-page-next'),
    pageError: requiredOwnedElement(root, 'selection-page-error'),
    listState: requiredOwnedElement(root, 'catalog-list-state'),
    title: requiredOwnedElement(root, 'title-search'),
    sortKey: requiredOwnedElement(root, 'sort-key')
  };
  assertFunction(onToggleWork, 'onToggleWork');
  assertFunction(onToggleCurrentPage, 'onToggleCurrentPage');
  assertFunction(onToggleCurrentResults, 'onToggleCurrentResults');
  assertFunction(onToggleSelectedOnly, 'onToggleSelectedOnly');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(onCompareWork, 'onCompareWork');
  assertFunction(isComparedWork, 'isComparedWork');
  assertFunction(onFilterChange, 'onFilterChange');
  assertFunction(onInteractionStart, 'onInteractionStart');
  assertFunction(onPageChange, 'onPageChange');
  let renderedWorkKey = '';
  let pageIndex = 0;
  let latestModel = null;
  let latestCoverUrls = null;
  let cardDisplay = DEFAULT_SELECTION_CARD_DISPLAY;
  const defaultSelectionMode = true;
  let selectionModeActive = defaultSelectionMode;
  let selectionModeEpoch = 0;
  let activeVisibleWorkIds = new Set();
  let latestWorksById = new Map();
  let latestSelectedWorkIds = new Set();
  let cardCache = new Map();

  function scrollTarget() {
    return documentRef.scrollingElement ?? root;
  }

  function capturePageScroll() {
    const target = scrollTarget();
    return {
      top: Number.isFinite(target?.scrollTop) ? target.scrollTop : 0,
      left: Number.isFinite(target?.scrollLeft) ? target.scrollLeft : 0
    };
  }

  function restorePageScroll(position) {
    const target = scrollTarget();
    if (target === null || typeof target !== 'object') return;
    target.scrollTop = Number.isFinite(position?.top) ? position.top : 0;
    target.scrollLeft = Number.isFinite(position?.left) ? position.left : 0;
  }

  const titleCommit = createDebouncedCommit((titleQuery, interaction) => {
    onFilterChange({ titleQuery }, interaction);
  });

  elements.selectCurrentPage.addEventListener('click', () => {
    if (latestModel === null) return;
    if (elements.selectCurrentPage.disabled) return;
    const page = selectionPages(latestModel.works.length)[pageIndex];
    if (page === undefined) return;
    onToggleCurrentPage(latestModel.works
      .slice(page.start, page.end)
      .map(work => work.workId));
  });
  elements.selectAllResults.addEventListener('click', () => {
    if (latestModel === null) return;
    onToggleCurrentResults(latestModel.works.map(work => work.workId));
  });
  elements.selectedWorksToggle.addEventListener('click', () => {
    if (latestModel === null) return;
    titleCommit.flush();
    onToggleSelectedOnly(!Boolean(latestModel.filterState.selectedOnly));
  });
  elements.sortDirectionToggle.addEventListener('click', () => {
    if (latestModel === null) return;
    const interaction = onInteractionStart('sort-direction');
    titleCommit.flush();
    onFilterChange({ sortDirection: latestModel.filterState.sortDirection === 'asc' ? 'desc' : 'asc' }, interaction);
  });
  elements.sortKey.addEventListener('change', () => {
    const sortKey = elements.sortKey.value;
    if (!FILTER_SORT_KEYS.has(sortKey)) return;
    const interaction = onInteractionStart('sort-key');
    titleCommit.flush();
    onFilterChange({ sortKey }, interaction);
  });
  elements.title.addEventListener('input', () => {
    titleCommit(elements.title.value, onInteractionStart('title-search'));
  });

  function showPageError(message = '请输入有效的页码') {
    elements.pageError.textContent = message;
    elements.pageError.hidden = false;
    elements.pageInput.setAttribute('aria-invalid', 'true');
  }

  function clearPageError() {
    elements.pageError.hidden = true;
    elements.pageInput.removeAttribute('aria-invalid');
  }

  function pageCountFor(model) {
    return selectionPages(model?.works?.length ?? 0).length;
  }

  function setPage(nextIndex, { scroll = true, notify = true } = {}) {
    if (latestModel === null) return;
    const pages = selectionPages(latestModel.works.length);
    const previousIndex = pageIndex;
    pageIndex = Math.max(0, Math.min(nextIndex, pages.length - 1));
    clearPageError();
    if (scroll && pageIndex !== previousIndex) restorePageScroll({ top: 0, left: 0 });
    renderLatest();
    if (notify && pageIndex !== previousIndex) onPageChange(pageIndex + 1);
  }

  elements.pagePrevious.addEventListener('click', () => setPage(pageIndex - 1));
  elements.pageNext.addEventListener('click', () => setPage(pageIndex + 1));
  elements.pageInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (latestModel === null) return;
    const raw = String(elements.pageInput.value ?? '').trim();
    if (!/^\d+$/u.test(raw)) {
      showPageError();
      return;
    }
    const requested = Number(raw);
    const total = pageCountFor(latestModel);
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > total) {
      showPageError();
      return;
    }
    setPage(requested - 1);
  });

  function renderLatest() {
    const model = latestModel;
    if (model === null) return;
      const activeElement = documentRef.activeElement;
      const activeCard = activeElement?.parentElement;
      const focusTarget = activeCard?.dataset?.workId && activeElement?.dataset?.controlType
        ? {
            workId: activeCard.dataset.workId,
            controlType: activeElement.dataset.controlType
          }
        : null;
      const selected = new Set(model.selectedWorkIds);
      const pages = selectionPages(model.works.length);
      pageIndex = Math.min(pageIndex, pages.length - 1);
      const page = pages[pageIndex];
      const visibleWorks = model.works.slice(page.start, page.end);
      activeVisibleWorkIds = new Set(visibleWorks.map(work => work.workId));
      latestWorksById = new Map(visibleWorks.map(work => [work.workId, work]));
      latestSelectedWorkIds = selected;
      setListState({
        status: elements.listState,
        state: model.works.length === 0 ? 'empty' : 'ready',
        message: '没有匹配的作品。'
      });
      const nextCardCache = new Map();
      const cards = visibleWorks.map(work => {
        const workId = work.workId;
        const coverUrl = latestCoverUrls?.get?.(workId)?.thumbnailUrl ?? null;
        const previewUrl = latestCoverUrls?.get?.(workId)?.previewUrl ?? null;
        const structureKey = cardStructureKey(work, {
          view: model.view,
          selectionEnabled: Boolean(model.selectionMode),
          compareMode: Boolean(model.compareMode),
          display: cardDisplay,
          coverUrl,
          previewUrl
        });
        let entry = cardCache.get(workId);
        if (entry === undefined || entry.structureKey !== structureKey || entry.epoch !== selectionModeEpoch) {
          entry?.deactivate();
          let active = true;
          const cardEpoch = selectionModeEpoch;
          const currentWork = () => latestWorksById.get(workId) ?? null;
          const card = createSelectionCard(documentRef, work, {
            view: model.view,
            selected: selected.has(workId),
            selectionEnabled: Boolean(model.selectionMode),
            isSelectionEnabled: () => active && cardEpoch === selectionModeEpoch && selectionModeActive && activeVisibleWorkIds.has(workId),
            isSelected: () => latestSelectedWorkIds.has(workId),
            onToggle: (_renderedWork, nextSelected) => {
              const liveWork = currentWork();
              if (active && cardEpoch === selectionModeEpoch && liveWork !== null && selectionModeActive && activeVisibleWorkIds.has(workId)) {
                onToggleWork(liveWork, nextSelected);
              }
            },
            selectionHotspots: cardSurfaceSelection && Boolean(model.selectionMode),
            isCardActive: () => active && cardEpoch === selectionModeEpoch && activeVisibleWorkIds.has(workId),
            onOpenDetails: () => {
              const liveWork = currentWork();
              if (active && liveWork !== null && activeVisibleWorkIds.has(workId)) onOpenDetails(liveWork);
            },
            onCompare: model.compareMode ? (_renderedWork, include) => {
              const liveWork = currentWork();
              if (active && liveWork !== null && activeVisibleWorkIds.has(workId)) onCompareWork(liveWork, include);
            } : null,
            compared: latestModel.comparedWorkIds?.includes?.(workId) ?? false,
            isCompared: () => {
              const liveWork = currentWork();
              return liveWork !== null && isComparedWork(liveWork);
            },
            compareMode: Boolean(model.compareMode),
            coverUrl,
            previewUrl,
            display: cardDisplay,
            mobileSortKey: model.filterState?.sortKey,
            assetBase
          });
          entry = {
            card,
            epoch: cardEpoch,
            structureKey,
            deactivate() { active = false; }
          };
        }
        syncSelectionCard(documentRef, entry.card, work, {
          view: model.view,
          selected: selected.has(workId),
          selectionEnabled: Boolean(model.selectionMode),
          compared: latestModel.comparedWorkIds?.includes?.(workId) ?? false,
          compareMode: Boolean(model.compareMode),
          mobileSortKey: model.filterState?.sortKey
        });
        nextCardCache.set(workId, entry);
        return entry.card;
      });
      for (const [workId, entry] of cardCache) {
        if (nextCardCache.get(workId) === entry) continue;
        entry.deactivate();
        releaseGridImages(entry.card);
      }
      reconcileKeyedChildren(elements.grid, cards);
      cardCache = nextCardCache;
      if (focusTarget !== null) {
        const focusedCard = cards.find(card => card.dataset.workId === focusTarget.workId);
        const focusedControl = Array.from(focusedCard?.children ?? []).find(
          child => child.dataset.controlType === focusTarget.controlType
        );
        focusedControl?.focus?.();
      }
      const pageSelected = visibleWorks.filter(work => selected.has(work.workId)).length;
      const pageState = pageSelected === 0 ? 'none' : pageSelected === visibleWorks.length ? 'all' : 'some';
      const unselectedPageCount = visibleWorks.length - pageSelected;
      const selectionCapacity = Number.isSafeInteger(model.selectionCapacity)
        ? Math.max(0, model.selectionCapacity)
        : Number.POSITIVE_INFINITY;
      const capacityBlocked = pageState !== 'all' && unselectedPageCount > selectionCapacity;
      const capacityMessage = capacityBlocked
        ? `当前页还需 ${unselectedPageCount} 个名额，当前可选 ${selectionCapacity} 部。`
        : '';
      const allState = model.selectAllState ?? (model.works.length === 0 ? 'none' : (
        model.works.every(work => selected.has(work.workId)) ? 'all' : pageSelected > 0 ? 'some' : 'none'
      ));
      elements.selectCurrentPage.setAttribute('aria-pressed', String(pageState === 'all'));
      elements.selectCurrentPage.disabled = capacityBlocked || visibleWorks.length === 0;
      if (capacityBlocked) {
        elements.selectCurrentPage.setAttribute('title', capacityMessage);
        elements.selectCurrentPage.setAttribute('aria-describedby', 'selection-capacity-status');
        elements.capacityStatus.textContent = capacityMessage;
        elements.capacityStatus.hidden = false;
      } else {
        elements.selectCurrentPage.removeAttribute('title');
        elements.selectCurrentPage.removeAttribute('aria-describedby');
        elements.capacityStatus.textContent = '';
        elements.capacityStatus.hidden = true;
      }
      elements.selectCurrentPage.textContent = pageState === 'all' ? '取消当前页' : '选择当前页';
      elements.selectAllResults.setAttribute('aria-pressed', String(allState === 'all'));
      elements.selectAllResults.textContent = allState === 'all' ? '取消全选' : '全选';
      elements.selectedWorksToggle.setAttribute('aria-pressed', String(Boolean(model.filterState.selectedOnly)));
      elements.selectedWorksToggle.textContent = `已选作品 ${model.selectedWorkIds.length}`;
      if (!titleCommit.pending()) elements.title.value = model.filterState.titleQuery;
      elements.sortKey.value = model.filterState.sortKey;
      const ascending = model.filterState.sortDirection === 'asc';
      elements.sortDirectionToggle.setAttribute('aria-pressed', String(ascending));
      elements.sortDirectionToggle.setAttribute('aria-label', `排序：${ascending ? '升序' : '降序'}，点击切换`);
      elements.sortDirectionLabel.textContent = ascending ? '升序' : '降序';
      elements.sortDirectionIcon.replaceChildren(createActionIcon(documentRef, ascending ? 'arrow-up-a-z' : 'arrow-down-a-z'));
      elements.pagePrevious.disabled = pageIndex <= 0;
      elements.pageNext.disabled = pageIndex >= pages.length - 1;
      elements.pageInput.value = String(pageIndex + 1);
      elements.pageTotal.textContent = String(pages.length);
  }

  return Object.freeze({
    cancelPendingTitleQuery() {
      return titleCommit.cancel();
    },

    setSelectionMode(active) {
      const nextActive = Boolean(active);
      if (selectionModeActive !== nextActive) selectionModeEpoch += 1;
      selectionModeActive = nextActive;
    },

    setCardDisplay(nextDisplay) {
      cardDisplay = normalizeSelectionCardDisplay(nextDisplay);
      renderLatest();
    },

    render(model, coverUrls = null) {
      if (
        !Array.isArray(model?.works)
        || !Array.isArray(model?.selectedWorkIds)
        || model.filterState === null
        || typeof model.filterState !== 'object'
      ) {
        throw new TypeError('model must contain works, selectedWorkIds, and filterState');
      }
      const workKey = model.works.map(work => work.workId).join('\u001f');
      if (workKey !== renderedWorkKey) {
        renderedWorkKey = workKey;
        pageIndex = 0;
      }
      latestModel = {
        ...model,
        selectionMode: typeof model.selectionMode === 'boolean' ? model.selectionMode : defaultSelectionMode
      };
      if (selectionModeActive !== latestModel.selectionMode) selectionModeEpoch += 1;
      selectionModeActive = latestModel.selectionMode;
      latestCoverUrls = coverUrls;
      renderLatest();
    },

    captureScroll() {
      return capturePageScroll();
    },

    restoreScroll(position) {
      if (position === null || typeof position !== 'object') return;
      restorePageScroll(position);
    },

    getPageNumber() {
      return pageIndex + 1;
    },

    setPageNumber(pageNumber, { scroll = false, notify = false } = {}) {
      const number = Number(pageNumber);
      if (!Number.isSafeInteger(number) || number < 1) return false;
      setPage(number - 1, { scroll, notify });
      return true;
    },

  });
}
