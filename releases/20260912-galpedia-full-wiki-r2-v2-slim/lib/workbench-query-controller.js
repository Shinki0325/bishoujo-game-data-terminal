import { createWorkspaceSession } from './workspace-session.js';

// Owns the current result revision and pinned hydrated page, not application
// filters/selection or the shared Worker/data caches. Leaving a workspace only
// invalidates its observer; completed shared fetches remain reusable.
export function createWorkbenchQueryController({
  workData, workerOwned, ensureFilterWorker, ensureRankingView,
  query, resultIds, metrics
}) {
  const session = createWorkspaceSession();
  let ticket = null, page = null, hydratedWorks = new Map();
  const stale = (interaction, reason) => {
    metrics.cancel(interaction, reason);
    return { status: 'stale' };
  };
  async function run({ state, directoryOpen, comparisonIds, pageNumber,
    includeFilterCounts, visibleBrands }, interaction) {
    const generation = session.begin('workbench-render');
    ticket = generation;
    page = null;
    let outcome;
    try {
      // Pin the current board before hydration. This method is closure-bound
      // in the store, so the fullWiki media wrapper cannot cache projected
      // rows in the source retained-200 set.
      workData?.retainWorkIds?.(state.selectedWorkIds);
      if (workData && !workerOwned) {
        const hydrated = await workData.get([...new Set([...state.selectedWorkIds, ...comparisonIds])]);
        if (!generation.isCurrent()) return stale(interaction, 'superseded-hydration');
        hydratedWorks = hydrated;
      }
      const needsFiltering = state.workspaceMode !== 'ranking' && !directoryOpen;
      if (state.workspaceMode === 'ranking' && !directoryOpen) await ensureRankingView();
      if (needsFiltering) await ensureFilterWorker();
      if (!generation.isCurrent()) return stale(interaction, 'superseded-search-load');
      metrics.stage(interaction, 'query-ready');
      outcome = needsFiltering ? await query({
        ...(workerOwned ? { paged: true, pageNumber } : {}),
        filterState: state.filterState, selectedWorkIds: state.selectedWorkIds,
        includeProjectedCounts: includeFilterCounts, visibleBrands, companyLimit: 24
      }) : { status: 'success', workIds: [], counts: null };
      // A superseded query must not request another page of display data.
      if (!generation.isCurrent()) return stale(interaction, 'superseded-render');
      if (outcome.status === 'stale') return stale(interaction, 'stale-query');
      metrics.stage(interaction, 'query-return');
      if (workerOwned) {
        const pinnedIds=[...new Set([...state.selectedWorkIds, ...comparisonIds])];
        if (typeof workData.getList!=='function') {
          const hydrated = await workData.get([...new Set([...pinnedIds, ...outcome.workIds])]);
          if (!generation.isCurrent()) return stale(interaction, 'superseded-hydration');
          hydratedWorks = hydrated;
        } else {
          const [pinned,display]=await Promise.all([
            workData.get(pinnedIds),
            outcome.workIds.length===0 ? Promise.resolve(new Map()) : workData.getList(outcome.workIds,{listPage:outcome.listPage,isCurrent:() => generation.isCurrent()})
          ]);
          if (!generation.isCurrent()) return stale(interaction, 'superseded-hydration');
          // Pinned selected/comparison rows keep their edition projection even
          // when they also occur on the visible result page.
          hydratedWorks = new Map([...display, ...pinned]);
        }
      }
    } catch (error) {
      if (!generation.isCurrent()) return stale(interaction, 'superseded-error');
      generation.fail(error);
      metrics.cancel(interaction, 'worker-error');
      return { status: 'error', error, generation };
    }
    page = outcome.page ?? null;
    metrics.stage(interaction, 'worker-return');
    return { status: 'ready', outcome, generation };
  }
  async function currentResultIds() {
    const generation = ticket, revision = page?.resultRevision;
    if (!generation?.isCurrent()) return null;
    try {
      const ids = await resultIds(revision);
      return generation.isCurrent() && page?.resultRevision === revision ? ids : null;
    } catch (error) {
      // A late failure from an abandoned result is not a current-page error.
      if (!generation.isCurrent() || page?.resultRevision !== revision) return null;
      throw error;
    }
  }
  return Object.freeze({
    run, currentResultIds,
    lookup: id => hydratedWorks.get(id) ?? workData?.peek(id),
    suspend: () => session.suspend(),
    dispose() { session.dispose(); workData?.retainWorkIds?.([]); hydratedWorks = new Map(); page = null; ticket = null; }
  });
}
