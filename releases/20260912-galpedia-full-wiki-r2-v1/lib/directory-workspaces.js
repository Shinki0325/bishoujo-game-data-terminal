import { parseUiLocationHash, formatUiLocationHash } from './ui-location-state.js';
import { configuredAssetBase } from './runtime-config.js';
import { resolveAssetUrl } from './asset-url.js';
import { createViewLifetime } from './view-lifetime.js';
import { createWorkspaceSession } from './workspace-session.js';

export function isIndependentDirectoryRoute(hash) {
  const route = parseUiLocationHash(hash);
  return route?.page === 'companies' || (route?.page === 'persons' && !route.personId);
}

export function createDirectoryWorkspaces({ navigate, activateFull }) {
  const lifetime = createViewLifetime();
  const session = createWorkspaceSession();
  const assetBase = configuredAssetBase();
  let activeTicket;
  let personView, companyView, personData, companyData;
  let personLocation, companyLocation;
  let personSearch, companySearch, companyImageUrl, worksForCompany;
  let detailSort = { sortKey: 'releaseDate', direction: 'asc' };
  const get = id => document.getElementById(id);
  const replace = route => history.replaceState(null, '', formatUiLocationHash(route));
  const changeCompany = patch => { if (!companyLocation || !session.isActive('companies')) return; Object.assign(companyLocation, patch); paintCompanies(); replace(companyLocation); };

  function paintPersons() {
    if (!personView || !personData || !session.isActive('persons')) return;
    get('person-directory-search').value = personLocation.query;
    get('person-search-clear').hidden = !personLocation.query;
    get('person-directory-total').textContent = `${personData.records.length.toLocaleString('zh-CN')} 位人物`;
    get('person-view').setAttribute('aria-busy', 'false');
    const legacyLoading = get('person-directory-loading');
    if (legacyLoading) legacyLoading.hidden = true;
    personView.render({ persons: personSearch(personData.records, personLocation.query), totalPersonCount: personData.records.length, activityAxis: personData.activityAxis });
    activeTicket.complete({ empty: get('person-directory-count').textContent === '0' });
  }
  function paintCompanies() {
    if (!companyView || !companyData || !session.isActive('companies')) return;
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
    activeTicket.complete({ empty: companies.length === 0 });
  }
  lifetime.listen(get('person-search-clear'), 'click', () => {
    if (!personLocation || !session.isActive('persons')) return;
    personLocation.query = ''; paintPersons(); replace(personLocation); get('person-directory-search').focus();
  });
  lifetime.listen(get('company-search-clear'), 'click', () => changeCompany({ query: '', pageNumber: 1 }));
  lifetime.listen(get('company-has-image'), 'change', () => changeCompany({ hasImage: get('company-has-image').checked, pageNumber: 1 }));
  lifetime.listen(get('company-selection-mode-toggle'), 'click', () => {
    if (!session.isActive('companies')) return;
    // Preserve this exact route while the shared editing runtime takes over.
    const expected = location.hash;
    void activateFull().then(() => {
      if (location.hash === expected) get('company-selection-mode-toggle').click();
    }).catch(() => {});
  });

  return {
    async show(hash) {
      if (session.disposed) return;
      if (!isIndependentDirectoryRoute(hash)) { session.suspend(); return; }
      const route = parseUiLocationHash(hash);
      const ticket = session.begin(route.page);
      activeTicket = ticket;
      try {
        if (route?.page === 'persons') {
          personLocation = route;
          const [{ getPersonWorkspaceRuntime }, { createPersonDirectoryView }, { filterPersonsBySearch, withCjkPersonSearchKey }] = await Promise.all([
            import('./person-workspace-data.js'), import('../views/person-directory-view.js'), import('./person-search.js')
          ]);
          if (!ticket.isCurrent()) return;
          const directory = await getPersonWorkspaceRuntime().loadDirectory();
          if (!ticket.isCurrent()) return;
          personData ??= { ...directory, records: directory.records.map(withCjkPersonSearchKey) };
          personSearch = filterPersonsBySearch;
          const mounted = createPersonDirectoryView({
            root: get('person-view'),
            onSearch: ticket.guard(query => { personLocation.query = query; personLocation.pageNumber = 1; paintPersons(); replace(personLocation); }),
            onRoleChange: ticket.guard(role => { personLocation.role = role; personLocation.pageNumber = 1; ticket.complete({ empty: get('person-directory-count').textContent === '0' }); replace(personLocation); }),
            onPageChange: ticket.guard(pageNumber => { personLocation.pageNumber = pageNumber; replace(personLocation); }),
            onSelect(personId) { if (ticket.isCurrent()) navigate(`#persons/person/${personId}`); return false; }
          });
          personView = mounted;
          ticket.scope.add(() => { if (personView === mounted) personView = null; mounted.dispose(); });
          personView.setRoleFilter(route.role);
          paintPersons();
          personView.setPageNumber(route.pageNumber);
        } else if (route?.page === 'companies') {
          companyLocation = route;
          const [{ loadCompanyWorkspace }, view, model] = await Promise.all([
            import('./company-workspace-data.js'), import('../views/company-directory-view.js'), import('./company-directory.js')
          ]);
          if (!ticket.isCurrent()) return;
          const directory = await loadCompanyWorkspace();
          if (!ticket.isCurrent()) return;
          companyData = directory;
          companySearch = model.searchCompanyDirectory; worksForCompany = model.worksForCompany; companyImageUrl = view.companyImageUrl;
          const mounted = view.createCompanyDirectoryView({
            root: get('company-view'), selectionMode: false,
            onSearch: ticket.guard(query => changeCompany({ query, pageNumber: 1 })),
            onSort: ticket.guard(sort => changeCompany({ sort, pageNumber: 1 })),
            onSelectCompany: ticket.guard((companyId, { revealDetail = false } = {}) => {
              companyLocation.companyId = companyId; paintCompanies();
              history.pushState(null, '', formatUiLocationHash(companyLocation));
              if (revealDetail && matchMedia('(max-width: 899px)').matches) get('company-detail').scrollIntoView({ block: 'start' });
            }),
            onCloseDetail: ticket.guard(() => { companyLocation.companyId = null; paintCompanies(); history.pushState(null, '', formatUiLocationHash(companyLocation)); }),
            onToggleCompany() {},
            onOpenWork: ticket.guard(work => navigate(`#work/${work.workId}`)),
            onDetailWorkSort: ticket.guard(patch => { Object.assign(detailSort, patch); paintCompanies(); }),
            onPageChange: ticket.guard(pageNumber => { companyLocation.pageNumber = pageNumber; replace(companyLocation); })
          });
          companyView = mounted;
          ticket.scope.add(() => { if (companyView === mounted) companyView = null; mounted.dispose(); });
          if (route.companyId && !companyData.companies.find(c => c.companyId === route.companyId)?.avatar) route.hasImage = false;
          paintCompanies();
          if (!route.companyId) companyView.setPageNumber(route.pageNumber);
        }
      } catch (error) {
        // Shared loads may still resolve/reject after the observing page has left.
        if (ticket.fail(error)) throw error;
      }
    },
    inspect: session.inspect,
    suspend: session.suspend,
    dispose() {
      try { session.dispose(); } finally { lifetime.dispose(); }
    }
  };
}
