import { resolveAssetUrl } from '../lib/asset-url.js';
import { createActionIcon } from '../lib/action-icons.js';
import { setListState } from '../lib/list-state.js';

const COMPANY_PAGE_SIZE = 36;

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

export function createCompanyDirectoryView({
  root,
  onSearch,
  onSort,
  onSelectCompany,
  onToggleCompany,
  onOpenWork,
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
  const search = requireElement(root, 'company-directory-search');
  const sort = requireElement(root, 'company-sort');
  const list = requireElement(root, 'company-list');
  const layout = root.querySelector?.('.company-directory-layout');
  const detail = requireElement(root, 'company-detail');
  const detailTitle = requireElement(root, 'company-detail-title');
  const detailAvatar = requireElement(root, 'company-detail-avatar');
  const detailMeta = requireElement(root, 'company-detail-meta');
  const detailClose = root.querySelector?.('#company-detail-close');
  const detailWorks = requireElement(root, 'company-detail-works');
  const detailSort = requireElement(root, 'company-detail-sort');
  const detailSortDirection = requireElement(root, 'company-detail-sort-direction');
  const detailSortDirectionIcon = requireElement(root, 'company-detail-sort-direction-icon');
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

  search.addEventListener('input', () => onSearch(search.value));
  sort.addEventListener('change', () => onSort(sort.value));
  detailSort.addEventListener('change', () => onDetailWorkSort({ sortKey: detailSort.value }));
  detailSortDirection.addEventListener('click', () => {
    onDetailWorkSort({ direction: detailSortDirection.getAttribute('aria-pressed') === 'true' ? 'desc' : 'asc' });
  });
  detailClose?.addEventListener('click', () => onCloseDetail());

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
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, '无头像'));
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
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, '无头像'));
    }, { once: true });
    parent.append(image);
  }

  function render({
    companies = [],
    selectedCompanyId = null,
    selectedCompanyIds = new Set(),
    selectedWorks = [],
    detailWorkSortKey = 'releaseDate',
    detailWorkSortDirection = 'asc',
    selectionMode: currentSelectionMode = selectionMode,
    imageUrlForCompany = null,
    imageUrlForWork = null
  } = {}) {
    const companyKey = companies.map(company => company.companyId).join('\u001f');
    if (companyKey !== renderedCompanyKey) {
      renderedCompanyKey = companyKey;
      renderedPageKey = '';
      pageIndex = 0;
      clearPageError();
    }
    const selectedCompanyChanged = selectedCompanyId !== renderedSelectedCompanyId;
    renderedSelectedCompanyId = selectedCompanyId;
    latestModel = {
      companies,
      selectedCompanyId,
      selectedCompanyIds,
      selectedWorks,
      detailWorkSortKey,
      detailWorkSortDirection,
      imageUrlForCompany,
      imageUrlForWork
    };
    const totalPages = pageCount(companies);
    const selectedIndex = companies.findIndex(company => company.companyId === selectedCompanyId);
    if (selectedCompanyChanged && selectedIndex >= 0 && (selectedIndex < pageIndex * COMPANY_PAGE_SIZE || selectedIndex >= (pageIndex + 1) * COMPANY_PAGE_SIZE)) {
      pageIndex = Math.floor(selectedIndex / COMPANY_PAGE_SIZE);
    }
    pageIndex = Math.min(pageIndex, totalPages - 1);
    const visibleCompanies = companies.slice(pageIndex * COMPANY_PAGE_SIZE, (pageIndex + 1) * COMPANY_PAGE_SIZE);
    const pageKey = `${companyKey}\u001f${pageIndex}\u001f${currentSelectionMode}`;
    if (pageKey !== renderedPageKey) {
      renderedPageKey = pageKey;
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
      imageFor(open, company, 'company-avatar', imageUrlForCompany);
      const overlay = documentRef.createElement('span');
      overlay.className = 'company-directory-card-overlay';
      overlay.append(
        text(documentRef, 'strong', 'company-directory-card-name', company.brandName),
        text(documentRef, 'span', 'company-directory-card-work-count', `${company.workCount} 部`),
        text(documentRef, 'span', 'company-directory-card-vote-count', `${formatCount(company.totalVoteCount)} 票`)
      );
      open.append(overlay);
      if (currentSelectionMode) {
        open.setAttribute('aria-label', `选择会社 ${company.brandName} 进行排榜`);
        open.setAttribute('aria-pressed', String(selectedCompanyIds.has(company.companyId)));
        open.addEventListener('click', () => onToggleCompany(company.companyId, !selectedCompanyIds.has(company.companyId)));
      } else {
        open.addEventListener('click', () => onSelectCompany(company.companyId, { revealDetail: true }));
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
      state: companies.length === 0 ? 'empty' : 'ready',
      message: '没有匹配的会社。'
    });
    pagination.hidden = totalPages <= 1;
    pagePrevious.disabled = pageIndex === 0;
    pageNext.disabled = pageIndex >= totalPages - 1;
    pageInput.value = String(pageIndex + 1);
    pageTotal.textContent = String(totalPages);
    for (const card of list.querySelectorAll('.company-directory-card')) {
      const companyId = card.dataset.companyId;
      card.classList.toggle('is-selected', companyId === selectedCompanyId);
      const select = card.querySelector('.company-directory-card-select');
      if (select !== null) select.checked = selectedCompanyIds.has(companyId);
    }
    const selected = companies.find(company => company.companyId === selectedCompanyId) ?? null;
    const isMobile = Boolean(root.ownerDocument?.defaultView?.matchMedia?.('(max-width: 899px)')?.matches);
    if (!isMobile && layout && detail.parentElement !== layout) layout.append(detail);
    detail.hidden = selected === null;
    if (!selected) return;
    detailTitle.textContent = selected.brandName;
    detailAvatar.replaceChildren();
    imageFor(detailAvatar, selected, 'company-detail-avatar-image', imageUrlForCompany);
    detailMeta.textContent = `${selected.workCount} 部作品 · ${selected.releaseYearStart ?? '未知'}-${selected.releaseYearEnd ?? '未知'} · 总评分 ${formatCount(selected.totalVoteCount)} · 平均每作 ${formatCount(selected.averageVoteCount)}`;
    detailSort.value = detailWorkSortKey;
    const ascending = detailWorkSortDirection === 'asc';
    detailSortDirection.setAttribute('aria-pressed', String(ascending));
    detailSortDirection.setAttribute('aria-label', `作品排序：${ascending ? '升序' : '降序'}，点击切换`);
    detailSortDirection.title = `作品排序：${ascending ? '升序' : '降序'}，点击切换`;
    detailSortDirectionIcon.replaceChildren(createActionIcon(documentRef, ascending ? 'arrow-up-a-z' : 'arrow-down-a-z'));
    detailWorks.replaceChildren();
    for (const work of selectedWorks) {
      const item = documentRef.createElement('button');
      item.type = 'button';
      item.className = 'company-directory-work';
      const cover = documentRef.createElement('span');
      cover.className = 'company-directory-work-cover';
      const imageUrl = typeof imageUrlForWork === 'function' ? imageUrlForWork(work) : null;
      if (imageUrl) {
        const image = documentRef.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.src = imageUrl;
        image.addEventListener('error', () => image.remove(), { once: true });
        cover.append(image);
      }
      const copy = documentRef.createElement('span');
      copy.className = 'company-directory-work-copy';
      copy.append(
        text(documentRef, 'strong', 'company-directory-work-title', work.displayTitle || work.title),
        text(documentRef, 'span', 'company-directory-work-meta', `${work.releaseDate?.slice(0, 4) || '未知'} · ${Number.isFinite(work.median) ? work.median.toFixed(1) : '-'} · ${formatCount(work.voteCount)}`)
      );
      item.append(cover, copy);
      item.addEventListener('click', () => onOpenWork(work));
      detailWorks.append(item);
    }
    if (isMobile) {
      const selectedIndex = visibleCompanies.findIndex(company => company.companyId === selectedCompanyId);
      const columns = Number(root.ownerDocument?.defaultView?.innerWidth) <= 899 ? 3 : 2;
      const rowEnd = Math.min(visibleCompanies.length, (Math.floor(selectedIndex / columns) + 1) * columns);
      const anchor = list.children[rowEnd - 1];
      if (anchor) anchor.after(detail);
    }
  }

  function setPage(nextPageIndex, { scroll = true, notify = true } = {}) {
    if (latestModel === null) return;
    const previousIndex = pageIndex;
    pageIndex = Math.max(0, Math.min(nextPageIndex, pageCount(latestModel.companies) - 1));
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

  pagePrevious.addEventListener('click', () => setPage(pageIndex - 1));
  pageNext.addEventListener('click', () => setPage(pageIndex + 1));
  pageInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const raw = String(pageInput.value ?? '').trim();
    const requested = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(requested) || requested < 1 || requested > pageCount(latestModel?.companies ?? [])) {
      showPageError();
      return;
    }
    setPage(requested - 1);
  });

  return Object.freeze({
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
  const path = company?.avatar?.path ?? company?.fallbackCoverPath;
  return typeof path === 'string' && path.length > 0 ? resolveAssetUrl(path, assetBase) : null;
}
