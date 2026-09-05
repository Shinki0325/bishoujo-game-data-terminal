function assertElement(value, name) {
  if (value === null || typeof value?.addEventListener !== 'function') {
    throw new TypeError(`${name} must provide addEventListener`);
  }
}

function isInside(element, container) {
  let current = element;
  while (current !== null && current !== undefined) {
    if (current === container) return true;
    current = current.parentElement;
  }
  return false;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function isHidden(element, boundary) {
  let current = element;
  while (current !== null && current !== undefined && current !== boundary) {
    if (current.hidden) return true;
    current = current.parentElement;
  }
  return false;
}

function focusableControls(drawer) {
  return [...drawer.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => (
    !element.disabled
    && element.type !== 'hidden'
    && element.getAttribute?.('tabindex') !== '-1'
    && !isHidden(element, drawer)
  ));
}

export function createFilterDrawerController({
  drawer,
  toggle,
  closeButton,
  backdrop,
  applyButton,
  mediaQuery,
  documentRef
}) {
  assertElement(drawer, 'drawer');
  assertElement(toggle, 'toggle');
  assertElement(closeButton, 'closeButton');
  assertElement(backdrop, 'backdrop');
  assertElement(applyButton, 'applyButton');
  if (mediaQuery === null || typeof mediaQuery?.matches !== 'boolean') {
    throw new TypeError('mediaQuery must provide matches');
  }
  if (documentRef === null || typeof documentRef?.addEventListener !== 'function') {
    throw new TypeError('documentRef must provide addEventListener');
  }

  let open = false;

  function sync({ focusDrawer = false, returnFocus = false } = {}) {
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    documentRef.body?.classList?.toggle('is-filter-drawer-open', open);
    if (returnFocus && typeof toggle.focus === 'function') toggle.focus();
    else if (focusDrawer && typeof closeButton.focus === 'function') closeButton.focus();
  }

  function close({ returnFocus = true } = {}) {
    if (!open) return false;
    open = false;
    sync({ returnFocus });
    return true;
  }

  function trapFocus(event) {
    const controls = focusableControls(drawer);
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls.at(-1);
    const active = documentRef.activeElement;
    const outsideCycle = !controls.includes(active);
    const wrapBackward = event.shiftKey && active === first;
    const wrapForward = !event.shiftKey && active === last;
    if (!outsideCycle && !wrapBackward && !wrapForward) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }

  toggle.addEventListener('click', () => {
    open = !open;
    sync({ focusDrawer: open, returnFocus: !open });
  });
  closeButton.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  applyButton.addEventListener('click', () => close());
  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Tab' && open) {
      trapFocus(event);
      return;
    }
    if (event.key === 'Escape') close();
  });
  mediaQuery.addEventListener?.('change', () => {
    const returnFocus = open && isInside(documentRef.activeElement, drawer);
    open = false;
    sync({ returnFocus });
  });

  sync();
  return Object.freeze({ sync });
}
