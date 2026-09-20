import { syncHeadingCount, syncLocalFeedback } from '../lib/ui-page-heading.js';

export function createWorkbenchResultsView({ elements, getFilterView }) {
  let renderedFilterKey = null;
  function renderCounts({ model, companyState, catalogTotal, resultTotal }) {
    const ranked = companyState?.rankedCount ?? model.rankedCount;
    const candidates = companyState?.candidateCompanyIds.length ?? model.unrankedCount;
    elements.selectedCount.textContent = String(companyState?.selectedCompanyIds.length ?? model.selectedCount);
    elements.rankedCount.textContent = String(ranked);
    elements.unrankedCount.textContent = String(candidates);
    syncLocalFeedback(elements.rankingHeadingCount, `已排 ${new Intl.NumberFormat('zh-CN').format(ranked)} · 候选 ${new Intl.NumberFormat('zh-CN').format(candidates)}`);
    syncHeadingCount(elements.catalogTotalCount, catalogTotal, '部作品');
    elements.filterResultCount.textContent = `${resultTotal} / ${catalogTotal} 项`;
    syncLocalFeedback(elements.catalogResultCount, `${resultTotal} / ${catalogTotal} 项`);
    elements.catalogResultCount.parentElement.hidden = resultTotal === catalogTotal;
  }
  function renderFilters({ model, visibleBrands, includeFilterCounts, counts, resultTotal, selectionActive }) {
    const key = JSON.stringify([
      model.state.filterState,
      model.state.filterState.selectedOnly ? model.state.selectedWorkIds : null,
      visibleBrands.map(brand => brand.brandId)
    ]);
    if (includeFilterCounts && counts && key !== renderedFilterKey) {
      getFilterView().render(model.state.filterState, {
        current: resultTotal,
        filters: counts.filters,
        brands: counts.brands,
        yearCounts: counts.yearCounts,
        yearRangeGroups: counts.yearRangeGroups,
        yearUniverseCount: counts.yearUniverseCount
      });
      renderedFilterKey = key;
    } else if (selectionActive) {
      getFilterView().renderSummary(
        model.state.filterState,
        resultTotal,
        includeFilterCounts && counts ? counts : null
      );
    }
  }
  return Object.freeze({ renderCounts, renderFilters, reset() { renderedFilterKey = null; } });
}
