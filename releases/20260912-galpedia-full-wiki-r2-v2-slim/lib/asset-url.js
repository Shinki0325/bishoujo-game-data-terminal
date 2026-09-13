import {PUBLIC_COVER_MIRROR} from './public-cover-mirror-config.js';
import {isLocalPreviewOrigin} from './detail-view-stats.js';
import {lookupFullWikiPublicMediaUrl} from './full-wiki-public-media-map.js';
import {coverObjectSha, publicCoverMirror} from './public-cover-mirror.js';
export const DEFAULT_ASSET_BASE = '/backend/exports/egs-tier-beta-v1/';

export const PRIMARY_COVER_ASSET_BASE = 'https://assets.bishojo.date/';
export const FALLBACK_COVER_ASSET_BASE = 'https://raw.githubusercontent.com/Shinki0325/bishoujo-game-cover-assets/main/';
const EXTERNAL_V2_ASSET_BASES = new Set([PRIMARY_COVER_ASSET_BASE, FALLBACK_COVER_ASSET_BASE]);
const V2_FALLBACK_PATH = 'egs-tier/v2/objects/sha256/58/58e13b4a0b2c570a210f98bb4da69c4d3fcffd5f58f580a0ddf38fbc7ce91394.webp';
const TERMINAL_RELEASE_MARKER = '/releases/';
const V2_OBJECT_PATH_PATTERN = /^egs-tier\/v2\/objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/u;
const LOCAL_WIKI_IMAGE_PATTERN = /^__wiki-local\/images\/[a-f0-9]{64}\.webp$/u;
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

const APPROVED_PUBLIC_MEDIA_BASE = 'https://assets.bishojo.date/';
const APPROVED_PUBLIC_MEDIA_PATTERNS = Object.freeze([
  /^egs-tier\/v2\/objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/u,
  /^terminal-wiki\/v1\/characters\/v1\/images\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/u,
]);

export function approvedPublicMediaUrl(publicUrl, descriptor = {}) {
  if (typeof publicUrl !== 'string' || !publicUrl) throw new AssetUrlError('public media URL is required');
  let url;
  try { url = new URL(publicUrl); } catch { throw new AssetUrlError('public media URL is invalid'); }
  if (!['https://assets.bishojo.date','https://wiki-assets.bishojo.date'].includes(url.origin) || url.search || url.hash) throw new AssetUrlError('public media URL origin is not approved');
  const path = url.pathname.replace(/^\//u, '');
  if (!APPROVED_PUBLIC_MEDIA_PATTERNS.some(pattern => pattern.test(path))) throw new AssetUrlError('public media URL path is not approved');
  if (typeof descriptor.sha256 !== 'string' || !path.endsWith(`${descriptor.sha256}.webp`)) throw new AssetUrlError('public media URL SHA mismatch');
  if (descriptor.publicEvidence && (descriptor.publicEvidence.sha256 !== descriptor.sha256
    || descriptor.publicEvidence.bytes !== descriptor.bytes
    || descriptor.publicEvidence.width !== descriptor.width
    || descriptor.publicEvidence.height !== descriptor.height
    || descriptor.publicEvidence.mimeType !== 'image/webp')) throw new AssetUrlError('public media evidence mismatch');
  return url.href;
}

export function approvedPublicMediaPath(publicUrl, descriptor = {}) {
  return new URL(approvedPublicMediaUrl(publicUrl, descriptor)).pathname.replace(/^\//u, '');
}

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
    || !(RELATIVE_ASSET_PATH_PATTERN.test(relativePath) || LOCAL_WIKI_IMAGE_PATTERN.test(relativePath)
      && isLocalPreviewOrigin(globalThis.location?.origin)
      && new URLSearchParams(globalThis.location?.search??'').get('localMedia')==='1')
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

function mirroredPublicMediaUrl(publicUrl, descriptor) {
  const url = new URL(approvedPublicMediaUrl(publicUrl, descriptor));
  const path = url.pathname.slice(1);
  return V2_OBJECT_PATH_PATTERN.test(path) ? new URL(path, PUBLIC_COVER_MIRROR.base).href : url.href;
}

export function resolveAssetUrl(relativePath, assetBase = DEFAULT_ASSET_BASE) {
  const base = validateAssetBase(assetBase);
  const path = validateRelativeAssetPath(relativePath);
  if (isLocalPreviewOrigin(globalThis.location?.origin) && new URLSearchParams(globalThis.location?.search ?? '').get('localMedia') === '1') {
    const fullWikiImage = /^data\/terminal-wiki-media-v1\/(?:covers|characters)\/(?:[^/]+\/)*([a-f0-9]{64})\.webp$/u.exec(path);
    if (fullWikiImage) return new URL(`__wiki-local/images/${fullWikiImage[1]}.webp`, terminalAssetBase()).href;
  }
  if (path.startsWith('data/terminal-wiki-media-v1/') && !(isLocalPreviewOrigin(globalThis.location?.origin) && new URLSearchParams(globalThis.location?.search ?? '').get('localMedia') === '1')) {
    const mappedPublicUrl = lookupFullWikiPublicMediaUrl(path.slice('data/terminal-wiki-media-v1/'.length));
    if (mappedPublicUrl !== null) return mirroredPublicMediaUrl(mappedPublicUrl, {sha256: mappedPublicUrl.split('/').pop()?.replace(/\.webp$/u, '')});
  }
  if (APPROVED_PUBLIC_MEDIA_PATTERNS.some(pattern => pattern.test(path))) return new URL(path, PUBLIC_COVER_MIRROR.base).href;
  if(path.startsWith('data/terminal-wiki-media-v1/')) {
    return new URL(`../${path}`,import.meta.url).href;
  }
  if(LOCAL_WIKI_IMAGE_PATTERN.test(path)) {
    return new URL(path,terminalAssetBase()).href;
  }
  if (EXTERNAL_V2_ASSET_BASES.has(base)) {
    // Company avatars remain hosted by Terminal; only work cover/preview paths
    // are translated to the external content-addressed v2 namespace.
    if (path.startsWith('company/')) {
      return new URL(path, terminalAssetBase()).href;
    }
    if (path === 'assets/cover-unavailable.webp') {
      return publicCoverMirror.peek(V2_FALLBACK_PATH) ?? new URL(V2_FALLBACK_PATH, base).href;
    }
    const match = /^assets\/(?:covers|previews)\/([0-9a-f]{2})\/([0-9a-f]{64}\.webp)$/u.exec(path);
    if (match) {
      const objectPath = `egs-tier/v2/objects/sha256/${match[1]}/${match[2]}`;
      return publicCoverMirror.peek(objectPath) ?? new URL(objectPath, base).href;
    }
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
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash || url.username || url.password) return null;
  const path = url.pathname.slice(base.pathname.length);
  return coverObjectSha(path) ? path : null;
}

export function fallbackCoverAssetUrl(urlValue) {
  const path = externalV2ObjectPath(urlValue, PRIMARY_COVER_ASSET_BASE);
  return path === null ? null : new URL(path, FALLBACK_COVER_ASSET_BASE).href;
}

export function recoverExternalCoverImage(image, { mirror = publicCoverMirror, isActive = () => true } = {}) {
  if (image === null || typeof image !== 'object' || image.dataset?.characterImageState) return Object.freeze({ recovered: false });
  const declaredUrl = image.getAttribute?.('src') || image.src || '';
  const activeUrl = image.currentSrc || declaredUrl;
  const objectPath = url => externalV2ObjectPath(url, PUBLIC_COVER_MIRROR.base)
    ?? externalV2ObjectPath(url, PRIMARY_COVER_ASSET_BASE) ?? externalV2ObjectPath(url, FALLBACK_COVER_ASSET_BASE);
  const declaredPath = objectPath(declaredUrl);
  const activePath = objectPath(activeUrl);
  const path = declaredPath ?? activePath;
  if (path === null) return Object.freeze({ recovered: false });
  const previous = imageRecoveryState.get(image);
  const current = declaredPath ? declaredUrl : activeUrl;
  if (previous?.path === path && previous.url === current) return Object.freeze({ recovered: previous.pending });
  const state = { path, url: current, pending: true };
  imageRecoveryState.set(image, state);
  image.removeAttribute?.('srcset');
  image.removeAttribute?.('sizes');
  const stillCurrent = () => isActive() && image.isConnected !== false
    && imageRecoveryState.get(image) === state && (image.getAttribute?.('src') || image.src || '') === declaredUrl;
  const finish = nextUrl => {
    if (!stillCurrent()) { state.pending = false; return; }
    state.pending = false;
    if (nextUrl) { state.url = nextUrl; image.removeAttribute?.('src'); image.src = nextUrl; }
    else {
      // Deliver the original failure to the owning view only after lookup has
      // finished. The exhausted state prevents the capture listener restarting.
      const EventRef = image.ownerDocument?.defaultView?.Event ?? globalThis.Event;
      image.dispatchEvent?.(new EventRef('error'));
    }
  };
  const isMirror = externalV2ObjectPath(current, PUBLIC_COVER_MIRROR.base) !== null;
  const completion = isMirror
    ? Promise.resolve().then(() => finish(new URL(path, PUBLIC_COVER_MIRROR.base).href))
    : Promise.resolve().then(() => mirror.resolve(path)).then(finish, () => finish(null));
  return Object.freeze({ recovered: true, stage: isMirror ? 'retry-primary' : 'verify-mirror', completion });
}

export function installExternalCoverImageRecovery(documentRef = globalThis.document) {
  if (documentRef === null || typeof documentRef?.addEventListener !== 'function') {
    throw new TypeError('documentRef must provide addEventListener');
  }
  let installed = installedRecoveryDocuments.get(documentRef);
  if (!installed) {
    installed = { owners: 0 };
    installed.onImageError = event => {
    const image = event?.target;
    if (String(image?.tagName ?? '').toUpperCase() !== 'IMG') return;
    const outcome = recoverExternalCoverImage(image, { isActive: () => installed.owners > 0 });
    if (!outcome.recovered) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    };
    documentRef.addEventListener('error', installed.onImageError, true);
    installedRecoveryDocuments.set(documentRef, installed);
  }
  installed.owners++;
  let active = true;
  const uninstall = () => {
    if (!active) return;
    active = false;
    if (--installed.owners === 0) {
      documentRef.removeEventListener?.('error', installed.onImageError, true);
      installedRecoveryDocuments.delete(documentRef);
    }
  };
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
