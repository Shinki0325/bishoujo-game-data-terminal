import {
  resolveAssetUrl,
  validateAssetBase,
  validateRelativeAssetPath
} from './asset-url.js';

const MANIFEST_VERSION = 'egs-tier-preview-assets-v1';
const WORK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function validWorkId(value) {
  return typeof value === 'string' && WORK_ID_PATTERN.test(value);
}

function normalizeManifest(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('preview manifest must be an object');
  }
  if (source.manifestVersion !== MANIFEST_VERSION) {
    throw new TypeError('preview manifest version is unsupported');
  }
  if (source.previewLongEdge !== 1024) {
    throw new TypeError('preview manifest long edge must be 1024');
  }
  if (!Array.isArray(source.entries)) throw new TypeError('preview manifest entries must be an array');
  const entriesByWorkId = new Map();
  for (const [index, entry] of source.entries.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`preview manifest entry ${index} is invalid`);
    }
    if (!validWorkId(entry.workId)) throw new TypeError(`preview manifest entry ${index} has an invalid workId`);
    if (entriesByWorkId.has(entry.workId)) throw new TypeError(`preview manifest duplicates ${entry.workId}`);
    validateRelativeAssetPath(entry.url, `preview manifest entries[${index}].url`);
    if (!Number.isSafeInteger(entry.width) || entry.width <= 0 || !Number.isSafeInteger(entry.height) || entry.height <= 0) {
      throw new TypeError(`preview manifest entry ${index} has invalid dimensions`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !SHA256_PATTERN.test(entry.sha256)) {
      throw new TypeError(`preview manifest entry ${index} has invalid integrity metadata`);
    }
    entriesByWorkId.set(entry.workId, Object.freeze({
      workId: entry.workId,
      url: entry.url,
      width: entry.width,
      height: entry.height,
      bytes: entry.bytes,
      sha256: entry.sha256
    }));
  }
  return Object.freeze({
    manifestVersion: source.manifestVersion,
    previewLongEdge: source.previewLongEdge,
    entriesByWorkId
  });
}

export function createPreviewMediaResolver({ assetBase, fetchJson }) {
  const base = validateAssetBase(assetBase);
  if (typeof fetchJson !== 'function') throw new TypeError('fetchJson must be a function');
  let loadPromise = null;
  let status = 'idle';

  async function loadOnce() {
    if (loadPromise === null) {
      loadPromise = Promise.resolve()
        .then(fetchJson)
        .then(normalizeManifest)
        .then(manifest => {
          status = 'ready';
          return manifest;
        })
        .catch(error => {
          status = 'fallback';
          return null;
        });
    }
    return loadPromise;
  }

  async function urlFor(workId, thumbnailPath) {
    const thumbnailUrl = resolveAssetUrl(thumbnailPath, base);
    const manifest = await loadOnce();
    if (manifest === null || !validWorkId(workId)) return thumbnailUrl;
    const entry = manifest.entriesByWorkId.get(workId);
    return entry === undefined ? thumbnailUrl : resolveAssetUrl(entry.url, base);
  }

  return Object.freeze({
    urlFor,
    inspect() {
      return Object.freeze({ status });
    }
  });
}
