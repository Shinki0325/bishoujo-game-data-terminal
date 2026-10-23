export function reconcileKeyedChildren(parent, orderedNodes) {
  if (!Array.isArray(orderedNodes)) throw new TypeError('orderedNodes must be an array');
  if (new Set(orderedNodes).size !== orderedNodes.length) {
    throw new TypeError('orderedNodes must not contain duplicate nodes');
  }
  if (parent === null || typeof parent !== 'object') throw new TypeError('parent is required');
  if (typeof parent.insertBefore !== 'function' || typeof parent.removeChild !== 'function') {
    if (typeof parent.replaceChildren !== 'function') {
      throw new TypeError('parent must support keyed insertion or replaceChildren');
    }
    const previousCount = Number(parent.children?.length ?? 0);
    parent.replaceChildren(...orderedNodes);
    return Object.freeze({ moved: orderedNodes.length, removed: Math.max(0, previousCount - orderedNodes.length) });
  }
  let cursor = parent.firstChild;
  let moved = 0;
  for (const node of orderedNodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    parent.insertBefore(node, cursor);
    moved += 1;
  }
  let removed = 0;
  while (cursor !== null) {
    const next = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
    removed += 1;
  }
  return Object.freeze({ moved, removed });
}
