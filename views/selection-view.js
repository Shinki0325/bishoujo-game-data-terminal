import { applyImageAsset, AssetUrlError } from '../lib/asset-url.js';
import { createActionIcon } from '../lib/action-icons.js';
import { setListState } from '../lib/list-state.js';

const CARD_VIEWS = new Set(['full', 'compact']);
const SELECT_ALL_STATES = new Set(['none', 'some', 'all']);
const FILTER_SORT_KEYS = new Set(['voteCount', 'median', 'title', 'brandName', 'releaseDate']);
const FILTER_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const DEBOUNCE_MS = 150;
const SELECTION_WINDOW_TARGET = 100;
const SELECTION_WINDOW_MIN = 60;

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
  selectionEnabled = true,
  isSelectionEnabled = () => Boolean(selectionEnabled),
  selectionHotspots = false,
  isCardActive = () => true
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
  assertFunction(isCardActive, 'isCardActive');
  const shouldToggleFromCardSurface = () => selectionHotspots && isSelectionEnabled();

  const displayTitle = typeof work.displayTitle === 'string' && work.displayTitle.length > 0
    ? work.displayTitle
    : work.title;
  const card = documentRef.createElement('article');
  card.className = `selection-card selection-card-${view}`;
  card.classList.toggle('is-selected', Boolean(selected));
  card.classList.toggle('is-selectable', Boolean(selectionEnabled));
  card.dataset.workId = work.workId;
  card.setAttribute('aria-label', `查看 ${displayTitle} 详情`);
  card.addEventListener('click', () => {
    if (!isCardActive()) return;
    if (isSelectionEnabled()) onToggle(work, !selected);
    else onOpenDetails(work);
  });

  const image = documentRef.createElement('img');
  if (typeof coverUrl === 'string' && coverUrl.length > 0) {
    if (!coverUrl.startsWith('blob:')) image.crossOrigin = 'anonymous';
    image.src = coverUrl;
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
    if (shouldToggleFromCardSurface()) onToggle(work, !selected);
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
        checkbox.checked = Boolean(selected);
        return;
      }
      if (isSelectionEnabled()) onToggle(work, checkbox.checked);
      else checkbox.checked = Boolean(selected);
    });
    checkbox.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
  }

  const overlay = documentRef.createElement('div');
  overlay.className = 'selection-card-overlay';
  appendTextElement(documentRef, overlay, 'p', 'selection-card-title', displayTitle);
  if (view === 'full') {
    appendTextElement(documentRef, overlay, 'p', 'selection-card-company', work.brandName);
    const stats = documentRef.createElement('p');
    stats.className = 'selection-card-stats';
    appendTextElement(documentRef, stats, 'span', 'selection-card-median', work.median);
    appendTextElement(documentRef, stats, 'span', 'selection-card-votes', work.voteCount);
    overlay.append(stats);
  }

  let versionBadge = null;
  if (Number.isInteger(work.presentationMemberCount) && work.presentationMemberCount > 1) {
    versionBadge = documentRef.createElement('span');
    versionBadge.className = 'selection-card-version-badge';
    versionBadge.setAttribute('aria-label', `${work.presentationMemberCount} 个公开版本`);
    versionBadge.append(createActionIcon(documentRef, 'layers-2'));
    appendTextElement(documentRef, versionBadge, 'span', 'selection-card-version-count', work.presentationMemberCount);
  }

  const details = documentRef.createElement('button');
  details.type = 'button';
  details.className = 'selection-card-info selection-card-details icon-button';
  details.dataset.controlType = 'details';
  details.setAttribute('aria-label', card.getAttribute('aria-label'));
  details.title = card.getAttribute('aria-label');
  details.textContent = 'i';
  details.addEventListener('click', event => {
    event.stopPropagation();
    if (!isCardActive()) return;
    if (shouldToggleFromCardSurface()) onToggle(work, !selected);
    else onOpenDetails(work);
  });

  card.append(cover, ...(versionBadge === null ? [] : [versionBadge]), ...(checkbox === null ? [overlay, details] : [checkbox, overlay, details]));
  if (selected && !selectionEnabled) {
    const marker = documentRef.createElement('span');
    marker.className = 'selection-card-selected-mark';
    marker.textContent = '已选';
    marker.setAttribute('aria-label', '已选');
    card.append(marker);
  }
  return card;
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
  onCardViewChange,
  onFilterChange,
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
  assertFunction(onCardViewChange, 'onCardViewChange');
  assertFunction(onFilterChange, 'onFilterChange');
  assertFunction(onPageChange, 'onPageChange');
  let renderedWorkKey = '';
  let pageIndex = 0;
  let latestModel = null;
  let latestCoverUrls = null;
  const defaultSelectionMode = true;
  let selectionModeActive = defaultSelectionMode;
  let selectionModeEpoch = 0;

  const titleCommit = createDebouncedCommit(titleQuery => {
    onFilterChange({ titleQuery });
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
  elements.cardViewToggle.addEventListener('click', () => {
    if (latestModel === null) return;
    titleCommit.flush();
    onCardViewChange(latestModel.view === 'full' ? 'compact' : 'full');
  });
  elements.sortDirectionToggle.addEventListener('click', () => {
    if (latestModel === null) return;
    titleCommit.flush();
    onFilterChange({ sortDirection: latestModel.filterState.sortDirection === 'asc' ? 'desc' : 'asc' });
  });
  elements.sortKey.addEventListener('change', () => {
    const sortKey = elements.sortKey.value;
    if (!FILTER_SORT_KEYS.has(sortKey)) return;
    titleCommit.flush();
    onFilterChange({ sortKey });
  });
  elements.title.addEventListener('input', () => {
    titleCommit(elements.title.value);
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
    if (scroll && pageIndex !== previousIndex) root.scrollTop = 0;
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
      // Every card render invalidates handlers retained by a previous page or
      // filter result before the new DOM is installed.
      selectionModeEpoch += 1;
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
      setListState({
        status: elements.listState,
        state: model.works.length === 0 ? 'empty' : 'ready',
        message: '没有匹配的作品。'
      });
      const renderedSelectionEpoch = selectionModeEpoch;
      const cards = visibleWorks.map(work => createSelectionCard(documentRef, work, {
        view: model.view,
        selected: selected.has(work.workId),
        selectionEnabled: Boolean(model.selectionMode),
        isSelectionEnabled: () => selectionModeActive && selectionModeEpoch === renderedSelectionEpoch,
        onToggle: (...args) => {
          if (selectionModeActive && selectionModeEpoch === renderedSelectionEpoch) onToggleWork(...args);
        },
        selectionHotspots: cardSurfaceSelection && Boolean(model.selectionMode),
        isCardActive: () => selectionModeEpoch === renderedSelectionEpoch,
        onOpenDetails,
        coverUrl: latestCoverUrls?.get?.(work.workId) ?? null,
        assetBase
      }));
      releaseGridImages(elements.grid);
      elements.grid.replaceChildren(...cards);
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
      elements.cardViewToggle.setAttribute('aria-pressed', String(model.view === 'compact'));
      elements.cardViewToggle.textContent = `卡片显示：${model.view === 'full' ? '完整' : '简约'}`;
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
    setSelectionMode(active) {
      const nextActive = Boolean(active);
      if (selectionModeActive !== nextActive) selectionModeEpoch += 1;
      selectionModeActive = nextActive;
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
      return { top: root.scrollTop, left: root.scrollLeft };
    },

    restoreScroll(position) {
      if (position === null || typeof position !== 'object') return;
      root.scrollTop = Number.isFinite(position.top) ? position.top : 0;
      root.scrollLeft = Number.isFinite(position.left) ? position.left : 0;
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
