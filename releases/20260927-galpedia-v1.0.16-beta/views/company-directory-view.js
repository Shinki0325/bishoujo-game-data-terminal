import {createDirectoryBrowse} from '../lib/company-ui/__player_v50/directory-browse.js';
import { groupCompanyWorks } from '../lib/company-ui/__company_v33/families.js';
import {companyRoleCounts,companyCredits,roleLabels,companyRoleLabels} from '../lib/company-ui/__company_v30/presentation.js';
import { createCompanyCard } from '../lib/company-ui/__company_v20/loader.js';
import { resolveAssetUrl } from '../lib/asset-url.js';
import { formatReleaseDate, releaseDateInfo, RELEASE_STATUS } from '../lib/work-release-date.js';
import { createViewLifetime } from '../lib/view-lifetime.js';
import { applyAdaptiveImageSource } from '../lib/adaptive-image-source.js';
import { setListState } from '../lib/list-state.js';
import { syncSortDirectionControl, toggleSortDirection } from '../lib/ui-sort-control.js';

const COMPANY_PAGE_SIZE = 36;
const profileSections = new Map();
const COMPANY_SORT_KEYS = new Set([
  'totalVoteCount', 'workCount', 'averageVoteCount', 'releaseYearStart', 'brandName'
]);
const COMPANY_SORT_DEFAULT_DIRECTIONS = Object.freeze({
  totalVoteCount: 'desc',
  workCount: 'desc',
  averageVoteCount: 'desc',
  releaseYearStart: 'asc',
  brandName: 'asc'
});

function requireElement(root, id) {
  const element = root.querySelector?.(`#${id}`);
  if (!element) throw new Error(`Company directory root is missing #${id}`);
  return element;
}

function text(documentRef, tag, className, value) {
  const element = documentRef.createElement(tag);
  element.className = className;
  element.textContent = String(value ?? '');
  return element;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return '暂无';
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
}

function companyReleaseSpan(company, works = []) {
  const infos = (Array.isArray(works) ? works : []).map(work => releaseDateInfo(work.releaseDate));
  const releasedYears = infos.filter(info => info.kind === RELEASE_STATUS.RELEASED).map(info => info.year);
  const hasTbd = infos.some(info => info.kind === RELEASE_STATUS.TBD);
  const hasUnreleased = infos.some(info => info.kind === RELEASE_STATUS.UNRELEASED);
  if (releasedYears.length > 0) {
    const span = `${Math.min(...releasedYears)}-${Math.max(...releasedYears)}`;
    const suffix = [hasTbd ? '含发售未定作品' : '', hasUnreleased ? '含未发售作品' : ''].filter(Boolean).join('、');
    return suffix ? `${span} · ${suffix}` : span;
  }
  const start = Number(company.releaseYearStart);
  const end = Number(company.releaseYearEnd);
  if (start === 2050 && end === 2050) return '发售未定';
  if (Number.isFinite(start) && end === 2050) return `${start} · 含发售未定作品`;
  if (Number.isFinite(start) && Number.isFinite(end)) return `${start}-${end}`;
  return '日期未知';
}

function parseCompanySortValue(value) {
  const raw = String(value ?? '');
  const match = /^(.*)-(asc|desc)$/u.exec(raw);
  const key = match?.[1] ?? raw;
  if (!COMPANY_SORT_KEYS.has(key)) {
    return { key: 'totalVoteCount', direction: 'desc' };
  }
  return {
    key,
    direction: match?.[2] === 'asc' || match?.[2] === 'desc'
      ? match[2]
      : COMPANY_SORT_DEFAULT_DIRECTIONS[key]
  };
}

function companySortValue({ key, direction }) {
  return `${key}-${direction}`;
}

export function createCompanyDirectoryView({
  root,
  onSearch,
  onSort,
  onSelectCompany,
  onToggleCompany,
  onOpenWork,
  familyForWork = () => null,
  onDetailWorkSort,
  onCloseDetail = () => {},
  onPageChange = () => {},
  selectionMode = true
}) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must provide querySelector');
  if (typeof onSearch !== 'function' || typeof onSort !== 'function' || typeof onSelectCompany !== 'function' || typeof onToggleCompany !== 'function' || typeof onOpenWork !== 'function' || typeof onDetailWorkSort !== 'function' || typeof onCloseDetail !== 'function' || typeof onPageChange !== 'function') {
    throw new TypeError('company directory callbacks must be functions');
  }
  const documentRef = root.ownerDocument;
  if(!documentRef.getElementById('company-roles-v30-style')){const link=documentRef.createElement('link');link.id='company-roles-v30-style';link.rel='stylesheet';link.href=new URL('../lib/company-ui/__company_v30/roles.css',import.meta.url).href;documentRef.head.append(link);}
  let roleSequence=0;
  if(!documentRef.getElementById('company-scope-style')){const css=documentRef.createElement('link');css.id='company-scope-style';css.rel='stylesheet';css.href=new URL('../lib/company-ui/__company_v35/scope.css',import.meta.url).href;documentRef.head.append(css);}
  const expandedFamilies = new Set();
  if(!documentRef.getElementById('player-profile-css')){const css=documentRef.createElement('link');css.id='player-profile-css';css.rel='stylesheet';css.href=new URL('../lib/company-ui/__player_v43/player.css',import.meta.url).href;documentRef.head.append(css);}
  if (!documentRef.querySelector('link[data-company-families]')) {
    const css=documentRef.createElement('link');css.rel='stylesheet';
    css.href=new URL('../lib/company-ui/__company_v33/families.css',import.meta.url).href;css.dataset.companyFamilies='true';documentRef.head.append(css);
  }
  const lifetime = createViewLifetime();
  root.classList.add('cp-root');
  if(!documentRef.getElementById('company-profile-style')){const link=documentRef.createElement('link');link.id='company-profile-style';link.rel='stylesheet';link.href=new URL('../lib/company-ui/__company_v20/profile.css',import.meta.url).href;documentRef.head.append(link);}

  const search = requireElement(root, 'company-directory-search');
  const sort = requireElement(root, 'company-sort');
  // The direction control was added after the first directory view tests;
  // keep it optional so those minimal fixtures remain valid.
  const sortDirection = root.querySelector?.('#company-sort-direction');
  const sortDirectionIcon = root.querySelector?.('#company-sort-direction-icon');
  const list = requireElement(root, 'company-list');
  const layout = root.querySelector?.('.company-directory-layout');
  const detail = requireElement(root, 'company-detail');
  const detailHome = detail.parentElement;
  const dialog=documentRef.createElement('dialog');dialog.id='company-detail-dialog';dialog.className='cp-dialog';dialog.setAttribute('aria-labelledby','company-detail-title');const portal=documentRef.createElement('div');portal.className='cp-root cp-detail-portal';documentRef.body.append(portal);portal.append(dialog);dialog.append(detail);

  const detailTitle = requireElement(detail, 'company-detail-title');
  const detailAvatar = requireElement(detail, 'company-detail-avatar');
  const detailMeta = requireElement(detail, 'company-detail-meta');
  const roleSummary=text(documentRef,'div','cp-role-summary',''),roleNote=text(documentRef,'p','cp-role-note','');detailMeta.after(roleSummary,roleNote);
  const companyCardHost = root.ownerDocument.createElement('section');
  companyCardHost.className = 'company-card-v20';
  detail.querySelector('.company-detail-heading').after(companyCardHost);
  const companyCard = createCompanyCard(companyCardHost);
  lifetime.listen(companyCardHost,'click',event=>{const link=event.target.closest('a[href]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const match=link.getAttribute('href').match(/^\/?#(?:works\/work|work)\/([^/?]+)/);if(match){event.preventDefault();event.stopPropagation();documentRef.dispatchEvent(new CustomEvent('galpedia-open-work',{detail:decodeURIComponent(match[1])}));}});
  const detailClose = detail.querySelector?.('#company-detail-close');
  const detailWorks = requireElement(detail, 'company-detail-works');
  const worksPanel=documentRef.createElement('section');worksPanel.id='cp-panel-works';worksPanel.setAttribute('role','tabpanel');worksPanel.setAttribute('aria-labelledby','cp-tab-works');worksPanel.tabIndex=0;
  detail.append(worksPanel);worksPanel.append(detail.querySelector('.company-detail-works-heading'),detailWorks);
  const roleControls=detail.querySelector('.cp-scope-bar');

  const nav=documentRef.createElement('nav');nav.className='cp-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','会社档案栏目');
  for(const [key,label] of [['honors','高分代表作'],['radar','概览'],['works','全部作品']]){const button=documentRef.createElement('button');button.type='button';button.id='cp-tab-'+key;button.dataset.section=key;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','cp-panel-'+key);nav.append(button);}
  companyCardHost.before(nav);
  const scrollBody=documentRef.createElement('div');scrollBody.className='cp-detail-scroll';detail.append(scrollBody);scrollBody.append(companyCardHost,worksPanel);

  detail.classList.add('cp-compact');
  const heading=detail.querySelector('.company-detail-heading');
  const identity=text(documentRef,'aside','cp-identity','');identity.setAttribute('aria-label','会社资料');
  const facts=text(documentRef,'div','cp-identity-facts','');if(roleControls)facts.append(roleControls);facts.append(detailMeta);identity.append(detailAvatar,facts);const scopeCaption=roleControls?.querySelector('.cp-scope-caption');if(scopeCaption)identity.append(scopeCaption);
  const main=text(documentRef,'div','cp-compact-main',''),body=text(documentRef,'div','cp-compact-body','');main.append(nav,scrollBody);body.append(identity,main);detail.append(body);
  const sectionByCompany=profileSections;let activeCompany=null,directoryScroll=0,returnFocus=null,currentSection='honors';
  let browseMode='overview',catalogLayout='year',catalogQuery='',catalogFilter=null,catalogLimit=36,catalogKey='',profileSnapshot=null;
  const catalogTools=text(documentRef,'div','pp pp-catalog-tools','');
  catalogTools.innerHTML='<label>查找作品<input type="search" data-catalog-search placeholder="作品或版本名称" aria-label="查找作品或版本"></label><div class="pp-view-toggle" role="group" aria-label="全部作品显示方式"><button type="button" data-catalog-layout="list">列表</button><button type="button" data-catalog-layout="year">年表</button></div><p class="pp-catalog-status" role="status"></p><button type="button" class="pp-text-button" data-catalog-clear hidden></button>';
  worksPanel.prepend(catalogTools);
  const catalogSearch=catalogTools.querySelector('input'),catalogStatus=catalogTools.querySelector('[role=status]'),catalogClear=catalogTools.querySelector('[data-catalog-clear]');
  function syncBrowse(){
    const inWorks=currentSection==='radar';nav.querySelector('[data-section="radar"]').disabled=latestModel?.companyRole==='other';
    worksPanel.hidden=!inWorks||browseMode==='overview';companyCard.setSection(inWorks&&browseMode==='all'?'works':currentSection);
  }
  function selectSection(section){
    if(section==='works'){section='radar';browseMode='all';}
    if(section!==currentSection)scrollBody.scrollTop=0;currentSection=section;
    if(activeCompany)sectionByCompany.set(String(activeCompany),section);
    for(const button of nav.children){const active=button.dataset.section===(section==='radar'&&browseMode==='all'?'works':section);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
    syncBrowse();
  }
  function openCatalog(filter=null){catalogFilter=filter?.ids?{ids:new Set(filter.ids),label:filter.label}:null;catalogQuery='';catalogSearch.value='';catalogLimit=36;browseMode='all';selectSection('radar');if(latestModel)render(latestModel);scrollBody.scrollTop=0;catalogSearch.focus({preventScroll:true});}
  lifetime.listen(companyCardHost,'pp-show-catalog',e=>openCatalog(e.detail));
  lifetime.listen(companyCardHost,'pp-profile-ready',e=>{if(e.detail.companyId!==String(activeCompany)||e.detail.role!==latestModel?.companyRole)return;profileSnapshot=e.detail;if(latestModel)render(latestModel);});
  lifetime.listen(catalogSearch,'input',()=>{catalogQuery=catalogSearch.value.trim().toLocaleLowerCase();catalogLimit=36;if(latestModel)render(latestModel);});
  lifetime.listen(catalogTools,'click',e=>{const b=e.target.closest('[data-catalog-layout]');if(!b)return;catalogLayout=b.dataset.catalogLayout;catalogLimit=36;if(latestModel)render(latestModel);});
  lifetime.listen(catalogClear,'click',()=>{catalogFilter=null;catalogLimit=36;if(latestModel)render(latestModel);catalogSearch.focus();});
  lifetime.listen(nav,'click',event=>{const button=event.target.closest('[data-section]');if(button&&!button.disabled){if(button.dataset.section==='radar')browseMode='overview';selectSection(button.dataset.section);scrollBody.scrollTop=0;}});
  lifetime.listen(nav,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...nav.children].filter(b=>!b.disabled),at=buttons.indexOf(documentRef.activeElement);const i=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[i].click();buttons[i].focus();});
  function closeProfile(){if(dialog.open)dialog.close();documentRef.documentElement.classList.remove('company-details-open');onCloseDetail();const win=documentRef.defaultView;if(win?.location.hash.includes('#companies/company/null'))win.history.replaceState(win.history.state,'',win.location.hash.replace('#companies/company/null','#companies'));}
  lifetime.listen(dialog,'cancel',event=>{if(event.target!==dialog)return;event.preventDefault();closeProfile();});
  const detailStatus = text(documentRef, 'div', 'list-state', '');
  detailStatus.setAttribute('role', 'status');
  lifetime.add(() => setListState({status:detailStatus,state:'ready'}));
  const detailSort = requireElement(detail, 'company-detail-sort');
  const detailSortDirection = requireElement(detail, 'company-detail-sort-direction');
  const detailSortDirectionIcon = requireElement(detail, 'company-detail-sort-direction-icon');
  const sortControls=detailSort.closest('.company-detail-sort-controls');catalogTools.insertBefore(sortControls,catalogStatus);
  const empty = requireElement(root, 'company-empty');
  const listState = requireElement(root, 'company-list-state');
  const pagination = requireElement(root, 'company-directory-pagination');
  const pagePrevious = requireElement(root, 'company-page-previous');
  const pageInput = requireElement(root, 'company-page-input');
  const pageTotal = requireElement(root, 'company-page-total');
  const pageNext = requireElement(root, 'company-page-next');
  const pageError = requireElement(root, 'company-page-error');
  let latestModel = null;
  let renderedCompanyKey = '';
  let renderedPageKey = '';
  let pageIndex = 0;
  let renderedSelectedCompanyId = null;
  let pendingDirectoryRole=null;

  const browse=createDirectoryBrowse(root,{refresh:()=>{if(latestModel)render(latestModel);}});

  lifetime.listen(search, 'input', () => onSearch(search.value));
  lifetime.listen(sort, 'change', () => {
    const parsed = parseCompanySortValue(sort.value);
    onSort(companySortValue({ key: parsed.key, direction: COMPANY_SORT_DEFAULT_DIRECTIONS[parsed.key] }));
  });
  lifetime.listen(sortDirection, 'click', () => {
    const parsed = parseCompanySortValue(latestModel?.sortValue ?? sort.value);
    onSort(companySortValue({ key: parsed.key, direction: toggleSortDirection(parsed.direction) }));
  });
  lifetime.listen(detailSort, 'change', () => onDetailWorkSort({ sortKey: detailSort.value }));
  lifetime.listen(detailSortDirection, 'click', () => {
    onDetailWorkSort({ direction: detailSortDirection.getAttribute('aria-pressed') === 'true' ? 'desc' : 'asc' });
  });
  lifetime.listen(detailClose, 'click', closeProfile);

  function pageCount(companies) {
    return Math.max(1, Math.ceil(companies.length / COMPANY_PAGE_SIZE));
  }

  function clearPageError() {
    pageError.hidden = true;
    pageInput.removeAttribute('aria-invalid');
  }

  function showPageError() {
    pageError.hidden = false;
    pageInput.setAttribute('aria-invalid', 'true');
  }

  function imageFor(parent, company, className, imageUrlForCompany) {
    const imageUrl = typeof imageUrlForCompany === 'function' ? imageUrlForCompany(company) : null;
    if (!imageUrl) {
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, Array.from(company.brandName||'社').slice(0,2).join('')));
      return;
    }
    const image = documentRef.createElement('img');
    image.className = className;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = imageUrl;
    image.addEventListener('error', () => {
      image.remove();
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, Array.from(company.brandName||'社').slice(0,2).join('')));
    }, { once: true });
    parent.append(image);
  }

  function render({
    companies = [],
    selectedCompanyId = null,
    selectedCompanyIds = new Set(),
    selectedWorks = [],
    detailState = 'ready',
    onRetryDetail = null,
    sortValue = 'totalVoteCount-desc',
    detailWorkSortKey = 'releaseDate',
    detailWorkSortDirection = 'asc',
    selectionMode: currentSelectionMode = selectionMode,
    imageUrlForCompany = null,
    imageUrlForWork = null,
    companyScope = 'work', companyRole = 'all', companyContract = null, selectedCompanyRecord = null
  } = {}) {
    const roleToken=++roleSequence;

    const parsedSort = parseCompanySortValue(sortValue);
    const normalizedSortValue = companySortValue(parsedSort);
    const directoryCompanies=browse.filter(companies);browse.sync(directoryCompanies.length);
    const companyKey = browse.role+'|'+normalizedSortValue+'|'+directoryCompanies.map(company => company.companyId).join('\u001f');
    if (companyKey !== renderedCompanyKey) {
      renderedCompanyKey = companyKey;
      renderedPageKey = '';
      pageIndex = 0;
      clearPageError();
    }
    const previousSelected=renderedSelectedCompanyId;
    const selectedCompanyChanged = selectedCompanyId !== renderedSelectedCompanyId;
    if(selectedCompanyChanged&&selectedCompanyId&&!previousSelected){directoryScroll=documentRef.defaultView?.scrollY||0;returnFocus=documentRef.activeElement;}

    renderedSelectedCompanyId = selectedCompanyId;
    latestModel = {
      companies,
      selectedCompanyId,
      selectedCompanyIds,
      selectedWorks,
      detailState,
      onRetryDetail,
      sortValue: normalizedSortValue,
      detailWorkSortKey,
      detailWorkSortDirection,
      selectionMode: currentSelectionMode,
      imageUrlForCompany,
      imageUrlForWork, companyScope, companyRole, companyContract, selectedCompanyRecord
    };
    const totalPages = pageCount(directoryCompanies);
    const selectedIndex = directoryCompanies.findIndex(company => company.companyId === selectedCompanyId);
    if (selectedCompanyChanged && selectedIndex >= 0 && (selectedIndex < pageIndex * COMPANY_PAGE_SIZE || selectedIndex >= (pageIndex + 1) * COMPANY_PAGE_SIZE)) {
      pageIndex = Math.floor(selectedIndex / COMPANY_PAGE_SIZE);
    }
    pageIndex = Math.min(pageIndex, totalPages - 1);
    const visibleCompanies = directoryCompanies.slice(pageIndex * COMPANY_PAGE_SIZE, (pageIndex + 1) * COMPANY_PAGE_SIZE);
    const pageKey = `${companyKey}\u001f${pageIndex}\u001f${currentSelectionMode}`;
    if (pageKey !== renderedPageKey) {
      renderedPageKey = pageKey;
      if (detail.parentElement !== dialog) dialog.append(detail);
      list.replaceChildren();
      for (const company of visibleCompanies) {
      const card = documentRef.createElement('article');
      card.className = 'company-directory-card';
      card.classList.toggle('is-selected', company.companyId === selectedCompanyId);
      card.dataset.companyId = company.companyId;
      const open = documentRef.createElement('button');
      open.type = 'button';
      open.className = 'company-directory-card-open';
      open.setAttribute('aria-label', `打开会社 ${company.brandName}`);
      const logo=text(documentRef,'span','cd-logo','');imageFor(logo, company, 'company-avatar', imageUrlForCompany);open.append(logo);
      const overlay=text(documentRef,'span','company-directory-card-overlay','');
      overlay.append(text(documentRef,'strong','company-directory-card-name',company.brandName));
      const meta=text(documentRef,'span','cd-card-meta','');meta.append(text(documentRef,'span','cp-card-role',companyRoleLabels(company.companyId).join(' · ')),text(documentRef,'span','company-directory-card-work-count',`收录 ${company.workCount} 部`));overlay.append(meta);
      const metric=parsedSort.key==='totalVoteCount'?`EGS ${formatCount(company.totalVoteCount)} 次作品评分`:parsedSort.key==='averageVoteCount'?`EGS 版本平均 ${formatCount(company.averageVoteCount)} 次评分`:parsedSort.key==='releaseYearStart'?`最早收录发售 ${company.releaseYearStart===2050?'未定':company.releaseYearStart||'未知'}`:'';
      if(metric)overlay.append(text(documentRef,'span','company-directory-card-vote-count',metric));
      open.append(overlay);

      if (currentSelectionMode) {
        open.setAttribute('aria-label', `选择会社 ${company.brandName} 进行排榜`);
        open.setAttribute('aria-pressed', String(selectedCompanyIds.has(company.companyId)));
        open.addEventListener('click', () => onToggleCompany(company.companyId, !selectedCompanyIds.has(company.companyId)));
      } else {
        open.addEventListener('click', () => {pendingDirectoryRole=['development','publishing'].includes(browse.role)?{id:String(company.companyId),role:browse.role}:null;onSelectCompany(company.companyId, { revealDetail: true });});
      }
      if (currentSelectionMode) {
        const select = documentRef.createElement('input');
        select.type = 'checkbox';
        select.className = 'company-directory-card-select';
        select.checked = selectedCompanyIds.has(company.companyId);
        select.setAttribute('aria-label', `选择会社 ${company.brandName} 进行排榜`);
        select.addEventListener('change', () => onToggleCompany(company.companyId, select.checked));
        card.append(open, select);
      } else {
        card.append(open);
        if (selectedCompanyIds.has(company.companyId)) {
          const marker = documentRef.createElement('span');
          marker.className = 'company-directory-card-selected-mark';
          marker.textContent = '已选';
          marker.setAttribute('aria-label', '已选');
          card.append(marker);
        }
      }
      list.append(card);
    }
    }
    empty.hidden = true;
    setListState({
      status: listState,
      state: directoryCompanies.length === 0 ? 'empty' : 'ready',
      message: '没有匹配的会社。'
    });
    pagination.hidden = totalPages <= 1;
    pagePrevious.disabled = pageIndex === 0;
    pageNext.disabled = pageIndex >= totalPages - 1;
    pageInput.value = String(pageIndex + 1);
    pageTotal.textContent = String(totalPages);
    const sortOptionValues = Array.from(sort.options ?? [], option => option.value);
    sort.value = sortOptionValues.includes(parsedSort.key) ? parsedSort.key : normalizedSortValue;
    if (sortDirection) {
      syncSortDirectionControl({
        button: sortDirection,
        icon: sortDirectionIcon,
        direction: parsedSort.direction,
        labelPrefix: '会社排序',
        documentRef
      });
    }
    for (const card of list.querySelectorAll('.company-directory-card')) {
      const companyId = card.dataset.companyId;
      card.classList.toggle('is-selected', companyId === selectedCompanyId);
      const select = card.querySelector('.company-directory-card-select');
      if (select !== null) select.checked = selectedCompanyIds.has(companyId);
    }
    const selected = companies.find(company => company.companyId === selectedCompanyId) ?? (String(selectedCompanyRecord?.companyId)===String(selectedCompanyId)?selectedCompanyRecord:null);
    const isMobile = false;
    if(detail.parentElement!==dialog)dialog.append(detail);
    detail.hidden = selected === null;
    root.dataset.profileOpen=String(Boolean(selected));activeCompany=selected?.companyId??null;
    if(pendingDirectoryRole?.id===String(activeCompany)){const wanted=pendingDirectoryRole;pendingDirectoryRole=null;queueMicrotask(()=>{const control=detail.querySelector('#company-reviewed-role');if(String(activeCompany)===wanted.id&&control&&control.value!==wanted.role){control.value=wanted.role;control.dispatchEvent(new Event('change',{bubbles:true}));}});}
    if(selected){dialog.dataset.entityId=String(selected.companyId);if(!dialog.open)dialog.showModal();}else if(dialog.open)dialog.close();
    documentRef.documentElement.classList.toggle('company-details-open',Boolean(selected));
    const nextCatalogKey=JSON.stringify([activeCompany,companyRole]);if(nextCatalogKey!==catalogKey){catalogKey=nextCatalogKey;if(companyRole==='other')sectionByCompany.set(String(activeCompany),'radar');browseMode=companyRole==='other'?'all':'overview';catalogQuery='';catalogSearch.value='';catalogFilter=null;catalogLimit=36;profileSnapshot=null;}
    companyCard.show(selected,companyRole);selectSection(sectionByCompany.get(String(activeCompany))||(companyRole==='other'?'works':'honors'));
    if(selectedCompanyChanged){requestAnimationFrame(()=>{if(selected){scrollBody.scrollTop=0;detailClose?.focus({preventScroll:true});}else if(previousSelected){documentRef.defaultView?.scrollTo({top:directoryScroll,behavior:'instant'});if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}});}

    detail.setAttribute('aria-busy', String(selected !== null && detailState === 'loading'));
    if (!selected) { setListState({status:detailStatus,state:'ready'}); return; }
    if (selectedCompanyChanged) setListState({status:detailStatus,state:'ready'});
    detailTitle.textContent = selected.brandName;
    const counts=companyRoleCounts(selected.companyId);
    roleSummary.replaceChildren();for(const label of companyRoleLabels(selected.companyId))roleSummary.append(text(documentRef,'span','',label));
    roleSummary.setAttribute('aria-label','参与角色');
    roleNote.hidden=true;roleSummary.hidden=true;
    const roleName=companyRole==='development'?'制作':companyRole==='publishing'?'发行':'关联';
    nav.querySelector('[data-section="honors"]').textContent='高分代表作';
    nav.querySelector('[data-section="radar"]').textContent='概览';
    const caption=scopeCaption;
    if(caption){caption.textContent=companyRole==='publishing'?'发行参与；以下日期为作品首发，并非本公司的发行日期。':companyRole==='other'?'保留原作、版权等关联，不视为本次制作。':companyContract?.relatedIds.length?'合集及原作关联在目录下方单列。':'';caption.hidden=!caption.textContent;}
    detailAvatar.replaceChildren();
    imageFor(detailAvatar, selected, 'company-detail-avatar-image', imageUrlForCompany);
    const workGroups = groupCompanyWorks(detailState === 'ready' ? selectedWorks : [], familyForWork);
    nav.querySelector('[data-section=works]').textContent=`全部作品${detailState==='ready'?' · '+workGroups.length:''}`;
    detailMeta.replaceChildren(text(documentRef,'span','',detailState==='ready'?`${workGroups.length} 部 · ${selectedWorks.length} 个版本`:`收录 ${selected.workCount} 条记录`),text(documentRef,'span','',`作品首发 ${companyReleaseSpan(selected,selectedWorks)}`));if(companyContract?.relatedIds.length)detailMeta.append(text(documentRef,'span','',`另有 ${companyContract.relatedIds.length} 条关联`));
    for(const option of detailSort.options)option.textContent=({releaseDate:'发售时间',median:'EGS 评分',voteCount:'EGS 评分人数'})[option.value]||option.textContent;
    detailSort.value = detailWorkSortKey;
    syncSortDirectionControl({
      button: detailSortDirection,
      icon: detailSortDirectionIcon,
      direction: detailWorkSortDirection,
      labelPrefix: '作品排序',
      documentRef
    });
    let familyHelp=worksPanel.querySelector('.cp-family-help');
    if(!familyHelp){familyHelp=text(documentRef,'p','cp-family-help','同作品的版本已折叠，展开查看各版本与职责。');detailWorks.before(familyHelp);}
    familyHelp.hidden=true;
    detailWorks.replaceChildren();
    if (detailState !== 'ready') {
      setListState({status:detailStatus, state: detailState, layout:'text',
        message: detailState === 'loading' ? '正在加载会社作品' : '会社作品没能加载出来',
        retry: onRetryDetail});
      detailWorks.append(detailStatus);
    } else setListState({status:detailStatus,state:'ready'});
    if(detailState==='ready'&&!selectedWorks.length){setListState({status:detailStatus,state:'empty',layout:'text',message:'暂无符合条件的作品记录'});detailWorks.append(detailStatus);}
    function workButton(work,version=false,related=false,profileWork=null) {
      const item = documentRef.createElement('button');
      item.type = 'button';
      item.className = 'company-directory-work';
      item.dataset.workId=String(work.workId);
      const cover = documentRef.createElement('span');
      cover.className = 'company-directory-work-cover';
      const imageSource = typeof imageUrlForWork === 'function' ? imageUrlForWork(work) : null;
      const imageUrl = typeof imageSource === 'string' ? imageSource : imageSource?.thumbnailUrl ?? null;
      if (imageUrl) {
        const image = documentRef.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        applyAdaptiveImageSource(image, {
          thumbnailUrl: imageUrl,
          previewUrl: typeof imageSource === 'string' ? null : imageSource?.previewUrl ?? null
        });
        image.addEventListener('error', () => image.remove(), { once: true });
        cover.append(image);
      }
      const copy = documentRef.createElement('span');
      copy.className = 'company-directory-work-copy';
      copy.append(
        text(documentRef, 'strong', 'company-directory-work-title', profileWork?.title || work.displayTitle || work.title),
        text(documentRef, 'span', 'company-directory-work-meta', profileWork?`作品首发 ${profileWork.date||'日期待确认'}`:formatReleaseDate(work.releaseDate)),
        text(documentRef, 'span', 'company-directory-work-meta cp-work-rating', `${Number.isFinite(work.median)?'EGS '+work.median.toFixed(1)+' 分':'EGS 暂无评分'}${Number.isFinite(work.voteCount)?' · '+formatCount(work.voteCount)+' 人评分':''}`)
      );
      const reviewed=companyContract?.notes[String(work.workId)];
      if(reviewed){const badge=text(documentRef,'small','cp-work-roles',reviewed.label);copy.append(badge);}
      if(!reviewed&&!related&&(version||companyRole==='other')){
        const badges=text(documentRef,'span','cp-work-roles','');badges.hidden=true;copy.append(badges);
        companyCredits(selected.companyId).then(credits=>{
          if(roleToken!==roleSequence||!item.isConnected)return;
          const row=credits.get(String(work.workId)),mask=row?.[version?1:0]??0;
          if(mask&3){badges.hidden=false;for(const label of roleLabels(mask)){const badge=text(documentRef,'span','cp-role-badge',label);badge.dataset.role=label==='发行'?'publishing':'development';badges.append(badge);}}
          else if(!version&&companyRole==='other'){badges.hidden=false;badges.textContent=mask&4?'品牌收录':'其他来源关联';}
        }).catch(()=>{if(roleToken===roleSequence)badges.hidden=true;});
      }
      item.append(cover, copy);
      item.addEventListener('click', () => onOpenWork(work));
      return item;
    }
    const matches=work=>!catalogQuery||[work.title,work.displayTitle,work.originalTitle].some(x=>String(x||'').toLocaleLowerCase().includes(catalogQuery));
    const familyKey=g=>companyContract?.familyByWork[String(g.works[0].workId)]||g.key;
    const groupYear=g=>{const dates=g.works.map(w=>String(w.releaseDate||'')).filter(x=>/^\d{4}-/.test(x)&&!x.startsWith('2050'));return dates.length?dates.sort()[0].slice(0,4):'日期待确认';};
    const snapshotWorks=new Map((profileSnapshot?.works||[]).map(w=>[w.id,w]));
    let filteredGroups=workGroups.filter(g=>g.works.some(matches)&&(!catalogFilter||catalogFilter.ids.has(familyKey(g))));
    if(catalogLayout==='list'&&profileSnapshot){const field={releaseDate:'date',median:'score',voteCount:'votes'}[detailWorkSortKey];filteredGroups=[...filteredGroups].sort((a,b)=>{const av=snapshotWorks.get(familyKey(a))?.[field],bv=snapshotWorks.get(familyKey(b))?.[field];if(av==null||bv==null)return av==null?(bv==null?familyKey(a).localeCompare(familyKey(b)):1):-1;const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv));return (detailWorkSortDirection==='desc'?-cmp:cmp)||familyKey(a).localeCompare(familyKey(b));});}
    if(catalogLayout==='year')filteredGroups=[...filteredGroups].sort((a,b)=>groupYear(b).localeCompare(groupYear(a))||familyKey(a).localeCompare(familyKey(b)));
    detailWorks.classList.toggle('pp-catalog-year',catalogLayout==='year');
    for(const b of catalogTools.querySelectorAll('[data-catalog-layout]'))b.setAttribute('aria-pressed',String(b.dataset.catalogLayout===catalogLayout));
    catalogStatus.textContent=`${catalogLayout==='year'?'按当前范围收录版本的最早年份 · ':''}${catalogFilter?catalogFilter.label+' · ':''}${catalogQuery?'搜索结果 · ':''}${filteredGroups.length} / ${workGroups.length} 部作品 · ${catalogFilter?'当前分段条件':'全部年份，含未计入评分作品；显示评分代表版'}`;
    catalogClear.hidden=!catalogFilter;catalogClear.textContent=catalogFilter?'清除分段条件 ×':'';
    const heading=worksPanel.querySelector('.company-detail-works-heading');heading.hidden=true;sortControls.hidden=catalogLayout==='year';
    let lastYear=null;
    if(detailState==='ready'&&workGroups.length&&!filteredGroups.length)detailWorks.append(text(documentRef,'p','pp-empty','没有匹配的作品，可修改关键词或清除分段条件。'));
    for (const originalGroup of filteredGroups.slice(0,catalogLimit)) {
      const profileWork=snapshotWorks.get(familyKey(originalGroup));const primary=originalGroup.works.find(x=>String(x.workId)===profileWork?.editionId);const group=primary?{...originalGroup,works:[primary,...originalGroup.works.filter(x=>x!==primary)]}:originalGroup;
      if(catalogLayout==='year'&&groupYear(group)!==lastYear){lastYear=groupYear(group);detailWorks.append(text(documentRef,'h3','pp-catalog-year-heading',lastYear));}

      const card = documentRef.createElement('article');
      card.className = 'cp-work-family';card.dataset.familyId=group.key;
      card.append(workButton(group.works[0],false,false,profileWork));
      if (group.works.length > 1) {
        const stateKey = JSON.stringify([selected.companyId, companyScope, companyRole, group.key]);
        const versions = documentRef.createElement('div');versions.className='cp-family-versions';
        versions.id='cp-versions-'+encodeURIComponent(group.key);
        const toggle = documentRef.createElement('button');toggle.type='button';toggle.className='cp-family-toggle';
        toggle.setAttribute('aria-controls',versions.id);
        const count=text(documentRef,'span','',`${group.works.length} 个版本`);
        const action=text(documentRef,'span','','');toggle.append(count,action);
        let populated=false;
        const sync = () => {
          const open=expandedFamilies.has(stateKey);
          if(open&&!populated){
            for(const work of group.works.slice(1))versions.append(workButton(work,true));
            populated=true;
          }
          versions.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
          action.textContent=open?'收起 ▴':'展开 ▾';
          toggle.setAttribute('aria-label',`${open?'收起':'查看'} ${group.works[0].displayTitle||group.works[0].title} 的其余 ${group.works.length-1} 个版本`);
        };
        toggle.addEventListener('click',()=>{if(expandedFamilies.has(stateKey))expandedFamilies.delete(stateKey);else expandedFamilies.add(stateKey);sync();});
        card.append(toggle,versions);sync();
      }
      const w=snapshotWorks.get(familyKey(group));
      if(w){const actions=text(documentRef,'div','pp pp-catalog-actions','');
        if(companyRole==='development'&&w.crossCount){const explore=text(documentRef,'button','pp-explore-button',`找共同主创作品 ${w.crossCount} →`);explore.type='button';explore.dataset.catalogExplore=w.id;explore.addEventListener('click',()=>profileSnapshot.openExplore(w.id,explore));actions.append(explore);}
        if(actions.childElementCount)card.append(actions);}
      const versionToggle=card.querySelector('.cp-family-toggle'),versionList=card.querySelector('.cp-family-versions');if(versionToggle){let actions=card.querySelector('.pp-catalog-actions');if(!actions){actions=text(documentRef,'div','pp pp-catalog-actions','');card.append(actions);}actions.prepend(versionToggle);card.append(versionList);}
      detailWorks.append(card);
    }
    if(filteredGroups.length>catalogLimit){const more=text(documentRef,'button','pp-more pp-catalog-more',`继续显示 · 已显示 ${catalogLimit} / ${filteredGroups.length} 部`);more.type='button';more.addEventListener('click',()=>{const top=scrollBody.scrollTop;catalogLimit+=36;render(latestModel);scrollBody.scrollTop=top;(detailWorks.querySelector('.pp-catalog-more')||catalogSearch).focus({preventScroll:true});});detailWorks.append(more);}

    if(companyContract?.relatedWorks.length&&detailState==='ready'&&!catalogFilter){
      const related=text(documentRef,'details','cp-related-records','');
      const heading=text(documentRef,'summary','',`其他版本与原作关联 · ${companyContract.relatedWorks.filter(matches).length} 条${catalogQuery?'匹配':''}`);related.append(heading);
      related.append(text(documentRef,'p','cp-family-help','保留查阅，不额外计入上方作品数量、画像和本范围高分代表作。'));
      for(const work of companyContract.relatedWorks.filter(matches))related.append(workButton(work,false,true));
      detailWorks.append(related);
    }
    if (isMobile) {
      const selectedIndex = visibleCompanies.findIndex(company => company.companyId === selectedCompanyId);
      const columns = Number(root.ownerDocument?.defaultView?.innerWidth) <= 899 ? 3 : 2;
      const rowEnd = Math.min(visibleCompanies.length, (Math.floor(selectedIndex / columns) + 1) * columns);
      const anchor = list.children[rowEnd - 1];
      if (selectedIndex >= 0 && anchor) anchor.after(detail);
      else if (detailHome) detailHome.append(detail);
    }
  }

  function setPage(nextPageIndex, { scroll = true, notify = true } = {}) {
    if (latestModel === null) return;
    const previousIndex = pageIndex;
    pageIndex = Math.max(0, Math.min(nextPageIndex, pageCount(browse.filter(latestModel.companies)) - 1));
    clearPageError();
    render(latestModel);
    if (scroll && pageIndex !== previousIndex) root.scrollTop = 0;
    const scrollWindow = root.ownerDocument?.defaultView
      ?? (typeof window !== 'undefined' ? window : null);
    if (scroll && pageIndex !== previousIndex && typeof scrollWindow?.scrollTo === 'function') {
      try {
        scrollWindow.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        try { scrollWindow.scrollTo(0, 0); } catch { /* no-op in test DOMs */ }
      }
    }
    if (notify && pageIndex !== previousIndex) onPageChange(pageIndex + 1);
  }

  lifetime.listen(pagePrevious, 'click', () => setPage(pageIndex - 1));
  lifetime.listen(pageNext, 'click', () => setPage(pageIndex + 1));
  lifetime.listen(pageInput, 'keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const raw = String(pageInput.value ?? '').trim();
    const requested = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(requested) || requested < 1 || requested > pageCount(browse.filter(latestModel?.companies ?? []))) {
      showPageError();
      return;
    }
    setPage(requested - 1);
  });

  return Object.freeze({
    captureState() {
      return {companyId:String(activeCompany),role:latestModel?.companyRole,currentSection,browseMode,
        catalogLayout,catalogQuery:catalogSearch.value,catalogLimit,
        catalogFilter:catalogFilter?{ids:[...catalogFilter.ids],label:catalogFilter.label}:null,
        expanded:[...expandedFamilies].filter(key=>String(JSON.parse(key)[0])===String(activeCompany)),
        profile:profileSnapshot?.captureState?.()??null};
    },
    async restoreState(state) {
      if(!state||String(activeCompany)!==state.companyId)return;
      const role=detail.querySelector('#company-reviewed-role');
      if(role&&role.value!==state.role){
        role.value=state.role;role.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(resolve=>{const done=()=>{observer.disconnect();clearTimeout(timer);resolve();};const observer=new MutationObserver(()=>{if(companyCardHost.dataset.readyRole===state.role)done();});observer.observe(companyCardHost,{attributes:true,childList:true,subtree:true});const timer=setTimeout(done,20000);});
      }
      if(state.profile&&!profileSnapshot){
        await new Promise(resolve=>{
          const done=()=>{companyCardHost.removeEventListener('pp-profile-ready',done);clearTimeout(timer);resolve();};
          companyCardHost.addEventListener('pp-profile-ready',done);const timer=setTimeout(done,20000);
          companyCard.setSection('radar');
        });
      }
      catalogLayout=state.catalogLayout;catalogQuery=state.catalogQuery.trim().toLocaleLowerCase();catalogSearch.value=state.catalogQuery;
      catalogLimit=state.catalogLimit;catalogFilter=state.catalogFilter?{...state.catalogFilter,ids:new Set(state.catalogFilter.ids)}:null;
      for(const key of [...expandedFamilies])if(String(JSON.parse(key)[0])===state.companyId)expandedFamilies.delete(key);
      for(const key of state.expanded)expandedFamilies.add(key);
      browseMode=state.browseMode;currentSection=state.currentSection;sectionByCompany.set(state.companyId,currentSection);
      if(latestModel)render(latestModel);
      profileSnapshot?.restoreState?.(state.profile);
    },
    suspend() {
      companyCard.suspend();
      setListState({status:detailStatus,state:'ready'});
      detail.setAttribute('aria-busy', 'false');
    },
    dispose() {
      browse.dispose();
      if(scopeCaption)roleControls.append(scopeCaption);heading.prepend(detailAvatar);detailTitle.after(detailMeta);detail.querySelector('.company-detail-works-heading').append(sortControls);if(roleControls?.isConnected)detail.append(roleControls);detail.append(nav,scrollBody);body.remove();detail.classList.remove('cp-compact');
      detail.append(detail.querySelector('.company-detail-works-heading'),detailWorks);
      worksPanel.remove();catalogTools.remove();nav.remove();scrollBody.remove();root.removeAttribute('data-profile-open');
      if(dialog.open)dialog.close();documentRef.documentElement.classList.remove('company-details-open');
      companyCard.dispose();
      lifetime.dispose();
      // Mobile places the detail between cards. Return the owned panel before
      // clearing rows so a subsequent workspace owner can still find its IDs.
      if (detailHome && detail.parentElement !== detailHome) detailHome.append(detail);
      portal.remove();list.replaceChildren(); detailWorks.replaceChildren();
    },
    render,
    getPageNumber() {
      return pageIndex + 1;
    },
    setPageNumber(pageNumber, { scroll = false, notify = false } = {}) {
      const number = Number(pageNumber);
      if (!Number.isSafeInteger(number) || number < 1) return false;
      setPage(number - 1, { scroll, notify });
      return true;
    },
    elements: Object.freeze({
      search,
      sort,
      sortDirection,
      list,
      detail,
      detailClose,
      detailSort,
      detailSortDirection,
      pagination,
      pagePrevious,
      pageInput,
      pageTotal,
      pageNext,
      pageError
    })
  });
}

export function companyImageUrl(company, assetBase) {
  const path = company?.avatar?.path;
  return typeof path === 'string' && path.length > 0 ? resolveAssetUrl(path, assetBase) : null;
}
