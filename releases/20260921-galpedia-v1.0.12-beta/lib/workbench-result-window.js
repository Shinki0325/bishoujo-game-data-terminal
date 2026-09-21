import { releaseDateInfo } from './work-release-date.js';
import { selectionPages } from './selection-pages.js';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { PRESENTATION_FAMILIES_SIDECAR_SHA256 } from './runtime-config.js';

const MAX_PROJECTION_CACHE_ENTRIES = 8;

// Retain the full ordered result only in the Worker. Folding must precede
// pagination, retaining an edition that actually matches the query.
export function createWorkbenchResultWindow(data) {
  const workById = new Map(data.ratedDisplayWorks.map(work => [work.workId, work]));
  const source = data.presentationFamiliesSource;
  if (source && source.sha256 !== (data.fullWiki?.familySha256 ?? PRESENTATION_FAMILIES_SIDECAR_SHA256)) {
    throw new TypeError('presentation families sidecar hash does not match the runtime pin');
  }
  const families = source ? preparePresentationFamiliesSidecar(source.value, {
    catalogSnapshotId: data.sampleSource.snapshot?.snapshotId,
    catalogSha256: data.catalogSource.sha256,
    workIds: data.populationContract.presentation.workIds,
    bangumiSubjectByWorkId: data.fullWiki || data.bangumiPublicBindings === null ? null
      : new Map(data.bangumiPublicBindings.bindings.map(b => [b.egsWorkId, b.bangumiSubjectId]))
  }) : null;
  const bangumiWorkIds = new Set((data.bangumiPublicBindings?.bindings ?? [])
    .filter(binding => String(binding.bangumiSubjectId ?? '').trim())
    .map(binding => binding.egsWorkId));
  const bangumiFamilyIds = new Set((families?.families ?? [])
    .filter(family => family.catalogMemberWorkIds.some(id => bangumiWorkIds.has(id)))
    .map(family => family.presentationWorkId));
  function prioritizeBangumi(works) {
    const ranked = works.map((work, position) => {
      const family = families?.familyForWork(work.workId);
      const hasBinding = Boolean(bangumiWorkIds.has(work.workId)
        || (family && bangumiFamilyIds.has(family.presentationWorkId)));
      const date = releaseDateInfo(work.releaseDate);
      // An actual scheduled day leads, regardless of its binding. A TBD
      // sentinel or year-only value must not become a fake scheduled day.
      const scheduled = date.kind === 'unreleased' && date.precision === 'date';
      return {work, position, hasBinding, day: scheduled ? date.ordinal : Infinity};
    });
    ranked.sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      return Number(b.hasBinding) - Number(a.hasBinding) || a.position - b.position;
    });
    return ranked.map(row => row.work);
  }
  let resultIds = null;
  let revision = 0;
  const projectionBuckets = new Map();
  const projectionLru = new Map();

  function resetProjectionCache() {
    projectionBuckets.clear();
    projectionLru.clear();
  }

  function projectionKey(sortKey, sortDirection, bangumiFirst) {
    return `${String(sortKey)}\u001f${String(sortDirection)}\u001f${Number(bangumiFirst)}`;
  }

  function readProjected(source, sortKey, sortDirection, bangumiFirst) {
    if (!Object.isFrozen(source)) return null;
    const bucket = projectionBuckets.get(source);
    const entry = bucket?.get(projectionKey(sortKey, sortDirection, bangumiFirst));
    if (!entry) return null;
    projectionLru.delete(entry);
    projectionLru.set(entry, entry);
    return entry.projected;
  }

  function writeProjected(source, sortKey, sortDirection, bangumiFirst, projected) {
    if (!Object.isFrozen(source)) return;
    const key = projectionKey(sortKey, sortDirection, bangumiFirst);
    let bucket = projectionBuckets.get(source);
    if (!bucket) {
      bucket = new Map();
      projectionBuckets.set(source, bucket);
    }
    const prior = bucket.get(key);
    if (prior) projectionLru.delete(prior);
    const entry = { source, key, projected };
    bucket.set(key, entry);
    projectionLru.set(entry, entry);
    while (projectionLru.size > MAX_PROJECTION_CACHE_ENTRIES) {
      const oldest = projectionLru.keys().next().value;
      projectionLru.delete(oldest);
      const oldBucket = projectionBuckets.get(oldest.source);
      if (oldBucket?.get(oldest.key) === oldest) oldBucket.delete(oldest.key);
      if (oldBucket?.size === 0) projectionBuckets.delete(oldest.source);
    }
  }

  return Object.freeze({
    project(result, payload) {
      const started = performance.now();
      const requestedPage = payload.pageNumber ?? 1;
      if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new TypeError('invalid result page');
      const matching = result.workIds.map(id => {
        const work = workById.get(id);
        if (!work) throw new TypeError('unknown query result ID');
        return work;
      });
      const bangumiFirst = ['unreleased', 'tbd'].includes(payload.filterState.releaseStatus);
      const cachedProjection = families
        ? readProjected(result.workIds, payload.filterState.sortKey, payload.filterState.sortDirection, bangumiFirst)
        : null;
      let projected = families
        ? (cachedProjection ?? families.projectVisibleWorks(matching, {
          workById, sortKey: payload.filterState.sortKey,
          sortDirection: payload.filterState.sortDirection, presorted: true, decorate: false
        }))
        : matching;
      if (cachedProjection === null && bangumiFirst) projected = prioritizeBangumi(projected);
      if (families && cachedProjection === null) {
        writeProjected(result.workIds, payload.filterState.sortKey, payload.filterState.sortDirection, bangumiFirst, projected);
      }
      const ids = projected.map(work => work.workId);
      if(payload.countsOnly)return {id:result.id,type:'counts',total:ids.length,counts:result.counts};
      const changed = resultIds !== null && (ids.length !== resultIds.length || ids.some((id, i) => id !== resultIds[i]));
      if (resultIds === null || changed) revision++;
      resultIds = ids;
      const pages = selectionPages(ids.length);
      const pageNumber = changed ? 1 : Math.min(requestedPage, pages.length);
      const page = pages[pageNumber - 1];
      const selected = new Set(payload.selectedWorkIds ?? []);
      const selectedCount = ids.reduce((count, id) => count + Number(selected.has(id)), 0);
      return { ...result, workerDurationMs: (result.workerDurationMs ?? 0) + performance.now() - started,
        workIds: ids.slice(page.start, page.end), nextWorkIds: ids.slice(page.end,page.end+48), page: {
        ...page, pageNumber, pageCount: pages.length, total: ids.length,
        resultRevision: revision,
        selectAllState: selectedCount === 0 ? 'none' : selectedCount === ids.length ? 'all' : 'some',
        unselectedCount: ids.length - selectedCount
      } };
    },
    ids(expectedRevision) {
      if (resultIds === null || expectedRevision !== revision) {
        throw new TypeError('result selection is stale; refresh the current results');
      }
      return [...resultIds];
    },
    invalidate() {
      resultIds = null;
      revision++;
      resetProjectionCache();
    }
  });
}
