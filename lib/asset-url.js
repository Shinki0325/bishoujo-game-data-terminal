export const DEFAULT_ASSET_BASE = '/backend/exports/egs-tier-beta-v1/';

export const PRIMARY_COVER_ASSET_BASE = 'https://assets.bishojo.date/';
export const FALLBACK_COVER_ASSET_BASE = 'https://raw.githubusercontent.com/Shinki0325/bishoujo-game-cover-assets/main/';
const EXTERNAL_V2_ASSET_BASES = new Set([PRIMARY_COVER_ASSET_BASE, FALLBACK_COVER_ASSET_BASE]);
const V2_FALLBACK_PATH = 'egs-tier/v2/objects/sha256/58/58e13b4a0b2c570a210f98bb4da69c4d3fcffd5f58f580a0ddf38fbc7ce91394.webp';
const TERMINAL_RELEASE_MARKER = '/releases/';
const V2_OBJECT_PATH_PATTERN = /^egs-tier\/v2\/objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/u;
const imageRecoveryState = new WeakMap();
const installedRecoveryDocuments = new WeakMap();

const RELATIVE_ASSET_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;
const RELATIVE_ASSET_BASE_PATTERN = /^(?:\.\/|\/|[A-Za-z0-9][A-Za-z0-9._/-]*\/$)/u;
const LOCAL_SOURCE_COVER_PREFIX = ['sources', 'web', 'erogamescape', 'work-images', ''].join('/');
const ASSET_PATH_FIELDS = Object.freeze([
  'thumbnailPath',
  'assetPath',
  'coverAssetPath',
  'coverPath'
]);

export class AssetUrlError extends Error {
  constructor(message, { path } = {}) {
    super(message);
    this.name = 'AssetUrlError';
    if (path !== undefined) this.path = path;
  }
}

export function validateAssetBase(assetBase = DEFAULT_ASSET_BASE) {
  if (typeof assetBase !== 'string' || assetBase.length === 0 || assetBase.includes('\\')) {
    throw new AssetUrlError('assetBase must be a configured URL or relative base', { path: 'assetBase' });
  }
  if (/^\/\//u.test(assetBase) || assetBase.includes('..')) {
    throw new AssetUrlError('assetBase must not be protocol-relative or traversing', { path: 'assetBase' });
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(assetBase)) {
    let url;
    try {
      url = new URL(assetBase);
    } catch (cause) {
      throw new AssetUrlError('assetBase must be a valid URL', { path: 'assetBase', cause });
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new AssetUrlError('assetBase must use http or https', { path: 'assetBase' });
    }
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  }
  if (!RELATIVE_ASSET_BASE_PATTERN.test(assetBase)) {
    throw new AssetUrlError('assetBase must be a relative directory base', { path: 'assetBase' });
  }
  return assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
}

export function validateRelativeAssetPath(relativePath, path = 'assetPath') {
  if (
    typeof relativePath !== 'string'
    || !RELATIVE_ASSET_PATH_PATTERN.test(relativePath)
    || relativePath.startsWith(LOCAL_SOURCE_COVER_PREFIX)
  ) {
    throw new AssetUrlError('asset path must be a relative immutable asset path', { path });
  }
  return relativePath;
}

export function terminalAssetBase(moduleHref = import.meta.url) {
  const moduleUrl = new URL(moduleHref);
  const releaseOffset = moduleUrl.pathname.indexOf(TERMINAL_RELEASE_MARKER);
  moduleUrl.pathname = releaseOffset >= 0
    ? moduleUrl.pathname.slice(0, releaseOffset + 1)
    : new URL('../', moduleUrl).pathname;
  moduleUrl.search = '';
  moduleUrl.hash = '';
  return moduleUrl.href;
}

export function assetPathFromWork(work) {
  if (work === null || typeof work !== 'object' || Array.isArray(work)) {
    throw new AssetUrlError('work must be an object', { path: 'work' });
  }
  for (const field of ASSET_PATH_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(work, field);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new AssetUrlError(`work.${field} must be a data property`, { path: `work.${field}` });
    }
    if (typeof descriptor.value === 'string' && descriptor.value.length > 0) {
      return validateRelativeAssetPath(descriptor.value, `work.${field}`);
    }
  }
  throw new AssetUrlError('work must provide a thumbnail asset path', { path: 'work.thumbnailPath' });
}

export function resolveAssetUrl(relativePath, assetBase = DEFAULT_ASSET_BASE) {
  const base = validateAssetBase(assetBase);
  const path = validateRelativeAssetPath(relativePath);
  if (EXTERNAL_V2_ASSET_BASES.has(base)) {
    // Company avatars remain hosted by Terminal; only work cover/preview paths
    // are translated to the external content-addressed v2 namespace.
    if (path.startsWith('company/')) {
      return new URL(path, terminalAssetBase()).href;
    }
    if (path === 'assets/cover-unavailable.webp') {
      return new URL(V2_FALLBACK_PATH, base).href;
    }
    const match = /^assets\/(?:covers|previews)\/([0-9a-f]{2})\/([0-9a-f]{64}\.webp)$/u.exec(path);
    if (match) return new URL(`egs-tier/v2/objects/sha256/${match[1]}/${match[2]}`, base).href;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(base)) {
    return new URL(path, base).href;
  }
  return `${base}${path}`;
}

function externalV2ObjectPath(urlValue, assetBase) {
  if (typeof urlValue !== 'string' || urlValue.length === 0) return null;
  let url;
  let base;
  try {
    url = new URL(urlValue);
    base = new URL(validateAssetBase(assetBase));
  } catch {
    return null;
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const path = url.pathname.slice(base.pathname.length);
  return V2_OBJECT_PATH_PATTERN.test(path) ? path : null;
}

export function fallbackCoverAssetUrl(urlValue) {
  const path = externalV2ObjectPath(urlValue, PRIMARY_COVER_ASSET_BASE);
  return path === null ? null : new URL(path, FALLBACK_COVER_ASSET_BASE).href;
}

export function recoverExternalCoverImage(image) {
  if (image === null || typeof image !== 'object') return Object.freeze({ recovered: false });
  const declaredUrl = image.getAttribute?.('src') || image.src || '';
  const activeUrl = image.currentSrc || declaredUrl;
  const declaredPath = externalV2ObjectPath(declaredUrl, PRIMARY_COVER_ASSET_BASE);
  const activePath = externalV2ObjectPath(activeUrl, PRIMARY_COVER_ASSET_BASE);
  const path = declaredPath ?? activePath;
  if (path === null) return Object.freeze({ recovered: false });

  const previous = imageRecoveryState.get(image);
  const stage = previous?.path === path ? previous.stage : 0;
  image.removeAttribute?.('srcset');
  image.removeAttribute?.('sizes');

  const nextStage = stage === 0 ? 1 : 2;
  const nextUrl = new URL(
    path,
    nextStage === 1 ? PRIMARY_COVER_ASSET_BASE : FALLBACK_COVER_ASSET_BASE
  ).href;
  imageRecoveryState.set(image, Object.freeze({ path, stage: nextStage }));
  image.removeAttribute?.('src');
  image.src = nextUrl;
  return Object.freeze({
    recovered: true,
    stage: nextStage === 1 ? 'retry-primary' : 'fallback',
    url: nextUrl
  });
}

export function installExternalCoverImageRecovery(documentRef = globalThis.document) {
  if (documentRef === null || typeof documentRef?.addEventListener !== 'function') {
    throw new TypeError('documentRef must provide addEventListener');
  }
  const installed = installedRecoveryDocuments.get(documentRef);
  if (installed) return installed;
  const onImageError = event => {
    const image = event?.target;
    if (String(image?.tagName ?? '').toUpperCase() !== 'IMG') return;
    const outcome = recoverExternalCoverImage(image);
    if (!outcome.recovered) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };
  documentRef.addEventListener('error', onImageError, true);
  const uninstall = () => {
    documentRef.removeEventListener?.('error', onImageError, true);
    installedRecoveryDocuments.delete(documentRef);
  };
  installedRecoveryDocuments.set(documentRef, uninstall);
  return uninstall;
}

export function resolveWorkImageUrl(work, assetBase = DEFAULT_ASSET_BASE) {
  return resolveAssetUrl(assetPathFromWork(work), assetBase);
}

export function applyImageAsset(image, work, assetBase = DEFAULT_ASSET_BASE) {
  if (image === null || typeof image !== 'object') {
    throw new AssetUrlError('image must be an object', { path: 'image' });
  }
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.src = resolveWorkImageUrl(work, assetBase);
  return image;
}
