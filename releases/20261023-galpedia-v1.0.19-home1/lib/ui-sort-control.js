import { createActionIcon } from './action-icons.js';

const SORT_DIRECTION_LABELS = Object.freeze({
  asc: '升序',
  desc: '降序'
});

export function normalizeSortDirection(direction) {
  return direction === 'asc' ? 'asc' : 'desc';
}

export function toggleSortDirection(direction) {
  return normalizeSortDirection(direction) === 'asc' ? 'desc' : 'asc';
}

/**
 * Keep the accessible state, tooltip, visually-hidden label, and direction
 * icon for a sort-direction button in sync.
 */
export function syncSortDirectionControl({
  button,
  icon = null,
  label = null,
  direction = 'desc',
  labelPrefix = '排序',
  documentRef = button?.ownerDocument
} = {}) {
  if (button === null || typeof button?.setAttribute !== 'function') {
    throw new TypeError('button must provide setAttribute');
  }
  const normalizedDirection = normalizeSortDirection(direction);
  const directionLabel = SORT_DIRECTION_LABELS[normalizedDirection];
  const accessibleLabel = `${String(labelPrefix || '排序')}：${directionLabel}，点击切换`;
  button.setAttribute('aria-pressed', String(normalizedDirection === 'asc'));
  button.setAttribute('aria-label', accessibleLabel);
  button.title = accessibleLabel;
  if (label !== null && label !== undefined) label.textContent = directionLabel;
  if (icon !== null && icon !== undefined) {
    if (typeof icon.replaceChildren !== 'function') throw new TypeError('icon must provide replaceChildren');
    icon.replaceChildren(createActionIcon(documentRef, normalizedDirection === 'asc' ? 'arrow-up-a-z' : 'arrow-down-a-z'));
  }
  return normalizedDirection;
}

// Keep a descriptive alias for callers that treat this operation as a pure
// render step. Both names intentionally share the same implementation.
export const renderSortDirectionControl = syncSortDirectionControl;
