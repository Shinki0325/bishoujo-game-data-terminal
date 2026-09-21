const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalPreviewOrigin(origin) {
  if (typeof origin !== 'string') return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return LOCAL_PREVIEW_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveDetailViewCountMode({ pageOrigin, endpointOrigin }) {
  if (isLocalPreviewOrigin(pageOrigin)) return 'local-preview';
  if (pageOrigin === endpointOrigin) return 'same-origin';
  return 'hidden';
}
