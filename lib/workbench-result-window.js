import { selectionPages } from './selection-pages.js';
import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { PRESENTATION_FAMILIES_SIDECAR_SHA256 } from './runtime-config.js';

// Retain the full ordered result only in the Worker. Folding must precede
// pagination: a matching non-default edition can surface its default edition.
export function createWorkbenchResultWindow(data) {
  const workById = new Map(data.ratedDisplayWorks.map(work => [work.workId, work]));
  const source = data.presentationFamiliesSource;
  if (source && source.sha256 !== PRESENTATION_FAMILIES_SIDECAR_SHA256) {
    throw new TypeError('presentation families sidecar hash does not match the runtime pin');
  }
  const families = source ? preparePresentationFamiliesSidecar(source.value, {
    catalogSnapshotId: data.sampleSource.snapshot?.snapshotId,
    catalogSha256: data.catalogSource.sha256,
    workIds: data.populationContract.presentation.workIds,
    bangumiSubjectByWorkId: data.bangumiPublicBindings === null ? null
      : new Map(data.bangumiPublicBindings.bindings.map(b => [b.egsWorkId, b.bangumiSubjectId]))
  }) : null;
  let resultIds = null, revision = 0;
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
      const projected = families ? families.projectVisibleWorks(matching, {
        workById, sortKey: payload.filterState.sortKey,
        sortDirection: payload.filterState.sortDirection, presorted: true, decorate: false
      }) : matching;
      const ids = projected.map(work => work.workId);
      const changed = resultIds !== null && (ids.length !== resultIds.length || ids.some((id, i) => id !== resultIds[i]));
      if (resultIds === null || changed) revision++;
      resultIds = ids;
      const pages = selectionPages(ids.length);
      const pageNumber = changed ? 1 : Math.min(requestedPage, pages.length);
      const page = pages[pageNumber - 1];
      const selected = new Set(payload.selectedWorkIds ?? []);
      const selectedCount = ids.reduce((count, id) => count + Number(selected.has(id)), 0);
      return { ...result, workerDurationMs: (result.workerDurationMs ?? 0) + performance.now() - started,
        workIds: ids.slice(page.start, page.end), page: {
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
    }
  });
}
