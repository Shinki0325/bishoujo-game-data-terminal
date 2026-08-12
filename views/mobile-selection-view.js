import { createSelectionCard } from './selection-view.js';

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function requiredOwnedElement(root, id) {
  const found = root.querySelector?.(`#${id}`);
  if (!found) throw new Error(`Mobile selection view root is missing #${id}`);
  return found;
}

function uniqueIds(ids) {
  return [...new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && id.length > 0) : [])];
}

function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.open = true;
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.open = false;
}

export function createMobileSelectionView({
  root,
  onToggleWork,
  onOpenDetails,
  onOpenMedia = onOpenDetails,
  onTitleQuery,
  onFilterOpen,
  onShareSelection,
  onClearSelection,
  onHelpOpen,
  assetBase
}) {
  if (root === null || typeof root?.querySelector !== 'function') {
    throw new TypeError('root must provide querySelector');
  }
  const documentRef = root.ownerDocument;
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('root must provide ownerDocument.createElement');
  }
  for (const [value, name] of [
    [onToggleWork, 'onToggleWork'],
    [onOpenDetails, 'onOpenDetails'],
    [onOpenMedia, 'onOpenMedia'],
    [onTitleQuery, 'onTitleQuery'],
    [onFilterOpen, 'onFilterOpen'],
    [onShareSelection, 'onShareSelection'],
    [onClearSelection, 'onClearSelection'],
    [onHelpOpen, 'onHelpOpen']
  ]) assertFunction(value, name);

  const elements = {
    grid: requiredOwnedElement(root, 'mobile-selection-grid'),
    mode: requiredOwnedElement(root, 'mobile-select-mode'),
    status: requiredOwnedElement(root, 'mobile-selection-status'),
    selectedCount: requiredOwnedElement(root, 'mobile-selected-count'),
    openDrawer: requiredOwnedElement(root, 'mobile-open-selection-drawer'),
    drawer: requiredOwnedElement(root, 'mobile-selection-drawer'),
    preview: requiredOwnedElement(root, 'mobile-selected-preview'),
    share: requiredOwnedElement(root, 'mobile-share-selection'),
    clear: requiredOwnedElement(root, 'mobile-clear-selection'),
    help: requiredOwnedElement(root, 'mobile-help-button'),
    helpDialog: requiredOwnedElement(root, 'mobile-help-dialog'),
    helpDismiss: requiredOwnedElement(root, 'mobile-help-dismiss'),
    titleSearch: requiredOwnedElement(root, 'mobile-title-search'),
    filter: requiredOwnedElement(root, 'mobile-filter-toggle')
  };

  let selectionMode = false;
  let drawerOpen = false;
  let lastModel = { works: [], selectedWorkIds: [], selectionMode: false };
  let scrollPosition = { top: 0, left: 0 };

  function renderDrawer(selectedWorkIds) {
    elements.preview.replaceChildren();
    for (const workId of selectedWorkIds) {
      const item = documentRef.createElement('span');
      item.className = 'mobile-selected-preview-item';
      item.textContent = workId;
      elements.preview.append(item);
    }
    elements.drawer.dataset.selectedCount = String(selectedWorkIds.length);
  }

  function render(model) {
    if (model === null || typeof model !== 'object') throw new TypeError('model must be an object');
    lastModel = {
      works: Array.isArray(model.works) ? model.works.slice() : [],
      selectedWorkIds: uniqueIds(model.selectedWorkIds),
      selectionMode: typeof model.selectionMode === 'boolean' ? model.selectionMode : selectionMode
    };
    selectionMode = lastModel.selectionMode;
    scrollPosition = { top: elements.grid.scrollTop, left: elements.grid.scrollLeft };
    elements.grid.replaceChildren();
    const selectedSet = new Set(lastModel.selectedWorkIds);
    for (const work of lastModel.works) {
      const card = createSelectionCard(documentRef, work, {
        view: 'compact',
        selected: selectedSet.has(work.workId),
        selectionEnabled: selectionMode,
        onToggle: (...args) => {
          if (selectionMode) onToggleWork(...args);
        },
        onOpenDetails,
        onOpenMedia,
        assetBase
      });
      card.classList.add('mobile-selection-card');
      elements.grid.append(card);
    }
    elements.mode.textContent = selectionMode ? '退出选择' : '选择';
    elements.mode.setAttribute('aria-pressed', String(selectionMode));
    elements.status.hidden = !selectionMode;
    elements.selectedCount.textContent = String(lastModel.selectedWorkIds.length);
    elements.clear.disabled = lastModel.selectedWorkIds.length === 0;
    renderDrawer(lastModel.selectedWorkIds);
    elements.grid.scrollTop = scrollPosition.top;
    elements.grid.scrollLeft = scrollPosition.left;
  }

  function setSelectionMode(value) {
    selectionMode = Boolean(value);
    render({ ...lastModel, selectionMode });
  }

  function openDrawer() {
    drawerOpen = true;
    renderDrawer(lastModel.selectedWorkIds);
    showDialog(elements.drawer);
  }

  function closeDrawer() {
    drawerOpen = false;
    closeDialog(elements.drawer);
  }

  function captureScroll() {
    scrollPosition = { top: elements.grid.scrollTop, left: elements.grid.scrollLeft };
    return { ...scrollPosition };
  }

  function restoreScroll(nextPosition = scrollPosition) {
    elements.grid.scrollTop = Number.isFinite(nextPosition.top) ? nextPosition.top : 0;
    elements.grid.scrollLeft = Number.isFinite(nextPosition.left) ? nextPosition.left : 0;
  }

  const onModeClick = () => setSelectionMode(!selectionMode);
  const onOpenDrawerClick = () => openDrawer();
  const onShareClick = () => onShareSelection([...lastModel.selectedWorkIds]);
  const onClearClick = () => onClearSelection([...lastModel.selectedWorkIds]);
  const onHelpClick = () => {
    onHelpOpen();
    showDialog(elements.helpDialog);
  };
  const onHelpDismissClick = () => closeDialog(elements.helpDialog);
  const onTitleInput = () => onTitleQuery(elements.titleSearch.value);
  const onFilterClick = () => onFilterOpen();

  elements.mode.addEventListener('click', onModeClick);
  elements.openDrawer.addEventListener('click', onOpenDrawerClick);
  elements.share.addEventListener('click', onShareClick);
  elements.clear.addEventListener('click', onClearClick);
  elements.help.addEventListener('click', onHelpClick);
  elements.helpDismiss.addEventListener('click', onHelpDismissClick);
  elements.titleSearch.addEventListener('input', onTitleInput);
  elements.filter.addEventListener('click', onFilterClick);

  function destroy() {
    closeDrawer();
    elements.mode.removeEventListener?.('click', onModeClick);
    elements.openDrawer.removeEventListener?.('click', onOpenDrawerClick);
    elements.share.removeEventListener?.('click', onShareClick);
    elements.clear.removeEventListener?.('click', onClearClick);
    elements.help.removeEventListener?.('click', onHelpClick);
    elements.helpDismiss.removeEventListener?.('click', onHelpDismissClick);
    elements.titleSearch.removeEventListener?.('input', onTitleInput);
    elements.filter.removeEventListener?.('click', onFilterClick);
  }

  return Object.freeze({
    render,
    setSelectionMode,
    openDrawer,
    closeDrawer,
    captureScroll,
    restoreScroll,
    inspect: () => Object.freeze({ selectionMode, drawerOpen }),
    destroy
  });
}
