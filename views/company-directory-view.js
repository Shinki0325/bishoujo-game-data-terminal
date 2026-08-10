import { resolveAssetUrl } from '../lib/asset-url.js';

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

export function createCompanyDirectoryView({ root, onSearch, onSort, onSelectCompany, onToggleCompany, onOpenWork }) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must provide querySelector');
  if (typeof onSearch !== 'function' || typeof onSort !== 'function' || typeof onSelectCompany !== 'function' || typeof onToggleCompany !== 'function' || typeof onOpenWork !== 'function') {
    throw new TypeError('company directory callbacks must be functions');
  }
  const documentRef = root.ownerDocument;
  const search = requireElement(root, 'company-directory-search');
  const sort = requireElement(root, 'company-sort');
  const list = requireElement(root, 'company-list');
  const detail = requireElement(root, 'company-detail');
  const detailTitle = requireElement(root, 'company-detail-title');
  const detailAvatar = requireElement(root, 'company-detail-avatar');
  const detailMeta = requireElement(root, 'company-detail-meta');
  const detailWorks = requireElement(root, 'company-detail-works');
  const empty = requireElement(root, 'company-empty');
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

  function render({ companies = [], selectedCompanyId = null, selectedCompanyIds = new Set(), selectedWorks = [], imageUrlForCompany = null } = {}) {
    const companyKey = companies.map(company => company.companyId).join('\u001f');
    if (companyKey !== renderedCompanyKey) {
      renderedCompanyKey = companyKey;
      renderedPageKey = '';
      pageIndex = 0;
      clearPageError();
    }
    const selectedCompanyChanged = selectedCompanyId !== renderedSelectedCompanyId;
    renderedSelectedCompanyId = selectedCompanyId;
    latestModel = { companies, selectedCompanyId, selectedCompanyIds, selectedWorks, imageUrlForCompany };
    const totalPages = pageCount(companies);
    const selectedIndex = companies.findIndex(company => company.companyId === selectedCompanyId);
    if (selectedCompanyChanged && selectedIndex >= 0 && (selectedIndex < pageIndex * COMPANY_PAGE_SIZE || selectedIndex >= (pageIndex + 1) * COMPANY_PAGE_SIZE)) {
      pageIndex = Math.floor(selectedIndex / COMPANY_PAGE_SIZE);
    }
    pageIndex = Math.min(pageIndex, totalPages - 1);
    const visibleCompanies = companies.slice(pageIndex * COMPANY_PAGE_SIZE, (pageIndex + 1) * COMPANY_PAGE_SIZE);
    const pageKey = `${companyKey}\u001f${pageIndex}`;
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
      open.addEventListener('click', () => onSelectCompany(company.companyId));
      const select = documentRef.createElement('input');
      select.type = 'checkbox';
      select.className = 'company-directory-card-select';
      select.checked = selectedCompanyIds.has(company.companyId);
      select.setAttribute('aria-label', `选择会社 ${company.brandName} 进行排榜`);
      select.addEventListener('change', () => onToggleCompany(company.companyId, select.checked));
      card.append(open, select);
      list.append(card);
    }
    }
    empty.hidden = companies.length !== 0;
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
    detail.hidden = selected === null;
    if (!selected) return;
    detailTitle.textContent = selected.brandName;
    detailAvatar.replaceChildren();
    imageFor(detailAvatar, selected, 'company-detail-avatar-image', imageUrlForCompany);
    detailMeta.textContent = `${selected.workCount} 部作品 · ${selected.releaseYearStart ?? '未知'}-${selected.releaseYearEnd ?? '未知'} · 总评分 ${formatCount(selected.totalVoteCount)} · 平均每作 ${formatCount(selected.averageVoteCount)}`;
    detailWorks.replaceChildren();
    for (const work of selectedWorks) {
      const item = documentRef.createElement('button');
      item.type = 'button';
      item.className = 'company-directory-work';
      item.textContent = `${work.title} · ${work.releaseDate || '未知'}`;
      item.addEventListener('click', () => onOpenWork(work));
      detailWorks.append(item);
    }
  }

  function setPage(nextPageIndex) {
    if (latestModel === null) return;
    pageIndex = Math.max(0, Math.min(nextPageIndex, pageCount(latestModel.companies) - 1));
    clearPageError();
    render(latestModel);
    root.scrollTop = 0;
    const scrollWindow = root.ownerDocument?.defaultView
      ?? (typeof window !== 'undefined' ? window : null);
    if (typeof scrollWindow?.scrollTo === 'function') {
      try {
        scrollWindow.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        try { scrollWindow.scrollTo(0, 0); } catch { /* no-op in test DOMs */ }
      }
    }
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

  return Object.freeze({ render, elements: Object.freeze({ search, sort, list, detail, pagination, pagePrevious, pageInput, pageTotal, pageNext, pageError }) });
}

export function companyImageUrl(company, assetBase) {
  const path = company?.avatar?.path ?? company?.fallbackCoverPath;
  return typeof path === 'string' && path.length > 0 ? resolveAssetUrl(path, assetBase) : null;
}
