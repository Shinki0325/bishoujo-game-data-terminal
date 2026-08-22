import { edgeScrollVelocity, insertionIndexFromPoint } from '../lib/drag.js';
import { applyImageAsset, AssetUrlError } from '../lib/asset-url.js';
import { MAX_TIERS, moveTier } from '../lib/tier-config.js';
import { TIER_COLOR_IDS, tierColor } from '../lib/tier-palette.js';
import { annotationLines } from '../lib/ranking-presentation.js';

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function normalizeTitle(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}

function requireOwnedElement(root, selector, label) {
  const element = root.querySelector?.(selector);
  if (!element) throw new Error(`Ranking view root is missing ${label}`);
  return element;
}

function arrayFrom(value) {
  return Array.from(value ?? []);
}

function isRankingCard(node) {
  return node?.classList?.contains?.('ranking-card') === true;
}

function supportsNativeDrag(viewWindow) {
  const width = Number(viewWindow?.innerWidth);
  return !(Number.isFinite(width) && width > 0 && width <= 899);
}

function isDescendant(root, candidate) {
  let current = candidate;
  while (current !== null && current !== undefined) {
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
}

function detach(node) {
  const parent = node?.parentElement;
  if (!parent) return;
  parent.replaceChildren(...arrayFrom(parent.children).filter(child => child !== node));
}

export function placeFloatingPanel({ anchor, panel, viewport, margin = 8, gap = 4 }) {
  for (const [label, rect] of [['anchor', anchor], ['panel', panel], ['viewport', viewport]]) {
    if (rect === null || typeof rect !== 'object') throw new TypeError(`${label} must be an object`);
  }
  const left = Math.min(
    Math.max(margin, anchor.right - panel.width),
    Math.max(margin, viewport.width - panel.width - margin)
  );
  const above = anchor.top - panel.height - gap;
  const top = above >= margin
    ? above
    : Math.min(anchor.bottom + gap, Math.max(margin, viewport.height - panel.height - margin));
  return { left, top };
}

function snapshotIdArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must be dense`);
    const workId = value[index];
    if (typeof workId !== 'string' || workId.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    result.push(workId);
  }
  return result;
}

function snapshotTiers(value) {
  if (!Array.isArray(value)) throw new TypeError('state.tiers must be an array');
  const tiers = [];
  const tierIds = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError('state.tiers must be dense');
    const tier = value[index];
    if (tier === null || typeof tier !== 'object' || Array.isArray(tier)) {
      throw new TypeError(`state.tiers[${index}] must be an object`);
    }
    const { id, name, colorId } = tier;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`state.tiers[${index}].id must be a non-empty string`);
    }
    if (tierIds.has(id)) throw new TypeError(`state.tiers contains duplicate tier ID ${id}`);
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError(`state.tiers[${index}].name must be a non-empty string`);
    }
    if (typeof colorId !== 'string' || colorId.length === 0) {
      throw new TypeError(`state.tiers[${index}].colorId must be a non-empty string`);
    }
    tierColor(colorId);
    tierIds.add(id);
    tiers.push({ id, name, colorId });
  }
  return tiers;
}

function workFromMap(worksById, workId) {
  const item = worksById.get(workId);
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError(`worksById is missing ${workId}`);
  }
  if (item.workId !== workId || typeof item.title !== 'string') {
    throw new TypeError(`worksById entry ${workId} is invalid`);
  }
  return item;
}

function installMissingImageFallback(documentRef, card, image) {
  image.addEventListener('error', () => {
    if (card.classList.contains('is-image-missing')) return;
    image.src = '';
    image.removeAttribute?.('src');
    image.hidden = true;
    card.classList.add('is-image-missing');
    const fallback = documentRef.createElement('span');
    fallback.className = 'ranking-card-missing-image';
    fallback.textContent = '封面缺失';
    fallback.setAttribute('aria-hidden', 'true');
    card.append(fallback);
  }, { once: true });
}

export function createRankingCard(documentRef, work, callbacks) {
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('documentRef must provide createElement');
  }
  if (work === null || typeof work !== 'object' || Array.isArray(work)) {
    throw new TypeError('work must be an object');
  }
  if (typeof work.workId !== 'string' || work.workId.length === 0 || typeof work.title !== 'string') {
    throw new TypeError('work must contain workId and title strings');
  }
  if (callbacks === null || typeof callbacks !== 'object' || Array.isArray(callbacks)) {
    throw new TypeError('callbacks must be an object');
  }
  const {
    onOpenDetails,
    onOpenMedia = () => {},
    onContextMenu = (item => onOpenDetails(item)),
    onDragStart,
    onDragEnd,
    shouldSuppressMediaClick = () => false,
    isCardActivationEnabled = () => true,
    assetBase,
    coverUrl = null
  } = callbacks;
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(onOpenMedia, 'onOpenMedia');
  assertFunction(onContextMenu, 'onContextMenu');
  assertFunction(onDragStart, 'onDragStart');
  assertFunction(onDragEnd, 'onDragEnd');
  assertFunction(shouldSuppressMediaClick, 'shouldSuppressMediaClick');
  assertFunction(isCardActivationEnabled, 'isCardActivationEnabled');

  const displayTitle = typeof work.displayTitle === 'string' && work.displayTitle.length > 0
    ? work.displayTitle
    : work.title;
  const card = documentRef.createElement('article');
  card.className = 'ranking-card';
  card.dataset.workId = work.workId;
  // Mobile uses the same pointer-capture drag path as the reference Tier
  // board. Keeping HTML5 draggable active here causes the browser to cancel
  // the pointer stream before the custom drop-zone calculation can run.
  card.draggable = supportsNativeDrag(documentRef.defaultView);
  card.tabIndex = 0;
  card.setAttribute('aria-label', displayTitle);

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
  image.draggable = false;
  installMissingImageFallback(documentRef, card, image);

  const cover = documentRef.createElement('button');
  cover.type = 'button';
  cover.className = 'ranking-card-cover';
  cover.setAttribute('aria-label', `放大 ${displayTitle}`);
  cover.title = `放大 ${displayTitle}`;
  cover.addEventListener('click', event => {
    if (!isCardActivationEnabled(work) || shouldSuppressMediaClick(work)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    onOpenMedia(work);
  });
  cover.append(image);

  const title = documentRef.createElement('span');
  title.className = 'ranking-card-title';
  title.dataset.field = 'title';
  title.textContent = displayTitle;
  const handle = documentRef.createElement('button');
  handle.type = 'button';
  handle.className = 'ranking-drag-handle';
  handle.setAttribute('aria-label', `整理 ${displayTitle}`);
  handle.setAttribute('title', `整理 ${displayTitle}`);
  handle.textContent = '::';
  handle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  card.append(cover, title, handle);
  const desktopDetails = documentRef.defaultView?.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? true;
  card.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (event.pointerType === 'touch' || !desktopDetails) return;
    onContextMenu(work, card, event);
  });
  card.addEventListener('dragstart', event => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData?.('text/plain', work.workId);
    }
    onDragStart(work, card, event);
  });
  card.addEventListener('dragend', event => onDragEnd(work, card, event));
  return card;
}

export function buildRankingModel(state, worksById, candidateTitleQuery) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('state must be an object');
  }
  if (!(worksById instanceof Map)) throw new TypeError('worksById must be a Map');
  if (typeof candidateTitleQuery !== 'string') {
    throw new TypeError('candidateTitleQuery must be a string');
  }
  const selectedWorkIds = snapshotIdArray(state.selectedWorkIds, 'state.selectedWorkIds');
  const tierConfig = snapshotTiers(state.tiers);
  const selectedSet = new Set();
  for (const workId of selectedWorkIds) {
    if (selectedSet.has(workId)) throw new TypeError('state.selectedWorkIds must be unique');
    selectedSet.add(workId);
    workFromMap(worksById, workId);
  }
  if (state.tierOrder === null || typeof state.tierOrder !== 'object' || Array.isArray(state.tierOrder)) {
    throw new TypeError('state.tierOrder must be an object');
  }

  const rankedSet = new Set();
  const tiers = tierConfig.map(tier => {
    const row = snapshotIdArray(state.tierOrder[tier.id], `state.tierOrder.${tier.id}`);
    const tierWorks = row.map(workId => {
      if (!selectedSet.has(workId)) throw new TypeError(`${workId} is ranked but not selected`);
      if (rankedSet.has(workId)) throw new TypeError(`${workId} has multiple placements`);
      rankedSet.add(workId);
      return workFromMap(worksById, workId);
    });
    return { ...tier, works: tierWorks };
  });

  const normalizedQuery = normalizeTitle(candidateTitleQuery);
  const candidateWorks = selectedWorkIds
    .filter(workId => !rankedSet.has(workId))
    .map(workId => workFromMap(worksById, workId))
    .filter(item => normalizedQuery.length === 0 || normalizeTitle(item.title).includes(normalizedQuery));

  return {
    tiers,
    candidateWorks,
    candidateTitleQuery
  };
}

export function createRankingView({
  root,
  createCard = (documentRef, item, callbacks) => createRankingCard(documentRef, item, callbacks),
  onMoveToTier,
  onMoveToUnranked,
  onOpenDetails,
  onOpenMedia = () => {},
  onCandidateSearch,
  onTierConfigChange = () => {},
  onTierDelete = () => {},
  onAddTier = () => {},
  onRequestMediaImport = () => {},
  onAnnotationChange = () => {},
  onRemoveCandidate = () => {},
  onRemoveCandidates = workIds => onRemoveCandidate(workIds[0]),
  onMoveCandidatesToTier = () => {},
  showImportTile = () => true,
  isCardActivationEnabled = () => true,
  candidateHoldDelayMs = 300,
  assetBase
}) {
  if (root === null || typeof root?.querySelector !== 'function') {
    throw new TypeError('root must provide querySelector');
  }
  const documentRef = root.ownerDocument;
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('root must provide ownerDocument.createElement');
  }
  assertFunction(onMoveToTier, 'onMoveToTier');
  assertFunction(createCard, 'createCard');
  assertFunction(onMoveToUnranked, 'onMoveToUnranked');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(onOpenMedia, 'onOpenMedia');
  assertFunction(onCandidateSearch, 'onCandidateSearch');
  assertFunction(onTierConfigChange, 'onTierConfigChange');
  assertFunction(onTierDelete, 'onTierDelete');
  assertFunction(onAddTier, 'onAddTier');
  assertFunction(onRequestMediaImport, 'onRequestMediaImport');
  assertFunction(onAnnotationChange, 'onAnnotationChange');
  assertFunction(onRemoveCandidate, 'onRemoveCandidate');
  assertFunction(onRemoveCandidates, 'onRemoveCandidates');
  assertFunction(onMoveCandidatesToTier, 'onMoveCandidatesToTier');
  assertFunction(showImportTile, 'showImportTile');
  assertFunction(isCardActivationEnabled, 'isCardActivationEnabled');
  if (!Number.isFinite(candidateHoldDelayMs) || candidateHoldDelayMs < 0) {
    throw new TypeError('candidateHoldDelayMs must be a non-negative number');
  }

  const tierBoard = requireOwnedElement(root, '#tier-board', '#tier-board');
  const candidateSearch = requireOwnedElement(root, '#ranking-candidate-search', '#ranking-candidate-search');
  const candidatePool = requireOwnedElement(root, '#ranking-candidate-grid', '#ranking-candidate-grid');
  const tierRows = new Map();
  const tierTracks = new Map();

  const viewWindow = documentRef.defaultView ?? globalThis;
  const requestFrame = typeof viewWindow.requestAnimationFrame === 'function'
    ? callback => viewWindow.requestAnimationFrame(callback)
    : callback => globalThis.setTimeout(callback, 16);
  const cancelFrame = typeof viewWindow.cancelAnimationFrame === 'function'
    ? frameId => viewWindow.cancelAnimationFrame(frameId)
    : frameId => globalThis.clearTimeout(frameId);
  const indicator = documentRef.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  let mobileDragProxy = null;
  let mobileDropHint = null;
  let mobileDragOffsetX = 0;
  let mobileDragOffsetY = 0;
  let mobileTierEditor = null;

  let model = null;
  let draggedWorkId = null;
  let draggedWorkIds = [];
  let dragOrigin = null;
  const candidateSelection = new Set();
  let candidateHoldTimer = null;
  let candidateSelectionActive = false;
  let candidatePointerId = null;
  let showCounts = false;
  let showTitles = true;
  let annotations = {};
  let dropPlan = null;
  let autoScrollFrame = null;
  let autoScrollTrack = null;
  let autoScrollPointerX = 0;
  let autoScrollRoot = false;
  let autoScrollPointerY = 0;
  let editingTierId = null;
  let focusTierId = null;
  let immersive = false;
  let colorPalette = null;
  let colorPaletteTrigger = null;
  let annotationEditor = null;
  let touchDrag = null;
  let suppressedTouchClickWorkId = null;
  let suppressedTouchClickTimer = null;
  const touchDragHoldDelayMs = 220;

  function pageScrollTarget() {
    return immersive ? root : documentRef.scrollingElement ?? root;
  }

  function capturePageScroll() {
    const target = pageScrollTarget();
    return {
      top: Number.isFinite(target?.scrollTop) ? target.scrollTop : 0,
      left: Number.isFinite(target?.scrollLeft) ? target.scrollLeft : 0
    };
  }

  function restorePageScroll(position) {
    const target = pageScrollTarget();
    if (target === null || typeof target !== 'object') return;
    target.scrollTop = Number.isFinite(position?.top) ? position.top : 0;
    target.scrollLeft = Number.isFinite(position?.left) ? position.left : 0;
  }

  const scheduleHold = typeof viewWindow.setTimeout === 'function'
    ? (callback, delay) => viewWindow.setTimeout(callback, delay)
    : (callback, delay) => globalThis.setTimeout(callback, delay);
  const cancelHold = typeof viewWindow.clearTimeout === 'function'
    ? timerId => viewWindow.clearTimeout(timerId)
    : timerId => globalThis.clearTimeout(timerId);
  let candidateToolbar = candidateSearch.parentElement;
  while (candidateToolbar && !candidateToolbar.classList?.contains('candidate-toolbar')) {
    candidateToolbar = candidateToolbar.parentElement;
  }
  candidateToolbar ??= candidateSearch.parentElement;
  const candidateBatchActions = documentRef.createElement('div');
  candidateBatchActions.className = 'candidate-batch-actions';
  candidateBatchActions.setAttribute('aria-label', '候选批量操作');
  const candidateSelectAllLabel = documentRef.createElement('label');
  candidateSelectAllLabel.className = 'candidate-select-all';
  const candidateSelectAll = documentRef.createElement('input');
  candidateSelectAll.type = 'checkbox';
  candidateSelectAll.setAttribute('aria-label', '全选当前候选');
  const candidateSelectAllText = documentRef.createElement('span');
  candidateSelectAllText.textContent = '全选';
  candidateSelectAllLabel.append(candidateSelectAll, candidateSelectAllText);
  const candidateSelectedCount = documentRef.createElement('output');
  candidateSelectedCount.className = 'candidate-selected-count';
  candidateSelectedCount.textContent = '0';
  const candidateRemoveSelected = documentRef.createElement('button');
  candidateRemoveSelected.type = 'button';
  candidateRemoveSelected.className = 'candidate-remove-selected';
  candidateRemoveSelected.textContent = '移除所选';
  candidateRemoveSelected.disabled = true;
  candidateBatchActions.append(candidateSelectAllLabel, candidateSelectedCount, candidateRemoveSelected);
  candidateToolbar?.append(candidateBatchActions);

  function candidateSelectionIds() {
    return (model?.candidateWorks ?? [])
      .map(work => work.workId)
      .filter(workId => candidateSelection.has(workId));
  }

  function updateCandidateSelection() {
    const visibleIds = new Set((model?.candidateWorks ?? []).map(work => work.workId));
    for (const workId of [...candidateSelection]) {
      if (!visibleIds.has(workId)) candidateSelection.delete(workId);
    }
    for (const card of arrayFrom(candidatePool.querySelectorAll?.('.ranking-card'))) {
      const selected = candidateSelection.has(card.dataset.workId);
      card.classList.toggle('is-candidate-selected', selected);
      const checkbox = card.querySelector?.('.ranking-candidate-select');
      if (checkbox) checkbox.checked = selected;
    }
    const selectedIds = candidateSelectionIds();
    const total = visibleIds.size;
    candidateSelectedCount.textContent = String(selectedIds.length);
    candidateRemoveSelected.disabled = selectedIds.length === 0;
    candidateSelectAll.checked = total > 0 && selectedIds.length === total;
    candidateSelectAll.indeterminate = selectedIds.length > 0 && selectedIds.length < total;
  }

  function setCandidateSelected(workId, selected) {
    if (selected) candidateSelection.add(workId);
    else candidateSelection.delete(workId);
    updateCandidateSelection();
  }

  function clearCandidateHold() {
    if (candidateHoldTimer !== null) {
      cancelHold(candidateHoldTimer);
      candidateHoldTimer = null;
    }
  }

  function finishCandidateSelectionGesture() {
    clearCandidateHold();
    candidateSelectionActive = false;
    candidatePointerId = null;
    for (const card of arrayFrom(candidatePool.querySelectorAll?.('.ranking-card'))) {
      card.draggable = supportsNativeDrag(viewWindow);
    }
  }

  function isTouchPointer(event) {
    return event?.pointerType === 'touch';
  }

  function clearSuppressedTouchClick() {
    if (suppressedTouchClickTimer !== null) cancelHold(suppressedTouchClickTimer);
    suppressedTouchClickTimer = null;
    suppressedTouchClickWorkId = null;
  }

  function suppressNextTouchClick(workId) {
    clearSuppressedTouchClick();
    suppressedTouchClickWorkId = workId;
    suppressedTouchClickTimer = scheduleHold(clearSuppressedTouchClick, 600);
  }

  function shouldSuppressMediaClick(work) {
    if (suppressedTouchClickWorkId !== work.workId) return false;
    clearSuppressedTouchClick();
    return true;
  }

  function rankingCardFromNode(node) {
    let current = node;
    while (current && current !== root) {
      if (isRankingCard(current) && root.contains(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function rankingCardFromPointer(event) {
    const directCard = rankingCardFromNode(event?.target);
    if (directCard) return directCard;
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return arrayFrom(root.querySelectorAll?.('.ranking-card')).find(card => {
      const rect = card.getBoundingClientRect?.();
      return rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) ?? null;
  }

  function tierIdFromNode(node) {
    let current = node;
    while (current && current !== root) {
      if (current.classList?.contains?.('tier-row') && typeof current.dataset?.tierId === 'string') {
        return current.dataset.tierId;
      }
      current = current.parentElement;
    }
    return null;
  }

  function tierIdFromPointer(event) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (const [tierId, row] of tierRows) {
      const rect = row.getBoundingClientRect?.();
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return tierId;
    }
    return null;
  }

  function dropNodeForPointer(event) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const hit = documentRef.elementFromPoint?.(x, y);
      if (hit) return hit;
    }
    return event?.target ?? null;
  }

  function pointerIsInsideCandidatePool(event) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    const rect = candidatePool.getBoundingClientRect?.();
    return Boolean(
      rect
      && Number.isFinite(x)
      && Number.isFinite(y)
      && x >= rect.left
      && x <= rect.right
      && y >= rect.top
      && y <= rect.bottom
    );
  }

  function startDrag(workId, card, { includeCandidateSelection = true } = {}) {
    clearDropState();
    draggedWorkId = workId;
    dragOrigin = card.parentElement?.classList.contains('tier-track') ? 'tier' : 'pool';
    draggedWorkIds = includeCandidateSelection && dragOrigin === 'pool' && candidateSelection.has(workId)
      ? candidateSelectionIds()
      : [workId];
    card.classList.add('is-dragging');
    if (draggedWorkIds.length > 1) {
      card.dataset.selectionCount = String(draggedWorkIds.length);
      card.classList.add('is-dragging-group');
    }
  }

  function clearDragCard(card) {
    card?.classList?.remove('is-dragging');
    card?.classList?.remove('is-dragging-group');
    card?.classList?.remove('is-mobile-dragging');
    if (card) card.draggable = supportsNativeDrag(viewWindow);
    if (card?.dataset) delete card.dataset.selectionCount;
  }

  function clearTouchDrag() {
    if (touchDrag?.timer !== null) cancelHold(touchDrag.timer);
    touchDrag = null;
  }

  function mobileCandidateDrawerButton() {
    return documentRef.getElementById?.('mobile-ranking-candidates')
      ?? root.querySelector?.('#mobile-ranking-candidates')
      ?? null;
  }

  function setMobileCandidateDrawer(open) {
    documentRef.body?.classList?.toggle('is-mobile-ranking-candidates-open', open);
    const button = mobileCandidateDrawerButton();
    button?.setAttribute?.('aria-expanded', String(open));
    const label = button?.querySelector?.('#mobile-ranking-candidates-label');
    if (label) label.textContent = open ? '收起候选' : '展开候选';
  }

  function removeMobileDragVisuals() {
    for (const node of [mobileDragProxy, mobileDropHint]) {
      if (!node) continue;
      if (typeof node.remove === 'function') {
        node.remove();
      } else if (node.parentElement?.replaceChildren) {
        node.parentElement.replaceChildren(...arrayFrom(node.parentElement.children).filter(child => child !== node));
      }
    }
    mobileDragProxy = null;
    mobileDropHint = null;
    mobileDragOffsetX = 0;
    mobileDragOffsetY = 0;
  }

  function createMobileDragVisuals(card, event) {
    removeMobileDragVisuals();
    const host = documentRef.body ?? root;
    if (!host?.append) return;
    const rect = card.getBoundingClientRect?.();
    if (rect) {
      mobileDragOffsetX = Math.max(0, Math.min(rect.width, Number(event?.clientX) - rect.left));
      mobileDragOffsetY = Math.max(0, Math.min(rect.height, Number(event?.clientY) - rect.top));
    }
    const proxy = card.cloneNode?.(true) ?? documentRef.createElement('div');
    if (proxy) {
      if (typeof proxy.cloneNode !== 'function') {
        proxy.textContent = card.querySelector?.('.ranking-card-title')?.textContent ?? card.getAttribute?.('aria-label') ?? '';
      }
      proxy.classList.add('mobile-ranking-drag-proxy');
      proxy.setAttribute('aria-hidden', 'true');
      proxy.tabIndex = -1;
      for (const control of arrayFrom(proxy.querySelectorAll?.('button, input'))) control.tabIndex = -1;
      if (rect) {
        proxy.style.setProperty('width', `${Math.max(44, rect.width)}px`);
        proxy.style.setProperty('height', `${Math.max(44, rect.height)}px`);
      }
      host.append(proxy);
      mobileDragProxy = proxy;
    }
    const hint = documentRef.createElement('div');
    hint.className = 'mobile-ranking-drop-hint';
    hint.setAttribute('aria-hidden', 'true');
    host.append(hint);
    mobileDropHint = hint;
    updateMobileDragVisuals(event, null);
  }

  function updateMobileDragVisuals(event, tierId, candidateTarget = false) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const transform = `translate3d(${x - mobileDragOffsetX}px, ${y - mobileDragOffsetY}px, 0)`;
    mobileDragProxy?.style?.setProperty('transform', transform);
    mobileDropHint?.style?.setProperty('transform', `translate3d(${x + 10}px, ${y - 30}px, 0)`);
    if (!mobileDropHint) return;
    const tier = tierId === null ? null : model?.tiers?.find(item => item.id === tierId) ?? null;
    mobileDropHint.textContent = candidateTarget ? '放回候选' : tier ? `放入 ${tier.name}` : '拖到分级';
    mobileDropHint.classList.toggle('has-target', candidateTarget || tier !== null);
  }

  function startMobileRootAutoScroll(pointerY) {
    autoScrollRoot = typeof root.getBoundingClientRect === 'function';
    autoScrollPointerY = pointerY;
    if (autoScrollFrame === null) autoScrollFrame = requestFrame(runAutoScroll);
  }

  function scrollableAncestor(node, axis) {
    let current = node;
    while (current && current !== root.parentElement) {
      const style = viewWindow.getComputedStyle?.(current);
      const overflow = axis === 'x' ? style?.overflowX : style?.overflowY;
      const scrollSize = axis === 'x' ? Number(current.scrollWidth) : Number(current.scrollHeight);
      const clientSize = axis === 'x' ? Number(current.clientWidth) : Number(current.clientHeight);
      if ((overflow === 'auto' || overflow === 'scroll') && scrollSize > clientSize + 1) return current;
      current = current.parentElement;
    }
    const page = documentRef.scrollingElement;
    return page && (axis === 'x' ? page.scrollWidth > page.clientWidth + 1 : page.scrollHeight > page.clientHeight + 1)
      ? page
      : null;
  }

  function scrollTouchBrowse(gesture, event) {
    const deltaX = (Number(event.clientX) || 0) - gesture.lastX;
    const deltaY = (Number(event.clientY) || 0) - gesture.lastY;
    gesture.lastX = Number(event.clientX) || gesture.lastX;
    gesture.lastY = Number(event.clientY) || gesture.lastY;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const target = horizontal
      ? scrollableAncestor(gesture.card, 'x')
      : scrollableAncestor(gesture.card, 'y');
    if (!target) return;
    if (horizontal) target.scrollLeft -= deltaX;
    else target.scrollTop -= deltaY;
    event.preventDefault?.();
  }

  function beginTouchDrag(event) {
    if (!viewWindow.matchMedia?.('(max-width: 899px)')?.matches) return;
    if (!isTouchPointer(event) || touchDrag !== null) return;
    const card = rankingCardFromPointer(event);
    if (!card || event.target?.classList?.contains?.('ranking-candidate-select')
      || event.target?.classList?.contains?.('ranking-candidate-remove')) return;
    const pointerId = event.pointerId ?? 0;
    event.preventDefault?.();
    const gesture = {
      pointerId,
      card,
      row: card.closest?.('.tier-row'),
      started: true,
      timer: null,
      startX: Number(event.clientX) || 0,
      startY: Number(event.clientY) || 0
    };
    touchDrag = gesture;
    clearCandidateHold();
    finishCandidateSelectionGesture();
    startDrag(card.dataset.workId, card, { includeCandidateSelection: false });
    root.classList.add('is-mobile-ranking-dragging');
    root.classList.toggle('is-mobile-ranking-dragging-from-pool', dragOrigin === 'pool');
    gesture.restoreCandidateDrawer = dragOrigin === 'pool'
      && documentRef.body?.classList?.contains('is-mobile-ranking-candidates-open');
    if (gesture.restoreCandidateDrawer) setMobileCandidateDrawer(false);
    card.classList.add('is-mobile-dragging');
    card.draggable = false;
    gesture.row?.classList.add('is-mobile-touch-dragging');
    card.setPointerCapture?.(pointerId);
    createMobileDragVisuals(card, event);
  }

  function updateTouchDrag(event) {
    const gesture = touchDrag;
    if (!gesture || (event.pointerId ?? 0) !== gesture.pointerId) return;
    const target = dropNodeForPointer(event);
    const tierId = tierIdFromPointer(event) ?? tierIdFromNode(target);
    const candidateTarget = pointerIsInsideCandidatePool(event);
    if (candidateTarget) handlePoolDragOver(event);
    else if (tierId !== null && tierTracks.has(tierId)) handleTierDragOver(tierId, event);
    else clearDropState();
    updateMobileDragVisuals(event, candidateTarget ? null : tierId, candidateTarget);
    startMobileRootAutoScroll(Number(event.clientY) || 0);
    event.preventDefault?.();
  }

  function finishTouchDrag(event) {
    const gesture = touchDrag;
    if (!gesture || (event.pointerId ?? 0) !== gesture.pointerId) return;
    clearTouchDrag();
    if (!gesture.started) return;
    const cancelled = event.type === 'pointercancel';
    if (!cancelled) {
      const finalTarget = dropNodeForPointer(event);
      const finalTierId = tierIdFromPointer(event) ?? tierIdFromNode(finalTarget);
      if (pointerIsInsideCandidatePool(event)) handlePoolDragOver(event);
      else if (finalTierId !== null && tierTracks.has(finalTierId)) handleTierDragOver(finalTierId, event);
    }
    const workId = draggedWorkId;
    const workIds = [...draggedWorkIds];
    const plan = cancelled ? null : dropPlan;
    clearDropState();
    root.classList.remove('is-mobile-ranking-dragging', 'is-mobile-ranking-dragging-from-pool');
    draggedWorkId = null;
    draggedWorkIds = [];
    dragOrigin = null;
    clearDragCard(gesture.card);
    gesture.row?.classList.remove('is-mobile-touch-dragging');
    removeMobileDragVisuals();
    suppressNextTouchClick(gesture.card.dataset.workId);
    event.preventDefault?.();
    if (workId === null || plan === null) {
      if (gesture.restoreCandidateDrawer) setMobileCandidateDrawer(true);
      return;
    }
    if (plan.type === 'tier') {
      if (workIds.length > 1 && workIds.every(id => model?.candidateWorks?.some(item => item.workId === id))) {
        onMoveCandidatesToTier(workIds, plan.tierId, plan.insertionIndex);
      } else {
        onMoveToTier(workId, plan.tierId, plan.insertionIndex);
      }
    } else if (plan.type === 'pool') {
      onMoveToUnranked(workId);
    }
    if (gesture.restoreCandidateDrawer) setMobileCandidateDrawer(true);
  }

  function candidateCardFromNode(node) {
    let current = node;
    while (current && current !== candidatePool) {
      if (isRankingCard(current) && candidatePool.contains(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function beginCandidateHold(workId, card, event) {
    // Touch holds are reserved for dragging. Candidate multi-selection on touch
    // remains explicit through the checkbox, so the two gesture timers cannot race.
    if (isTouchPointer(event)) return;
    if (immersive || event.target?.classList?.contains('ranking-candidate-select')
      || event.target?.classList?.contains('ranking-candidate-remove')) return;
    clearCandidateHold();
    candidatePointerId = event.pointerId ?? 0;
    candidateHoldTimer = scheduleHold(() => {
      candidateHoldTimer = null;
      candidateSelectionActive = true;
      card.draggable = false;
      setCandidateSelected(workId, true);
    }, candidateHoldDelayMs);
  }

  function updateTierTrackRows() {
    for (const [tierId, track] of tierTracks) {
      const row = tierRows.get(tierId);
      const cards = arrayFrom(track.children).filter(isRankingCard);
      const cardWidth = Number(cards[0]?.getBoundingClientRect?.().width) || 88;
      const trackWidth = Number(track.clientWidth)
        || Number(track.getBoundingClientRect?.().width)
        || Math.max(1, (Number(viewWindow.innerWidth) || 390) - 128);
      const capacity = Math.max(1, Math.floor((trackWidth - 22 + 9) / (cardWidth + 9)));
      row.dataset.trackRows = cards.length > capacity ? '2' : '1';
      track.style.setProperty('--tier-track-columns', String(capacity));
      for (const [index, card] of cards.entries()) {
        if (row.dataset.trackRows === '1') {
          card.style.removeProperty('grid-row');
          card.style.removeProperty('grid-column');
          continue;
        }
        const batchSize = capacity * 2;
        const batch = Math.floor(index / batchSize);
        const local = index % batchSize;
        card.style.setProperty('grid-row', String(local < capacity ? 1 : 2));
        card.style.setProperty(
          'grid-column',
          String(batch * capacity + (local % capacity) + 1)
        );
      }
    }
  }

  function closeColorPalette() {
    if (colorPaletteTrigger) colorPaletteTrigger.setAttribute('aria-expanded', 'false');
    detach(colorPalette);
    colorPalette = null;
    colorPaletteTrigger = null;
  }

  function closeAnnotationEditor(commit) {
    if (annotationEditor === null) return;
    const current = annotationEditor;
    annotationEditor = null;
    detach(current.input);
    if (commit) onAnnotationChange(current.work.workId, current.input.value);
  }

  function applyCardPresentation(card) {
    const title = card.querySelector?.('.ranking-card-title');
    if (title) title.hidden = !showTitles;
    const workId = card.dataset.workId;
    const value = annotations[workId] ?? '';
    let overlay = card.querySelector?.('.ranking-card-annotation');
    if (value.length === 0) {
      detach(overlay);
      return;
    }
    if (!overlay) {
      overlay = documentRef.createElement('span');
      overlay.className = 'ranking-card-annotation';
      overlay.setAttribute('aria-hidden', 'true');
      card.querySelector('.ranking-card-cover').append(overlay);
    }
    overlay.textContent = annotationLines(value).join('\n');
    overlay.hidden = !immersive;
  }

  function beginAnnotationEdit(work, card) {
    closeAnnotationEditor(true);
    const input = documentRef.createElement('input');
    input.type = 'text';
    input.className = 'ranking-annotation-input';
    input.maxLength = 16;
    input.value = annotations[work.workId] ?? '';
    input.setAttribute('aria-label', `编辑${work.title}的标注`);
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAnnotationEditor(false);
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        closeAnnotationEditor(true);
      }
    });
    card.querySelector('.ranking-card-cover').append(input);
    annotationEditor = { work, card, input };
    input.focus?.();
    input.select?.();
  }

  function openColorPalette(tier, trigger) {
    closeColorPalette();
    const palette = documentRef.createElement('div');
    palette.className = 'tier-color-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', '等级颜色');
    for (const colorId of TIER_COLOR_IDS) {
      const option = documentRef.createElement('button');
      const optionColor = tierColor(colorId);
      option.type = 'button';
      option.className = 'tier-color-option';
      option.dataset.colorId = colorId;
      option.style.setProperty('background', optionColor.background);
      option.setAttribute('aria-label', `选择${colorId}颜色`);
      option.setAttribute('title', `选择${colorId}颜色`);
      option.addEventListener('click', event => {
        event.stopPropagation();
        const nextTiers = model.tiers.map(item => ({
          ...item,
          colorId: item.id === tier.id ? colorId : item.colorId
        }));
        closeColorPalette();
        onTierConfigChange(snapshotTierConfig(nextTiers));
      });
      palette.append(option);
    }
    const customColor = documentRef.createElement('input');
    customColor.type = 'color';
    customColor.className = 'tier-custom-color-input';
    customColor.value = tierColor(tier.colorId).background;
    customColor.setAttribute('aria-label', '自定义颜色');
    customColor.setAttribute('title', '自定义颜色');
    customColor.addEventListener('change', event => {
      event.stopPropagation();
      const colorId = tierColor(customColor.value).background;
      const nextTiers = model.tiers.map(item => ({
        ...item,
        colorId: item.id === tier.id ? colorId : item.colorId
      }));
      closeColorPalette();
      onTierConfigChange(snapshotTierConfig(nextTiers));
    });
    palette.append(customColor);
    documentRef.body.append(palette);
    colorPalette = palette;
    colorPaletteTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    const anchor = trigger.getBoundingClientRect?.() ?? {
      left: 8, right: 30, top: 8, bottom: 30, width: 22, height: 22
    };
    const measured = palette.getBoundingClientRect?.() ?? { width: 119, height: 81 };
    const panel = {
      width: Number.isFinite(measured.width) && measured.width > 0 ? measured.width : 119,
      height: Number.isFinite(measured.height) && measured.height > 0 ? measured.height : 81
    };
    const position = placeFloatingPanel({
      anchor,
      panel,
      viewport: {
        width: Number(viewWindow.innerWidth) || 390,
        height: Number(viewWindow.innerHeight) || 844
      }
    });
    palette.style.setProperty('left', `${position.left}px`);
    palette.style.setProperty('top', `${position.top}px`);
  }

  function removeIndicator() {
    const parent = indicator.parentElement;
    if (!parent) return;
    parent.replaceChildren(...arrayFrom(parent.children).filter(child => child !== indicator));
  }

  function stopAutoScroll() {
    autoScrollTrack = null;
    autoScrollRoot = false;
    if (autoScrollFrame !== null) {
      cancelFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  function runAutoScroll() {
    autoScrollFrame = null;
    if (autoScrollTrack === null && !autoScrollRoot) return;
    let shouldContinue = false;
    try {
      if (autoScrollTrack !== null) {
        const rect = autoScrollTrack.getBoundingClientRect();
        const velocity = edgeScrollVelocity({
          pointerX: autoScrollPointerX,
          left: rect.left,
          right: rect.right
        });
        if (velocity === 0) {
          autoScrollTrack = null;
        } else {
          const before = Number(autoScrollTrack.scrollLeft);
          autoScrollTrack.scrollLeft = before + velocity;
          const after = Number(autoScrollTrack.scrollLeft);
          const maximum = Number(autoScrollTrack.scrollWidth) - Number(autoScrollTrack.clientWidth);
          const reachedBoundary = !Number.isFinite(before)
            || !Number.isFinite(after)
            || after === before
            || (velocity < 0 && after <= 0)
            || (velocity > 0 && Number.isFinite(maximum) && after >= Math.max(0, maximum));
          if (reachedBoundary) autoScrollTrack = null;
          else shouldContinue = true;
        }
      }
      if (autoScrollRoot) {
        const target = pageScrollTarget();
        const viewportHeight = Number(viewWindow.innerHeight);
        const rect = target === root && typeof root.getBoundingClientRect === 'function'
          ? root.getBoundingClientRect()
          : { top: 0, bottom: Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 390 };
        const velocity = edgeScrollVelocity({
          pointerX: autoScrollPointerY,
          left: rect.top,
          right: rect.bottom,
          threshold: 64,
          maxSpeed: 20
        });
        if (velocity === 0) {
          autoScrollRoot = false;
        } else {
          const before = Number(target?.scrollTop);
          target.scrollTop = before + velocity;
          const after = Number(target?.scrollTop);
          const maximum = Number(target?.scrollHeight) - Number(target?.clientHeight);
          const reachedBoundary = !Number.isFinite(before)
            || !Number.isFinite(after)
            || after === before
            || (velocity < 0 && after <= 0)
            || (velocity > 0 && Number.isFinite(maximum) && after >= Math.max(0, maximum));
          if (reachedBoundary) autoScrollRoot = false;
          else shouldContinue = true;
        }
      } else if (autoScrollRoot) {
        autoScrollRoot = false;
      }
      if (shouldContinue) autoScrollFrame = requestFrame(runAutoScroll);
    } catch {
      autoScrollTrack = null;
      autoScrollRoot = false;
    }
  }

  function startAutoScroll(track, pointerX, pointerY) {
    autoScrollTrack = track;
    autoScrollPointerX = pointerX;
    autoScrollRoot = typeof root.getBoundingClientRect === 'function';
    autoScrollPointerY = pointerY;
    if (autoScrollFrame === null) autoScrollFrame = requestFrame(runAutoScroll);
  }

  function clearDropState() {
    for (const row of tierRows.values()) row.classList.remove('is-drop-target');
    candidatePool.classList.remove('is-drop-target');
    removeIndicator();
    stopAutoScroll();
    dropPlan = null;
  }

  function finishDrag() {
    closeAnnotationEditor(false);
    clearDropState();
    removeMobileDragVisuals();
    draggedWorkId = null;
    draggedWorkIds = [];
    dragOrigin = null;
    root.classList.remove('is-mobile-ranking-dragging', 'is-mobile-ranking-dragging-from-pool');
  }

  function placeIndicator(track, pointerX, pointerY) {
    removeIndicator();
    const allCards = arrayFrom(track.children).filter(isRankingCard);
    const destinationCards = allCards.filter(card => !draggedWorkIds.includes(card.dataset.workId));
    const usesTwoRows = track.parentElement?.dataset?.trackRows === '2';
    let insertionIndex;
    if (usesTwoRows) {
      const entries = allCards.map(card => {
        const rect = card.getBoundingClientRect();
        const row = Number(card.style.getPropertyValue('grid-row'));
        if ((row !== 1 && row !== 2)
          || !Number.isFinite(rect.left) || !Number.isFinite(rect.right)
          || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)
          || rect.right < rect.left || rect.bottom < rect.top) {
          throw new TypeError('two-row cards must expose finite row-aware rectangles');
        }
        return { card, row, rect };
      });
      const rowBounds = new Map();
      for (const { row, rect } of entries) {
        const current = rowBounds.get(row);
        rowBounds.set(row, current
          ? { top: Math.min(current.top, rect.top), bottom: Math.max(current.bottom, rect.bottom) }
          : { top: rect.top, bottom: rect.bottom });
      }
      const targetRow = [...rowBounds].reduce((best, [row, bounds]) => {
        const distance = pointerY < bounds.top
          ? bounds.top - pointerY
          : pointerY > bounds.bottom ? pointerY - bounds.bottom : 0;
        const centerDistance = Math.abs(pointerY - ((bounds.top + bounds.bottom) / 2));
        if (best === null || distance < best.distance
          || (distance === best.distance && centerDistance < best.centerDistance)) {
          return { row, distance, centerDistance };
        }
        return best;
      }, null)?.row;
      const rowEntries = entries.filter(({ card, row }) => (
        row === targetRow && !draggedWorkIds.includes(card.dataset.workId)
      ));
      if (rowEntries.length === 0) {
        insertionIndex = destinationCards.length;
      } else {
        const rowIndex = insertionIndexFromPoint(
          rowEntries.map(({ rect }) => ({ left: rect.left, right: rect.right })),
          pointerX
        );
        insertionIndex = rowIndex < rowEntries.length
          ? destinationCards.indexOf(rowEntries[rowIndex].card)
          : destinationCards.indexOf(rowEntries.at(-1).card) + 1;
      }
      const capacity = Number.parseInt(
        track.style.getPropertyValue('--tier-track-columns'),
        10
      );
      if (!Number.isSafeInteger(capacity) || capacity < 1) {
        throw new TypeError('two-row track capacity must be a positive integer');
      }
      const batchSize = capacity * 2;
      const batch = Math.floor(insertionIndex / batchSize);
      const local = insertionIndex % batchSize;
      indicator.style.setProperty('grid-row', String(local < capacity ? 1 : 2));
      indicator.style.setProperty(
        'grid-column',
        String(batch * capacity + (local % capacity) + 1)
      );
      indicator.style.setProperty('justify-self', 'start');
    } else {
      const rects = destinationCards.map(card => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      insertionIndex = insertionIndexFromPoint(rects, pointerX);
      indicator.style.removeProperty('grid-row');
      indicator.style.removeProperty('grid-column');
      indicator.style.removeProperty('justify-self');
    }
    const target = destinationCards[insertionIndex] ?? null;
    const domIndex = target === null ? allCards.length : allCards.indexOf(target);
    track.replaceChildren(
      ...allCards.slice(0, domIndex),
      indicator,
      ...allCards.slice(domIndex)
    );
    return insertionIndex;
  }

  function handleTierDragOver(tierId, event) {
    if (draggedWorkId === null
      || typeof event.clientX !== 'number' || !Number.isFinite(event.clientX)
      || typeof event.clientY !== 'number' || !Number.isFinite(event.clientY)) {
      clearDropState();
      return;
    }
    const row = tierRows.get(tierId);
    const track = tierTracks.get(tierId);
    let insertionIndex;
    try {
      insertionIndex = placeIndicator(track, event.clientX, event.clientY);
    } catch {
      clearDropState();
      return;
    }
    event.preventDefault();
    for (const item of tierRows.values()) item.classList.toggle('is-drop-target', item === row);
    candidatePool.classList.remove('is-drop-target');
    dropPlan = { type: 'tier', tierId, insertionIndex };
    startAutoScroll(track, event.clientX, event.clientY);
  }

  function handleTierDrop(tierId, event) {
    const workId = draggedWorkId;
    const workIds = [...draggedWorkIds];
    const plan = dropPlan;
    clearDropState();
    draggedWorkId = null;
    draggedWorkIds = [];
    dragOrigin = null;
    if (workId === null || plan?.type !== 'tier' || plan.tierId !== tierId) return;
    event.preventDefault();
    event.stopPropagation?.();
    if (workIds.length > 1 && workIds.every(id => model?.candidateWorks?.some(item => item.workId === id))) {
      onMoveCandidatesToTier(workIds, tierId, plan.insertionIndex);
    } else {
      onMoveToTier(workId, tierId, plan.insertionIndex);
    }
  }

  function handlePoolDragOver(event) {
    if (draggedWorkId === null) {
      clearDropState();
      return;
    }
    event.preventDefault();
    for (const row of tierRows.values()) row.classList.remove('is-drop-target');
    removeIndicator();
    stopAutoScroll();
    candidatePool.classList.add('is-drop-target');
    dropPlan = { type: 'pool' };
  }

  function handlePoolDrop(event) {
    const workId = draggedWorkId;
    const plan = dropPlan;
    clearDropState();
    draggedWorkId = null;
    draggedWorkIds = [];
    dragOrigin = null;
    if (workId === null || plan?.type !== 'pool') return;
    event.preventDefault();
    event.stopPropagation?.();
    onMoveToUnranked(workId);
  }

  function cardCallbacks() {
    return {
      onOpenDetails(work) {
        if (!immersive) onOpenDetails(work);
      },
      onContextMenu(work, card) {
        if (immersive) beginAnnotationEdit(work, card);
        else onOpenDetails(work);
      },
      onOpenMedia,
      onDragStart(work, card) {
        startDrag(work.workId, card);
      },
      onDragEnd(work, card) {
        const shouldReturnToPool = draggedWorkId === work.workId && dragOrigin === 'tier';
        if (shouldReturnToPool) {
          draggedWorkId = null;
          dragOrigin = null;
          onMoveToUnranked(work.workId);
        }
        clearDragCard(card);
        finishDrag();
      },
      shouldSuppressMediaClick,
      isCardActivationEnabled,
      assetBase
    };
  }

  function snapshotTierConfig(nextTiers) {
    return nextTiers.map(item => ({
      id: item.id,
      name: item.name,
      colorId: item.colorId
    }));
  }

  function closeTierEditing() {
    if (editingTierId === null) return;
    const row = tierRows.get(editingTierId);
    const label = row?.querySelector?.('.tier-label');
    if (label) {
      label.classList.remove('is-tier-editing');
      const name = label.querySelector('.tier-label-name');
      const input = label.querySelector('.tier-name-input');
      const editingState = label.querySelector('.tier-editing-state');
      if (name) name.hidden = false;
      if (input) input.hidden = true;
      if (editingState) editingState.hidden = true;
    }
    closeColorPalette();
    editingTierId = null;
  }

  function closeMobileTierEditor() {
    const editor = mobileTierEditor;
    mobileTierEditor = null;
    if (!editor) return;
    if (editor.open && typeof editor.close === 'function') editor.close();
    editor.remove?.();
  }

  function openMobileTierEditor(tier) {
    if (immersive) return;
    closeMobileTierEditor();
    const host = documentRef.body ?? root;
    if (!host?.append) return;
    const tierIndex = model.tiers.findIndex(item => item.id === tier.id);
    const dialog = documentRef.createElement('dialog');
    dialog.className = 'mobile-tier-edit-menu';
    dialog.setAttribute('aria-labelledby', 'mobile-tier-edit-title');

    const heading = documentRef.createElement('div');
    heading.className = 'dialog-heading';
    const title = documentRef.createElement('h2');
    title.id = 'mobile-tier-edit-title';
    title.textContent = `编辑 ${tier.name} 分级`;
    const closeButton = documentRef.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'icon-button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', '关闭分级编辑');
    closeButton.addEventListener('click', closeMobileTierEditor);
    heading.append(title, closeButton);

    const body = documentRef.createElement('div');
    body.className = 'mobile-tier-edit-body';
    const nameField = documentRef.createElement('label');
    nameField.textContent = '分级名称';
    const nameInput = documentRef.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = tier.name;
    nameInput.setAttribute('aria-label', '分级名称');
    nameField.append(nameInput);

    const colorField = documentRef.createElement('label');
    colorField.textContent = '分级颜色';
    const colorInput = documentRef.createElement('input');
    colorInput.type = 'color';
    colorInput.value = tier.colorId.startsWith('#') ? tier.colorId : tierColor(tier.colorId).background;
    colorInput.setAttribute('aria-label', '分级颜色');
    colorField.append(colorInput);

    const actions = documentRef.createElement('div');
    actions.className = 'mobile-tier-edit-actions';
    const moveUp = documentRef.createElement('button');
    moveUp.type = 'button';
    moveUp.textContent = '上移';
    moveUp.disabled = tierIndex === 0;
    const moveDown = documentRef.createElement('button');
    moveDown.type = 'button';
    moveDown.textContent = '下移';
    moveDown.disabled = tierIndex === model.tiers.length - 1;
    const remove = documentRef.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除分级';
    remove.className = 'mobile-tier-edit-delete';
    remove.disabled = model.tiers.length <= 3;
    actions.append(moveUp, moveDown, remove);

    const submit = documentRef.createElement('button');
    submit.type = 'button';
    submit.className = 'mobile-tier-edit-save';
    submit.textContent = '保存名称';

    const closeEditorAfterAction = () => closeButton.click();
    const updateTiers = transform => {
      focusTierId = tier.id;
      const nextTiers = snapshotTierConfig(transform(model.tiers));
      closeEditorAfterAction();
      onTierConfigChange(nextTiers);
    };
    submit.addEventListener('click', () => {
      const nextName = nameInput.value.trim();
      if (nextName.length === 0) {
        nameInput.focus?.();
        return;
      }
      updateTiers(tiers => tiers.map(item => item.id === tier.id ? { ...item, name: nextName } : item));
    });
    nameInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit.click();
    });
    colorInput.addEventListener('change', () => {
      updateTiers(tiers => tiers.map(item => item.id === tier.id ? { ...item, colorId: colorInput.value } : item));
    });
    moveUp.addEventListener('click', () => updateTiers(tiers => moveTier(snapshotTierConfig(tiers), tier.id, -1)));
    moveDown.addEventListener('click', () => updateTiers(tiers => moveTier(snapshotTierConfig(tiers), tier.id, 1)));
    remove.addEventListener('click', () => {
      closeEditorAfterAction();
      onTierDelete(tier.id);
    });

    body.append(nameField, colorField, actions, submit);
    dialog.append(heading, body);
    dialog.addEventListener('close', () => {
      if (mobileTierEditor === dialog) mobileTierEditor = null;
      dialog.remove?.();
    });
    host.append(dialog);
    mobileTierEditor = dialog;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.open = true;
      dialog.setAttribute('open', '');
    }
    nameInput.focus?.();
    nameInput.select?.();
  }

  function createTierRow(tier) {
    const tierIndex = model.tiers.findIndex(item => item.id === tier.id);
    const color = tierColor(tier.colorId);
    const row = documentRef.createElement('section');
    row.className = 'tier-row';
    row.id = `ranking-${tier.id}`;
    row.dataset.tierId = tier.id;
    row.setAttribute('aria-label', `${tier.name} 级`);
    row.setAttribute('aria-dropeffect', 'move');
    row.style.setProperty('--tier-background', color.background);
    row.style.setProperty('--tier-foreground', color.foreground);

    const label = documentRef.createElement('div');
    label.className = 'tier-label';
    label.tabIndex = 0;
    label.setAttribute('aria-label', tier.name);
    label.setAttribute('title', tier.name);
    label.style.setProperty('background', 'var(--tier-background)');
    label.style.setProperty('color', 'var(--tier-foreground)');
    const name = documentRef.createElement('span');
    name.className = 'tier-label-name';
    name.textContent = tier.name;
    const input = documentRef.createElement('input');
    input.className = 'tier-name-input';
    input.type = 'text';
    input.value = tier.name;
    input.maxLength = 24;
    input.hidden = true;
    input.setAttribute('aria-label', `${tier.name} 绾у悕`);
    const count = documentRef.createElement('output');
    count.textContent = String(tier.works.length);
    count.hidden = !showCounts;
    const editingState = documentRef.createElement('div');
    editingState.className = 'tier-editing-state';
    editingState.hidden = true;

    const controls = [
      ['move-up', '↑', '上移', tierIndex === 0, () => {
        focusTierId = tier.id;
        onTierConfigChange(snapshotTierConfig(moveTier(snapshotTierConfig(model.tiers), tier.id, -1)));
      }],
      ['move-down', '↓', '下移', tierIndex === model.tiers.length - 1, () => {
        focusTierId = tier.id;
        onTierConfigChange(snapshotTierConfig(moveTier(snapshotTierConfig(model.tiers), tier.id, 1)));
      }],
      ['delete', '−', '删除', model.tiers.length <= 3, () => {
        focusTierId = null;
        onTierDelete(tier.id);
      }]
    ];
    for (const [action, glyph, accessibleLabel, disabled, callback] of controls) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = `tier-edit-control tier-edit-${action}`;
      button.dataset.action = action;
      button.textContent = glyph;
      button.disabled = disabled;
      button.setAttribute('aria-label', accessibleLabel);
      button.setAttribute('title', accessibleLabel);
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (!button.disabled) callback();
      });
      editingState.append(button);
    }

    const paletteTrigger = documentRef.createElement('button');
    paletteTrigger.type = 'button';
    paletteTrigger.className = 'tier-edit-control tier-color-trigger';
    paletteTrigger.dataset.action = 'color';
    paletteTrigger.textContent = '●';
    paletteTrigger.setAttribute('aria-label', '选择颜色');
    paletteTrigger.setAttribute('title', '选择颜色');
    paletteTrigger.setAttribute('aria-expanded', 'false');
    paletteTrigger.addEventListener('click', event => {
      event.stopPropagation();
      if (colorPaletteTrigger === paletteTrigger) closeColorPalette();
      else openColorPalette(tier, paletteTrigger);
    });
    editingState.append(paletteTrigger);
    label.append(name, input, count, editingState);

    function beginEdit() {
      if (immersive) return;
      if (editingTierId !== null && editingTierId !== tier.id) closeTierEditing();
      editingTierId = tier.id;
      label.classList.add('is-tier-editing');
      editingState.hidden = false;
      name.hidden = true;
      input.hidden = false;
      input.value = tier.name;
      input.focus?.();
      input.select?.();
    }

    function cancelEdit() {
      input.value = tier.name;
      closeTierEditing();
    }

    function commitName() {
      const nextName = input.value.trim();
      if (nextName.length === 0) {
        input.focus?.();
        return;
      }
      const nextTiers = model.tiers.map(item => ({
        ...item,
        name: item.id === tier.id ? nextName : item.name
      }));
      onTierConfigChange(snapshotTierConfig(nextTiers));
      closeTierEditing();
    }

    label.addEventListener('click', event => {
      if (viewWindow.matchMedia?.('(max-width: 899px)')?.matches) {
        openMobileTierEditor(tier);
        return;
      }
      if (event.target === input || event.target === editingState || editingState.contains(event.target)) return;
      if (editingTierId === tier.id) closeTierEditing();
      else beginEdit();
    });
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        commitName();
      }
    });
    input.addEventListener('blur', event => {
      if (isDescendant(editingState, event.relatedTarget)) return;
      if (editingTierId === tier.id) commitName();
    });

    const track = documentRef.createElement('div');
    track.className = 'tier-track';
    track.dataset.destination = tier.id;
    track.setAttribute('role', 'list');
    track.setAttribute('aria-label', `${tier.name} 级作品`);
    track.tabIndex = 0;
    row.addEventListener('dragover', event => handleTierDragOver(tier.id, event));
    row.addEventListener('dragleave', event => {
      if (!isDescendant(row, event.relatedTarget)) clearDropState();
    });
    row.addEventListener('drop', event => handleTierDrop(tier.id, event));
    row.append(label, track);
    return { row, track };
  }

  candidatePool.setAttribute('role', 'list');
  candidatePool.setAttribute('aria-label', '未分级候选作品');
  candidatePool.setAttribute('aria-dropeffect', 'move');
  candidatePool.tabIndex = 0;
  candidatePool.addEventListener('dragover', handlePoolDragOver);
  candidatePool.addEventListener('dragleave', event => {
    if (!isDescendant(candidatePool, event.relatedTarget)) clearDropState();
  });
  candidatePool.addEventListener('drop', handlePoolDrop);
  candidatePool.addEventListener('wheel', event => {
    const maximum = Math.max(0, Number(candidatePool.scrollWidth) - Number(candidatePool.clientWidth));
    if (maximum <= 0 || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2
      ? Number(viewWindow.innerHeight) || 390
      : 1;
    const before = Number(candidatePool.scrollLeft) || 0;
    candidatePool.scrollLeft = before + event.deltaY * multiplier;
    if (candidatePool.scrollLeft !== before) event.preventDefault?.();
  }, { passive: false });
  candidateSelectAll.addEventListener('change', () => {
    const checked = candidateSelectAll.checked;
    for (const work of model?.candidateWorks ?? []) candidateSelection[checked ? 'add' : 'delete'](work.workId);
    updateCandidateSelection();
  });
  candidateRemoveSelected.addEventListener('click', event => {
    event.preventDefault();
    const selectedIds = candidateSelectionIds();
    if (immersive || selectedIds.length === 0) return;
    candidateSelection.clear();
    updateCandidateSelection();
    onRemoveCandidates(selectedIds);
  });
  candidatePool.addEventListener('pointerdown', event => {
    const card = candidateCardFromNode(event.target);
    if (!card) return;
    if (event.target?.classList?.contains('ranking-candidate-select')
      || event.target?.classList?.contains('ranking-candidate-remove')) return;
    beginCandidateHold(card.dataset.workId, card, event);
  });
  root.addEventListener('pointerdown', beginTouchDrag);
  root.addEventListener('pointermove', updateTouchDrag);
  root.addEventListener('pointerup', finishTouchDrag);
  root.addEventListener('pointercancel', finishTouchDrag);
  candidatePool.addEventListener('pointermove', event => {
    if (!candidateSelectionActive || (event.pointerId ?? 0) !== candidatePointerId) return;
    const card = candidateCardFromNode(event.target);
    if (!card) return;
    setCandidateSelected(card.dataset.workId, true);
    event.preventDefault?.();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    candidatePool.addEventListener(type, finishCandidateSelectionGesture);
  }
  const uploadTile = documentRef.createElement('button');
  uploadTile.type = 'button';
  uploadTile.className = 'ranking-upload-tile';
  uploadTile.textContent = '+';
  uploadTile.setAttribute('aria-label', '导入图片');
  uploadTile.setAttribute('title', '导入图片');
  uploadTile.addEventListener('click', event => {
    event.stopPropagation();
    if (!immersive) onRequestMediaImport(null);
  });
  uploadTile.addEventListener('dragover', event => {
    event.preventDefault();
    event.stopPropagation();
    uploadTile.classList.add('is-drop-target');
  });
  uploadTile.addEventListener('dragleave', event => {
    event.stopPropagation();
    if (!uploadTile.contains(event.relatedTarget)) uploadTile.classList.remove('is-drop-target');
  });
  uploadTile.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    uploadTile.classList.remove('is-drop-target');
    if (!immersive) onRequestMediaImport(arrayFrom(event.dataTransfer?.files));
  });
  candidateSearch.addEventListener('input', () => onCandidateSearch(candidateSearch.value));
  documentRef.addEventListener('click', event => {
    if (annotationEditor !== null && !isDescendant(annotationEditor.input, event.target)) {
      closeAnnotationEditor(true);
    }
    if (editingTierId === null) return;
    const row = tierRows.get(editingTierId);
    if (!row || !isDescendant(row, event.target)) closeTierEditing();
  });
  documentRef.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (annotationEditor !== null) closeAnnotationEditor(false);
    if (editingTierId !== null) closeTierEditing();
    else closeColorPalette();
  });

  return Object.freeze({
    render(nextModel, coverUrls = null) {
      if (nextModel === null || typeof nextModel !== 'object' || Array.isArray(nextModel)) {
        throw new TypeError('model must be an object');
      }
      if (!Array.isArray(nextModel.tiers)) {
        throw new TypeError('model.tiers must be an array');
      }
      if (!Array.isArray(nextModel.candidateWorks) || typeof nextModel.candidateTitleQuery !== 'string') {
        throw new TypeError('model must contain candidateWorks and candidateTitleQuery');
      }
      const retainedTierScroll = Object.fromEntries(
        [...tierTracks].map(([tierId, track]) => [tierId, track.scrollLeft])
      );
      const focusedWorkId = isRankingCard(documentRef.activeElement)
        ? documentRef.activeElement.dataset.workId
        : null;
      finishDrag();
      closeColorPalette();
      model = nextModel;
      closeTierEditing();
      const callbacks = cardCallbacks();
      const nextTierRows = new Map();
      const nextTierTracks = new Map();
      const renderedRows = [];
      for (let index = 0; index < model.tiers.length; index += 1) {
        const tier = model.tiers[index];
        if (
          tier === null
          || typeof tier !== 'object'
          || Array.isArray(tier)
          || typeof tier.id !== 'string'
          || tier.id.length === 0
          || typeof tier.name !== 'string'
          || typeof tier.colorId !== 'string'
          || !Array.isArray(tier.works)
        ) {
          throw new TypeError(`model.tiers[${index}] is invalid`);
        }
        if (nextTierRows.has(tier.id)) {
          throw new TypeError(`model.tiers contains duplicate tier ID ${tier.id}`);
        }
        const { row, track } = createTierRow(tier);
        const cards = tier.works.map(item => createCard(documentRef, item, {
          ...callbacks,
          coverUrl: coverUrls?.get?.(item.workId) ?? null
        }));
        for (const card of cards) applyCardPresentation(card);
        track.replaceChildren(...cards);
        nextTierRows.set(tier.id, row);
        nextTierTracks.set(tier.id, track);
        renderedRows.push(row);
      }
      const addTier = documentRef.createElement('button');
      addTier.type = 'button';
      addTier.className = 'tier-add-button';
      addTier.textContent = '+';
      addTier.disabled = model.tiers.length >= MAX_TIERS;
      addTier.setAttribute('aria-label', '添加等级');
      addTier.setAttribute('title', '添加等级');
      addTier.addEventListener('click', () => {
        if (!immersive && !addTier.disabled) onAddTier();
      });
      const candidates = model.candidateWorks.map(item => {
        const card = createCard(documentRef, item, {
          ...callbacks,
          coverUrl: coverUrls?.get?.(item.workId) ?? null
        });
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'ranking-candidate-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `移除候选作品：${item.title}`);
        remove.setAttribute('title', `移除候选作品：${item.title}`);
        remove.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (!immersive) onRemoveCandidate(item.workId);
        });
        card.append(remove);
        const select = documentRef.createElement('input');
        select.type = 'checkbox';
        select.className = 'ranking-candidate-select';
        select.checked = candidateSelection.has(item.workId);
        select.setAttribute('aria-label', `选择候选作品：${item.title}`);
        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', event => {
          event.stopPropagation();
          setCandidateSelected(item.workId, select.checked);
        });
        card.append(select);
        return card;
      });
      for (const card of candidates) applyCardPresentation(card);
      tierBoard.replaceChildren(...renderedRows, addTier);
      tierBoard.dataset.tierCount = String(renderedRows.length);
      tierRows.clear();
      tierTracks.clear();
      for (const [tierId, row] of nextTierRows) tierRows.set(tierId, row);
      for (const [tierId, track] of nextTierTracks) {
        tierTracks.set(tierId, track);
        const retained = retainedTierScroll[tierId];
        track.scrollLeft = Number.isFinite(retained) ? retained : 0;
      }
      candidatePool.replaceChildren(...candidates, ...(showImportTile() ? [uploadTile] : []));
      updateCandidateSelection();
      updateTierTrackRows();
      candidateSearch.value = model.candidateTitleQuery;
      if (focusedWorkId !== null) {
        const nextCard = cardForWorkId(focusedWorkId);
        if (nextCard) nextCard.focus?.();
      }
      if (!immersive && focusTierId !== null) {
        const nextLabel = tierRows.get(focusTierId)?.querySelector?.('.tier-label') ?? null;
        if (viewWindow.matchMedia?.('(max-width: 899px)')?.matches) nextLabel?.focus?.();
        else nextLabel?.click?.();
      }
      focusTierId = null;
    },

    captureScroll() {
      return {
        ...capturePageScroll(),
        tiers: Object.fromEntries(
          [...tierTracks].map(([tierId, track]) => [tierId, track.scrollLeft])
        ),
        poolLeft: candidatePool.scrollLeft
      };
    },

    restoreScroll(position) {
      if (position === null || typeof position !== 'object') return;
      restorePageScroll(position);
      for (const [tierId, track] of tierTracks) {
        const value = position.tiers?.[tierId];
        track.scrollLeft = Number.isFinite(value) ? value : 0;
      }
      candidatePool.scrollLeft = Number.isFinite(position.poolLeft) ? position.poolLeft : 0;
    },

    refreshLayout() {
      updateTierTrackRows();
    },

    setShowCounts(nextShowCounts) {
      if (typeof nextShowCounts !== 'boolean') throw new TypeError('showCounts must be a boolean');
      showCounts = nextShowCounts;
      for (const row of tierRows.values()) {
        const count = row.querySelector?.('output');
        if (count) count.hidden = !showCounts;
      }
    },

    setShowTitles(nextShowTitles) {
      if (typeof nextShowTitles !== 'boolean') throw new TypeError('showTitles must be a boolean');
      showTitles = nextShowTitles;
      for (const card of arrayFrom(root.querySelectorAll?.('.ranking-card'))) {
        applyCardPresentation(card);
      }
    },

    setAnnotations(nextAnnotations) {
      if (nextAnnotations === null || typeof nextAnnotations !== 'object' || Array.isArray(nextAnnotations)) {
        throw new TypeError('annotations must be an object');
      }
      annotations = Object.fromEntries(
        Object.entries(nextAnnotations).filter(([, value]) => typeof value === 'string' && value.length > 0)
      );
      for (const card of arrayFrom(root.querySelectorAll?.('.ranking-card'))) {
        applyCardPresentation(card);
      }
    },

    setImmersive(nextImmersive) {
      if (typeof nextImmersive !== 'boolean') throw new TypeError('immersive must be a boolean');
      immersive = nextImmersive;
      if (immersive) {
        focusTierId = null;
        closeTierEditing();
      } else {
        closeAnnotationEditor(false);
      }
      for (const card of arrayFrom(root.querySelectorAll?.('.ranking-card'))) {
        applyCardPresentation(card);
      }
    },

    setMobileDragEnabled(nextEnabled) {
      if (typeof nextEnabled !== 'boolean') throw new TypeError('mobile drag enabled must be boolean');
      root.classList.toggle('is-mobile-drag-enabled', nextEnabled);
      const nativeDrag = supportsNativeDrag(viewWindow);
      for (const card of arrayFrom(root.querySelectorAll?.('.ranking-card'))) {
        card.draggable = nativeDrag;
      }
    },

    visibleWorkIds() {
      const width = Number(viewWindow.innerWidth) || 0;
      const height = Number(viewWindow.innerHeight) || 0;
      return arrayFrom(root.querySelectorAll?.('.ranking-card'))
        .filter(card => {
          const rect = card.getBoundingClientRect?.();
          return rect
            && rect.right > 0
            && rect.bottom > 0
            && rect.left < width
            && rect.top < height;
        })
        .map(card => card.dataset.workId);
    },

    focusTier(tierId) {
      if (typeof tierId !== 'string' || tierId.length === 0) {
        throw new TypeError('tierId must be a non-empty string');
      }
      focusTierId = tierId;
    }
  });

  function cardForWorkId(workId) {
    return arrayFrom(root.querySelectorAll?.('.ranking-card'))
      .find(card => card.dataset.workId === workId) ?? null;
  }
}
