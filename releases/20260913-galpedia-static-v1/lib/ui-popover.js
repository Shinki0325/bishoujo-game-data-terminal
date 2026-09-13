let generatedMenuId = 0;

const DEFAULT_GROUP = Symbol('popover-default-group');

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function assertEventTarget(value, name) {
  if (!isObject(value) || typeof value.addEventListener !== 'function') {
    throw new TypeError(`${name} must be an EventTarget-like object`);
  }
}

function setAttribute(node, name, value) {
  if (typeof node?.setAttribute === 'function') node.setAttribute(name, String(value));
  else if (isObject(node)) {
    node.attributes ??= {};
    node.attributes[name] = String(value);
  }
}

function getAttribute(node, name) {
  if (typeof node?.getAttribute === 'function') return node.getAttribute(name);
  return node?.attributes?.[name] ?? null;
}

function removeAttribute(node, name) {
  if (typeof node?.removeAttribute === 'function') node.removeAttribute(name);
  else if (node?.attributes) delete node.attributes[name];
}

function menuId(menu) {
  const existing = menu?.id || getAttribute(menu, 'id');
  if (existing) return String(existing);
  const id = `popover-menu-${++generatedMenuId}`;
  try {
    menu.id = id;
  } catch {
    // Some test doubles expose an immutable id property. aria-controls still
    // receives a stable generated value below.
  }
  setAttribute(menu, 'id', id);
  return id;
}

function isHidden(node) {
  if (!node) return true;
  if (node.hidden === true) return true;
  if (getAttribute(node, 'hidden') !== null) return true;
  if (getAttribute(node, 'aria-hidden') === 'true') return true;
  const display = node.style?.display;
  const visibility = node.style?.visibility;
  return display === 'none' || visibility === 'hidden';
}

function setHidden(node, value) {
  if (!node) return;
  try {
    node.hidden = Boolean(value);
  } catch {
    if (value) setAttribute(node, 'hidden', '');
    else removeAttribute(node, 'hidden');
  }
}

function isDisabled(node) {
  return node?.disabled === true
    || getAttribute(node, 'disabled') !== null
    || getAttribute(node, 'aria-disabled') === 'true';
}

function tagName(node) {
  return String(node?.tagName || node?.nodeName || '').toLowerCase();
}

function childrenOf(node) {
  if (!node) return [];
  if (node.children && typeof node.children.length === 'number') return [...node.children];
  if (node.childNodes && typeof node.childNodes.length === 'number') return [...node.childNodes];
  return [];
}

function descendantsOf(node) {
  const result = [];
  const visit = current => {
    for (const child of childrenOf(current)) {
      result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

function isActionControl(node) {
  if (!node || isHidden(node) || isDisabled(node)) return false;
  const role = getAttribute(node, 'role');
  const name = tagName(node);
  if (name === 'input' || name === 'select' || name === 'textarea' || name === 'option') return false;
  return role === 'menuitem'
    || role === 'menuitemcheckbox'
    || role === 'menuitemradio'
    || name === 'button'
    || (name === 'a' && Boolean(node.href || getAttribute(node, 'href')))
    || node.tabIndex >= 0
    || getAttribute(node, 'tabindex') !== null;
}

function hiddenByAncestor(node, root) {
  let current = node;
  while (current && current !== root) {
    if (isHidden(current)) return true;
    current = current.parentNode || current.parentElement || null;
  }
  return isHidden(root);
}

function safeFocus(node) {
  if (typeof node?.focus !== 'function' || isHidden(node) || isDisabled(node)) return false;
  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
      return false;
    }
  }
  return true;
}

function eventKey(event) {
  return event?.key || event?.code || '';
}

function preventDefault(event) {
  if (typeof event?.preventDefault === 'function') event.preventDefault();
}

function viewportSize(windowRef, documentRef) {
  const root = documentRef?.documentElement;
  const width = Number(windowRef?.innerWidth) || Number(root?.clientWidth) || 0;
  const height = Number(windowRef?.innerHeight) || Number(root?.clientHeight) || 0;
  return { width, height };
}

function rectOf(node) {
  const rect = typeof node?.getBoundingClientRect === 'function'
    ? node.getBoundingClientRect()
    : null;
  const left = Number(rect?.left) || 0;
  const right = Number(rect?.right) || left + (Number(rect?.width) || 0);
  const top = Number(rect?.top) || 0;
  const bottom = Number(rect?.bottom) || top + (Number(rect?.height) || 0);
  const width = Number(rect?.width) || Math.max(0, right - left);
  const height = Number(rect?.height) || Math.max(0, bottom - top);
  return { left, right, top, bottom, width, height };
}

function readNumeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function containsNode(container, node) {
  if (!container || !node) return false;
  if (container === node) return true;
  return typeof container.contains === 'function' && container.contains(node);
}

function topNativeModal(documentRef) {
  if (!documentRef) return false;

  // Native :modal is the most precise check and is supported by current
  // browsers. It is intentionally guarded because lightweight DOM fakes do
  // not necessarily implement the pseudo-class selector.
  try {
    if (typeof documentRef.querySelectorAll === 'function') {
      const modalDialogs = [...documentRef.querySelectorAll('dialog:modal')];
      if (modalDialogs.length) return modalDialogs.at(-1);
    }
    if (typeof documentRef.querySelector === 'function') {
      const modal = documentRef.querySelector('dialog:modal');
      if (modal) return modal;
    }
  } catch {
    // Fall through to the explicit test-double properties below.
  }

  let dialogs = [];
  if (typeof documentRef.querySelectorAll === 'function') {
    try {
      dialogs = [...documentRef.querySelectorAll('dialog')];
    } catch {
      try {
        dialogs = [...documentRef.querySelectorAll('dialog[open]')];
      } catch {
        dialogs = [];
      }
    }
  }
  for (const dialog of dialogs) {
    if (!dialog || dialog.open === false || isHidden(dialog)) continue;
    try {
      if (typeof dialog.matches === 'function' && dialog.matches(':modal')) return dialog;
    } catch {
      // Ignore unsupported selectors on test doubles.
    }
    if (dialog.isModal === true || dialog.modal === true || dialog.openModal === true) return dialog;
    if (getAttribute(dialog, 'aria-modal') === 'true') return dialog;
  }
  return null;
}

function hasOpenNativeModal(documentRef, allowedNode = null) {
  const modal = topNativeModal(documentRef);
  return Boolean(modal && !containsNode(modal, allowedNode));
}

function closestWithin(node, root, predicate) {
  let current = node;
  while (current && current !== root) {
    if (predicate(current)) return current;
    current = current.parentNode || current.parentElement || null;
  }
  return current === root && predicate(root) ? root : null;
}

/**
 * Add the shared keyboard, focus, positioning, and dismissal grammar used by
 * the small toolbar popovers. The controller deliberately does not create
 * markup or own business actions; callers keep their existing handlers.
 */
export function createPopoverController({
  items,
  documentRef = typeof document === 'undefined' ? null : document,
  windowRef = typeof window === 'undefined' ? null : window
} = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  assertEventTarget(documentRef, 'documentRef');
  assertEventTarget(windowRef, 'windowRef');

  const states = items.map((item, index) => {
    if (!isObject(item)) throw new TypeError(`items[${index}] must be an object`);
    const { button, menu, kind = 'actions' } = item;
    if (!isObject(button) || typeof button.addEventListener !== 'function') {
      throw new TypeError(`items[${index}].button must be an EventTarget-like object`);
    }
    if (!isObject(menu) || typeof menu.addEventListener !== 'function') {
      throw new TypeError(`items[${index}].menu must be an EventTarget-like object`);
    }
    if (kind !== 'actions' && kind !== 'form') throw new TypeError(`items[${index}].kind must be actions or form`);
    if (typeof menu.hidden !== 'boolean') setHidden(menu, true);
    return {
      item,
      button,
      menu,
      kind,
      group: item.group ?? item.groupId ?? DEFAULT_GROUP,
      listeners: [],
      open: !isHidden(menu)
    };
  });

  let destroyed = false;
  let activeState = null;
  let sequence = 0;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    return typeof target.removeEventListener === 'function'
      ? () => target.removeEventListener(type, handler, options)
      : () => {};
  }

  function descendantsForQuery(menu, selector) {
    if (typeof menu.querySelectorAll === 'function') {
      try {
        const found = [...menu.querySelectorAll(selector)];
        if (found.length) return found;
      } catch {
        // Use the generic tree walker for lightweight fakes.
      }
    }
    return descendantsOf(menu);
  }

  function actionItems(state) {
    const candidates = descendantsForQuery(state.menu, '[role="menuitem"],button,a[href],[tabindex]');
    const unique = [];
    const seen = new Set();
    for (const node of candidates) {
      if (seen.has(node) || !isActionControl(node) || hiddenByAncestor(node, state.menu)) continue;
      seen.add(node);
      unique.push(node);
    }
    return unique;
  }

  function setupSemantics(state) {
    const id = menuId(state.menu);
    setAttribute(state.button, 'aria-controls', id);
    setAttribute(state.button, 'aria-haspopup', state.kind === 'actions' ? 'menu' : 'dialog');
    setAttribute(state.button, 'aria-expanded', String(state.open));
    setAttribute(state.menu, 'data-popover', state.kind);

    if (state.kind === 'actions') {
      setAttribute(state.menu, 'role', 'menu');
      for (const node of descendantsForQuery(state.menu, 'button,a[href],[role="menuitem"], [tabindex]')) {
        if (isActionControl(node) && getAttribute(node, 'role') === null) setAttribute(node, 'role', 'menuitem');
      }
    } else {
      // Form popovers intentionally keep checkbox/range/native Tab semantics,
      // but aria-haspopup=dialog should still point at a named popup rather
      // than an element that accidentally retains role=menu.
      setAttribute(state.menu, 'role', 'dialog');
      if (!getAttribute(state.menu, 'aria-label') && !getAttribute(state.menu, 'aria-labelledby')) {
        const label = getAttribute(state.button, 'aria-label') || state.button.textContent?.trim();
        if (label) setAttribute(state.menu, 'aria-label', label.replace(/\s*[▾⌄]\s*$/, ''));
      }
    }
  }

  function syncTrigger(state) {
    setAttribute(state.button, 'aria-expanded', String(state.open && !isHidden(state.menu)));
  }

  function stateOpen(state) {
    return state.open && !isHidden(state.menu);
  }

  function closeState(state) {
    const wasOpen = stateOpen(state) || !isHidden(state.menu);
    state.open = false;
    setHidden(state.menu, true);
    syncTrigger(state);
    if (activeState === state) activeState = null;
    return wasOpen;
  }

  function closeGroup(group, except = null) {
    for (const state of states) {
      if (state !== except && state.group === group && stateOpen(state)) closeState(state);
    }
  }

  function closeAll({ restoreFocus = false } = {}) {
    if (destroyed) return;
    const openStates = states.filter(stateOpen);
    const restoreState = activeState && stateOpen(activeState)
      ? activeState
      : openStates.at(-1);
    for (const state of openStates) closeState(state);
    if (restoreFocus && restoreState) safeFocus(restoreState.button);
  }

  function menuStyle(menu) {
    if (!menu.style) {
      try {
        menu.style = {};
      } catch {
        return null;
      }
    }
    return menu.style;
  }

  function position(state) {
    if (destroyed || !stateOpen(state)) return;
    const { width: viewportWidth, height: viewportHeight } = viewportSize(windowRef, documentRef);
    if (!(viewportWidth > 0) || !(viewportHeight > 0)) return;
    const anchor = rectOf(state.button);
    const measured = rectOf(state.menu);
    const width = Math.max(1, measured.width || readNumeric(state.menu.offsetWidth, 0) || 1);
    const height = Math.max(1, measured.height || readNumeric(state.menu.offsetHeight, 0) || 1);
    const availableWidth = Math.max(0, viewportWidth - 16);
    const availableHeight = Math.max(0, viewportHeight - 16);
    const style = menuStyle(state.menu);
    if (!style) return;
    style.position = 'fixed';

    // CSS owns the normal 220–280px width. This max-width only protects a
    // narrow viewport and keeps the 8px edge padding invariant.
    if (availableWidth > 0) style.maxWidth = `${availableWidth}px`;
    style.maxHeight = `${availableHeight}px`;
    style.overflowY = 'auto';

    const boundedWidth = Math.min(width, availableWidth || width);
    const boundedHeight = Math.min(height, availableHeight || height);
    let left = Math.min(Math.max(8, anchor.left), Math.max(8, viewportWidth - boundedWidth - 8));
    const below = anchor.bottom + 4;
    const above = anchor.top - boundedHeight - 4;
    let top = below;
    if (below + boundedHeight > viewportHeight - 8 && above >= 8) top = above;
    else top = Math.min(Math.max(8, top), Math.max(8, viewportHeight - boundedHeight - 8));
    left = Math.min(Math.max(8, left), Math.max(8, viewportWidth - boundedWidth - 8));
    style.left = `${left}px`;
    style.top = `${top}px`;
  }

  function focusAction(state, index) {
    const candidates = actionItems(state);
    const target = candidates[index];
    if (target) safeFocus(target);
  }

  function openState(state, focusIndex = null) {
    if (destroyed || isDisabled(state.button) || hasOpenNativeModal(documentRef, state.button)) return false;
    closeGroup(state.group, state);
    state.open = true;
    setHidden(state.menu, false);
    syncTrigger(state);
    activeState = state;
    state.sequence = ++sequence;
    position(state);
    if (focusIndex !== null) focusAction(state, focusIndex);
    return true;
  }

  function toggleState(state) {
    if (stateOpen(state)) {
      closeState(state);
      return false;
    }
    return openState(state);
  }

  function onButtonClick(state) {
    return event => {
      if (event?.defaultPrevented || isDisabled(state.button) || hasOpenNativeModal(documentRef, state.button)) return;
      toggleState(state);
    };
  }

  function onButtonKeydown(state) {
    return event => {
      if (event?.defaultPrevented || isDisabled(state.button) || hasOpenNativeModal(documentRef, state.button)) return;
      const key = eventKey(event);
      if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
      preventDefault(event);
      openState(state, key === 'ArrowDown' ? 0 : Math.max(0, actionItems(state).length - 1));
    };
  }

  function onMenuKeydown(state) {
    return event => {
      if (event?.defaultPrevented || !stateOpen(state) || hasOpenNativeModal(documentRef, state.menu)) return;
      const key = eventKey(event);
      if (key === 'Escape') {
        preventDefault(event);
        closeState(state);
        safeFocus(state.button);
        return;
      }
      if (key === 'Tab') {
        // Let the browser's normal tab order move focus. The document
        // focusin listener closes once focus actually leaves this menu, so
        // Tab between native form controls is not interrupted and no focus
        // is stolen by the trigger.
        return;
      }
      if (state.kind !== 'actions') return;
      const candidates = actionItems(state);
      if (!candidates.length) return;
      let current = closestWithin(event.target, state.menu, node => candidates.includes(node));
      if (!current && documentRef.activeElement) {
        current = closestWithin(documentRef.activeElement, state.menu, node => candidates.includes(node));
      }
      let index = current ? candidates.indexOf(current) : -1;
      if (key === 'ArrowDown') index = (index + 1 + candidates.length) % candidates.length;
      else if (key === 'ArrowUp') index = (index - 1 + candidates.length) % candidates.length;
      else if (key === 'Home') index = 0;
      else if (key === 'End') index = candidates.length - 1;
      else return;
      preventDefault(event);
      safeFocus(candidates[index]);
    };
  }

  function onMenuClick(state) {
    return event => {
      if (state.kind !== 'actions' || event?.defaultPrevented || !stateOpen(state)) return;
      const target = closestWithin(event.target, state.menu, isActionControl);
      if (target) closeState(state);
    };
  }

  function onDocumentClick(event) {
    if (destroyed) return;
    for (const state of states) {
      if (!stateOpen(state)) continue;
      const insideMenu = typeof state.menu.contains === 'function' && state.menu.contains(event?.target);
      const insideButton = typeof state.button.contains === 'function' && state.button.contains(event?.target);
      if (!insideMenu && !insideButton && event?.target !== state.menu && event?.target !== state.button) closeState(state);
    }
  }

  function onDocumentFocusIn(event) {
    if (destroyed) return;
    for (const state of states) {
      if (!stateOpen(state)) continue;
      const target = event?.target;
      const insideMenu = typeof state.menu.contains === 'function' && state.menu.contains(target);
      if (!insideMenu) closeState(state);
    }
  }

  function onDocumentKeydown(event) {
    // A business dialog is allowed to consume Escape first. In particular,
    // never turn a defaultPrevented Escape from an upper modal into a toolbar
    // menu close/focus restore.
    if (destroyed || event?.defaultPrevented || eventKey(event) !== 'Escape') return;
    const openStateList = states.filter(stateOpen);
    if (openStateList.some(state => hasOpenNativeModal(documentRef, state.menu))) return;
    if (!openStateList.length) return;
    preventDefault(event);
    closeAll({ restoreFocus: true });
  }

  const cleanups = [];
  for (const state of states) {
    setupSemantics(state);
    if (state.open) {
      if (states.some(other => other !== state && other.group === state.group && other.open)) closeState(state);
      else activeState = state;
    }
    const buttonClick = onButtonClick(state);
    const buttonKeydown = onButtonKeydown(state);
    const menuKeydown = onMenuKeydown(state);
    const menuClick = onMenuClick(state);
    cleanups.push(listen(state.button, 'click', buttonClick));
    cleanups.push(listen(state.button, 'keydown', buttonKeydown));
    cleanups.push(listen(state.menu, 'keydown', menuKeydown));
    // Capture is intentional: existing business buttons may call
    // stopPropagation(), but a selected action must still dismiss its menu.
    cleanups.push(listen(state.menu, 'click', menuClick, { capture: true }));
  }
  cleanups.push(listen(documentRef, 'click', onDocumentClick));
  cleanups.push(listen(documentRef, 'focusin', onDocumentFocusIn));
  cleanups.push(listen(documentRef, 'keydown', onDocumentKeydown, { capture: true }));
  const reposition = () => {
    for (const state of states) if (stateOpen(state)) position(state);
  };
  cleanups.push(listen(windowRef, 'resize', reposition));
  cleanups.push(listen(windowRef, 'scroll', reposition));

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
    for (const state of states) {
      setHidden(state.menu, true);
      state.open = false;
      syncTrigger(state);
    }
    activeState = null;
  }

  return { closeAll, destroy };
}
