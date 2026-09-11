import { searchCompanyDirectory, worksForCompany } from './company-directory.js';
import { createWorkspaceSession } from './workspace-session.js';
import { syncHeadingCount, syncLocalFeedback } from './ui-page-heading.js';

function comparableCompanyId(value) {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

function matchesCompanyId(company, requestedId) {
  const requested = comparableCompanyId(requestedId);
  if (!requested) return false;
  const ids = [company?.companyId, ...(Array.isArray(company?.companyIdAliases) ? company.companyIdAliases : [])];
  return ids.some(id => comparableCompanyId(id) === requested);
}

// Owns the detail request lifetime and one resolved company-work projection.
// Source services and ranking selection are injected, never duplicated here.
export function createCompanyWorkspaceController({
  directory, elements, renderView, isActive, loadWorkIds = null, loadWorks,
  onSelectionResolved, onError, imageUrlForCompany, imageUrlForWork,
  syncSearchClears, logger = console
}) {
  const session = createWorkspaceSession();
  let loadedWorks = null, latestOptions = null;
  async function render(options) {
    latestOptions = options;
    const generation = session.begin('company-detail');
    const { query, sort, hasImage, selectedCompanyId: requestedId,
      detailSortKey, detailSortDirection, selectedCompanyIds, selectionMode } = options;
    if (elements.search.value !== query) elements.search.value = query;
    syncSearchClears();
    const [sortKey, direction] = sort.split('-');
    const companies = searchCompanyDirectory(directory, query, {
      sortKey, direction, hasAvatar: hasImage ? true : null
    });
    syncHeadingCount(elements.total, directory.companies.length, '家会社');
    syncLocalFeedback(elements.count, new Intl.NumberFormat('zh-CN').format(companies.length));
    elements.count.parentElement.hidden = companies.length === directory.companies.length;
    const selected = companies.find(company => matchesCompanyId(company, requestedId))
      ?? directory.companies.find(company => matchesCompanyId(company, requestedId)) ?? null;
    const selectedCompanyId = selected?.companyId ?? null;
    onSelectionResolved(selectedCompanyId);
    const renderDetail = (selectedWorks, detailState = 'ready') => renderView({
      sortValue: sort, companies, selectedCompanyId, selectedWorks, detailState,
      onRetryDetail: () => render(latestOptions),
      detailWorkSortKey: detailSortKey, detailWorkSortDirection: detailSortDirection,
      selectedCompanyIds, selectionMode, imageUrlForCompany, imageUrlForWork
    });
    let selectedWorks = [];
    if (selected && loadWorkIds) {
      const key = JSON.stringify([selected.companyId, detailSortKey, detailSortDirection]);
      try {
        if (loadedWorks?.key === key) selectedWorks = loadedWorks.works;
        else {
          renderDetail([], 'loading');
          const ids = await loadWorkIds(selected.companyId, { sortKey: detailSortKey, direction: detailSortDirection });
          if (!generation.isCurrent() || !isActive()) return;
          const rows = await loadWorks(ids);
          if (!generation.isCurrent() || !isActive()) return;
          selectedWorks = ids.map(id => rows.get(id));
          loadedWorks = { key, works: selectedWorks };
        }
      } catch (error) {
        if (!generation.isCurrent() || !isActive()) return;
        generation.fail(error);
        renderDetail([], 'error');
        onError('会社作品加载失败，可在详情中重试。', 'error');
        logger.warn('company works request failed', error);
        return;
      }
    } else if (selected) {
      selectedWorks = worksForCompany(directory, selected.companyId, {
        sortKey: detailSortKey, direction: detailSortDirection
      });
    }
    renderDetail(selectedWorks);
    generation.complete({ empty: companies.length === 0 });
  }
  return Object.freeze({ render, suspend: () => session.suspend() });
}
