import { applyImageAsset, AssetUrlError } from '../lib/asset-url.js';

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
  assetBase
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

  const card = documentRef.createElement('article');
  card.className = `selection-card selection-card-${view}`;
  card.classList.toggle('is-selected', Boolean(selected));
  card.dataset.workId = work.workId;
  card.setAttribute('aria-label', `查看 ${work.title} 详情`);

  const image = documentRef.createElement('img');
  try {
    applyImageAsset(image, work, assetBase);
  } catch (error) {
    if (error instanceof AssetUrlError) {
      throw new TypeError('work.coverPath must use the approved public asset path');
    }
    throw error;
  }
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  installMissingImageFallback(documentRef, card, image);

  const checkbox = documentRef.createElement('input');
  checkbox.className = 'selection-card-checkbox';
  checkbox.type = 'checkbox';
  checkbox.dataset.controlType = 'checkbox';
  checkbox.checked = Boolean(selected);
  checkbox.setAttribute('aria-label', `${selected ? '取消选择' : '选择'} ${work.title}`);
  checkbox.addEventListener('click', event => event.stopPropagation());
  checkbox.addEventListener('change', event => {
    event.stopPropagation();
    onToggle(work, checkbox.checked);
  });
  checkbox.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  });

  const overlay = documentRef.createElement('div');
  overlay.className = 'selection-card-overlay';
  appendTextElement(documentRef, overlay, 'p', 'selection-card-title', work.title);
  if (view === 'full') {
    appendTextElement(documentRef, overlay, 'p', 'selection-card-company', work.brandName);
    const stats = documentRef.createElement('p');
    stats.className = 'selection-card-stats';
    appendTextElement(documentRef, stats, 'span', 'selection-card-median', work.median);
    appendTextElement(documentRef, stats, 'span', 'selection-card-votes', work.voteCount);
    overlay.append(stats);
  }

  const details = documentRef.createElement('button');
  details.type = 'button';
  details.className = 'selection-card-details';
  details.dataset.controlType = 'details';
  details.setAttribute('aria-label', card.getAttribute('aria-label'));
  details.addEventListener('click', () => onOpenDetails(work));

  card.append(image, checkbox, overlay, details);
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
  onToggleCurrentResults,
  onOpenDetails,
  onCardViewChange,
  onFilterChange,
  assetBase
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
    selectAll: requiredOwnedElement(root, 'select-current-results'),
    cardFull: requiredOwnedElement(root, 'card-view-full'),
    cardCompact: requiredOwnedElement(root, 'card-view-compact'),
    title: requiredOwnedElement(root, 'title-search'),
    sortKey: requiredOwnedElement(root, 'sort-key'),
    sortDirection: requiredOwnedElement(root, 'sort-direction'),
    selectedOnly: requiredOwnedElement(root, 'selected-only')
  };
  assertFunction(onToggleWork, 'onToggleWork');
  assertFunction(onToggleCurrentResults, 'onToggleCurrentResults');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(onCardViewChange, 'onCardViewChange');
  assertFunction(onFilterChange, 'onFilterChange');
  let renderedWorkKey = '';
  let pageIndex = 0;

  const titleCommit = createDebouncedCommit(titleQuery => {
    onFilterChange({ titleQuery });
  });

  elements.selectAll.addEventListener('change', () => {
    onToggleCurrentResults(elements.selectAll.checked);
  });
  elements.cardFull.addEventListener('click', () => {
    titleCommit.flush();
    onCardViewChange('full');
  });
  elements.cardCompact.addEventListener('click', () => {
    titleCommit.flush();
    onCardViewChange('compact');
  });
  elements.selectedOnly.addEventListener('change', () => {
    const selectedOnly = elements.selectedOnly.checked;
    titleCommit.flush();
    onFilterChange({ selectedOnly });
  });
  elements.sortKey.addEventListener('change', () => {
    const sortKey = elements.sortKey.value;
    if (!FILTER_SORT_KEYS.has(sortKey)) return;
    titleCommit.flush();
    onFilterChange({ sortKey });
  });
  elements.sortDirection.addEventListener('change', () => {
    const sortDirection = elements.sortDirection.value;
    if (!FILTER_SORT_DIRECTIONS.has(sortDirection)) return;
    titleCommit.flush();
    onFilterChange({ sortDirection });
  });
  elements.title.addEventListener('input', () => {
    titleCommit(elements.title.value);
  });

  return Object.freeze({
    render(model) {
      if (
        !Array.isArray(model?.works)
        || !Array.isArray(model?.selectedWorkIds)
        || model.filterState === null
        || typeof model.filterState !== 'object'
      ) {
        throw new TypeError('model must contain works, selectedWorkIds, and filterState');
      }
      const activeElement = documentRef.activeElement;
      const activeCard = activeElement?.parentElement;
      const focusTarget = activeCard?.dataset?.workId && activeElement?.dataset?.controlType
        ? {
            workId: activeCard.dataset.workId,
            controlType: activeElement.dataset.controlType
          }
        : null;
      const workKey = model.works.map(work => work.workId).join('\u001f');
      if (workKey !== renderedWorkKey) {
        renderedWorkKey = workKey;
        pageIndex = 0;
      }
      const selected = new Set(model.selectedWorkIds);
      const pages = selectionPages(model.works.length);
      pageIndex = Math.min(pageIndex, pages.length - 1);
      const page = pages[pageIndex];
      const visibleWorks = model.works.slice(page.start, page.end);
      const cards = visibleWorks.map(work => createSelectionCard(documentRef, work, {
        view: model.view,
        selected: selected.has(work.workId),
        onToggle: onToggleWork,
        onOpenDetails,
        assetBase
      }));
      if (pageIndex > 0) {
        const previous = documentRef.createElement('button');
        previous.type = 'button';
        previous.className = 'selection-window-previous';
        previous.textContent = `上一页 ${pageIndex} / ${pages.length}`;
        previous.addEventListener('click', () => {
          pageIndex -= 1;
          this.render(model);
        });
        cards.push(previous);
      }
      if (pageIndex < pages.length - 1) {
        const more = documentRef.createElement('button');
        more.type = 'button';
        more.className = 'selection-window-more';
        more.textContent = `加载更多 ${pageIndex + 2} / ${pages.length}`;
        more.addEventListener('click', () => {
          pageIndex += 1;
          this.render(model);
        });
        cards.push(more);
      }
      releaseGridImages(elements.grid);
      elements.grid.replaceChildren(...cards);
      if (focusTarget !== null) {
        const focusedCard = cards.find(card => card.dataset.workId === focusTarget.workId);
        const focusedControl = Array.from(focusedCard?.children ?? []).find(
          child => child.dataset.controlType === focusTarget.controlType
        );
        focusedControl?.focus?.();
      }
      syncSelectAllCheckbox(elements.selectAll, model.selectAllState);
      elements.cardFull.setAttribute('aria-pressed', String(model.view === 'full'));
      elements.cardCompact.setAttribute('aria-pressed', String(model.view === 'compact'));
      if (!titleCommit.pending()) elements.title.value = model.filterState.titleQuery;
      elements.sortKey.value = model.filterState.sortKey;
      elements.sortDirection.value = model.filterState.sortDirection;
      elements.selectedOnly.checked = model.filterState.selectedOnly;
    },

    captureScroll() {
      return { top: root.scrollTop, left: root.scrollLeft };
    },

    restoreScroll(position) {
      if (position === null || typeof position !== 'object') return;
      root.scrollTop = Number.isFinite(position.top) ? position.top : 0;
      root.scrollLeft = Number.isFinite(position.left) ? position.left : 0;
    }
  });
}
