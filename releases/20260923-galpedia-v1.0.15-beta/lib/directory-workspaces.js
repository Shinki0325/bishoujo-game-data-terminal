import { setListState } from './list-state.js';
import { parseUiLocationHash, formatUiLocationHash } from './ui-location-state.js';
import { configuredAssetBase } from './runtime-config.js';
import { resolveAssetUrl, installExternalCoverImageRecovery } from './asset-url.js';
import { createViewLifetime } from './view-lifetime.js';
import { createWorkspaceSession } from './workspace-session.js';
import {createAnalysisSiteBridge} from './analysis-site-bridge.js';
import {getStaticCompanyClient} from './company-static-client.js';

export function isIndependentDirectoryRoute(hash, { staticPersons = false } = {}) {
  const route = parseUiLocationHash(hash);
  return route?.page === 'companies' || (route?.page === 'persons' && (staticPersons || !route.personId));
}

export function createDirectoryWorkspaces({ navigate, activateFull, staticPersons = false }) {
  const lifetime = createViewLifetime();
  lifetime.add(installExternalCoverImageRecovery(document));
  const session = createWorkspaceSession();
  const assetBase = configuredAssetBase();
  let activeTicket;
  let personView, companyView, personData, companyData;
  let companyWorksData, companyWorksLoader, companyWorksPending;
  let companyDetailState = 'idle';
  let personLocation, companyLocation;
  let personStaticClient, personRenderSequence = 0, personDetailClientPromise;
  let personDetailParents = [];
  const loadStaticPerson = async id => {
    personDetailClientPromise ??= import('./person-static-detail-client.js')
      .then(module => module.createStaticPersonDetailClient()).catch(error => { personDetailClientPromise = null; throw error; });
    return (await personDetailClientPromise).loadPerson(id);
  };
  let personSearch, companySearch, companyImageUrl, worksForCompany;
  let detailSort = { sortKey: 'releaseDate', direction: 'asc' };

  const roleBox=document.createElement('div');roleBox.className='company-detail-sort-controls';roleBox.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
  roleBox.innerHTML='<label>参与职能 <select id="company-reviewed-role"><option value="all">全部关联</option><option value="development">制作</option><option value="publishing">发行</option><option value="both">制作与发行</option><option value="brand">品牌记录</option><option value="other">其他参与</option></select></label><label>记录范围 <select id="company-reviewed-scope"><option value="work">作品各版本</option><option value="edition">当前版本</option></select></label><p id="company-reviewed-note" class="muted" style="flex-basis:100%;margin:0;font-size:12px" hidden></p>';
  document.querySelector('.company-detail-works-heading').before(roleBox);
  for(const label of roleBox.querySelectorAll('label'))label.style.cssText='display:grid;gap:4px;flex:1 1 140px';
  for(const select of roleBox.querySelectorAll('select'))select.style.cssText='min-width:0;width:100%';
  lifetime.add(()=>roleBox.remove());
  for(const control of roleBox.querySelectorAll('select'))lifetime.listen(control,'change',()=>{
    detailSort.role=document.getElementById('company-reviewed-role').value;detailSort.scope=document.getElementById('company-reviewed-scope').value;
    const note=document.getElementById('company-reviewed-note');note.hidden=detailSort.role==='all';note.textContent=detailSort.scope==='work'?'按作品各版本的参与记录筛选，具体版本可能不同。':'仅显示能对应当前版本的参与记录。';paintCompanies();
  });

  const get = id => document.getElementById(id);
  const replace = route => history.replaceState(null, '', formatUiLocationHash(route));
  const changeCompany = patch => { if (!companyLocation || !session.isActive('companies')) return; Object.assign(companyLocation, patch); paintCompanies(); replace(companyLocation); };

  async function paintStaticPersons() {
    if (!personView || !personStaticClient || !session.isActive('persons')) return;
    const ticket = activeTicket, sequence = ++personRenderSequence;
    const loading = get('person-directory-loading');
    get('person-view').setAttribute('aria-busy', 'true');
    get('person-directory-search').value = personLocation.query;
    get('person-search-clear').hidden = !personLocation.query;
    setListState({status:loading,state:'loading',layout:'panel',message:'正在加载人物列表',detail:'人物资料加载完成后，会自动更新列表。',slowLabel:'人物资料仍在加载，请再等一会儿。'});
    get('person-page-previous').disabled = true; get('person-page-next').disabled = true;
    try {
      const page = await personStaticClient.getPage({ ...personLocation });
      if (!ticket.isCurrent() || sequence !== personRenderSequence) return;
      personLocation.pageNumber = page.remotePage.pageNumber;
      get('person-directory-total').textContent = page.totalPersonCount.toLocaleString('zh-CN') + ' 位人物';
      personView.render(page); replace(personLocation);
      if (personLocation.personId) personView.openPerson(personLocation.personId);
      setListState({status:loading,state:'ready'}); get('person-view').setAttribute('aria-busy', 'false');
      ticket.complete({ empty: page.persons.length === 0 });
    } catch (error) {
      if (!ticket.isCurrent() || sequence !== personRenderSequence) return;
      get('person-view').setAttribute('aria-busy', 'false');
      setListState({status:loading,state:'error',layout:'panel',message:'人物列表没能加载出来',detail:'资料暂时没有加载成功，可以再试一次。',retry:ticket.guard(() => { void paintStaticPersons(); })});
      ticket.fail(error);
    }
  }
  function paintPersons() {
    if (staticPersons) return paintStaticPersons();
    if (!personView || !personData || !session.isActive('persons')) return;
    get('person-directory-search').value = personLocation.query;
    get('person-search-clear').hidden = !personLocation.query;
    get('person-directory-total').textContent = `${personData.records.length.toLocaleString('zh-CN')} 位人物`;
    get('person-view').setAttribute('aria-busy', 'false');
    const legacyLoading = get('person-directory-loading');
    if (legacyLoading) setListState({status:legacyLoading,state:'ready'});
    personView.render({ persons: personSearch(personData.records, personLocation.query), totalPersonCount: personData.records.length, activityAxis: personData.activityAxis });
    activeTicket.complete({ empty: get('person-directory-count').textContent === '0' });
  }
  function paintCompanies() {
    if (!companyView || !companyData || !session.isActive('companies')) return;
    const route = companyLocation; route.companyId=companyData.companyIdByAlias?.get(route.companyId)??route.companyId; const [sortKey,direction]=route.sort.split('-');
    const companies = companySearch(companyData, route.query, { sortKey, direction, hasAvatar: route.hasImage ? true : null });
    if (!companyWorksData && companyDetailState === 'idle' && companies.some(company => company.companyId === route.companyId)) {
      const ticket = activeTicket;
      companyDetailState = 'loading';
      // The shared resource may finish after navigation; only the current view
      // observes its result. A failed detail leaves the directory usable.
      companyWorksPending ??= companyWorksLoader().then(data => {
        companyWorksData = data;
        return data;
      }).catch(error => { companyWorksPending = null; throw error; });
      companyWorksPending.then(ticket.guard(() => {
        companyDetailState = 'ready'; paintCompanies();
      }), ticket.guard(() => {
        companyDetailState = 'error'; paintCompanies();
      }));
    }
    get('company-directory-search').value = route.query;
    get('company-search-clear').hidden = !route.query;
    get('company-has-image').checked = route.hasImage;
    get('company-directory-total').textContent = `${companyData.companies.length.toLocaleString('zh-CN')} 家会社`;
    get('company-directory-count').textContent = companies.length.toLocaleString('zh-CN');
    get('company-directory-count').parentElement.hidden = companies.length === companyData.companies.length;
    companyView.render({
      companies, selectedCompanyId: route.companyId, sortValue: route.sort,
      selectedWorks: route.companyId && companyWorksData ? worksForCompany(companyWorksData, route.companyId, detailSort) : [],
      detailState: companyWorksData ? 'ready' : companyDetailState === 'error' ? 'error' : 'loading',
      onRetryDetail: activeTicket.guard(() => { companyDetailState = 'idle'; paintCompanies(); }),
      detailWorkSortKey: detailSort.sortKey, detailWorkSortDirection: detailSort.direction,
      selectedCompanyIds: new Set(), selectionMode: false,
      imageUrlForCompany: company => companyImageUrl(company, assetBase),
      imageUrlForWork: work => resolveAssetUrl(work.projectedThumbnailPath ?? work.coverPath, assetBase)
    });
    activeTicket.complete({ empty: companies.length === 0 });
  }
  lifetime.listen(get('person-search-clear'), 'click', () => {
    if (!personLocation || !session.isActive('persons')) return;
    personLocation.query = ''; personLocation.pageNumber = 1; paintPersons(); replace(personLocation); get('person-directory-search').focus();
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

  const analysis=createAnalysisSiteBridge({
    resultIds:()=>null,refresh:()=>{},
    snapshot:()=>({url:'/'+location.hash,scroll:scrollY,directoryRoute:{...(session.isActive('persons')?personLocation:companyLocation)},detailSort:{...detailSort}}),
    restore(back,route){
      if(back.directoryRoute?.page===route.page)Object.assign(route,back.directoryRoute);
      else if(route.page==='companies')Object.assign(route,{query:back.companyQuery??route.query,sort:back.companySort??route.sort,hasImage:back.companyHasImage??route.hasImage,pageNumber:back.companyPage??route.pageNumber});
      else if(route.page==='persons')Object.assign(route,{query:back.personQuery??route.query,role:back.personRole??route.role,pageNumber:back.personPage??route.pageNumber});
      detailSort={...detailSort,...(back.detailSort??{sortKey:back.companyDetailSortKey??detailSort.sortKey,direction:back.companyDetailSortDirection??detailSort.direction,role:back.companyRole??'all',scope:back.companyScope??'work'})};
      get('company-reviewed-role').value=detailSort.role??'all';get('company-reviewed-scope').value=detailSort.scope??'work';
    },
    async entity(kind){
      if(kind==='company'){
        const role=get('company-reviewed-role').value,scope=get('company-reviewed-scope').value;
        const label=get('company-detail-title').textContent.trim()+(role==='all'?'':' · '+get('company-reviewed-role').selectedOptions[0].textContent),sort={...detailSort,role,scope};
        const client=getStaticCompanyClient(),id=await client.resolveCompanyId(companyLocation?.companyId);
        if(!id)throw Error('请先打开一家会社。');
        return {kind,id:id+':'+role+':'+scope,entityId:id,label,workIds:await client.workIds(id,sort)};
      }
      const id=personLocation?.personId;if(!id)throw Error('请先打开一位人物。');
      const role=personLocation.role,label=get('person-detail-title').textContent.trim(),person=await loadStaticPerson(id),roleOf=c=>c.creditType==='character-voiced-by'?'voice-actor':c.roleCode;
      const matches=c=>role==='all'||roleOf(c)===role||role==='music'&&['songs','vocal','vocalist','lyrics','composition','arrangement'].includes(roleOf(c));
      return {kind,id:id+':'+role,entityId:id,label:label+(role==='all'?'':' · '+({'scenario':'剧本','artwork':'原画','music':'音乐','voice-actor':'声优'}[role]??role)),workIds:[...new Set(person.credits.filter(matches).map(c=>String(c.workId)))]};
    }
  });
  lifetime.add(()=>analysis.dispose());
  return {
    async show(hash) {
      if (session.disposed) return;
      if (!isIndependentDirectoryRoute(hash, { staticPersons })) { session.suspend(); return; }
      const route = parseUiLocationHash(hash);analysis.restore(route);
      const ticket = session.begin(route.page);
      activeTicket = ticket;
      if (route.page === 'persons') ticket.scope.add(() => {
        setListState({status:get('person-directory-loading'),state:'ready'});
        get('person-view').setAttribute('aria-busy', 'false');
      });
      try {
        if (route?.page === 'persons') {
          personLocation = route;
          personDetailParents = [];
          const [{ getPersonWorkspaceRuntime, createStaticPersonClient }, { createPersonDirectoryView }, { filterPersonsBySearch, withCjkPersonSearchKey }] = await Promise.all([
            staticPersons ? import('./person-static-client.js') : import('./person-workspace-data.js'), import('../views/person-directory-view.js'), import('./person-search.js')
          ]);
          if (!ticket.isCurrent()) return;
          if (staticPersons) personStaticClient ??= createStaticPersonClient();
          else {
            const directory = await getPersonWorkspaceRuntime().loadDirectory();
            if (!ticket.isCurrent()) return;
            personData ??= { ...directory, records: directory.records.map(withCjkPersonSearchKey) };
          }
          personSearch = filterPersonsBySearch;
          const mounted = createPersonDirectoryView({
            root: get('person-view'),
            onSearch: ticket.guard(query => { personLocation.query = query; personLocation.pageNumber = 1; paintPersons(); replace(personLocation); }),
            onRoleChange: ticket.guard(role => { personLocation.role = role; personLocation.pageNumber = 1; if (staticPersons) { void paintPersons(); replace(personLocation); return; } ticket.complete({ empty: get('person-directory-count').textContent === '0' }); replace(personLocation); }),
            onPageChange: ticket.guard(pageNumber => { personLocation.pageNumber = pageNumber; if (staticPersons) void paintPersons(); replace(personLocation); }),
            onLoadPerson: staticPersons ? loadStaticPerson : undefined,
            imageUrlForWork: work => resolveAssetUrl(work.workThumbnailPath ?? work.projectedThumbnailPath ?? work.coverPath, assetBase),
            onOpenWork: ticket.guard(workId => navigate('#work/' + workId)),
            onOpenCompany: ticket.guard(companyId => navigate('#companies/company/' + companyId)),
            onOpenPerson: ticket.guard(personId => {
              if (staticPersons) {
                if (personLocation.personId && personLocation.personId !== personId) personDetailParents.push(personLocation.personId);
                personLocation.personId = personId; history.pushState(null, '', formatUiLocationHash(personLocation));
                personView.openPerson(personId);
              } else navigate('#persons/person/' + personId);
            }),
            onSelect(personId) {
              if (!ticket.isCurrent()) return false;
              if (staticPersons) {
                if (!personId && personDetailParents.length) {
                  const parent = personDetailParents.pop(); personLocation.personId = parent;
                  history.replaceState(null, '', formatUiLocationHash(personLocation));
                  setTimeout(ticket.guard(() => { personView.openPerson(parent); }), 0); return true;
                }
                if (personId) personDetailParents = [];
                personLocation.personId = personId || null;
                history.pushState(null, '', formatUiLocationHash(personLocation)); return true;
              }
              if (personId) navigate('#persons/person/' + personId); return false;
            }
          });
          personView = mounted;
          ticket.scope.add(() => { if (personView === mounted) personView = null; mounted.dispose(); get('person-detail-dialog')?.close(); });
          personView.setRoleFilter(route.role);
          await paintPersons();
          if (!staticPersons) personView.setPageNumber(route.pageNumber);
        } else if (route?.page === 'companies') {
          companyLocation = route;
          const [{ loadCompanyDirectory, loadCompanyWorkspace }, view, model] = await Promise.all([
            import('./company-workspace-data.js'), import('../views/company-directory-view.js'), import('./company-directory.js')
          ]);
          if (!ticket.isCurrent()) return;
          const directory = await loadCompanyDirectory();
          if (!ticket.isCurrent()) return;
          companyData = directory;
          companyWorksLoader = loadCompanyWorkspace;
          companyDetailState = 'idle';
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
        analysis.restoreScroll();
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
