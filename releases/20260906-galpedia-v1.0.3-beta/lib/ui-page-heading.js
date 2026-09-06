const numbers = new Intl.NumberFormat('zh-CN');

// Presentation only. Callers own the population, filtering and family rules.
export function formatHeadingCount(count, unit) {
  return Number.isSafeInteger(count) && count >= 0
    ? `${numbers.format(count)} ${unit}`
    : '加载中…';
}

export function syncHeadingCount(element, count, unit) {
  if (!element) return;
  const text = formatHeadingCount(count, unit);
  if (element.textContent !== text) element.textContent = text;
}

export function syncLocalFeedback(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}
