import { createWorkspaceSession } from '../lib/workspace-session.js';
import { applyImageAsset } from '../lib/asset-url.js';
import { createSelectionCard as renderSelectionCard, mobileCardRating } from './selection-card.js';
export { mobileCardRating } from './selection-card.js';
import { reconcileKeyedChildren } from '../lib/keyed-dom.js';
import { setListState } from '../lib/list-state.js';
import { DEFAULT_SELECTION_CARD_DISPLAY, normalizeSelectionCardDisplay } from '../lib/selection-card-presentation.js';
import { syncSortDirectionControl } from '../lib/ui-sort-control.js';
import { selectionPages } from '../lib/selection-pages.js';

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
// Two normal pages, including the visible one. Detached cards never form an
// additional rendered grid, and old callbacks still require a visible work ID.
const MAX_CACHED_CARDS = 198;

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function requiredOwnedElement(root, id) {
  const element = root.querySelector?.(`#${id}`);
  if (!element) throw new Error(`Selection view root is missing #${id}`);
  return element;
}

export function selectionInitialWorks(works) {
  if (!Array.isArray(works)) throw new TypeError('works must be an array');
  const [firstPage] = selectionPages(works.length);
  return works.slice(firstPage.start, firstPage.end);
}

function releaseGridImages(grid) {
  for (const image of Array.from(grid.querySelectorAll?.('img') ?? [])) {
    image.removeAttribute?.('srcset');
    image.removeAttribute?.('src');
  }
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

export function bindTitleQueryInput(input, commit, startInteraction) {
  let composing=false;
  const schedule=()=>{
    commit(input.value,startInteraction('title-search'));
    if(input.value==='')commit.flush();
  };
  input.addEventListener('compositionstart',()=>{composing=true;commit.cancel();});
  input.addEventListener('compositionend',()=>{composing=false;schedule();});
  input.addEventListener('input',event=>{if(!composing&&!event.isComposing)schedule();});
  input.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||composing||event.isComposing)return;
    event.preventDefault();commit.flush();
  });
}

// Preserve existing consumers while both views share the same card renderer.
export function createSelectionCard(documentRef, work, options) {
  return renderSelectionCard(documentRef, work, { ...options, imageAsset: applyImageAsset });
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
  onPageRequest = null,
  onCancelUpdate = null,
  prepareWorks = null,
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
  let appliedPageIndex = 0;
  let latestModel = null;
  let requestedSort=null,updating=false,resultCommitModel=null;
  let loadingReturnFocus=null;
  function syncRequestedSort(state){
    elements.sortKey.value=state.sortKey;
    syncSortDirectionControl({button:elements.sortDirectionToggle,icon:elements.sortDirectionIcon,label:elements.sortDirectionLabel,direction:state.sortDirection,documentRef});

  }
  // Overlay feedback below the existing toolbar; keep its compact controls and geometry.
  const controls=elements.sortKey.closest?.('.catalog-controls');
  controls?.append(elements.listState);
  elements.listState.classList.add('catalog-update-state');
  let remotePagePending = false;
  let latestCoverUrls = null;
  let cardDisplay = DEFAULT_SELECTION_CARD_DISPLAY;
  const defaultSelectionMode = true;
  let selectionModeActive = defaultSelectionMode;
  let selectionModeEpoch = 0;
  let activeVisibleWorkIds = new Set();
  let latestWorksById = new Map();
  let renderedModel = null;
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
    const page = selectionPages(latestModel.works.length)[latestModel.page ? 0 : pageIndex];
    if (page === undefined) return;
    onToggleCurrentPage(latestModel.works
      .slice(page.start, page.end)
      .map(work => work.workId));
  });
  elements.selectAllResults.addEventListener('click', () => {
    if (latestModel === null || updating) return;
    onToggleCurrentResults(latestModel.page ? null : latestModel.works.map(work => work.workId));
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
    const state=requestedSort??latestModel.filterState;
    requestedSort={...state,sortDirection:state.sortDirection==='asc'?'desc':'asc'};syncRequestedSort(requestedSort);
    onFilterChange({sortDirection:requestedSort.sortDirection},interaction);
  });
  elements.sortKey.addEventListener('change', () => {
    const sortKey = elements.sortKey.value;
    if (!FILTER_SORT_KEYS.has(sortKey)) return;
    const interaction = onInteractionStart('sort-key');
    titleCommit.flush();
    requestedSort={...(requestedSort??latestModel.filterState),sortKey};syncRequestedSort(requestedSort);
    onFilterChange({ sortKey }, interaction);
  });
  bindTitleQueryInput(elements.title,titleCommit,onInteractionStart);

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
    return model?.page?.pageCount ?? selectionPages(model?.works?.length ?? 0).length;
  }

  function requestRemotePage() {
    const generation = hydrationSession.begin('result-page');
    remotePagePending = true;
    setListState({status:elements.listState,state:'loading',layout:'panel',message:'正在翻到下一页',detail:'下一页还需要一点时间，你可以先看看当前的作品。',cancel:onCancelUpdate,slowLabel:'还需要一点时间。你可以继续调整条件，或先看原来的作品。'});
    elements.grid.setAttribute('aria-busy', 'true');
    elements.grid.inert = false;
    elements.selectCurrentPage.disabled = true;
    elements.pageInput.value = String(pageIndex + 1);
    Promise.resolve().then(() => generation.isCurrent() ? onPageRequest(pageIndex + 1) : undefined).then(success => {
      // The query owner already rendered its error (including retry cooldown).
      if (success === false && elements.listState.dataset.state !== 'error') throw new Error('page request did not complete');
    }).catch(error => {
      if (!generation.isCurrent()) return;
      generation.fail(error);
      elements.grid.setAttribute('aria-busy', 'false');
      elements.grid.inert = false;
      setListState({status:elements.listState,state:'error',layout:'panel',message:'这次没能加载出来',detail:'原来的作品还在。可以再试一次，也可以先继续浏览。',retry:requestRemotePage,retryAt:error.retryAt,cancel:onCancelUpdate});
      console.warn('work result page failed', error);
    });
  }

  function setPage(nextIndex, { scroll = true, notify = true } = {}) {
    if (latestModel === null) return;
    const previousIndex = pageIndex;
    pageIndex = Math.max(0, Math.min(nextIndex, pageCountFor(latestModel) - 1));
    clearPageError();
    if (scroll && pageIndex !== previousIndex) restorePageScroll({ top: 0, left: 0 });
    if (latestModel.page) {
      if (pageIndex !== previousIndex) {
        // Keep the current cards while the Worker prepares the next page.
        requestRemotePage();
      }
    } else renderLatest();
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

  const hydrationSession = createWorkspaceSession();
  let hydratedInputs = null, hydratedPage = null;
  function renderLatest() {
    // Display settings may change while the next page is in flight. They
    // must not relabel the previous page's cards as the requested new page.
    if (remotePagePending) return;
    const generation = hydrationSession.begin('result-page');
    if (prepareWorks === null || latestModel === null) { generation.complete(); return renderLatestReady(); }
    const model = latestModel;
    const pages = selectionPages(model.page?.total ?? model.works.length);
    pageIndex = Math.min(pageIndex, pages.length - 1);
    const page = pages[pageIndex];
    const inputs=model.page ? model.works : model.works.slice(page.start,page.end);
    if(hydratedInputs&&inputs.length===hydratedInputs.length&&inputs.every((work,i)=>work===hydratedInputs[i])) {
      elements.grid.setAttribute('aria-busy','false');elements.grid.inert=false;
      return renderLatestReady(hydratedPage);
    }
    elements.grid.setAttribute('aria-busy', 'true');
    elements.grid.inert = false;
    elements.selectCurrentPage.disabled = true;
    setListState({status:elements.listState,state:'loading',layout:'panel',message:'正在整理作品列表',detail:'整理好后会自动显示，原来的作品会先留在这里。',cancel:onCancelUpdate,slowLabel:'还需要一点时间。你可以继续调整条件，或先看原来的作品。'});
    return Promise.resolve(prepareWorks(inputs)).then(works => {
      if (!generation.isCurrent() || latestModel !== model) return;
      hydratedInputs=inputs;hydratedPage=works;
      elements.grid.setAttribute('aria-busy', 'false');
      elements.grid.inert = false;
      renderLatestReady(works);
      generation.complete({ empty: works.length === 0 });
    }).catch(error => {
      if (!generation.isCurrent()) return;
      generation.fail(error);
      elements.grid.setAttribute('aria-busy', 'false');
      elements.grid.inert = false;
      setListState({status:elements.listState,state:'error',layout:'panel',message:'这次没能加载出来',detail:'原来的作品还在。可以再试一次，也可以先继续浏览。',retry:() => renderLatest(),retryAt:error.retryAt,cancel:onCancelUpdate});
      console.warn('work card hydration failed', error);
    });
  }

  function renderLatestReady(hydratedWorks = null) {
    const model = latestModel;
    if (model === null) return;
    const keepPending=updating&&resultCommitModel!==model;
    elements.grid.setAttribute('aria-busy', String(keepPending));
    elements.grid.inert = false;
      const activeElement = documentRef.activeElement;
      const activeCard = activeElement?.parentElement;
      const focusTarget = activeCard?.dataset?.workId && activeElement?.dataset?.controlType
        ? {
            workId: activeCard.dataset.workId,
            controlType: activeElement.dataset.controlType
          }
        : null;
      const selected = new Set(model.selectedWorkIds);
      const pages = selectionPages(model.page?.total ?? model.works.length);
      pageIndex = Math.min(pageIndex, pages.length - 1);
      const page = pages[pageIndex];
      const visibleWorks = hydratedWorks ?? (model.page ? model.works : model.works.slice(page.start, page.end));
      const previousVisibleWorkIds = activeVisibleWorkIds;
      activeVisibleWorkIds = new Set(visibleWorks.map(work => work.workId));
      latestWorksById = new Map(visibleWorks.map(work => [work.workId, work]));
      latestSelectedWorkIds = selected;
      if(!keepPending)setListState({
        status: elements.listState,
        state: model.works.length === 0 ? 'empty' : 'ready',
        message: model.filterState?.selectedOnly ? '这里还没有作品。可以先去作品库选择。' : '没有匹配的作品，可以换个名称，或放宽筛选条件。'
      });
      const nextCardCache = new Map();
      const cardSize = documentRef.defaultView?.getComputedStyle?.(documentRef.documentElement)
        .getPropertyValue('--selection-card-size')?.trim() || '180px';
      const cards = visibleWorks.map((work, index) => {
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
        // Revisiting a failed cover keeps the old rebuild-and-retry behavior.
        // Same-page selection updates must not create an image retry loop.
        const retryCover = entry && !previousVisibleWorkIds.has(workId)
          && entry.card.classList.contains('is-image-missing');
        if (entry === undefined || entry.structureKey !== structureKey || entry.epoch !== selectionModeEpoch || retryCover) {
          entry?.deactivate();
          if (entry) releaseGridImages(entry.card);
          let active = true;
          const cardEpoch = selectionModeEpoch;
          const currentWork = () => latestWorksById.get(workId) ?? null;
          const card = createSelectionCard(documentRef, work, {
            cardSize,
            eagerCover: index < 12,
            priorityCover: index === 0,
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
        // Cached cards can change position after sorting/filtering.
        const image = entry.card.querySelector('.selection-card-cover img');
        if (image) {
          image.loading = index < 12 ? 'eager' : 'lazy';
          image.fetchPriority = index === 0 ? 'high' : 'auto';
        }
        return entry.card;
      });
      for (const [workId, entry] of cardCache) {
        if (nextCardCache.has(workId)) continue;
        if (entry.epoch !== selectionModeEpoch) {
          entry.deactivate();
          releaseGridImages(entry.card);
          continue;
        }
        // Keep recently visited cards detached, with their decoded images.
        // Visibility checks above disable every callback until reuse.
        nextCardCache.set(workId, entry);
      }
      reconcileKeyedChildren(elements.grid, cards);
      if(!keepPending)appliedPageIndex=pageIndex;
      // Visible entries were inserted first, followed by retained entries in
      // recency order. Evict only the excess detached cards.
      let cacheIndex = 0;
      for (const [workId, entry] of nextCardCache) {
        if (++cacheIndex <= Math.max(MAX_CACHED_CARDS, cards.length)) continue;
        entry.deactivate();
        releaseGridImages(entry.card);
        nextCardCache.delete(workId);
      }
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
      elements.selectCurrentPage.disabled = keepPending || capacityBlocked || visibleWorks.length === 0;
      elements.selectAllResults.disabled=keepPending;
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
      elements.selectedWorksToggle.textContent = '查看已选';
      if (!titleCommit.pending()) elements.title.value = model.filterState.titleQuery;
      elements.sortKey.value = (requestedSort??model.filterState).sortKey;
      syncSortDirectionControl({
        button: elements.sortDirectionToggle,
        icon: elements.sortDirectionIcon,
        label: elements.sortDirectionLabel,
        direction: (requestedSort??model.filterState).sortDirection,
        labelPrefix: '排序',
        documentRef
      });
      elements.pagination.hidden = (model.page?.total ?? model.works.length) === 0;
      elements.pagePrevious.disabled = pageIndex <= 0;
      elements.pageNext.disabled = pageIndex >= pages.length - 1;
      elements.pageInput.value = String(pageIndex + 1);
      elements.pageTotal.textContent = String(pages.length);
      if(!keepPending){requestedSort=null;updating=false;resultCommitModel=null;}
      syncRequestedSort(requestedSort??model.filterState);
      renderedModel = model;
  }

  return Object.freeze({
    // Capture the exact hydrated and decorated visual rows. A failed or
    // superseded render must not expose a previous page for the new model.
    getRenderedWorks() {
      return renderedModel === latestModel ? [...latestWorksById.values()] : [];
    },
    beginLoading({filterState}={}) {
      if(!updating)loadingReturnFocus=documentRef.activeElement;
      updating=true;
      if(filterState){requestedSort={...filterState};syncRequestedSort(requestedSort);}
      elements.grid.setAttribute('aria-busy', 'true');elements.grid.inert=false;
      elements.selectCurrentPage.disabled=true;elements.selectAllResults.disabled=true;
      const changed=filterState&&latestModel&&(filterState.sortKey!==latestModel.filterState.sortKey||filterState.sortDirection!==latestModel.filterState.sortDirection);
      const label=elements.sortKey.selectedOptions?.[0]?.textContent??'所选方式';
      elements.listState.dataset.phase='updating';
      setListState({status:elements.listState,state:'loading',layout:'panel',message:changed?'正在调整作品顺序':'正在整理作品列表',detail:changed?`已选择「${label}」，排好后会自动更新。`:'整理好后会自动显示，你也可以继续调整条件。',cancel:onCancelUpdate,slowLabel:'还需要一点时间。你可以继续调整条件，或先看原来的作品。'});
    },
    updateLoadingPhase(phase) {
      if(!updating)return;
      const messages={
        'initializing-search':'正在查找作品',
        'querying':'正在查找作品',
        'loading-results':'正在整理作品列表'
      };
      if(!messages[phase])return;
      elements.listState.dataset.phase=phase;
      setListState({status:elements.listState,state:'loading',layout:'panel',message:messages[phase],detail:phase==='initializing-search'?'第一次查找会多花一点时间，你可以继续修改搜索条件。':phase==='querying'?'你可以继续调整条件，找到后会自动更新列表。':'整理好后会自动显示，原来的作品会先留在这里。',cancel:onCancelUpdate,slowLabel:'还需要一点时间。你可以继续调整条件，或先看原来的作品。'});
    },
    showLoadingError(retry, error) {
      elements.grid.setAttribute('aria-busy', 'false');
      elements.grid.inert = false;
      setListState({status:elements.listState,state:'error',layout:'panel',message:'这次没能加载出来',detail:'原来的作品还在。可以再试一次，也可以先继续浏览。',retry,retryAt:error?.retryAt,cancel:onCancelUpdate});
    },
    cancelPendingTitleQuery() {
      return titleCommit.cancel();
    },
    restoreLoadingFocus() {
      if(loadingReturnFocus?.isConnected&&loadingReturnFocus.getClientRects?.().length)loadingReturnFocus.focus({preventScroll:true});
      loadingReturnFocus=null;
    },
    restoreAppliedPage() {
      pageIndex=appliedPageIndex;
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
      const workKey = model.page ? String(model.page.resultRevision) : model.works.map(work => work.workId).join('\u001f');
      if (workKey !== renderedWorkKey) {
        renderedWorkKey = workKey;
        pageIndex = 0;
      }
      if (model.page) pageIndex = model.page.pageNumber - 1;
      if (model.page && typeof onPageRequest !== 'function') throw new TypeError('paged view requires onPageRequest');
      remotePagePending = false;
      latestModel = {
        ...model,
        selectionMode: typeof model.selectionMode === 'boolean' ? model.selectionMode : defaultSelectionMode
      };
      resultCommitModel=latestModel;
      if (selectionModeActive !== latestModel.selectionMode) selectionModeEpoch += 1;
      selectionModeActive = latestModel.selectionMode;
      latestCoverUrls = coverUrls;
      return renderLatest();
    },

    // Keep pagination/model ownership; only pending visual updates are suspended.
    suspend() {
      requestedSort=null;updating=false;resultCommitModel=null;
      hydrationSession.suspend();
      setListState({status:elements.listState,state:'ready'});
      remotePagePending = false;
      elements.grid.setAttribute('aria-busy', 'false');
      elements.grid.inert = false;
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
