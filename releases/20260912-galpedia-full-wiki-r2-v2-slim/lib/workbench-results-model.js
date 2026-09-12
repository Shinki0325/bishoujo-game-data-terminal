// Data-only projection. Families collapse only for the legacy unpaged path;
// paged Worker results are already projected and must not collapse a second time.
export function projectWorkbenchResults({ model, outcome, families, worksById,
  catalogSize, decorate, selectionLimit, selectionMode, compareMode, comparedWorkIds }) {
  const works = outcome.page || families === null
    ? model.visibleWorks.map(work => worksById.get(work.workId) ?? work)
    : families.projectVisibleWorks(model.visibleWorks, {
      sortKey: model.state.filterState.sortKey,
      sortDirection: model.state.filterState.sortDirection,
      workById: worksById, presorted: true, decorate
    });
  const catalogTotal = families === null ? catalogSize : catalogSize - families.memberCount + families.familyCount;
  return {
    works, catalogTotal, resultTotal: outcome.page?.total ?? works.length,
    selection: {
      works, ...(outcome.page ? { page: outcome.page } : {}), view: 'full',
      selectedWorkIds: model.state.selectedWorkIds,
      selectAllState: outcome.page ? outcome.page.selectAllState : families === null
        ? model.selectAllState : families.presentationSelectionState(works, model.state.selectedWorkIds),
      selectionCapacity: Math.max(0, selectionLimit - model.selectedCount),
      filterState: model.state.filterState,
      selectionMode: selectionMode && !compareMode, compareMode, comparedWorkIds
    }
  };
}
