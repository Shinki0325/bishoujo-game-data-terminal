import { DATA_REVISION } from './runtime-config.js';
import { WORKBENCH_DEMAND } from './workbench-demand-config.js';
import { isLocalPreviewOrigin } from './detail-view-stats.js';
import { parseUiLocationHash } from './ui-location-state.js';

export const WORKBENCH_LANDING_SNAPSHOT_KEY = 'egs-tier-terminal:workbench-landing-v1';
export const DEFAULT_WORKBENCH_STATE_STORAGE_KEY = 'egs-tier-terminal:egs-tier-100-v1';
export const WORKBENCH_LANDING_SNAPSHOT_SCHEMA = 'egs-tier-workbench-landing-v4';
export const WORKBENCH_LANDING_SNAPSHOT_LIMIT = 28;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const SAFE_SHA256 = /^[a-f0-9]{64}$/u;
const THEME_KEY = 'egs-tier-terminal:theme-v1';
const ALLOWED_QUERY_KEYS = new Set(['startupMetrics', 'interactionMetrics', 'workerWorkbench', 'localMedia']);
const ALLOWED_WORK_HASH_KEYS = new Set(['query', 'sort', 'page']);
const SNAPSHOT_FILTER_FIELDS = Object.freeze([
  'sortKey', 'sortDirection', 'titleQuery', 'minimumScore', 'minimumVoteCount',
  'releaseStatus', 'selectedOnly'
]);
const SNAPSHOT_MEDIA_FIELDS = Object.freeze(['thumbnailUrl', 'previewUrl']);
const ALLOWED_WORK_FIELDS = Object.freeze([
  'workId', 'title', 'displayTitle', 'brandName', 'releaseDate',
  'median', 'voteCount', 'vndbRating', 'bangumiRating',
  'presentationMemberCount', 'coverPath', 'thumbnailPath', 'assetPath',
  'projectedThumbnailPath', 'projectedPreviewPath',
  'coverWidth', 'coverHeight', 'previewWidth', 'previewHeight'
]);
const ALLOWED_RATING_FIELDS = Object.freeze(['cardText', 'detailScore']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function readStorage(storage, key) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return { ok: false, value: null };
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

function writeStorage(storage, key, value) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // A private-mode or quota failure only disables this optional hint.
  }
}

function worksHashContext(hash) {
  if (typeof hash !== 'string') return null;
  const questionIndex = hash.indexOf('?');
  const route = questionIndex < 0 ? hash.slice(1) : hash.slice(1, questionIndex);
  const query = questionIndex < 0 ? '' : hash.slice(questionIndex + 1);
  if (route !== 'works' || query.includes('?')) return null;
  const parameters = new URLSearchParams(query);
  const counts = new Map();
  for (const key of parameters.keys()) {
    if (!ALLOWED_WORK_HASH_KEYS.has(key)) return null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if ([...counts.values()].some(count => count > 1)) return null;
  const parsed = parseUiLocationHash(hash);
  if (parsed?.page !== 'works' || parsed.workId !== null) return null;
  if (parameters.has('query') && parameters.get('query') !== parsed.query) return null;
  if (parameters.has('sort') && parameters.get('sort') !== parsed.sort) return null;
  if (parameters.has('page') && parameters.get('page') !== String(parsed.pageNumber)) return null;
  return Object.freeze({ hash, parsed });
}

function landingRouteContext(locationRef) {
  const hashContext = worksHashContext(locationRef?.hash);
  if (hashContext === null) return null;
  const parameters = new URLSearchParams(locationRef.search ?? '');
  for (const key of parameters.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) return null;
    if (key === 'localMedia' && (parameters.get(key) !== '1' || !isLocalPreviewOrigin(locationRef.origin))) return null;
  }
  const local = parameters.get('localMedia') === '1';
  return Object.freeze({
    hash: hashContext.hash,
    parsed: hashContext.parsed,
    mode: local ? 'local-preview' : 'public',
    origin: local ? String(locationRef.origin ?? '') : null
  });
}

export function canUseWorkbenchLandingRoute(locationRef) {
  return landingRouteContext(locationRef) !== null;
}

export function canCaptureWorkbenchLanding(locationRef) {
  return canUseWorkbenchLandingRoute(locationRef);
}

export function hasPersistedWorkbenchState(storage, storageKey = DEFAULT_WORKBENCH_STATE_STORAGE_KEY) {
  try {
    // Keep the original landing predicate's prefix scan and its permissive
    // zero-length/missing-storage behavior. `storageKey` remains in the
    // signature for callers that pass the configured state key.
    void storageKey;
    for (let index = 0; index < (storage?.length ?? 0); index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith('egs-tier-terminal:')
        && key !== THEME_KEY && key !== WORKBENCH_LANDING_SNAPSHOT_KEY) return true;
    }
    return false;
  } catch {
    // Never show a default list when storage cannot be inspected.
    return true;
  }
}

function bytesOf(text) {
  return new TextEncoder().encode(text).byteLength;
}

async function sha256Hex(value, cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.subtle?.digest) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validStoredStateSource(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_SNAPSHOT_BYTES) return false;
  try {
    const state = JSON.parse(raw);
    return isPlainObject(state)
      && state.schemaVersion === 'egs-tier-state-v5'
      && typeof state.sampleId === 'string' && state.sampleId.length > 0
      && isPlainObject(state.filterState)
      && Array.isArray(state.selectedWorkIds)
      && typeof state.savedAt === 'string';
  } catch {
    return false;
  }
}

function projectFilterState(filterState) {
  if (!isPlainObject(filterState)) return null;
  const result = {};
  for (const key of SNAPSHOT_FILTER_FIELDS) {
    const value = filterState[key];
    if (key === 'sortKey' || key === 'sortDirection' || key === 'titleQuery' || key === 'releaseStatus') {
      if (typeof value !== 'string') return null;
      result[key] = value;
    } else if (key === 'selectedOnly') {
      if (typeof value !== 'boolean') return null;
      result[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      result[key] = value;
    }
  }
  return result;
}

function validSnapshotFilterState(value) {
  return isPlainObject(value)
    && Object.keys(value).length === SNAPSHOT_FILTER_FIELDS.length
    && SNAPSHOT_FILTER_FIELDS.every(field => Object.hasOwn(value, field))
    && projectFilterState(value) !== null;
}

function mediaUrl(value, context) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('blob:')) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (context.mode === 'local-preview') {
    // Local previews also use the approved public cover-unavailable asset.
    // Keep the final rendered URL, including public fallback images, while
    // preventing private URLs from a different local preview origin.
    if (url.origin !== context.origin && isLocalPreviewOrigin(url.origin)) return null;
  } else if (isLocalPreviewOrigin(url.origin)) {
    return null;
  }
  return url.href;
}

function coverSourceFor(coverUrls, workId, context) {
  if (!context) return null;
  const source = coverUrls?.get?.(workId) ?? coverUrls?.[workId];
  if (!isPlainObject(source)) return null;
  const thumbnailUrl = mediaUrl(source.thumbnailUrl, context);
  const previewUrl = source.previewUrl === null || source.previewUrl === undefined
    ? null : mediaUrl(source.previewUrl, context);
  if (thumbnailUrl === null || (source.previewUrl && previewUrl === null)) return null;
  return { thumbnailUrl, previewUrl };
}

function copyRating(value) {
  if (!isPlainObject(value)) return undefined;
  const rating = {};
  for (const key of ALLOWED_RATING_FIELDS) {
    const item = value[key];
    if (typeof item === 'string' || typeof item === 'number' || item === null) rating[key] = item;
  }
  return Object.keys(rating).length > 0 ? rating : undefined;
}

function projectWork(work) {
  if (!isPlainObject(work) || typeof work.workId !== 'string' || work.workId.length === 0
    || typeof work.title !== 'string') return null;
  const result = {};
  for (const key of ALLOWED_WORK_FIELDS) {
    if (key === 'vndbRating' || key === 'bangumiRating') {
      const rating = copyRating(work[key]);
      if (rating !== undefined) result[key] = rating;
      continue;
    }
    const value = work[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value;
    }
  }
  if (typeof result.displayTitle !== 'string' || result.displayTitle.length === 0) {
    delete result.displayTitle;
  }
  return result;
}

function validSnapshotWork(work) {
  if (!(isPlainObject(work)
    && typeof work.workId === 'string' && work.workId.length > 0
    && typeof work.title === 'string' && work.title.length > 0
    && Object.keys(work).every(key => ALLOWED_WORK_FIELDS.includes(key)))) return false;
  const stringFields = ['displayTitle', 'brandName', 'releaseDate', 'coverPath', 'thumbnailPath',
    'assetPath', 'projectedThumbnailPath', 'projectedPreviewPath'];
  if (stringFields.some(key => Object.hasOwn(work, key)
    && work[key] !== null && typeof work[key] !== 'string')) return false;
  const numberFields = ['median', 'voteCount', 'coverWidth', 'coverHeight', 'previewWidth', 'previewHeight'];
  if (numberFields.some(key => Object.hasOwn(work, key)
    && work[key] !== null && (typeof work[key] !== 'number' || !Number.isFinite(work[key])))) return false;
  if (Object.hasOwn(work, 'presentationMemberCount')
    && work.presentationMemberCount !== null
    && (!Number.isSafeInteger(work.presentationMemberCount) || work.presentationMemberCount < 1)) return false;
  for (const key of ['vndbRating', 'bangumiRating']) {
    if (!Object.hasOwn(work, key)) continue;
    if (!isPlainObject(work[key]) || Object.keys(work[key]).some(field => !ALLOWED_RATING_FIELDS.includes(field))) return false;
    if (Object.hasOwn(work[key], 'cardText') && typeof work[key].cardText !== 'string') return false;
    if (Object.hasOwn(work[key], 'detailScore') && typeof work[key].detailScore !== 'number'
      && typeof work[key].detailScore !== 'string' && work[key].detailScore !== null) return false;
  }
  return true;
}

function validSnapshot(value, routeContext) {
  if (!isPlainObject(value)
    || value.schema !== WORKBENCH_LANDING_SNAPSHOT_SCHEMA
    || value.route !== routeContext?.hash
    || value.dataRevision !== DATA_REVISION
    || value.workbenchManifestSha256 !== WORKBENCH_DEMAND.sha256
    || value.mediaMode !== routeContext?.mode
    || value.mediaOrigin !== routeContext?.origin
    || (value.mediaMode !== 'public' && value.mediaMode !== 'local-preview')
    || (value.mediaMode === 'local-preview' && typeof value.mediaOrigin !== 'string')
    || (value.mediaMode === 'public' && value.mediaOrigin !== null)
    || !SAFE_SHA256.test(value.stateDigest)
    || !validSnapshotFilterState(value.filterState)
    || !isPlainObject(value.media)
    || !Array.isArray(value.works)
    || value.works.length < 1 || value.works.length > WORKBENCH_LANDING_SNAPSHOT_LIMIT
    || typeof value.capturedAt !== 'string') return false;
  // Released/unreleased membership changes at the UTC day boundary used by
  // work-release-date.js even when the source and saved filters are unchanged.
  if (['released', 'unreleased'].includes(value.filterState.releaseStatus)) {
    const captured = new Date(value.capturedAt);
    if (!Number.isFinite(captured.getTime())
      || captured.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10)) return false;
  }
  const ids = new Set();
  const validRows = value.works.every(work => {
    if (!validSnapshotWork(work) || ids.has(work.workId)) return false;
    ids.add(work.workId);
    return true;
  });
  if (!validRows) return false;
  const mediaKeys = Object.keys(value.media);
  if (mediaKeys.length !== ids.size || mediaKeys.some(id => !ids.has(id))) return false;
  return mediaKeys.every(id => {
    const source = value.media[id];
    if (!isPlainObject(source) || Object.keys(source).some(key => !SNAPSHOT_MEDIA_FIELDS.includes(key))) return false;
    if (mediaUrl(source.thumbnailUrl, routeContext) === null) return false;
    return source.previewUrl === null || mediaUrl(source.previewUrl, routeContext) !== null;
  });
}

export function snapshotWorkRows(works, { coverUrls, mediaContext } = {}) {
  if (!Array.isArray(works)) return { rows: [], media: {} };
  const rows = [];
  const media = {};
  for (const work of works.slice(0, WORKBENCH_LANDING_SNAPSHOT_LIMIT)) {
    const row = projectWork(work);
    if (row === null) return { rows: [], media: {} };
    const source = coverSourceFor(coverUrls, row.workId, mediaContext);
    if (source === null) return { rows: [], media: {} };
    rows.push(row);
    media[row.workId] = source;
  }
  return { rows, media };
}

export async function readWorkbenchLandingSnapshot({
  locationRef = globalThis.location,
  storage = globalThis.localStorage,
  storageKey = DEFAULT_WORKBENCH_STATE_STORAGE_KEY,
  cryptoRef = globalThis.crypto,
  isCurrent = () => true
} = {}) {
  const routeContext = landingRouteContext(locationRef);
  if (routeContext === null || !isCurrent()) return null;
  const stateResult = readStorage(storage, storageKey);
  if (!stateResult.ok || !validStoredStateSource(stateResult.value)) {
    removeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
    return null;
  }
  const snapshotResult = readStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
  if (!snapshotResult.ok || typeof snapshotResult.value !== 'string'
    || bytesOf(snapshotResult.value) > MAX_SNAPSHOT_BYTES) return null;
  let snapshot;
  try { snapshot = JSON.parse(snapshotResult.value); } catch { snapshot = null; }
  if (!validSnapshot(snapshot, routeContext)) {
    removeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
    return null;
  }
  const stateDigest = await sha256Hex(stateResult.value, cryptoRef);
  if (stateDigest === null || stateDigest !== snapshot.stateDigest) {
    removeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
    return null;
  }
  const latestState = readStorage(storage, storageKey);
  const latestRouteContext = landingRouteContext(locationRef);
  if (!isCurrent() || !latestState.ok || latestState.value !== stateResult.value
    || latestRouteContext?.hash !== routeContext.hash
    || latestRouteContext?.mode !== routeContext.mode || latestRouteContext?.origin !== routeContext.origin) return null;
  const coverUrls = new Map(Object.entries(snapshot.media));
  return Object.freeze({
    source: 'saved-snapshot',
    route: snapshot.route,
    works: snapshot.works,
    coverUrls,
    filterState: snapshot.filterState,
    mediaMode: snapshot.mediaMode
  });
}

export async function captureWorkbenchLandingSnapshot({
  works,
  coverUrls,
  filterState,
  pageNumber = 1,
  locationRef = globalThis.location,
  storage = globalThis.localStorage,
  storageKey = DEFAULT_WORKBENCH_STATE_STORAGE_KEY,
  stateRaw,
  cryptoRef = globalThis.crypto,
  now = () => new Date().toISOString(),
  isCurrent = () => true
} = {}) {
  const routeContext = landingRouteContext(locationRef);
  if (routeContext === null || !isCurrent()) return { saved: false, reason: 'route' };
  if (pageNumber !== 1) return { saved: false, reason: 'page' };
  const raw = stateRaw === undefined ? readStorage(storage, storageKey).value : stateRaw;
  if (!validStoredStateSource(raw)) return { saved: false, reason: 'state' };
  const filter = projectFilterState(filterState);
  if (filter === null) return { saved: false, reason: 'filter' };
  const projected = snapshotWorkRows(works, { coverUrls, mediaContext: routeContext });
  if (!projected || !Array.isArray(projected.rows) || projected.rows.length === 0) {
    removeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
    return { saved: false, reason: 'empty' };
  }
  const stateDigest = await sha256Hex(raw, cryptoRef);
  const latestState = readStorage(storage, storageKey);
  const latestRouteContext = landingRouteContext(locationRef);
  if (stateDigest === null) return { saved: false, reason: 'crypto' };
  if (!isCurrent() || !latestState.ok || latestState.value !== raw
    || latestRouteContext?.hash !== routeContext.hash
    || latestRouteContext?.mode !== routeContext.mode || latestRouteContext?.origin !== routeContext.origin) {
    return { saved: false, reason: 'stale' };
  }
  const snapshot = {
    schema: WORKBENCH_LANDING_SNAPSHOT_SCHEMA,
    route: routeContext.hash,
    dataRevision: DATA_REVISION,
    workbenchManifestSha256: WORKBENCH_DEMAND.sha256,
    mediaMode: routeContext.mode,
    mediaOrigin: routeContext.origin,
    stateDigest,
    capturedAt: now(),
    filterState: filter,
    media: projected.media,
    works: projected.rows
  };
  const payload = JSON.stringify(snapshot);
  if (!isCurrent() || bytesOf(payload) > MAX_SNAPSHOT_BYTES || !writeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY, payload)) {
    return { saved: false, reason: 'storage' };
  }
  return { saved: true, count: projected.rows.length };
}

export function clearWorkbenchLandingSnapshot(storage = globalThis.localStorage) {
  removeStorage(storage, WORKBENCH_LANDING_SNAPSHOT_KEY);
}
