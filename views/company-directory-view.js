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

export function createCompanyDirectoryView({ root, onSearch, onSort, onSelectCompany, onOpenWork }) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must provide querySelector');
  if (typeof onSearch !== 'function' || typeof onSort !== 'function' || typeof onSelectCompany !== 'function' || typeof onOpenWork !== 'function') {
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

  function avatarFor(parent, company, className, avatarUrlForCompany) {
    if (!company.avatar || typeof avatarUrlForCompany !== 'function') {
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, '无头像'));
      return;
    }
    const image = documentRef.createElement('img');
    image.className = className;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = avatarUrlForCompany(company.avatar);
    image.addEventListener('error', () => {
      image.remove();
      parent.append(text(documentRef, 'span', `${className} company-avatar-fallback`, '无头像'));
    }, { once: true });
    parent.append(image);
  }

  function render({ companies = [], selectedCompanyId = null, selectedWorks = [], avatarUrlForCompany = null } = {}) {
    list.replaceChildren();
    empty.hidden = companies.length !== 0;
    for (const company of companies) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'company-directory-card';
      button.classList.toggle('is-selected', company.companyId === selectedCompanyId);
      button.dataset.companyId = company.companyId;
      const avatar = documentRef.createElement('span');
      avatar.className = 'company-directory-card-avatar';
      avatarFor(avatar, company, 'company-avatar', avatarUrlForCompany);
      const body = documentRef.createElement('span');
      body.className = 'company-directory-card-body';
      body.append(
        text(documentRef, 'strong', 'company-directory-card-name', company.brandName),
        text(documentRef, 'span', 'company-directory-card-stats', `${company.workCount} 部作品`)
      );
      button.append(avatar, body);
      button.addEventListener('click', () => onSelectCompany(company.companyId));
      list.append(button);
    }
    const selected = companies.find(company => company.companyId === selectedCompanyId) ?? null;
    detail.hidden = selected === null;
    if (!selected) return;
    detailTitle.textContent = selected.brandName;
    detailAvatar.replaceChildren();
    avatarFor(detailAvatar, selected, 'company-detail-avatar-image', avatarUrlForCompany);
    detailMeta.textContent = `${selected.workCount} 部作品 · ${selected.releaseYearStart ?? '未知'}-${selected.releaseYearEnd ?? '未知'} · 平均 ${selected.averageScore ?? '暂无'}`;
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

export function companyAvatarUrl(avatar, assetBase) {
  return avatar ? resolveAssetUrl(avatar.path, assetBase) : null;
}
