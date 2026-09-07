import { parseUiLocationHash, formatUiLocationHash } from './ui-location-state.js';
import { configuredAssetBase } from './runtime-config.js';
import { resolveAssetUrl } from './asset-url.js';
import { createViewLifetime } from './view-lifetime.js';

export function isIndependentDirectoryRoute(hash) {
  const route = parseUiLocationHash(hash);
  return route?.page === 'companies' || (route?.page === 'persons' && !route.personId);
}

export function createDirectoryWorkspaces({ navigate, activateFull }) {
  const lifetime = createViewLifetime();
  const assetBase = configuredAssetBase();
  let generation = 0, disposed = false;
  let personView, companyView, personData, companyData;
  let personLocation, companyLocation;
  let personSearch, companySearch, companyImageUrl, worksForCompany;
  let detailSort = { sortKey: 'releaseDate', direction: 'asc' };
  const get = id => document.getElementById(id);
  const replace = route => history.replaceState(null, '', formatUiLocationHash(route));
  const changeCompany = patch => { if (!companyLocation || disposed) return; Object.assign(companyLocation, patch); paintCompanies(); replace(companyLocation); };

  function paintPersons() {
    if (!personView || !personData || disposed) return;
    get('person-directory-search').value = personLocation.query;
    get('person-search-clear').hidden = !personLocation.query;
    get('person-directory-total').textContent = `${personData.records.length.toLocaleString('zh-CN')} 位人物`;
    get('person-view').setAttribute('aria-busy', 'false');
    const legacyLoading = get('person-directory-loading');
    if (legacyLoading) legacyLoading.hidden = true;
    personView.render({ persons: personSearch(personData.records, personLocation.query), totalPersonCount: personData.records.length, activityAxis: personData.activityAxis });
  }
  function paintCompanies() {
    if (!companyView || !companyData || disposed) return;
    const route = companyLocation, [sortKey, direction] = route.sort.split('-');
    const companies = companySearch(companyData, route.query, { sortKey, direction, hasAvatar: route.hasImage ? true : null });
    get('company-directory-search').value = route.query;
    get('company-search-clear').hidden = !route.query;
    get('company-has-image').checked = route.hasImage;
    get('company-directory-total').textContent = `${companyData.companies.length.toLocaleString('zh-CN')} 家会社`;
    get('company-directory-count').textContent = companies.length.toLocaleString('zh-CN');
    get('company-directory-count').parentElement.hidden = companies.length === companyData.companies.length;
    companyView.render({
      companies, selectedCompanyId: route.companyId, sortValue: route.sort,
      selectedWorks: route.companyId ? worksForCompany(companyData, route.companyId, detailSort) : [],
      detailWorkSortKey: detailSort.sortKey, detailWorkSortDirection: detailSort.direction,
      selectedCompanyIds: new Set(), selectionMode: false,
      imageUrlForCompany: company => companyImageUrl(company, assetBase),
      imageUrlForWork: work => resolveAssetUrl(work.projectedThumbnailPath ?? work.coverPath, assetBase)
    });
  }
  lifetime.listen(get('person-search-clear'), 'click', () => {
    if (!personLocation) return;
    personLocation.query = ''; paintPersons(); replace(personLocation); get('person-directory-search').focus();
  });
  lifetime.listen(get('company-search-clear'), 'click', () => changeCompany({ query: '', pageNumber: 1 }));
  lifetime.listen(get('company-has-image'), 'change', () => changeCompany({ hasImage: get('company-has-image').checked, pageNumber: 1 }));
  lifetime.listen(get('company-selection-mode-toggle'), 'click', () => {
    if (disposed) return;
    // Preserve this exact route while the shared editing runtime takes over.
    const expected = location.hash;
    void activateFull().then(() => {
      if (location.hash === expected) get('company-selection-mode-toggle').click();
    }).catch(() => {});
  });

  return {
    async show(hash) {
      const route = parseUiLocationHash(hash), request = ++generation;
      if (route?.page === 'persons') {
        personLocation = route;
        const [{ getPersonWorkspaceRuntime }, { createPersonDirectoryView }, { filterPersonsBySearch, withCjkPersonSearchKey }] = await Promise.all([
          import('./person-workspace-data.js'), import('../views/person-directory-view.js'), import('./person-search.js')
        ]);
        const directory = await getPersonWorkspaceRuntime().loadDirectory();
        if (disposed || request !== generation) return;
        personData ??= { ...directory, records: directory.records.map(withCjkPersonSearchKey) };
        personSearch = filterPersonsBySearch;
        personView ??= createPersonDirectoryView({
          root: get('person-view'),
          onSearch(query) { personLocation.query = query; personLocation.pageNumber = 1; paintPersons(); replace(personLocation); },
          onRoleChange(role) { personLocation.role = role; personLocation.pageNumber = 1; replace(personLocation); },
          onPageChange(pageNumber) { personLocation.pageNumber = pageNumber; replace(personLocation); },
          onSelect(personId) { navigate(`#persons/person/${personId}`); return false; }
        });
        personView.setRoleFilter(route.role);
        paintPersons();
        personView.setPageNumber(route.pageNumber);
      } else if (route?.page === 'companies') {
        companyLocation = route;
        const [{ loadCompanyWorkspace }, view, model] = await Promise.all([
          import('./company-workspace-data.js'), import('../views/company-directory-view.js'), import('./company-directory.js')
        ]);
        const directory = await loadCompanyWorkspace();
        if (disposed || request !== generation) return;
        companyData = directory;
        companySearch = model.searchCompanyDirectory; worksForCompany = model.worksForCompany; companyImageUrl = view.companyImageUrl;
        companyView ??= view.createCompanyDirectoryView({
          root: get('company-view'), selectionMode: false,
          onSearch: query => changeCompany({ query, pageNumber: 1 }),
          onSort: sort => changeCompany({ sort, pageNumber: 1 }),
          onSelectCompany(companyId, { revealDetail = false } = {}) {
            companyLocation.companyId = companyId; paintCompanies();
            history.pushState(null, '', formatUiLocationHash(companyLocation));
            if (revealDetail && matchMedia('(max-width: 899px)').matches) get('company-detail').scrollIntoView({ block: 'start' });
          },
          onCloseDetail() { companyLocation.companyId = null; paintCompanies(); history.pushState(null, '', formatUiLocationHash(companyLocation)); },
          onToggleCompany() {},
          onOpenWork: work => navigate(`#work/${work.workId}`),
          onDetailWorkSort(patch) { Object.assign(detailSort, patch); paintCompanies(); },
          onPageChange(pageNumber) { companyLocation.pageNumber = pageNumber; replace(companyLocation); }
        });
        paintCompanies(); companyView.setPageNumber(route.pageNumber);
      }
    },
    suspend() { generation += 1; },
    dispose() {
      disposed = true; generation += 1; lifetime.dispose();
      personView?.dispose(); companyView?.dispose();
    }
  };
}
