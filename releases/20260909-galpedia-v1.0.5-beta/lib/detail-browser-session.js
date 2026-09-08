const BODY_STYLES = ['position', 'top', 'left', 'right', 'width', 'paddingRight'];

/** Detail scroll lock and return-focus ownership, independent of detail data/navigation. */
export function createDetailBrowserSession({ dialog, documentRef = document, windowRef = window }) {
  let scrollTop = null;
  let savedStyles = null;
  let returnFocus = null;
  function lock() {
    if (scrollTop !== null) return;
    scrollTop = windowRef.scrollY;
    const style = documentRef.body.style;
    savedStyles = Object.fromEntries(BODY_STYLES.map(key => [key, style[key]]));
    const scrollbarWidth = Math.max(0, windowRef.innerWidth - documentRef.documentElement.clientWidth);
    documentRef.documentElement.classList.add('work-details-open');
    Object.assign(style, {
      position: 'fixed', top: `-${scrollTop}px`, left: '0', right: '0', width: '100%',
      paddingRight: scrollbarWidth > 0 ? `${scrollbarWidth}px` : ''
    });
  }
  function unlock() {
    if (scrollTop === null) return;
    const top = scrollTop;
    scrollTop = null;
    documentRef.documentElement.classList.remove('work-details-open');
    for (const key of BODY_STYLES) documentRef.body.style[key] = savedStyles?.[key] ?? '';
    savedStyles = null;
    windowRef.scrollTo(0, top);
  }
  function sync() { if (dialog.open) lock(); else unlock(); }
  dialog.addEventListener('toggle', sync);
  return Object.freeze({
    lock, unlock,
    captureFocus({ preserve = false } = {}) {
      if (preserve) return;
      const active = documentRef.activeElement;
      returnFocus = active instanceof windowRef.HTMLElement && !dialog.contains(active) ? active : null;
    },
    takeFocusRestore() {
      const target = returnFocus;
      returnFocus = null;
      // Navigation decides whether to invoke this; taking it always clears the session.
      return () => { if (target?.isConnected) target.focus({ preventScroll: true }); };
    },
    dispose() {
      dialog.removeEventListener('toggle', sync);
      unlock(); returnFocus = null;
    }
  });
}
