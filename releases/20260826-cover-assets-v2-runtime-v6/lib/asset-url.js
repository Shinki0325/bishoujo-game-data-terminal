export const DEFAULT_ASSET_BASE = '/backend/exports/egs-tier-beta-v1/';

const EXTERNAL_V2_ASSET_BASE = 'https://raw.githubusercontent.com/Shinki0325/bishoujo-game-cover-assets/main/';
const V2_FALLBACK_PATH = 'egs-tier/v2/objects/sha256/58/58e13b4a0b2c570a210f98bb4da69c4d3fcffd5f58f580a0ddf38fbc7ce91394.webp';

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
  if (base === EXTERNAL_V2_ASSET_BASE) {
    // Company avatars remain hosted by Terminal; only work cover/preview paths
    // are translated to the external content-addressed v2 namespace.
    if (path.startsWith('company/')) return resolveAssetUrl(path, DEFAULT_ASSET_BASE);
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
