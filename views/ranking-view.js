import { edgeScrollVelocity, insertionIndexFromPoint } from '../lib/drag.js';
import { applyImageAsset, AssetUrlError } from '../lib/asset-url.js';
import { moveTier } from '../lib/tier-config.js';
import { TIER_COLOR_IDS, tierColor } from '../lib/tier-palette.js';

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

function isDescendant(root, candidate) {
  let current = candidate;
  while (current !== null && current !== undefined) {
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
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
  const { onOpenActions, onOpenMedia = () => {}, onDragStart, onDragEnd, assetBase, coverUrl = null } = callbacks;
  assertFunction(onOpenActions, 'onOpenActions');
  assertFunction(onOpenMedia, 'onOpenMedia');
  assertFunction(onDragStart, 'onDragStart');
  assertFunction(onDragEnd, 'onDragEnd');

  const card = documentRef.createElement('article');
  card.className = 'ranking-card';
  card.dataset.workId = work.workId;
  card.draggable = true;
  card.tabIndex = 0;
  card.setAttribute('aria-label', work.title);

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
  cover.setAttribute('aria-label', `放大 ${work.title}`);
  cover.title = `放大 ${work.title}`;
  cover.addEventListener('click', event => {
    event.stopPropagation();
    onOpenMedia(work);
  });
  cover.append(image);

  const actions = documentRef.createElement('button');
  actions.type = 'button';
  actions.className = 'ranking-card-actions icon-button';
  actions.setAttribute('aria-label', `${work.title} 操作`);
  actions.title = `${work.title} 操作`;
  actions.textContent = '...';
  actions.addEventListener('click', event => {
    event.stopPropagation();
    onOpenActions(work, card);
  });

  const title = documentRef.createElement('span');
  title.className = 'ranking-card-title';
  title.dataset.field = 'title';
  title.textContent = work.title;
  card.append(cover, title, actions);
  card.addEventListener('click', () => onOpenActions(work, card));
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onOpenActions(work, card);
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
  onMoveToTier,
  onMoveToUnranked,
  onOpenDetails,
  onOpenMedia = () => {},
  onCandidateSearch,
  onTierConfigChange = () => {},
  onTierDelete = () => {},
  onRequestMediaImport = () => {},
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
  assertFunction(onMoveToUnranked, 'onMoveToUnranked');
  assertFunction(onOpenDetails, 'onOpenDetails');
  assertFunction(onOpenMedia, 'onOpenMedia');
  assertFunction(onCandidateSearch, 'onCandidateSearch');
  assertFunction(onTierConfigChange, 'onTierConfigChange');
  assertFunction(onTierDelete, 'onTierDelete');
  assertFunction(onRequestMediaImport, 'onRequestMediaImport');

  const tierBoard = requireOwnedElement(root, '#tier-board', '#tier-board');
  const tierJumps = requireOwnedElement(root, '#ranking-tier-jumps', '#ranking-tier-jumps');
  const candidateSearch = requireOwnedElement(root, '#ranking-candidate-search', '#ranking-candidate-search');
  const candidatePool = requireOwnedElement(root, '#ranking-candidate-grid', '#ranking-candidate-grid');
  const actionDialog = documentRef.getElementById?.('card-actions');
  if (!actionDialog) throw new Error('Ranking view document is missing #card-actions');
  const actionDialogTitle = actionDialog.querySelector?.('#card-actions-title');
  const actionContainer = actionDialog.querySelector?.('.dialog-actions');
  if (!actionDialogTitle || !actionContainer) {
    throw new Error('Ranking action dialog is incomplete');
  }

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

  let model = null;
  let draggedWorkId = null;
  let showCounts = false;
  let activeMenuCard = null;
  let dropPlan = null;
  let autoScrollFrame = null;
  let autoScrollTrack = null;
  let autoScrollPointerX = 0;
  let editingTierId = null;
  let focusTierId = null;

  function removeIndicator() {
    const parent = indicator.parentElement;
    if (!parent) return;
    parent.replaceChildren(...arrayFrom(parent.children).filter(child => child !== indicator));
  }

  function stopAutoScroll() {
    autoScrollTrack = null;
    if (autoScrollFrame !== null) {
      cancelFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  function runAutoScroll() {
    autoScrollFrame = null;
    if (autoScrollTrack === null) return;
    let rect;
    try {
      rect = autoScrollTrack.getBoundingClientRect();
      const velocity = edgeScrollVelocity({
        pointerX: autoScrollPointerX,
        left: rect.left,
        right: rect.right
      });
      if (velocity === 0) {
        autoScrollTrack = null;
        return;
      }
      const before = Number(autoScrollTrack.scrollLeft);
      autoScrollTrack.scrollLeft = before + velocity;
      const after = Number(autoScrollTrack.scrollLeft);
      const maximum = Number(autoScrollTrack.scrollWidth) - Number(autoScrollTrack.clientWidth);
      const reachedBoundary = !Number.isFinite(before)
        || !Number.isFinite(after)
        || after === before
        || (velocity < 0 && after <= 0)
        || (velocity > 0 && Number.isFinite(maximum) && after >= Math.max(0, maximum));
      if (reachedBoundary) {
        autoScrollTrack = null;
        return;
      }
      autoScrollFrame = requestFrame(runAutoScroll);
    } catch {
      autoScrollTrack = null;
    }
  }

  function startAutoScroll(track, pointerX) {
    autoScrollTrack = track;
    autoScrollPointerX = pointerX;
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
    clearDropState();
    draggedWorkId = null;
  }

  function placeIndicator(track, pointerX) {
    removeIndicator();
    const allCards = arrayFrom(track.children).filter(isRankingCard);
    const destinationCards = allCards.filter(card => card.dataset.workId !== draggedWorkId);
    const rects = destinationCards.map(card => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    const insertionIndex = insertionIndexFromPoint(rects, pointerX);
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
    if (draggedWorkId === null || typeof event.clientX !== 'number' || !Number.isFinite(event.clientX)) {
      clearDropState();
      return;
    }
    const row = tierRows.get(tierId);
    const track = tierTracks.get(tierId);
    let insertionIndex;
    try {
      insertionIndex = placeIndicator(track, event.clientX);
    } catch {
      clearDropState();
      return;
    }
    event.preventDefault();
    for (const item of tierRows.values()) item.classList.toggle('is-drop-target', item === row);
    candidatePool.classList.remove('is-drop-target');
    dropPlan = { type: 'tier', tierId, insertionIndex };
    startAutoScroll(track, event.clientX);
  }

  function handleTierDrop(tierId, event) {
    const workId = draggedWorkId;
    const plan = dropPlan;
    clearDropState();
    draggedWorkId = null;
    if (workId === null || plan?.type !== 'tier' || plan.tierId !== tierId) return;
    event.preventDefault();
    event.stopPropagation?.();
    onMoveToTier(workId, tierId, plan.insertionIndex);
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
    if (workId === null || plan?.type !== 'pool') return;
    event.preventDefault();
    event.stopPropagation?.();
    onMoveToUnranked(workId);
  }

  function restoreActionFocus() {
    const sourceCard = activeMenuCard;
    activeMenuCard = null;
    sourceCard?.focus?.();
  }

  function closeActionMenu() {
    if (actionDialog.open && typeof actionDialog.close === 'function') {
      actionDialog.close();
      if (activeMenuCard !== null && !actionDialog.open) restoreActionFocus();
      return;
    }
    actionDialog.open = false;
    restoreActionFocus();
  }

  function createActionButton(action, label, callback, accessibleLabel = null, disabled = false) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = label;
    button.disabled = Boolean(disabled);
    if (accessibleLabel !== null) {
      button.setAttribute('aria-label', accessibleLabel);
      button.setAttribute('title', accessibleLabel);
    }
    button.addEventListener('click', () => {
      if (button.disabled) return;
      closeActionMenu();
      callback();
    });
    return button;
  }

  function placementFor(workId) {
    for (const tier of model.tiers) {
      const index = tier.works.findIndex(item => item.workId === workId);
      if (index >= 0) return { tier, index };
    }
    return null;
  }

  function appendPositionActions(buttons, work) {
    const placement = placementFor(work.workId);
    const isRanked = placement !== null;
    const rowLength = placement?.tier.works.length ?? 0;
    const previousIndex = isRanked ? Math.max(0, placement.index - 1) : 0;
    const nextIndex = isRanked ? Math.min(rowLength - 1, placement.index + 1) : 0;
    buttons.push(
      createActionButton('first', '移到第一位', () => {
        onMoveToTier(work.workId, placement.tier.id, 0);
      }, '移到当前等级第一位', !isRanked || placement.index === 0),
      createActionButton('last', '移到最后一位', () => {
        onMoveToTier(work.workId, placement.tier.id, rowLength - 1);
      }, '移到当前等级最后一位', !isRanked || placement.index === rowLength - 1),
      createActionButton('before', '移到前一张之前', () => {
        onMoveToTier(work.workId, placement.tier.id, previousIndex);
      }, '移到前一张卡片之前', !isRanked || placement.index === 0),
      createActionButton('after', '移到后一张之后', () => {
        onMoveToTier(work.workId, placement.tier.id, nextIndex);
      }, '移到后一张卡片之后', !isRanked || placement.index === rowLength - 1)
    );
  }

  function openActionMenu(work, sourceCard) {
    closeActionMenu();
    activeMenuCard = sourceCard;
    actionDialogTitle.textContent = work.title;
    actionContainer.setAttribute('aria-label', `${work.title} 移动目标`);
    const buttons = model.tiers.map(tier => createActionButton(
      tier.id,
      `移至 ${tier.name} 级`,
      () => {
        const destinationLength = tier.works
          .filter(item => item.workId !== work.workId).length;
        onMoveToTier(work.workId, tier.id, destinationLength);
      },
      `移至 ${tier.name} 级`
    ));
    appendPositionActions(buttons, work);
    buttons.push(
      createActionButton('unranked', '移至未分级', () => onMoveToUnranked(work.workId)),
      createActionButton('details', '查看详情', () => onOpenDetails(work))
    );
    actionContainer.replaceChildren(...buttons);
    if (typeof actionDialog.showModal === 'function') actionDialog.showModal();
    else actionDialog.open = true;
    buttons[0]?.focus?.();
  }

  function cardCallbacks() {
    return {
      onOpenActions: openActionMenu,
      onOpenMedia,
      onDragStart(work, card) {
        clearDropState();
        draggedWorkId = work.workId;
        card.classList.add('is-dragging');
      },
      onDragEnd(work, card) {
        card.classList.remove('is-dragging');
        finishDrag();
      },
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
      const palette = label.querySelector('.tier-color-palette');
      if (name) name.hidden = false;
      if (input) input.hidden = true;
      if (palette) palette.hidden = true;
    }
    editingTierId = null;
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
    paletteTrigger.addEventListener('click', event => {
      event.stopPropagation();
      palette.hidden = !palette.hidden;
    });
    editingState.append(paletteTrigger);

    const palette = documentRef.createElement('div');
    palette.className = 'tier-color-palette';
    palette.hidden = true;
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
        onTierConfigChange(snapshotTierConfig(nextTiers));
        palette.hidden = true;
      });
      palette.append(option);
    }
    editingState.append(palette);
    label.append(name, input, count, editingState);

    function beginEdit() {
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
    input.addEventListener('blur', () => {
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
  const uploadTile = documentRef.createElement('button');
  uploadTile.type = 'button';
  uploadTile.className = 'ranking-upload-tile';
  uploadTile.textContent = '+';
  uploadTile.setAttribute('aria-label', '导入图片');
  uploadTile.setAttribute('title', '导入图片');
  uploadTile.addEventListener('click', event => {
    event.stopPropagation();
    onRequestMediaImport(null);
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
    onRequestMediaImport(arrayFrom(event.dataTransfer?.files));
  });
  candidateSearch.addEventListener('input', () => onCandidateSearch(candidateSearch.value));
  actionDialog.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeActionMenu();
  });
  actionDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeActionMenu();
  });
  actionDialog.addEventListener('close', restoreActionFocus);
  documentRef.addEventListener('click', event => {
    if (editingTierId === null) return;
    const row = tierRows.get(editingTierId);
    if (!row || !isDescendant(row, event.target)) closeTierEditing();
  });
  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editingTierId !== null) closeTierEditing();
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
      const menuWasOpen = activeMenuCard !== null;
      const focusedWorkId = activeMenuCard?.dataset?.workId ?? (
        isRankingCard(documentRef.activeElement)
          ? documentRef.activeElement.dataset.workId
          : null
      );
      closeActionMenu();
      finishDrag();
      model = nextModel;
      closeTierEditing();
      const callbacks = cardCallbacks();
      const nextTierRows = new Map();
      const nextTierTracks = new Map();
      const renderedRows = [];
      const renderedJumps = [];
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
        const cards = tier.works.map(item => createRankingCard(documentRef, item, {
          ...callbacks,
          coverUrl: coverUrls?.get?.(item.workId) ?? null
        }));
        track.replaceChildren(...cards);
        nextTierRows.set(tier.id, row);
        nextTierTracks.set(tier.id, track);
        renderedRows.push(row);
        const jump = documentRef.createElement('button');
        jump.type = 'button';
        jump.className = 'ranking-tier-jump';
        jump.dataset.tierId = tier.id;
        jump.setAttribute('aria-controls', row.id);
        jump.textContent = tier.name;
        jump.addEventListener('click', () => {
          row.scrollIntoView?.({ block: 'start', inline: 'nearest' });
          track.focus?.({ preventScroll: true });
        });
        renderedJumps.push(jump);
      }
      const candidates = model.candidateWorks.map(item => createRankingCard(documentRef, item, {
        ...callbacks,
        coverUrl: coverUrls?.get?.(item.workId) ?? null
      }));
      tierBoard.replaceChildren(...renderedRows);
      tierJumps.replaceChildren(...renderedJumps);
      tierBoard.dataset.tierCount = String(renderedRows.length);
      tierRows.clear();
      tierTracks.clear();
      for (const [tierId, row] of nextTierRows) tierRows.set(tierId, row);
      for (const [tierId, track] of nextTierTracks) {
        tierTracks.set(tierId, track);
        const retained = retainedTierScroll[tierId];
        track.scrollLeft = Number.isFinite(retained) ? retained : 0;
      }
      candidatePool.replaceChildren(...candidates, uploadTile);
      candidateSearch.value = model.candidateTitleQuery;
      if (focusedWorkId !== null) {
        const nextCard = cardForWorkId(focusedWorkId);
        if (nextCard) nextCard.focus?.();
        else if (menuWasOpen) candidateSearch.focus?.();
      }
      if (focusTierId !== null) {
        const nextRow = tierRows.get(focusTierId);
        nextRow?.querySelector?.('.tier-label')?.focus?.();
        focusTierId = null;
      }
    },

    captureScroll() {
      return {
        top: root.scrollTop,
        left: root.scrollLeft,
        tiers: Object.fromEntries(
          [...tierTracks].map(([tierId, track]) => [tierId, track.scrollLeft])
        ),
        poolLeft: candidatePool.scrollLeft
      };
    },

    restoreScroll(position) {
      if (position === null || typeof position !== 'object') return;
      root.scrollTop = Number.isFinite(position.top) ? position.top : 0;
      root.scrollLeft = Number.isFinite(position.left) ? position.left : 0;
      for (const [tierId, track] of tierTracks) {
        const value = position.tiers?.[tierId];
        track.scrollLeft = Number.isFinite(value) ? value : 0;
      }
      candidatePool.scrollLeft = Number.isFinite(position.poolLeft) ? position.poolLeft : 0;
    },

    setShowCounts(nextShowCounts) {
      if (typeof nextShowCounts !== 'boolean') throw new TypeError('showCounts must be a boolean');
      showCounts = nextShowCounts;
      for (const row of tierRows.values()) {
        const count = row.querySelector?.('output');
        if (count) count.hidden = !showCounts;
      }
    },

    closeActionMenu
  });

  function cardForWorkId(workId) {
    return arrayFrom(root.querySelectorAll?.('.ranking-card'))
      .find(card => card.dataset.workId === workId) ?? null;
  }
}
