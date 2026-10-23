// The full catalog shares compact pages between the Worker and the view.
// Fixed windows keep each forward step bounded on phones as well as desktops.
export const SELECTION_PAGE_SIZE = 48;
export function selectionPages(total) {
  if (!Number.isSafeInteger(total) || total < 0) throw new TypeError('invalid result total');
  if (total === 0) return [{ start: 0, end: 0 }];
  return Array.from({ length: Math.ceil(total / SELECTION_PAGE_SIZE) }, (_, index) => ({
    start: index * SELECTION_PAGE_SIZE,
    end: Math.min(total, (index + 1) * SELECTION_PAGE_SIZE)
  }));
}
