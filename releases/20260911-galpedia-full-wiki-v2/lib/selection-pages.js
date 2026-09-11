// Shared by the query Worker and the view. Preserve balanced 60–100 item
// windows (including the existing single-page 101–119 item exception).
export function selectionPages(total) {
  if (!Number.isSafeInteger(total) || total < 0) throw new TypeError('invalid result total');
  if (total === 0) return [{ start: 0, end: 0 }];
  let count = Math.ceil(total / 100);
  while (count > 1 && Math.floor(total / count) < 60) count--;
  const size = Math.floor(total / count), extra = total % count;
  let start = 0;
  return Array.from({ length: count }, (_, index) => {
    const end = start + size + (index < extra ? 1 : 0);
    const page = { start, end };
    start = end;
    return page;
  });
}
