import { resolveAssetUrl } from '../lib/asset-url.js';

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

  search.addEventListener('input', () => onSearch(search.value));
  sort.addEventListener('change', () => onSort(sort.value));

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
    list.replaceChildren();
    empty.hidden = companies.length !== 0;
    for (const company of companies) {
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

  return Object.freeze({ render, elements: Object.freeze({ search, sort, list, detail }) });
}

export function companyImageUrl(company, assetBase) {
  const path = company?.avatar?.path ?? company?.fallbackCoverPath;
  return typeof path === 'string' && path.length > 0 ? resolveAssetUrl(path, assetBase) : null;
}
