export const THEME_STORAGE_KEY = 'egs-tier-terminal:theme-v1';
export const THEMES = Object.freeze(['dark', 'light']);

export function normalizeTheme(value, fallback = 'dark') {
  if (!THEMES.includes(fallback)) throw new RangeError('fallback must be dark or light');
  return THEMES.includes(value) ? value : fallback;
}

export function readTheme(storage, fallback = 'dark') {
  try {
    return normalizeTheme(storage?.getItem?.(THEME_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function applyTheme(documentRef, theme) {
  if (documentRef?.documentElement === undefined || documentRef.documentElement === null) {
    throw new TypeError('documentRef must provide documentElement');
  }
  const normalized = normalizeTheme(theme);
  documentRef.documentElement.dataset.theme = normalized;
  return normalized;
}

export function saveTheme(storage, theme) {
  const normalized = normalizeTheme(theme);
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalized);
  } catch {
    // Theme preference remains active for the current session.
  }
  return normalized;
}
