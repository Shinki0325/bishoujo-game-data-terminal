// Presentation only: never mutate the owning selection or comparison sets.
export function syncSelectionContext({ root, mode, count, resultActions, focusFallback, keepEmptyTools = false }) {
  const hasSelection = count > 0;
  const hide = element => {
    if (!element) return;
    const active = element.ownerDocument?.activeElement;
    if (active && (active === element || element.contains?.(active))) focusFallback?.focus?.();
    element.hidden = true;
  };
  if (!mode || (!hasSelection && !keepEmptyTools)) hide(root);
  else root.hidden = false;
  root.dataset.empty = String(!hasSelection);
  const summary = root.querySelector('[data-selection-count]');
  if (!hasSelection) hide(summary);
  else if (summary) summary.hidden = false;
  for (const action of resultActions) {
    if (!hasSelection) hide(action);
    else action.hidden = false;
  }
}
